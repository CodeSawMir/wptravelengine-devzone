<?php

namespace WPTravelEngineDevZone\Tools\Perf;

use WPTravelEngineDevZone\Admin;
use WPTravelEngineDevZone\Tools\AbstractTool;

defined( 'ABSPATH' ) || exit;

class ToolPerf extends AbstractTool {

	public function get_slug(): string     { return 'perf'; }
	public function get_label(): string    { return __( 'Performance', 'wptravelengine-devzone' ); }
	public function get_template(): string { return WPTE_DEVZONE_DIR . 'templates/tab-perf.php'; }

	public function register_ajax(): void {
		add_action( 'wp_ajax_wpte_devzone_perf_stats',           [ $this, 'get_stats' ] );
		add_action( 'wp_ajax_wpte_devzone_perf_cleanup_counts',  [ $this, 'get_cleanup_counts' ] );
		add_action( 'wp_ajax_wpte_devzone_perf_do_cleanup',      [ $this, 'do_cleanup' ] );
		add_action( 'wp_ajax_wpte_devzone_perf_wte_counts',      [ $this, 'get_wte_counts' ] );
		add_action( 'wp_ajax_wpte_devzone_perf_do_wte_cleanup',  [ $this, 'do_wte_cleanup' ] );
		add_action( 'wp_ajax_wpte_devzone_perf_autoload',        [ $this, 'get_autoloaded_options' ] );
		add_action( 'wp_ajax_wpte_devzone_perf_plugins',         [ $this, 'get_plugin_health' ] );
	}

	// -------------------------------------------------------------------------
	// Endpoints
	// -------------------------------------------------------------------------

