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

	private function boot(): void {
		Tools\Logs\ToolWordpressLogs::apply_debug_flags();

		$tools = apply_filters( 'wpte_devzone_tools', [
			new Tools\Inspector\ToolOverview(),
			new Tools\Inspector\ToolTrips(),
			new Tools\Inspector\ToolBookings(),
			new Tools\Inspector\ToolPayments(),
			new Tools\Inspector\ToolCustomers(),
			new Tools\Inspector\ToolQuery(),
			new Tools\Logs\ToolWpteLogs(),
			new Tools\Logs\ToolWordpressLogs(),
			new Tools\Cron\ToolCron(),
			// new Tools\Perf\ToolPerf(),
			new Tools\Marketplace\ToolMarketplace(),
		] );

		new Admin( $tools );
	}

}

