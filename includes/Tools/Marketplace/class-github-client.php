<?php

namespace WPTravelEngineDevZone\Tools\Marketplace;

defined( 'ABSPATH' ) || exit;

/**
 * Thin GitHub API HTTP helper with transient caching.
 *
 * All responses are cached for CACHE_TTL seconds. Call bust_cache() to
 * invalidate a specific URL before re-fetching.
 */
class GithubClient {

	private const CACHE_TTL    = HOUR_IN_SECONDS;
	private const CACHE_PREFIX = 'wpte_dzm_';
	public  const API_BASE     = 'https://api.github.com';

	/** @var string|null Optional personal access token (raises rate limit 60 → 5000/hr). */
	private $token;

	public function __construct( $token = null ) {
		$this->token = $token ?? ( get_option( 'wpte_dz_github_token' ) ?: null );
	}

	// -------------------------------------------------------------------------
	// High-level API methods
	// -------------------------------------------------------------------------

	/**
	 * Fetch the curated registry JSON from a raw GitHub URL.
	 *
	 * @param string $raw_url  e.g. https://raw.githubusercontent.com/owner/repo/main/plugins.json
	 * @return array|\WP_Error Decoded payload array or WP_Error on failure.
	 */
	public function fetch_registry( string $raw_url ) {
		return $this->get( $raw_url );
	}

	/**
	 * Search GitHub for repos whose name contains the given prefix.
	 *
	 * @param string $prefix  Repository name prefix (e.g. 'wpte-devzone-addon-').
	 * @return array|\WP_Error Decoded search result or WP_Error.
	 */
	public function fetch_by_name_prefix( string $prefix ) {
		$url = self::API_BASE . '/search/repositories?q=' . rawurlencode( $prefix ) . '+in:name&sort=stars&order=desc&per_page=50';
		return $this->get( $url );
	}

	/**
	 * Search GitHub for repos tagged with a given GitHub repository topic.
	 *
	 * With a PAT this returns both public and private repos the token has access to.
	 * Without a PAT only public repos are returned.
	 *
	 * @param string $topic  GitHub repository topic (e.g. 'wpte-devzone-compatible').
	 * @return array|\WP_Error Decoded search result or WP_Error.
	 */
	public function fetch_by_topic( string $topic ) {
		$url = self::API_BASE . '/search/repositories?q=' . rawurlencode( 'topic:' . $topic ) . '&per_page=50';
		return $this->get( $url );
	}

	/**
	 * Fetch all tags for a repository.
	 *
	 * @param string $owner  Repository owner/org.
	 * @param string $repo   Repository name.
	 * @return array|\WP_Error Array of tag objects or WP_Error.
	 */
	public function fetch_tags( string $owner, string $repo ) {
		$url = self::API_BASE . '/repos/' . rawurlencode( $owner ) . '/' . rawurlencode( $repo ) . '/tags?per_page=100';
		return $this->get( $url );
	}

	/**
	 * Find the latest 'wpte-devzone-compatible*' tag and return its zipball URL.
	 *
	 * The returned URL is the GitHub API zipball endpoint which redirects to the
	 * real .zip file — Plugin_Upgrader follows the redirect automatically.
	 *
	 * @param string $owner  Repository owner/org.
	 * @param string $repo   Repository name.
	 * @return string|\WP_Error Zipball URL string or WP_Error if no compatible tag found.
	 */
	public function fetch_compatible_zip_url( string $owner, string $repo ) {
		$tags = $this->fetch_tags( $owner, $repo );
		if ( is_wp_error( $tags ) ) {
			return $tags;
		}

		$compatible = [];
		foreach ( $tags as $tag ) {
			if ( isset( $tag['name'] ) && strpos( $tag['name'], 'wpte-devzone-compatible' ) === 0 ) {
				$compatible[] = $tag['name'];
			}
		}

		if ( empty( $compatible ) ) {
			return new \WP_Error(
				'no_compatible_tag',
				__( 'This repository has no wpte-devzone-compatible* tag. The developer has not marked it as compatible.', 'wptravelengine-devzone' )
			);
		}

		usort( $compatible, 'version_compare' );
		$latest_tag = end( $compatible );

		return self::API_BASE . '/repos/' . rawurlencode( $owner ) . '/' . rawurlencode( $repo ) . '/zipball/' . rawurlencode( $latest_tag );
	}

