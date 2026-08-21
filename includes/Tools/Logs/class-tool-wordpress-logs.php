<?php

namespace WPTravelEngineDevZone\Tools\Logs;

use WPTravelEngineDevZone\Admin;
use WPTravelEngineDevZone\Tools\AbstractTool;

defined( 'ABSPATH' ) || exit;

class ToolWordpressLogs extends AbstractTool {

	const OPTION = 'wpte_devzone_debug_flags';

	public function get_slug(): string     { return 'wordpress'; }
	public function get_label(): string    { return __( 'WordPress', 'wptravelengine-devzone' ); }
	public function get_template(): string { return WPTE_DEVZONE_DIR . 'templates/tab-logs-wordpress.php'; }

	public function register_ajax(): void {
		add_action( 'wp_ajax_wpte_devzone_logs_wp_save_flags', [ $this, 'save_flags' ] );
		add_action( 'wp_ajax_wpte_devzone_logs_wp_clear_log',  [ $this, 'clear_log' ] );
	}

	/**
	 * Applies saved debug flags on every load while the plugin is active.
	 * Uses ini_set() for logging/display so constants already set false in
	 * wp-config.php are still overridden at the PHP level.
	 * When the plugin is deactivated, nothing persists — the site reverts.
	 */
	public static function apply_debug_flags(): void {
		$flags = get_option( self::OPTION, [] );
		if ( empty( $flags ) ) {
			return;
		}

		if ( ! empty( $flags['WP_DEBUG'] ) ) {
			defined( 'WP_DEBUG' ) || define( 'WP_DEBUG', true );
			error_reporting( E_ALL ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions
		}

		if ( ! empty( $flags['WP_DEBUG_LOG'] ) ) {
			defined( 'WP_DEBUG_LOG' ) || define( 'WP_DEBUG_LOG', true );
			$log = defined( 'WP_DEBUG_LOG' ) && is_string( WP_DEBUG_LOG )
				? WP_DEBUG_LOG
				: WP_CONTENT_DIR . '/debug.log';
			ini_set( 'log_errors', '1' );        // phpcs:ignore WordPress.PHP.IniSet
			ini_set( 'error_log', $log );         // phpcs:ignore WordPress.PHP.IniSet
		}

		if ( ! empty( $flags['WP_DEBUG_DISPLAY'] ) ) {
			defined( 'WP_DEBUG_DISPLAY' ) || define( 'WP_DEBUG_DISPLAY', true );
			ini_set( 'display_errors', '1' );    // phpcs:ignore WordPress.PHP.IniSet
		}

		if ( ! empty( $flags['SCRIPT_DEBUG'] ) ) {
			defined( 'SCRIPT_DEBUG' ) || define( 'SCRIPT_DEBUG', true );
		}
	}

	/**
	 * Saves the enabled/disabled state for a single debug constant to the option.
	 */
	public function save_flags(): void {
		Admin::verify_request();

		$allowed  = [ 'WP_DEBUG', 'WP_DEBUG_LOG', 'WP_DEBUG_DISPLAY', 'SCRIPT_DEBUG' ];
		$constant = strtoupper( sanitize_text_field( wp_unslash( $_POST['constant'] ?? '' ) ) );
		$enable   = '1' === ( $_POST['value'] ?? '0' );

		if ( ! in_array( $constant, $allowed, true ) ) {
			wp_send_json_error( [ 'message' => 'Invalid constant.' ] );
		}

		$flags               = (array) get_option( self::OPTION, [] );
		$flags[ $constant ]  = $enable;

		update_option( self::OPTION, array_filter( $flags ), false );

		wp_send_json_success( [ 'constant' => $constant, 'value' => $enable ] );
	}

	/**
	 * Truncates the WordPress debug log file.
	 */
	public function clear_log(): void {
		Admin::verify_request();

		$log_path = defined( 'WP_DEBUG_LOG' ) && is_string( WP_DEBUG_LOG )
			? WP_DEBUG_LOG
			: WP_CONTENT_DIR . '/debug.log';

		if ( ! file_exists( $log_path ) ) {
			wp_send_json_success( [ 'message' => 'Log file does not exist.' ] );
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		file_put_contents( $log_path, '' );

		wp_send_json_success( [ 'message' => 'Log cleared.' ] );
	}
}
