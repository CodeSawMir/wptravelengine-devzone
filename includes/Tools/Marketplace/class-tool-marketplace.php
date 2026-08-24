<?php

namespace WPTravelEngineDevZone\Tools\Marketplace;

use WPTravelEngineDevZone\Admin;
use WPTravelEngineDevZone\Tools\AbstractTool;

defined( 'ABSPATH' ) || exit;

/**
 * Marketplace tab — discovers and installs WP Travel Engine add-on plugins.
 *
 * Data comes from three tiers (highest priority wins on slug conflict):
 *  1. Curated registry  — plugins.json hosted in a central GitHub repo.
 *  2. Name-prefix search — GitHub repos whose name starts with the addon prefix.
 *  3. WordPress filter   — apply_filters( 'wpte_devzone_marketplace_plugins', [] ).
 *
 * Third-party developers can inject their plugin into the marketplace by:
 *  a) Naming their GitHub repo with the prefix (e.g. wpte-devzone-addon-stripe).
 *  b) Hooking the 'wpte_devzone_marketplace_plugins' filter and appending their plugin data.
 */
class ToolMarketplace extends AbstractTool {

	/** Central curated registry — raw URL of the plugins.json file. */
	private const REGISTRY_URL = 'https://raw.githubusercontent.com/wptravelengine/marketplace/main/plugins.json';

	/** GitHub repo name prefix used for auto-discovery (Tier 2). */
	private const ADDON_PREFIX = 'wpte-devzone-addon-';

	/** Transient keys for the plugin lists and authenticated user info. */
	private const LIST_TRANSIENT  = 'wpte_dzm_plugin_list';
	private const TIER4_TRANSIENT = 'wpte_dzm_plugin_list_t4';
	private const USER_TRANSIENT  = 'wpte_dzm_user_info';

	/** WP option key that tracks plugins installed via the marketplace. */
	private const INSTALLED_OPTION = 'wpte_devzone_marketplace_installed';

	/** Transient key for the cached remote version check (self-update). */
	private const SELF_UPDATE_TRANSIENT = 'wpte_dzm_self_version';

	public function get_slug(): string     { return 'marketplace'; }
	public function get_label(): string    { return __( 'Marketplace', 'wptravelengine-devzone' ); }
	public function get_template(): string { return WPTE_DEVZONE_DIR . 'templates/tab-marketplace.php'; }

	public function register_ajax(): void {
		add_action( 'wp_ajax_wpte_devzone_marketplace_plugins',    [ $this, 'get_plugins' ] );
		add_action( 'wp_ajax_wpte_devzone_marketplace_install',    [ $this, 'install_plugin' ] );
		add_action( 'wp_ajax_wpte_devzone_marketplace_activate',   [ $this, 'activate_plugin' ] );
		add_action( 'wp_ajax_wpte_devzone_marketplace_deactivate', [ $this, 'deactivate_plugin' ] );
		add_action( 'wp_ajax_wpte_devzone_marketplace_delete',     [ $this, 'delete_plugin' ] );
		add_action( 'wp_ajax_wpte_devzone_marketplace_tier4',      [ $this, 'get_tier4_plugins' ] );
		add_action( 'wp_ajax_wpte_devzone_marketplace_bust_cache', [ $this, 'bust_cache' ] );
		add_action( 'wp_ajax_wpte_devzone_marketplace_save_token',   [ $this, 'save_token' ] );
		add_action( 'wp_ajax_wpte_devzone_marketplace_verify_token', [ $this, 'verify_token' ] );
		add_action( 'wp_ajax_wpte_devzone_self_check_update',        [ $this, 'self_check_update' ] );
		add_action( 'wp_ajax_wpte_devzone_self_update',               [ $this, 'self_update' ] );
	}

