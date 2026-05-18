<?php
/**
 * Uninstall hook for WP Travel Engine Dev Zone.
 *
 * Runs when the plugin is deleted via the WordPress Plugins admin screen.
 * Removes all plugins installed through the Marketplace tab, then cleans up
 * the options this plugin has stored.
 */
defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

$tracked = get_option( 'wpte_devzone_marketplace_installed', [] );

if ( ! empty( $tracked ) && is_array( $tracked ) ) {
	require_once ABSPATH . 'wp-admin/includes/plugin.php';
	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
	require_once ABSPATH . 'wp-admin/includes/class-wp-ajax-upgrader-skin.php';

	// Initialize the WP filesystem (required by delete_plugins()).
	WP_Filesystem();

	foreach ( array_keys( $tracked ) as $plugin_file ) {
		if ( is_plugin_active( $plugin_file ) ) {
			deactivate_plugins( $plugin_file );
		}
		if ( file_exists( WP_PLUGIN_DIR . '/' . $plugin_file ) ) {
			delete_plugins( [ $plugin_file ] );
		}
	}
}

delete_option( 'wpte_devzone_marketplace_installed' );
delete_option( 'wpte_dz_github_token' );
delete_option( 'wpte_dz_github_user' );