	public function get_stats(): void {
		Admin::verify_request();

		global $wpdb;

		$memory_limit = ini_get( 'memory_limit' );
		$memory_usage = memory_get_usage( true );

		// DB tables + sizes (may be restricted on some managed hosts)
		$db_stats = $wpdb->get_row(
			"SELECT COUNT(*) AS table_count,
			        SUM(data_length + index_length) AS total_size
			 FROM information_schema.tables
			 WHERE table_schema = DATABASE()"
		);

		// Autoloaded options total size
		$autoload_size = (int) $wpdb->get_var(
			"SELECT SUM(LENGTH(option_value))
			 FROM {$wpdb->options}
			 WHERE autoload IN ('yes','on','1','true')"
		);

		// Transients
		$transient_total = (int) $wpdb->get_var(
			"SELECT COUNT(*) FROM {$wpdb->options}
			 WHERE option_name LIKE '_transient_%'
			   AND option_name NOT LIKE '_transient_timeout_%'"
		);

		$transient_expired = (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->options} t
				 JOIN {$wpdb->options} tt
				   ON tt.option_name = CONCAT('_transient_timeout_', SUBSTRING(t.option_name, 13))
				 WHERE t.option_name LIKE '_transient_%'
				   AND t.option_name NOT LIKE '_transient_timeout_%'
				   AND tt.option_value < %d",
				time()
			)
		);

		$active_plugins = count( (array) get_option( 'active_plugins', [] ) );

		$revisions = (int) $wpdb->get_var(
			"SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'revision'"
		);

		wp_send_json_success( [
			'stats' => [
				'memory_limit'       => $memory_limit,
				'memory_usage'       => $memory_usage,
				'memory_usage_human' => size_format( $memory_usage ),
				'memory_limit_bytes' => $this->_parse_size( $memory_limit ),
				'db_table_count'     => $db_stats ? (int) $db_stats->table_count : null,
				'db_total_size'      => $db_stats ? (int) $db_stats->total_size : null,
				'db_total_size_human'=> $db_stats && $db_stats->total_size ? size_format( (int) $db_stats->total_size ) : null,
				'autoload_size'      => $autoload_size,
				'autoload_size_human'=> size_format( $autoload_size ),
				'transient_total'    => $transient_total,
				'transient_expired'  => $transient_expired,
				'active_plugins'     => $active_plugins,
				'revisions'          => $revisions,
			],
		] );
	}

	public function get_cleanup_counts(): void {
		Admin::verify_request();

		global $wpdb;

		$revisions = (int) $wpdb->get_var(
			"SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'revision'"
		);

		$expired_transients = (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->options} t
				 JOIN {$wpdb->options} tt
				   ON tt.option_name = CONCAT('_transient_timeout_', SUBSTRING(t.option_name, 13))
				 WHERE t.option_name LIKE '_transient_%'
				   AND t.option_name NOT LIKE '_transient_timeout_%'
				   AND tt.option_value < %d",
				time()
			)
		);

		$orphan_meta = (int) $wpdb->get_var(
			"SELECT COUNT(*) FROM {$wpdb->postmeta} pm
			 LEFT JOIN {$wpdb->posts} p ON pm.post_id = p.ID
			 WHERE p.ID IS NULL"
		);

		$bad_comments = (int) $wpdb->get_var(
			"SELECT COUNT(*) FROM {$wpdb->comments}
			 WHERE comment_approved IN ('spam', 'trash')"
		);

		$auto_drafts = (int) $wpdb->get_var(
			"SELECT COUNT(*) FROM {$wpdb->posts}
			 WHERE post_status = 'auto-draft'"
		);

		wp_send_json_success( [
			'counts' => [
				'revisions'          => $revisions,
				'expired_transients' => $expired_transients,
				'orphan_meta'        => $orphan_meta,
				'bad_comments'       => $bad_comments,
				'auto_drafts'        => $auto_drafts,
			],
		] );
	}

	public function do_cleanup(): void {
		Admin::verify_request();

		global $wpdb;

		$allowed = [ 'revisions', 'expired_transients', 'orphan_meta', 'bad_comments', 'auto_drafts' ];
		$action  = sanitize_text_field( wp_unslash( $_POST['cleanup_action'] ?? '' ) );

		if ( ! in_array( $action, $allowed, true ) ) {
			wp_send_json_error( [ 'message' => __( 'Invalid action.', 'wptravelengine-devzone' ) ] );
		}

		$deleted = 0;

		switch ( $action ) {
			case 'revisions':
				// Delete revision posts.
				$wpdb->query( "DELETE FROM {$wpdb->posts} WHERE post_type = 'revision'" );
				$deleted = (int) $wpdb->rows_affected;
				// Clean up orphaned meta from those deleted revisions.
				$wpdb->query(
					"DELETE pm FROM {$wpdb->postmeta} pm
					 LEFT JOIN {$wpdb->posts} p ON pm.post_id = p.ID
					 WHERE p.ID IS NULL"
				);
				break;

			case 'expired_transients':
				$expired_keys = $wpdb->get_col(
					$wpdb->prepare(
						"SELECT SUBSTRING(option_name, 20)
						 FROM {$wpdb->options}
						 WHERE option_name LIKE '_transient_timeout_%'
						   AND option_value < %d",
						time()
					)
				);
				foreach ( $expired_keys as $key ) {
					delete_transient( $key );
					$deleted++;
				}
				break;

			case 'orphan_meta':
				// Batched delete to avoid locking on large tables.
				do {
					$wpdb->query(
						"DELETE pm FROM {$wpdb->postmeta} pm
						 LEFT JOIN {$wpdb->posts} p ON pm.post_id = p.ID
						 WHERE p.ID IS NULL
						 LIMIT 1000"
					);
					$deleted += (int) $wpdb->rows_affected;
				} while ( $wpdb->rows_affected > 0 );
				break;

			case 'bad_comments':
				$wpdb->query(
					"DELETE FROM {$wpdb->comments}
					 WHERE comment_approved IN ('spam', 'trash')"
				);
				$deleted = (int) $wpdb->rows_affected;
				// Clean up orphaned comment meta.
				$wpdb->query(
					"DELETE cm FROM {$wpdb->commentmeta} cm
					 LEFT JOIN {$wpdb->comments} c ON cm.comment_id = c.comment_ID
					 WHERE c.comment_ID IS NULL"
				);
				break;

			case 'auto_drafts':
				$wpdb->query(
					"DELETE FROM {$wpdb->posts} WHERE post_status = 'auto-draft'"
				);
				$deleted = (int) $wpdb->rows_affected;
				break;
		}

		wp_cache_flush();

		wp_send_json_success( [
			'deleted' => $deleted,
			'message' => sprintf(
				/* translators: %d: number of items deleted */
				__( 'Deleted %d item(s).', 'wptravelengine-devzone' ),
				$deleted
			),
		] );
	}

	public function get_wte_counts(): void {
		Admin::verify_request();

		global $wpdb;

		$days   = max( 1, intval( $_POST['days'] ?? 30 ) );
		$cutoff = gmdate( 'Y-m-d H:i:s', strtotime( "-{$days} days" ) );

		$stale_bookings = (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->posts}
				 JOIN {$wpdb->postmeta} pm
				   ON pm.post_id = {$wpdb->posts}.ID
				   AND pm.meta_key = 'wp_travel_engine_booking_status'
				   AND pm.meta_value = 'pending'
				 WHERE post_type = 'booking'
				   AND post_status = 'publish'
				   AND post_date < %s",
				$cutoff
			)
		);

		$wte_transients = (int) $wpdb->get_var(
			"SELECT COUNT(*) FROM {$wpdb->options}
			 WHERE (
			     option_name LIKE '_transient_wte_%'
			  OR option_name LIKE '_transient_payment_key_%'
			  OR option_name LIKE '_transient_wp_travel_engine_%'
			 )
			 AND option_name NOT LIKE '_transient_timeout_%'"
		);

		wp_send_json_success( [
			'counts' => [
				'stale_bookings' => $stale_bookings,
				'wte_transients' => $wte_transients,
			],
		] );
	}

	public function do_wte_cleanup(): void {
		Admin::verify_request();

		$allowed = [ 'stale_bookings', 'wte_transients' ];
		$action  = sanitize_text_field( wp_unslash( $_POST['cleanup_action'] ?? '' ) );

		if ( ! in_array( $action, $allowed, true ) ) {
			wp_send_json_error( [ 'message' => __( 'Invalid action.', 'wptravelengine-devzone' ) ] );
		}

		global $wpdb;

		$deleted = 0;

		switch ( $action ) {
			case 'stale_bookings':
				$days   = max( 1, intval( $_POST['days'] ?? 30 ) );
				$cutoff = gmdate( 'Y-m-d H:i:s', strtotime( "-{$days} days" ) );

				$ids = $wpdb->get_col(
					$wpdb->prepare(
						"SELECT {$wpdb->posts}.ID FROM {$wpdb->posts}
						 JOIN {$wpdb->postmeta} pm
						   ON pm.post_id = {$wpdb->posts}.ID
						   AND pm.meta_key = 'wp_travel_engine_booking_status'
						   AND pm.meta_value = 'pending'
						 WHERE post_type = 'booking'
						   AND post_status = 'publish'
						   AND post_date < %s",
						$cutoff
					)
				);

				foreach ( $ids as $id ) {
					wp_trash_post( (int) $id );
					$deleted++;
				}
				break;

			case 'wte_transients':
				$keys = $wpdb->get_col(
					"SELECT SUBSTRING(option_name, 12)
					 FROM {$wpdb->options}
					 WHERE (
					     option_name LIKE '_transient_wte_%'
					  OR option_name LIKE '_transient_payment_key_%'
					  OR option_name LIKE '_transient_wp_travel_engine_%'
					 )
					 AND option_name NOT LIKE '_transient_timeout_%'"
				);

				foreach ( $keys as $key ) {
					delete_transient( $key );
					$deleted++;
				}
				break;
		}

		wp_cache_flush();

		wp_send_json_success( [
			'deleted' => $deleted,
			'message' => sprintf(
				/* translators: %d: number of items */
				__( 'Cleaned %d item(s).', 'wptravelengine-devzone' ),
				$deleted
			),
		] );
	}

	public function get_autoloaded_options(): void {
		Admin::verify_request();

		global $wpdb;

		$rows = $wpdb->get_results(
			"SELECT option_name, LENGTH(option_value) AS size_bytes, autoload
			 FROM {$wpdb->options}
			 WHERE autoload IN ('yes','on','1','true')
			 ORDER BY size_bytes DESC
			 LIMIT 20",
			ARRAY_A
		);

		$items = array_map( function ( $row ) {
			return [
				'name'       => $row['option_name'],
				'size_bytes' => (int) $row['size_bytes'],
				'size_human' => size_format( (int) $row['size_bytes'] ),
			];
		}, $rows );

		wp_send_json_success( [ 'options' => $items ] );
	}

	public function get_plugin_health(): void {
		Admin::verify_request();

		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}

		$all_plugins    = get_plugins();
		$active_plugins = array_flip( (array) get_option( 'active_plugins', [] ) );

		$items = [];

		// Guard against slow scans on large setups.
		set_time_limit( 30 );

		foreach ( $all_plugins as $file => $data ) {
			$dir      = WP_PLUGIN_DIR . '/' . dirname( $file );
			$dir_size = 0;

			if ( is_dir( $dir ) ) {
				try {
					$it = new \RecursiveIteratorIterator(
						new \RecursiveDirectoryIterator( $dir, \FilesystemIterator::SKIP_DOTS )
					);
					foreach ( $it as $f ) {
						$dir_size += $f->getSize();
					}
				} catch ( \Exception $e ) {
					$dir_size = 0;
				}
			}

			$items[] = [
				'file'       => $file,
				'name'       => $data['Name'],
				'version'    => $data['Version'],
				'is_active'  => isset( $active_plugins[ $file ] ),
				'size_bytes' => $dir_size,
				'size_human' => size_format( $dir_size ),
			];
		}

		usort( $items, fn( $a, $b ) => $b['size_bytes'] - $a['size_bytes'] );

		wp_send_json_success( [ 'plugins' => $items ] );
	}

	// -------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------

	private function _parse_size( string $size ): int {
		$unit  = strtolower( substr( $size, -1 ) );
		$value = (int) $size;
		switch ( $unit ) {
			case 'g': return $value * 1073741824;
			case 'm': return $value * 1048576;
			case 'k': return $value * 1024;
		}
		return $value;
	}
}
