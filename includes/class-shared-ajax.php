<?php

namespace WPTravelEngineDevZone;

use WPTravelEngineDevZone\Tools\AbstractPostTool;
use WPTravelEngineDevZone\Traits\ValueHelperTrait;
use WPTravelEngine\Utilities\ArrayUtility;

defined( 'ABSPATH' ) || exit;

/**
 * Registers AJAX endpoints that are shared across all post-type tools:
 * tab loading, post listing/reading/saving, and data unserialization.
 */
class SharedAjax {

	use ValueHelperTrait;

	// Meta keys that must never be written via the Dev Zone.
	private const BLOCKED_META_KEYS = [
		'_wp_trash_meta_time',
		'_wp_trash_meta_status',
		'_wp_old_slug',
		'_edit_lock',
		'_edit_last',
	];

	private const BLOCKED_META_PREFIXES = [
		'_wp_',
	];

	/** @var AbstractTool[] */
	private array $tools;

	/** @param AbstractTool[] $tools */
	public function __construct( array $tools ) {
		$this->tools = $tools;
	}

	public function register(): void {
		$actions = [
			'wpte_devzone_load_tab'        => 'load_tab',
			'wpte_devzone_list_posts'      => 'list_posts',
			'wpte_devzone_get_post'        => 'get_post',
			'wpte_devzone_save_meta'       => 'save_meta',
			'wpte_devzone_save_post_field' => 'save_post_field',
			'wpte_devzone_get_relations'   => 'get_relations',
		];
		foreach ( $actions as $action => $method ) {
			add_action( "wp_ajax_{$action}", [ $this, $method ] );
		}
	}

	// -------------------------------------------------------------------------
	// Endpoints
	// -------------------------------------------------------------------------

	public function load_tab(): void {
		Admin::verify_request();

		$tab  = sanitize_key( $_POST['tab'] ?? '' );
		$tool = null;

		foreach ( $this->tools as $t ) {
			if ( $t->get_slug() === $tab ) {
				$tool = $t;
				break;
			}
		}

		if ( ! $tool ) {
			wp_send_json_error( [ 'message' => 'Invalid tab' ] );
		}

		ob_start();
		require $tool->get_template();
		$html = ob_get_clean();

		wp_send_json_success( [ 'html' => $html, 'tab' => $tab ] );
	}

	public function list_posts(): void {
		Admin::verify_request();

		$post_type = sanitize_key( $_GET['post_type'] ?? '' );
		$tool      = $this->find_post_tool_by_type( $post_type );

		if ( ! $tool ) {
			wp_send_json_error( [ 'message' => 'Invalid post type' ] );
		}

		$search         = sanitize_text_field( wp_unslash( $_GET['search'] ?? '' ) );
		$page           = max( 1, intval( $_GET['paged'] ?? 1 ) );
		$pinned_ids_raw = sanitize_text_field( wp_unslash( $_GET['pinned_ids'] ?? '' ) );
		$pinned_ids     = array_values( array_filter( array_map( 'intval', explode( ',', $pinned_ids_raw ) ) ) );

		wp_send_json_success( $tool->get_posts( $search, $page, $pinned_ids ) );
	}

	public function get_post(): void {
		Admin::verify_request();

		$post_id = intval( $_GET['post_id'] ?? 0 );
		$post    = get_post( $post_id );

		if ( ! $post ) {
			wp_send_json_error( [ 'message' => 'Post not found' ] );
		}

		$raw_meta = get_post_meta( $post_id );
		$meta     = [];
		foreach ( $raw_meta as $key => $values ) {
			$meta[ $key ] = maybe_unserialize( $values[0] ?? null );
		}

		$taxonomies = get_object_taxonomies( $post->post_type );
		$terms      = [];
		foreach ( $taxonomies as $tax ) {
			$t           = get_the_terms( $post_id, $tax );
			$terms[ $tax ] = ( $t && ! is_wp_error( $t ) ) ? wp_list_pluck( $t, 'name' ) : [];
		}

		wp_send_json_success( [
			'post'       => [
				'ID'           => $post->ID,
				'post_title'   => $post->post_title,
				'post_status'  => $post->post_status,
				'post_date'    => $post->post_date,
				'post_type'    => $post->post_type,
				'post_content' => $post->post_content,
			],
			'meta'       => $meta,
			'taxonomies' => $terms,
		] );
	}

