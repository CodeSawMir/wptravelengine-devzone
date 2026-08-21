<?php

namespace WPTravelEngineDevZone\Tools\Marketplace;

defined( 'ABSPATH' ) || exit;

/**
 * Thin wrapper around WordPress's Plugin_Upgrader for AJAX contexts.
 */
class PluginInstaller {

	/**
	 * Download and install a plugin from a ZIP URL.
	 *
	 * @param string $zip_url Direct URL to a .zip file.
	 * @return array|\WP_Error On success: ['plugin_file' => 'folder/file.php']. On failure: WP_Error.
	 */
	public function install( string $zip_url, string $github_repo = '' ) {
		require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
		require_once ABSPATH . 'wp-admin/includes/class-wp-ajax-upgrader-skin.php';
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';

		$skin     = new \WP_Ajax_Upgrader_Skin();
		$upgrader = new \Plugin_Upgrader( $skin );
		$result   = $upgrader->install( $zip_url );

		if ( is_wp_error( $result ) ) {
			return $result;
		}
		if ( ! $result ) {
			$messages = $skin->get_upgrade_messages();
			$message  = ! empty( $messages ) ? implode( ' ', $messages ) : __( 'Plugin installation failed.', 'wptravelengine-devzone' );
			return new \WP_Error( 'install_failed', $message );
		}

		$plugin_file = $upgrader->plugin_info();
		if ( ! $plugin_file ) {
			return new \WP_Error( 'no_plugin_file', __( 'Plugin installed but main file could not be detected.', 'wptravelengine-devzone' ) );
		}

		// Rename installed folder to {owner}-{repo} for a predictable, clean path.
		if ( $github_repo ) {
			$current_folder = dirname( $plugin_file );
			$desired_folder = strtolower( str_replace( '/', '-', $github_repo ) );
			if ( $current_folder !== $desired_folder ) {
				global $wp_filesystem;
				$src = WP_PLUGIN_DIR . '/' . $current_folder;
				$dst = WP_PLUGIN_DIR . '/' . $desired_folder;
				if ( $wp_filesystem->is_dir( $dst ) ) {
					$wp_filesystem->delete( $dst, true );
				}
				if ( $wp_filesystem->move( $src, $dst ) ) {
					$plugin_file = $desired_folder . '/' . basename( $plugin_file );
				}
			}
		}

		return [ 'plugin_file' => $plugin_file ];
	}

	/**
	 * Activate an installed plugin by its plugin file path (e.g. 'folder/file.php').
	 *
	 * @param string $plugin_file Relative plugin file path.
	 * @return bool|\WP_Error true on success, WP_Error on failure.
	 */
	public function activate( string $plugin_file ) {
		if ( ! function_exists( 'activate_plugin' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		$result = activate_plugin( $plugin_file );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return true;
	}

	/**
	 * Check whether a plugin is installed (its main file exists on disk).
	 */
	public function is_installed( string $plugin_file ): bool {
		if ( ! $plugin_file ) {
			return false;
		}
		return file_exists( WP_PLUGIN_DIR . '/' . $plugin_file );
	}

	/**
	 * Check whether a plugin is currently active.
	 */
	public function is_active( string $plugin_file ): bool {
		if ( ! function_exists( 'is_plugin_active' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		return is_plugin_active( $plugin_file );
	}

	/**
	 * Return the installed version string for a plugin, or null if not installed.
	 *
	 * @return string|null
	 */
	public function get_installed_version( string $plugin_file ) {
		if ( ! $this->is_installed( $plugin_file ) ) {
			return null;
		}
		if ( ! function_exists( 'get_plugin_data' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		$data = get_plugin_data( WP_PLUGIN_DIR . '/' . $plugin_file, false, false );
		return isset( $data['Version'] ) ? $data['Version'] : null;
	}
}
