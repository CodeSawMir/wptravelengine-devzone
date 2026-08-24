<?php
/**
 * Standalone bootstrap for Tinker's process-isolated run mode.
 *
 * Not autoloaded — invoked directly as a script by ToolTinker::run_isolated(),
 * either:
 *   a) `<cli-php> isolated-runner.php <ABSPATH> <code file> <result file>`, or
 *   b) `wp eval-file isolated-runner.php <code file> <result file>`
 *      (WP-CLI bootstraps WordPress itself in this case and passes the extra
 *      positional args through as $args, which is how the two invocation
 *      styles are told apart below).
 *
 * A fatal error, timeout kill, or crash here only takes down this disposable
 * process — never the web-serving worker that spawned it. The result (output,
 * return value, diagnostics, fatal) is written to the result file as JSON
 * instead of an HTTP response, since there is no HTTP request in this process.
 */

use WPTravelEngineDevZone\Tools\Tinker\ToolTinker;

if ( isset( $args ) && is_array( $args ) ) {
	// Launched via `wp eval-file` — WordPress is already booted. The
	// equivalent of the WP_DISABLE_FATAL_ERROR_HANDLER define below was
	// already injected via a `--exec` flag ahead of WP's own bootstrap —
	// see build_isolation_command()'s wp-cli branch.
	[ $code_file, $result_file ] = $args;
} else {
	// Launched directly against a CLI PHP binary — boot WordPress ourselves.
	[ , $abspath, $code_file, $result_file ] = $argv;
	define( 'WP_USE_THEMES', false );
	// WP core's own fatal-error/recovery-mode handler would otherwise echo its
	// "critical error" HTML into the same output buffer this file's capture()
	// call is collecting the snippet's own output into. We already have a
	// purpose-built fatal-error capture (see ToolTinker::capture()); WP's
	// competing one only needs disabling in this disposable process.
	define( 'WP_DISABLE_FATAL_ERROR_HANDLER', true );
	require rtrim( $abspath, '/' ) . '/wp-load.php';
}

ToolTinker::set_delivery( static function ( array $payload ) use ( $result_file ) {
	file_put_contents( $result_file, wp_json_encode( $payload ) );
} );

ToolTinker::run_snippet_file( $code_file );