	public function save_meta(): void {
		Admin::verify_request();

		$post_id  = intval( $_POST['post_id'] ?? 0 );
		$meta_key = sanitize_text_field( wp_unslash( $_POST['meta_key'] ?? '' ) );
		$key_path = sanitize_text_field( wp_unslash( $_POST['key_path'] ?? '' ) );
		$value    = wp_unslash( $_POST['value'] ?? '' );

		if ( ! $post_id || ! $meta_key ) {
			wp_send_json_error( [ 'message' => 'Missing post_id or meta_key' ] );
		}
		if ( ! $this->is_meta_key_writable( $meta_key ) ) {
			wp_send_json_error( [ 'message' => "Meta key '{$meta_key}' is protected." ], 403 );
		}

		$current   = get_post_meta( $post_id, $meta_key, true );
		$old_value = $current;

		if ( $key_path ) {
			$arr       = ArrayUtility::make( (array) $current );
			$new_value = $this->cast_value( $value, $arr->get( $key_path ) );
			$arr->set( $key_path, $new_value );
			$current   = $arr->value();
		} else {
			$new_value = $this->cast_value( $value, $current );
			$current   = $new_value;
		}

		$this->log_change(
			"post_meta:{$post_id}.{$meta_key}" . ( $key_path ? ".{$key_path}" : '' ),
			$old_value,
			$new_value
		);

		update_post_meta( $post_id, $meta_key, $current );
		wp_send_json_success( [ 'saved' => true ] );
	}

	public function save_post_field(): void {
		Admin::verify_request();

		$post_id = intval( $_POST['post_id'] ?? 0 );
		$field   = sanitize_key( $_POST['field'] ?? '' );
		$value   = sanitize_text_field( wp_unslash( $_POST['value'] ?? '' ) );

		$allowed_fields = [ 'post_title', 'post_status', 'post_date' ];
		if ( ! $post_id || ! in_array( $field, $allowed_fields, true ) ) {
			wp_send_json_error( [ 'message' => 'Invalid field or post_id' ] );
		}

		$post = get_post( $post_id );
		if ( ! $post ) {
			wp_send_json_error( [ 'message' => 'Post not found' ] );
		}

		$old_value = $post->$field;
		$this->log_change( "post_field:{$post_id}.{$field}", $old_value, $value );

		wp_update_post( [
			'ID'   => $post_id,
			$field => $value,
		] );

		wp_send_json_success( [ 'saved' => true ] );
	}

	public function get_relations(): void {
		Admin::verify_request();

		$post_id   = intval( $_GET['post_id'] ?? 0 );
		$post_type = sanitize_key( $_GET['post_type'] ?? '' );
		$group     = sanitize_key( $_GET['group'] ?? '' );
		$page      = max( 1, intval( $_GET['page'] ?? 1 ) );
		$post      = get_post( $post_id );

		if ( ! $post || ! $post_id ) {
			wp_send_json_error( [ 'message' => 'Post not found' ] );
		}

		$tool = $this->find_post_tool_by_type( $post_type );

		if ( ! $tool ) {
			wp_send_json_error( [ 'message' => 'Invalid post type' ] );
		}

		wp_send_json_success( [ 'relations' => $tool->get_relations( $post_id, $group, $page ) ] );
	}

	// -------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------

	private function find_post_tool_by_type( string $post_type ): ?AbstractPostTool {
		foreach ( $this->tools as $tool ) {
			if ( $tool instanceof AbstractPostTool && $tool->get_post_type() === $post_type ) {
				return $tool;
			}
		}
		return null;
	}

	private function is_meta_key_writable( string $key ): bool {
		if ( in_array( $key, self::BLOCKED_META_KEYS, true ) ) {
			return false;
		}
		foreach ( self::BLOCKED_META_PREFIXES as $prefix ) {
			if ( strpos( $key, $prefix ) === 0 ) {
				return false;
			}
		}
		return true;
	}
}
