<?php
/**
 * Plugin Name: WPTE DevZone
 * Plugin URI:  https://github.com/CodeSawMir
 * Description: Visual database inspector for WP Travel Engine — diagnose and fix data issues directly in WP Admin.
 * Version:     1.2.0
 * Author:      Samir Shrestha
 * Text Domain: wptravelengine-devzone
 * Requires WP: 6.9
 * Requires PHP: 7.4
 */

defined( 'ABSPATH' ) || exit;

define( 'WPTE_DEVZONE_VERSION', '1.2.0' );
define( 'WPTE_DEVZONE_DIR', plugin_dir_path( __FILE__ ) );
define( 'WPTE_DEVZONE_URL', plugin_dir_url( __FILE__ ) );

register_activation_hook( __FILE__, function () {
	set_transient( 'wpte_devzone_activation_pointer', true, DAY_IN_SECONDS );
} );

require_once WPTE_DEVZONE_DIR . 'includes/class-plugin.php';
\WPTravelEngineDevZone\Plugin::register_autoloader();

// Priority 20: addon plugins hook wpte_devzone_tools at default priority 10,
// so they must register before we boot and apply that filter.
add_action( 'plugins_loaded', function () {
	// Only boot in the admin context (includes admin-ajax.php for AJAX handlers).
	if ( ! is_admin() ) {
		return;
	}

	if ( ! defined( 'WP_TRAVEL_ENGINE_VERSION' ) ) {
		// Show the dependency notice only outside our own page to avoid double-notice clutter.
		add_action( 'admin_notices', function () {
			$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
			if ( $screen && strpos( $screen->id, \WPTravelEngineDevZone\Admin::PAGE_SLUG ) !== false ) {
				return;
			}
			echo '<div class="notice notice-error"><p><strong>WTE Dev Zone</strong> requires the <strong>WP Travel Engine</strong> plugin to be active.</p></div>';
		} );
		return;
	}

	\WPTravelEngineDevZone\Plugin::instance();
}, 20 );
