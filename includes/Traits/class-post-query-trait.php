<?php

namespace WPTravelEngineDevZone\Traits;

defined( 'ABSPATH' ) || exit;

/**
 * Provides standardised WP_Query helpers for post-type tools.
 *
 * suppress_filters => true is set on every WP_Query to prevent un-guarded
 * third-party pre_get_posts hooks from silently altering sidebar queries.
 */
trait PostQueryTrait {

	/**
	 * Build the standard list-posts response payload used by SharedAjax::list_posts().
	 *
	 * @param string $search     Raw search term (may be empty).
	 * @param int    $page       1-based page number.
	 * @param int[]  $pinned_ids Post IDs that must appear first (from localStorage).
	 * @return array{posts: array, pinned: array, total: int, total_pages: int, page: int}
	 */
	public function get_posts( string $search, int $page, array $pinned_ids = [] ): array {
		$post_type = $this->get_post_type();
		$format    = fn( \WP_Post $p ) => $this->format_post( $p );

		// Pinned query — preserve pin order; suppress_filters blocks pre_get_posts.
		$pinned_posts = [];
		if ( ! empty( $pinned_ids ) ) {
			$pinned_q = new \WP_Query( [
				'post_type'           => $post_type,
				'post_status'         => array_keys( get_post_stati() ),
				'posts_per_page'      => count( $pinned_ids ),
				'post__in'            => $pinned_ids,
				'orderby'             => 'post__in',
				'ignore_sticky_posts' => true,
				'suppress_filters'    => true,
			] );
			$pinned_posts = array_map( $format, $pinned_q->posts );
		}

		$args = array_merge(
			[
				'post_type'        => $post_type,
				'post_status'      => array_keys( get_post_stati() ),
				'posts_per_page'   => 30,
				'paged'            => $page,
				's'                => $search,
				'orderby'          => 'ID',
				'order'            => 'DESC',
				'suppress_filters' => true,
			],
			$this->extra_query_args()
		);
		if ( ! empty( $pinned_ids ) ) {
			$args['post__not_in'] = $pinned_ids;
		}

		$query = new \WP_Query( $args );
		$posts = array_map( $format, $query->posts );

		// Direct ID lookup when the search string is a plain integer.
		if ( $search && ctype_digit( $search ) ) {
			$id_post = get_post( intval( $search ) );
			if ( $id_post && $id_post->post_type === $post_type
				&& ! in_array( $id_post->ID, array_column( $posts, 'id' ), true ) ) {
				array_unshift( $posts, $format( $id_post ) );
			}
		}

		return [
			'posts'       => $posts,
			'pinned'      => $pinned_posts,
			'total'       => $query->found_posts,
			'total_pages' => $query->max_num_pages,
			'page'        => $page,
		];
	}

	/** Extra args merged into the main list query. Override in concrete tools. */
	protected function extra_query_args(): array {
		return [];
	}

	/** Standard sidebar-list row. */
	public function format_post( \WP_Post $p ): array {
		return [
			'id'     => $p->ID,
			'title'  => $p->post_title ?: '#' . $p->ID,
			'status' => $p->post_status,
			'date'   => $p->post_date,
		];
	}

	/** Standard relations row. Tools may override to add extra fields. */
	public function format_relation_post( \WP_Post $p ): array {
		return [
			'id'        => $p->ID,
			'title'     => $p->post_title ?: '#' . $p->ID,
			'status'    => $p->post_status,
			'post_type' => $p->post_type,
		];
	}

	/**
	 * Extract unique trip IDs from a booking's cart_info meta.
	 *
	 * Tries the unserialized array first; falls back to a regex on the raw
	 * serialised DB value so it works regardless of how WordPress stored it.
	 *
	 * @return int[]
	 */
	protected function trip_ids_from_cart_info( int $booking_id ): array {
		$trip_ids  = [];
		$cart_info = get_post_meta( $booking_id, 'cart_info', true );

		if ( ! is_array( $cart_info ) ) {
			$cart_info = maybe_unserialize( $cart_info );
		}

		if ( is_array( $cart_info ) ) {
			foreach ( $cart_info as $item ) {
				if ( is_array( $item ) && ! empty( $item['trip_id'] ) ) {
					$trip_ids[] = intval( $item['trip_id'] );
				}
			}
		}

		// Fallback: regex on the raw serialised string.
		if ( empty( $trip_ids ) ) {
			global $wpdb;
			$raw = $wpdb->get_var(
				$wpdb->prepare(
					"SELECT meta_value FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key = 'cart_info' LIMIT 1",
					$booking_id
				)
			);
			if ( $raw ) {
				preg_match_all( '/s:7:"trip_id";i:(\d+);/', $raw, $m );
				$trip_ids = array_map( 'intval', $m[1] ?? [] );
			}
		}

		return array_values( array_unique( array_filter( $trip_ids ) ) );
	}

	/**
	 * Paginate an in-memory array into the standard relations shape.
	 *
	 * @return array{items: array, total: int, total_pages: int, page: int}
	 */
	protected function paginate_array( array $all, int $page, int $per_page = 15 ): array {
		$total       = count( $all );
		$total_pages = max( 1, (int) ceil( $total / $per_page ) );
		$offset      = ( $page - 1 ) * $per_page;
		return [
			'items'       => array_values( array_slice( $all, $offset, $per_page ) ),
			'total'       => $total,
			'total_pages' => $total_pages,
			'page'        => $page,
		];
	}
}