	public function enqueue_assets(): void {
		wp_enqueue_style(
			'wpte-devzone-marketplace',
			WPTE_DEVZONE_URL . 'assets/css/tabs/marketplace.css',
			[ 'wpte-devzone' ],
			WPTE_DEVZONE_VERSION
		);
		wp_enqueue_script(
			'wpte-devzone-marketplace',
			WPTE_DEVZONE_URL . 'assets/js/tabs/marketplace-tab.js',
			[ 'wpte-devzone' ],
			WPTE_DEVZONE_VERSION,
			true
		);
	}

	// -------------------------------------------------------------------------
	// AJAX endpoints
	// -------------------------------------------------------------------------

	public function get_plugins(): void {
		Admin::verify_request();

		$has_token = ! empty( get_option( 'wpte_dz_github_token' ) );
		$client    = null;

		// T1+T2+T3.
		$list_cached = get_transient( self::LIST_TRANSIENT );
		if ( false === $list_cached ) {
			$client      = $this->get_github_client();
			$list_cached = $this->merge_plugins(
				$this->fetch_tier1( $client ),
				$this->fetch_tier2( $client ),
				$this->fetch_tier3()
			);
			set_transient( self::LIST_TRANSIENT, $list_cached, HOUR_IN_SECONDS );
		}

		// T4 — fetch topic-tagged repos (works without token for public repos).
		$t4_cached     = get_transient( self::TIER4_TRANSIENT );
		$tier4_pending = false === $t4_cached;
		$merged        = false !== $t4_cached
			? $this->merge_plugins( $list_cached, [], [], $t4_cached )
			: $list_cached;

		// User info — cached so the live verify call only happens when the transient is cold.
		$user = null;
		if ( $has_token ) {
			$user = get_transient( self::USER_TRANSIENT );
			if ( false === $user ) {
				$client = $client ?? $this->get_github_client();
				$result = $client->fetch_authenticated_user();
				if ( ! is_wp_error( $result ) ) {
					$user = [
						'login'      => $result['login'] ?? '',
						'name'       => $result['name'] ?? '',
						'avatar_url' => $result['avatar_url'] ?? '',
						'html_url'   => $result['html_url'] ?? '',
					];
					set_transient( self::USER_TRANSIENT, $user, HOUR_IN_SECONDS );
					update_option( 'wpte_dz_github_user', $user, false );
				} elseif ( 'github_unauthorized' === $result->get_error_code() ) {
					// Token saved but rejected by GitHub — signal invalid so UI doesn't show "connected".
					$has_token     = false;
					$tier4_pending = false;
				}
			}
		}

		wp_send_json_success( [
			'plugins'       => $this->enrich_with_installed_status( $merged ),
			'has_token'     => $has_token,
			'user'          => $user,
			'tier4_pending' => $tier4_pending,
		] );
	}

	public function get_tier4_plugins(): void {
		Admin::verify_request();

		$cached = get_transient( self::TIER4_TRANSIENT );
		if ( false === $cached ) {
			$client = $this->get_github_client();
			$cached = $this->fetch_tier4( $client );
			set_transient( self::TIER4_TRANSIENT, $cached, HOUR_IN_SECONDS );
		}

		$plugins = $this->enrich_with_installed_status( $cached );

		wp_send_json_success( [ 'plugins' => $plugins ] );
	}

