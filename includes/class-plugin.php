<?php

namespace WPTravelEngineDevZone;

defined( 'ABSPATH' ) || exit;

class Plugin {

	private static ?Plugin $instance = null;

	public static function register_autoloader(): void {
		spl_autoload_register( function ( $class ) {
			$prefix = 'WPTravelEngineDevZone\\';
			if ( strpos( $class, $prefix ) !== 0 ) {
				return;
			}

			// Convert namespace path to file path, supporting subdirectories:
			// WPTravelEngineDevZone\Admin            → includes/class-admin.php
			// WPTravelEngineDevZone\Tools\ToolTrips  → includes/Tools/class-tool-trips.php
			// WPTravelEngineDevZone\Traits\FooTrait  → includes/Traits/class-foo-trait.php
			$parts     = explode( '\\', substr( $class, strlen( $prefix ) ) );
			$classname = array_pop( $parts );
			$kebab     = strtolower( preg_replace( '/([A-Z])/', '-$1', lcfirst( $classname ) ) );
			$subdir    = $parts ? implode( DIRECTORY_SEPARATOR, $parts ) . DIRECTORY_SEPARATOR : '';
			$file      = WPTE_DEVZONE_DIR . 'includes/' . $subdir . 'class-' . $kebab . '.php';

			if ( file_exists( $file ) ) {
				require_once $file;
			}
		} );
	}

	public static function instance(): Plugin {
		if ( null === self::$instance ) {
			self::$instance = new self();
			self::$instance->boot();
		}
		return self::$instance;
	}

	/**
	 * Whether WP Travel Engine is active on this site.
	 *
	 * Dev Zone's core tools (Tinker, Query, Cron, Logs, Marketplace) work on
	 * any WordPress install; the Inspector suite and WTE log tab are specific
	 * to WP Travel Engine's data model and only register when it's present.
	 */
	public static function is_wte_active(): bool {
		return defined( 'WP_TRAVEL_ENGINE_VERSION' );
	}

	private function boot(): void {
		Tools\Logs\ToolWordpressLogs::apply_debug_flags();

		$tools = [
			new Tools\Inspector\ToolQuery(),
			new Tools\Logs\ToolWordpressLogs(),
			new Tools\Cron\ToolCron(),
			new Tools\Tinker\ToolTinker(),
			// new Tools\Perf\ToolPerf(),
			new Tools\Marketplace\ToolMarketplace(),
		];

		if ( self::is_wte_active() ) {
			array_push(
				$tools,
				new Tools\Inspector\ToolOverview(),
				new Tools\Inspector\ToolTrips(),
				new Tools\Inspector\ToolBookings(),
				new Tools\Inspector\ToolPayments(),
				new Tools\Inspector\ToolCustomers(),
				new Tools\Logs\ToolWpteLogs()
			);
		}

		$tools = apply_filters( 'wpte_devzone_tools', $tools );

		new Admin( $tools );
	}

}