	/**
	 * Fetch the authenticated GitHub user for the current token.
	 *
	 * @return array|\WP_Error User data array or WP_Error if token is missing/invalid.
	 */
	public function fetch_authenticated_user() {
		if ( ! $this->token ) {
			return new \WP_Error( 'no_token', __( 'No GitHub token configured.', 'wptravelengine-devzone' ) );
		}
		// Skip the cache for auth checks — always verify live.
		$response = wp_remote_get( self::API_BASE . '/user', $this->build_args() );
		return $this->parse_response( $response );
	}

	/**
	 * Resolve a GitHub API zipball URL to its final S3 download URL.
	 *
	 * For private repos GitHub returns a 302 redirect to a pre-signed S3 URL.
	 * S3 rejects requests that include an Authorization header, so the caller
	 * must download the returned S3 URL without auth headers.
	 *
	 * @param string $url  GitHub API zipball URL.
	 * @return string  The S3 redirect target, or the original URL if no redirect / no token.
	 */
	public function resolve_zip_redirect( string $url ): string {
		if ( ! $this->token ) {
			return $url;
		}
		$args             = $this->build_args();
		$args['redirection'] = 0;
		$response = wp_remote_get( $url, $args );
		if ( is_wp_error( $response ) ) {
			return $url;
		}
		$code     = wp_remote_retrieve_response_code( $response );
		$location = wp_remote_retrieve_header( $response, 'location' );
		if ( in_array( $code, [ 301, 302 ], true ) && $location ) {
			return $location;
		}
		return $url;
	}

	/**
	 * Delete the cached response for a specific URL.
	 */
	public function bust_cache( string $url ): void {
		delete_transient( self::CACHE_PREFIX . md5( $url ) );
	}

	// -------------------------------------------------------------------------
	// Core HTTP
	// -------------------------------------------------------------------------

	/**
	 * Fetch a URL (JSON), with transient caching.
	 *
	 * @param string $url
	 * @return array|\WP_Error Decoded JSON array or WP_Error.
	 */
	public function get( string $url ) {
		$cache_key = self::CACHE_PREFIX . md5( $url );
		$cached    = get_transient( $cache_key );
		if ( false !== $cached ) {
			return $cached;
		}

		$response = wp_remote_get( $url, $this->build_args() );
		$data     = $this->parse_response( $response );

		if ( ! is_wp_error( $data ) ) {
			set_transient( $cache_key, $data, self::CACHE_TTL );
		}

		return $data;
	}

	/** @return array */
	private function build_args(): array {
		$args = [
			'timeout'    => 15,
			'user-agent' => 'WPTravelEngine-DevZone/' . WPTE_DEVZONE_VERSION,
			'headers'    => [
				'Accept' => 'application/vnd.github.v3+json',
			],
		];
		if ( $this->token ) {
			$args['headers']['Authorization'] = 'Bearer ' . $this->token;
		}
		return $args;
	}

	/**
	 * @param array|\WP_Error $response
	 * @return array|\WP_Error
	 */
	private function parse_response( $response ) {
		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = wp_remote_retrieve_response_code( $response );
		$body = wp_remote_retrieve_body( $response );

		if ( 401 === $code ) {
			return new \WP_Error( 'github_unauthorized', __( 'GitHub token is invalid or expired.', 'wptravelengine-devzone' ) );
		}
		if ( 403 === $code ) {
			return new \WP_Error( 'github_rate_limit', __( 'GitHub API rate limit exceeded. Add a Personal Access Token to increase the limit.', 'wptravelengine-devzone' ) );
		}
		if ( 404 === $code ) {
			return new \WP_Error( 'github_not_found', __( 'GitHub resource not found.', 'wptravelengine-devzone' ) );
		}
		if ( $code < 200 || $code >= 300 ) {
			/* translators: %d: HTTP status code */
			return new \WP_Error( 'github_http_error', sprintf( __( 'GitHub API returned HTTP %d.', 'wptravelengine-devzone' ), $code ) );
		}

		$data = json_decode( $body, true );
		if ( ! is_array( $data ) ) {
			return new \WP_Error( 'github_parse_error', __( 'Failed to parse GitHub API response.', 'wptravelengine-devzone' ) );
		}

		return $data;
	}
}