	public function install_plugin(): void {
		Admin::verify_request();

		$github_repo = sanitize_text_field( wp_unslash( $_POST['github_repo'] ?? '' ) );

		if ( ! preg_match( '#^[a-zA-Z0-9_.\-]+/[a-zA-Z0-9_.\-]+$#', $github_repo ) ) {
			wp_send_json_error( [ 'message' => __( 'Invalid repository slug.', 'wptravelengine-devzone' ) ] );
		}

		[ $owner, $repo ] = explode( '/', $github_repo, 2 );
		$client  = $this->get_github_client();

		$repo_base_url = GithubClient::API_BASE . '/repos/' . rawurlencode( $owner ) . '/' . rawurlencode( $repo );

		// Always install from the default branch HEAD for predictable, latest-commit behaviour.
		$client->bust_cache( $repo_base_url );
		$repo_info      = $client->get( $repo_base_url );
		$default_branch = ( ! is_wp_error( $repo_info ) && ! empty( $repo_info['default_branch'] ) )
			? $repo_info['default_branch']
			: 'HEAD';
		$zip_url = $repo_base_url . '/zipball/' . rawurlencode( $default_branch );
		if ( is_wp_error( $zip_url ) ) {
			wp_send_json_error( [ 'message' => $zip_url->get_error_message() ] );
		}

		// For private repos, GitHub redirects the zipball URL to S3; resolve it so
		// Plugin_Upgrader downloads from S3 directly (S3 rejects Authorization headers).
		$zip_url = $client->resolve_zip_redirect( $zip_url );

		// Extract tag name from the zipball URL for tracking.
		$tag_name = '';
		if ( preg_match( '#/zipball/([^/]+)$#', $zip_url, $m ) ) {
			$tag_name = rawurldecode( $m[1] );
		}

		$reinstall = ! empty( $_POST['reinstall'] );

		// Reinstall: delete the existing plugin cleanly before installing fresh.
		if ( $reinstall ) {
			$existing_file = sanitize_text_field( wp_unslash( $_POST['plugin_file'] ?? '' ) );
			if ( $existing_file ) {
				if ( ! function_exists( 'get_plugins' ) ) {
					require_once ABSPATH . 'wp-admin/includes/plugin.php';
				}
				if ( array_key_exists( $existing_file, get_plugins() ) ) {
					if ( is_plugin_active( $existing_file ) ) {
						deactivate_plugins( $existing_file );
					}
					delete_plugins( [ $existing_file ] );
				}
			}
		}

		$installer = new PluginInstaller();
		$result    = $installer->install( $zip_url, $github_repo );

		if ( is_wp_error( $result ) ) {
			wp_send_json_error( [ 'message' => $result->get_error_message() ] );
		}

		// Track this installation so uninstall.php can clean it up.
		$tracked = get_option( self::INSTALLED_OPTION, [] );
		if ( ! is_array( $tracked ) ) {
			$tracked = [];
		}
		$tracked[ $result['plugin_file'] ] = [
			'github_repo'  => $github_repo,
			'tag'          => $tag_name,
			'installed_at' => time(),
		];
		update_option( self::INSTALLED_OPTION, $tracked, false );

		wp_send_json_success( [
			'plugin_file' => $result['plugin_file'],
			'version'     => $tag_name,
			'message'     => __( 'Plugin installed successfully.', 'wptravelengine-devzone' ),
		] );
	}

	public function activate_plugin(): void {
		Admin::verify_request();

		$plugin_file = sanitize_text_field( wp_unslash( $_POST['plugin_file'] ?? '' ) );
		if ( ! $plugin_file ) {
			wp_send_json_error( [ 'message' => __( 'Missing plugin file.', 'wptravelengine-devzone' ) ] );
		}

		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}

		if ( ! array_key_exists( $plugin_file, get_plugins() ) ) {
			wp_send_json_error( [ 'message' => __( 'Invalid plugin.', 'wptravelengine-devzone' ) ] );
		}

		$installer = new PluginInstaller();
		$activated = $installer->activate( $plugin_file );

		if ( is_wp_error( $activated ) ) {
			wp_send_json_error( [ 'message' => $activated->get_error_message() ] );
		}

		wp_send_json_success( [ 'message' => __( 'Plugin activated.', 'wptravelengine-devzone' ) ] );
	}

	public function deactivate_plugin(): void {
		Admin::verify_request();

		$plugin_file = sanitize_text_field( wp_unslash( $_POST['plugin_file'] ?? '' ) );
		if ( ! $plugin_file ) {
			wp_send_json_error( [ 'message' => __( 'Missing plugin file.', 'wptravelengine-devzone' ) ] );
		}

		if ( ! function_exists( 'deactivate_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}

		if ( ! array_key_exists( $plugin_file, get_plugins() ) ) {
			wp_send_json_error( [ 'message' => __( 'Invalid plugin.', 'wptravelengine-devzone' ) ] );
		}

		deactivate_plugins( $plugin_file );

		wp_send_json_success( [ 'message' => __( 'Plugin deactivated.', 'wptravelengine-devzone' ) ] );
	}

	public function delete_plugin(): void {
		Admin::verify_request();

		$plugin_file = sanitize_text_field( wp_unslash( $_POST['plugin_file'] ?? '' ) );
		if ( ! $plugin_file ) {
			wp_send_json_error( [ 'message' => __( 'Missing plugin file.', 'wptravelengine-devzone' ) ] );
		}

		if ( ! function_exists( 'delete_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}

		if ( ! array_key_exists( $plugin_file, get_plugins() ) ) {
			wp_send_json_error( [ 'message' => __( 'Invalid plugin.', 'wptravelengine-devzone' ) ] );
		}

		// Deactivate first if active.
		if ( is_plugin_active( $plugin_file ) ) {
			deactivate_plugins( $plugin_file );
		}

		$result = delete_plugins( [ $plugin_file ] );
		if ( is_wp_error( $result ) ) {
			wp_send_json_error( [ 'message' => $result->get_error_message() ] );
		}

		// Remove from tracking.
		$tracked = (array) get_option( self::INSTALLED_OPTION, [] );
		unset( $tracked[ $plugin_file ] );
		update_option( self::INSTALLED_OPTION, $tracked, false );

		wp_send_json_success( [ 'message' => __( 'Plugin deleted.', 'wptravelengine-devzone' ) ] );
	}

	public function bust_cache(): void {
		Admin::verify_request();

		global $wpdb;

		// Wipe every transient with our prefix — covers list, tier4, user, and all GitHub API entries.
		$wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
				$wpdb->esc_like( '_transient_wpte_dzm_' ) . '%',
				$wpdb->esc_like( '_transient_timeout_wpte_dzm_' ) . '%'
			)
		);

		// Force a fresh filesystem scan so manually added/removed plugin folders are detected.
		wp_cache_delete( 'plugins', 'plugins' );

		wp_send_json_success( [ 'message' => __( 'Cache cleared.', 'wptravelengine-devzone' ) ] );
	}

	public function save_token(): void {
		Admin::verify_request();

		$token = sanitize_text_field( wp_unslash( $_POST['token'] ?? '' ) );
		if ( $token ) {
			update_option( 'wpte_dz_github_token', $token, false );
		} else {
			delete_option( 'wpte_dz_github_token' );
			delete_option( 'wpte_dz_github_user' );
		}

		// Wipe all marketplace transients so the next load re-fetches with the new token.
		global $wpdb;
		$wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
				$wpdb->esc_like( '_transient_wpte_dzm_' ) . '%',
				$wpdb->esc_like( '_transient_timeout_wpte_dzm_' ) . '%'
			)
		);

		wp_send_json_success( [ 'message' => __( 'Token saved.', 'wptravelengine-devzone' ) ] );
	}

	public function verify_token(): void {
		Admin::verify_request();

		$client = $this->get_github_client();
		$user   = $client->fetch_authenticated_user();

		if ( is_wp_error( $user ) ) {
			wp_send_json_error( [ 'message' => $user->get_error_message() ] );
		}

		$user_data = [
			'login'      => $user['login'] ?? '',
			'name'       => $user['name'] ?? '',
			'avatar_url' => $user['avatar_url'] ?? '',
			'html_url'   => $user['html_url'] ?? '',
		];
		update_option( 'wpte_dz_github_user', $user_data, false );

		wp_send_json_success( $user_data );
	}

	/**
	 * Compare Dev Zone's own installed version against the Version header on
	 * the remote 'main' branch and report whether an update is available.
	 */
	public function self_check_update(): void {
		Admin::verify_request();

		$latest = get_transient( self::SELF_UPDATE_TRANSIENT );
		if ( false === $latest ) {
			$latest = $this->fetch_self_remote_version();
			set_transient( self::SELF_UPDATE_TRANSIENT, $latest, HOUR_IN_SECONDS );
		}

		if ( is_wp_error( $latest ) ) {
			wp_send_json_error( [ 'message' => $latest->get_error_message() ] );
		}

		wp_send_json_success( [
			'current'          => WPTE_DEVZONE_VERSION,
			'latest'           => $latest,
			'update_available' => version_compare( $latest, WPTE_DEVZONE_VERSION, '>' ),
			'repo'             => self::get_self_repo(),
		] );
	}

	/**
	 * Download the 'main' branch zipball of Dev Zone's own repo and overwrite
	 * this plugin's own directory in place.
	 *
	 * This plugin lives outside WP_PLUGIN_DIR (nested under .wpte-devzone/),
	 * so it isn't a normal WP-recognized plugin and Plugin_Upgrader can't
	 * target it — the copy has to be done directly.
	 */
	public function self_update(): void {
		Admin::verify_request();

		$client  = $this->get_github_client();
		$zip_url = $client->resolve_zip_redirect(
			GithubClient::API_BASE . '/repos/' . self::get_self_repo() . '/zipball/main'
		);

		require_once ABSPATH . 'wp-admin/includes/file.php';
		WP_Filesystem();
		global $wp_filesystem;

		$tmp_zip = download_url( $zip_url );
		if ( is_wp_error( $tmp_zip ) ) {
			wp_send_json_error( [ 'message' => $tmp_zip->get_error_message() ] );
		}

		$tmp_dir      = trailingslashit( get_temp_dir() ) . 'wpte-devzone-self-update-' . wp_generate_password( 8, false );
		$unzip_result = unzip_file( $tmp_zip, $tmp_dir );
		wp_delete_file( $tmp_zip );

		if ( is_wp_error( $unzip_result ) ) {
			wp_send_json_error( [ 'message' => $unzip_result->get_error_message() ] );
		}

		// GitHub zipballs extract into a single '{repo}-{sha}' subfolder.
		$entries = glob( $tmp_dir . '/*', GLOB_ONLYDIR );
		$source  = $entries[0] ?? $tmp_dir;

		$copied = copy_dir( $source, WPTE_DEVZONE_DIR );
		$wp_filesystem->delete( $tmp_dir, true );

		if ( is_wp_error( $copied ) ) {
			wp_send_json_error( [ 'message' => $copied->get_error_message() ] );
		}

		delete_transient( self::SELF_UPDATE_TRANSIENT );

		wp_send_json_success( [ 'message' => __( 'Dev Zone updated. Reloading…', 'wptravelengine-devzone' ) ] );
	}

	/** GitHub repo slug ('owner/repo') this plugin updates itself from. */
	public static function get_self_repo(): string {
		return apply_filters( 'wpte_devzone_self_update_repo', 'CodeSawMir/wptravelengine-devzone-plugin' );
	}

	/**
	 * Fetch the Version header from this plugin's own main file on the
	 * remote 'main' branch via the GitHub Contents API.
	 *
	 * @return string|\WP_Error
	 */
	private function fetch_self_remote_version() {
		$client = $this->get_github_client();
		$url    = GithubClient::API_BASE . '/repos/' . self::get_self_repo() . '/contents/wptravelengine-devzone.php?ref=main';

		$result = $client->get( $url );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$content = ! empty( $result['content'] ) ? base64_decode( str_replace( "\n", '', $result['content'] ) ) : '';
		if ( ! $content || ! preg_match( '/define\(\s*[\'"]WPTE_DEVZONE_VERSION[\'"]\s*,\s*[\'"]([0-9.]+)[\'"]\s*\)/', $content, $m ) ) {
			return new \WP_Error( 'self_update_parse_error', __( 'Could not read the remote plugin version.', 'wptravelengine-devzone' ) );
		}

		return $m[1];
	}

	// -------------------------------------------------------------------------
	// Data pipeline
	// -------------------------------------------------------------------------

	private function get_github_client(): GithubClient {
		return new GithubClient();
	}

	/** Fetch the curated plugins.json registry (Tier 1). */
	private function fetch_tier1( GithubClient $client ): array {
		$result = $client->fetch_registry( self::REGISTRY_URL );
		if ( is_wp_error( $result ) ) {
			return [];
		}
		$raw = $result['plugins'] ?? ( is_array( $result ) && isset( $result[0] ) ? $result : [] );
		return array_values( array_map( fn( $p ) => $this->normalize_plugin( $p, 'registry' ), $raw ) );
	}

	/** Discover repos by name prefix via GitHub Search API (Tier 2). */
	private function fetch_tier2( GithubClient $client ): array {
		$prefix = apply_filters( 'wpte_devzone_marketplace_repo_prefix', self::ADDON_PREFIX );
		$result = $client->fetch_by_name_prefix( $prefix );
		if ( is_wp_error( $result ) ) {
			return [];
		}
		$plugins = [];
		foreach ( $result['items'] ?? [] as $repo ) {
			$plugins[] = $this->normalize_plugin( [
				'slug'        => $repo['name'],
				'name'        => $repo['name'],
				'description' => $repo['description'] ?? '',
				'author'      => $repo['owner']['login'] ?? '',
				'author_url'  => $repo['owner']['html_url'] ?? '',
				'github_repo' => $repo['full_name'],
				'stars'       => $repo['stargazers_count'] ?? 0,
				'tags'        => $repo['topics'] ?? [],
			], 'topic' );
		}
		return $plugins;
	}

	/** Collect plugins registered via WordPress filter (Tier 3). */
	private function fetch_tier3(): array {
		$plugins = apply_filters( 'wpte_devzone_marketplace_plugins', [] );
		if ( ! is_array( $plugins ) ) {
			return [];
		}
		return array_values( array_map( fn( $p ) => $this->normalize_plugin( $p, 'local' ), $plugins ) );
	}

	/**
	 * Discover repos via GitHub topic search (Tier 4).
	 * Repos must add 'wpte-devzone-compatible' as a GitHub repository topic.
	 * With a PAT this includes private repos the token can access.
	 * Skipped entirely when no GitHub token is configured.
	 */
	private function fetch_tier4( GithubClient $client ): array {
		$topic  = apply_filters( 'wpte_devzone_marketplace_topic', 'wpte-devzone-compatible' );
		$result = $client->fetch_by_topic( $topic );
		if ( is_wp_error( $result ) ) {
			return [];
		}
		$plugins = [];
		foreach ( $result['items'] ?? [] as $repo ) {
			$plugins[] = $this->normalize_plugin( [
				'slug'        => $repo['name'],
				'name'        => $repo['name'],
				'description' => $repo['description'] ?? '',
				'author'      => $repo['owner']['login'] ?? '',
				'author_url'  => $repo['owner']['html_url'] ?? '',
				'github_repo' => $repo['full_name'],
				'stars'       => $repo['stargazers_count'] ?? 0,
				'tags'        => $repo['topics'] ?? [],
			], 'topic' );
		}
		return $plugins;
	}

	/**
	 * Merge tiers into a single deduplicated list (keyed by slug).
	 * Priority: T1 > T4 > T2 > T3 for conflicts.
	 */
	private function merge_plugins( array $t1, array $t2, array $t3, array $t4 = [] ): array {
		$index = [];

		foreach ( $t1 as $plugin ) {
			$index[ $plugin['slug'] ] = $plugin;
		}

		// T4: org-discovered repos (token-only); wins over T2/T3 but not T1.
		foreach ( $t4 as $plugin ) {
			if ( ! isset( $index[ $plugin['slug'] ] ) ) {
				$index[ $plugin['slug'] ] = $plugin;
			}
		}

		foreach ( $t2 as $plugin ) {
			if ( isset( $index[ $plugin['slug'] ] ) ) {
				if ( ! $index[ $plugin['slug'] ]['stars'] && $plugin['stars'] ) {
					$index[ $plugin['slug'] ]['stars'] = $plugin['stars'];
				}
			} else {
				$index[ $plugin['slug'] ] = $plugin;
			}
		}

		foreach ( $t3 as $plugin ) {
			if ( isset( $index[ $plugin['slug'] ] ) ) {
				// Override only keys that are non-null strings/arrays (keep zeros/false from base).
				$overrides = array_filter( $plugin, static function ( $v ) { return null !== $v && '' !== $v && [] !== $v; } );
				$index[ $plugin['slug'] ] = array_merge( $index[ $plugin['slug'] ], $overrides );
			} else {
				$index[ $plugin['slug'] ] = $plugin;
			}
		}

		$plugins = array_values( $index );

		usort( $plugins, static function ( array $a, array $b ): int {
			if ( $a['featured'] !== $b['featured'] ) {
				return $b['featured'] <=> $a['featured'];
			}
			if ( $a['stars'] !== $b['stars'] ) {
				return $b['stars'] <=> $a['stars'];
			}
			return strcmp( $a['name'], $b['name'] );
		} );

		return $plugins;
	}

	/** Normalize a raw plugin array to a consistent shape. */
	private function normalize_plugin( array $data, string $source ): array {
		return [
			'slug'        => sanitize_key( $data['slug'] ?? '' ),
			'name'        => sanitize_text_field( $data['name'] ?? '' ),
			'description' => sanitize_text_field( $data['description'] ?? '' ),
			'author'      => sanitize_text_field( $data['author'] ?? '' ),
			'author_url'  => esc_url_raw( $data['author_url'] ?? '' ),
			'github_repo' => sanitize_text_field( $data['github_repo'] ?? '' ),
			'plugin_file' => sanitize_text_field( $data['plugin_file'] ?? '' ),
			'stars'       => (int) ( $data['stars'] ?? 0 ),
			'version'     => sanitize_text_field( $data['version'] ?? '' ),
			'tags'        => array_map( 'sanitize_key', (array) ( $data['tags'] ?? [] ) ),
			'featured'    => ! empty( $data['featured'] ),
			'source'      => $source,
		];
	}

	/** Add is_installed / is_active / installed_ver fields to each plugin entry. */
	private function enrich_with_installed_status( array $plugins ): array {
		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}

		$installer      = new PluginInstaller();
		$active_plugins = array_flip( (array) get_option( 'active_plugins', [] ) );
		$tracked        = (array) get_option( self::INSTALLED_OPTION, [] );

		// Build a github_repo → plugin_file reverse map from tracked marketplace installs.
		// ($tracked is keyed by plugin_file, so we invert it here.)
		$tracked_by_repo = [];
		foreach ( $tracked as $plugin_file => $data ) {
			if ( ! empty( $data['github_repo'] ) ) {
				$tracked_by_repo[ $data['github_repo'] ] = $plugin_file;
			}
		}

		// Build a slug → plugin_file map from all installed plugins so we can
		// match marketplace entries that don't have a known plugin_file yet.
		$slug_map = [];
		foreach ( array_keys( get_plugins() ) as $plugin_file ) {
			$folder = strstr( $plugin_file, '/', true ) ?: $plugin_file;
			$slug_map[ $folder ] = $plugin_file;
		}

		foreach ( $plugins as &$plugin ) {
			$file = $plugin['plugin_file'];

			// Try tracked installs by github_repo (most reliable — survives renamed folders).
			if ( ! $file && ! empty( $plugin['github_repo'] ) ) {
				$file = $tracked_by_repo[ $plugin['github_repo'] ] ?? '';
			}
			// Fallback: slug-based folder match (works for manually installed plugins).
			if ( ! $file ) {
				$file = $slug_map[ $plugin['slug'] ] ?? '';
			}

			if ( $file ) {
				$plugin['plugin_file']  = $file;
			}

			$plugin['is_installed']  = $file ? $installer->is_installed( $file ) : false;
			$plugin['is_active']     = $plugin['is_installed'] && isset( $active_plugins[ $file ] );
			$plugin['installed_ver'] = $plugin['is_installed'] ? $installer->get_installed_version( $file ) : null;
		}
		unset( $plugin );

		return $plugins;
	}
}
