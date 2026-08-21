<?php

namespace WPTravelEngineDevZone\Tools\Tinker;

use WPTravelEngineDevZone\Admin;
use WPTravelEngineDevZone\Tools\AbstractTool;

defined( 'ABSPATH' ) || exit;

/**
 * Tinker tab — a PHP scratchpad that runs snippets inside a fully booted
 * WordPress request.
 *
 * Code runs through admin-ajax.php, which means `init` has already fired by the
 * time the snippet is evaluated — the same guarantee the
 * .wpte-devzone/snippets/_playground.php bootstrap gets from wrapping its call
 * in add_action( 'init', ... ). Every WP function, every WPTravelEngine class
 * and every active add-on is therefore available to the snippet.
 *
 * Captured per run: echoed output (raw, so Kint `d()` dumps render), the eval
 * return value, notices/warnings, fatal errors, `die()`/`exit()` calls,
 * wall time and peak memory.
 */
class ToolTinker extends AbstractTool {

	/** Option holding saved snippets, keyed by sanitized name. */
	private const SNIPPETS_OPTION = 'wpte_devzone_tinker_snippets';

	/** Diagnostics (notices/warnings) collected during the current run. */
	private static array $diagnostics = [];

	/** Everything the snippet printed, accumulated by the output-buffer callback. */
	private static string $captured = '';

	/** Output-buffer nesting level captured before the snippet ran. */
	private static int $base_ob_level = 0;

	/** True once a JSON response has been sent, so the shutdown hook stands down. */
	private static bool $responded = false;

	public function get_slug(): string     { return 'tinker'; }
	public function get_label(): string    { return __( 'Tinker', 'wptravelengine-devzone' ); }
	public function get_template(): string { return WPTE_DEVZONE_DIR . 'templates/tab-tinker.php'; }

	public function register_ajax(): void {
		add_action( 'wp_ajax_wpte_devzone_tinker_run',            [ $this, 'run_code' ] );
		add_action( 'wp_ajax_wpte_devzone_tinker_save_snippet',   [ $this, 'save_snippet' ] );
		add_action( 'wp_ajax_wpte_devzone_tinker_delete_snippet', [ $this, 'delete_snippet' ] );
	}

	/**
	 * Loads WordPress's bundled CodeMirror (the same editor behind the Plugin/Theme
	 * File Editor) for PHP syntax highlighting. No third-party package needed.
	 */
	public function enqueue_assets(): void {
		wp_enqueue_style(
			'wpte-devzone-tinker',
			WPTE_DEVZONE_URL . 'assets/css/tabs/tinker.css',
			[ 'wpte-devzone' ],
			WPTE_DEVZONE_VERSION
		);

		if ( ! self::is_enabled() ) {
			return;
		}
		wp_enqueue_code_editor( [ 'type' => 'application/x-httpd-php' ] );
	}

	/**
	 * Whether snippet execution is permitted.
	 *
	 * Disabled on production environments by default; override with the
	 * 'wpte_devzone_tinker_enabled' filter.
	 */
	public static function is_enabled(): bool {
		$default = 'production' !== wp_get_environment_type();
		return (bool) apply_filters( 'wpte_devzone_tinker_enabled', $default );
	}

	/**
	 * Saved snippets, keyed by sanitized name.
	 *
	 * @return array<string,array{name:string,code:string,updated:int}>
	 */
	public static function get_snippets(): array {
		$snippets = get_option( self::SNIPPETS_OPTION, [] );
		return is_array( $snippets ) ? $snippets : [];
	}

	// -------------------------------------------------------------------------
	// Endpoints
	// -------------------------------------------------------------------------

	public function run_code(): void {
		Admin::verify_request();

		if ( ! self::is_enabled() ) {
			wp_send_json_error( [ 'message' => __( 'Tinker is disabled on this environment.', 'wptravelengine-devzone' ) ], 403 );
		}

		$code = trim( (string) wp_unslash( $_POST['code'] ?? '' ) );

		if ( '' === $code ) {
			wp_send_json_error( [ 'message' => __( 'Nothing to run.', 'wptravelengine-devzone' ) ] );
		}

		// eval() must not see PHP tags. Stripping in place keeps line numbers aligned.
		$code = (string) preg_replace( '/^<\?(?:php|=)?/', '', $code );
		$code = (string) preg_replace( '/\?>\s*$/', '', $code );

		self::$diagnostics   = [];
		self::$captured      = '';
		self::$responded     = false;
		self::$base_ob_level = ob_get_level();

		$started      = microtime( true );
		$start_memory = memory_get_usage();

		set_error_handler( [ self::class, 'collect_diagnostic' ] );
		// Catches die()/exit() from dd() and uncatchable compile/fatal errors.
		register_shutdown_function( [ self::class, 'respond_on_shutdown' ], $started, $start_memory );

		// Buffer through a callback: PHP may flush buffers before shutdown handlers
		// run when the snippet calls die(), so the callback — not the buffer — is
		// what reliably holds the printed output.
		ob_start( [ self::class, 'capture_chunk' ] );

		$result    = null;
		$throwable = null;

		try {
			// Isolated scope: the snippet sees neither $this nor any local of this method.
			$evaluate = static function ( string $__wpte_tinker_code ) {
				return eval( $__wpte_tinker_code );
			};
			$result = $evaluate( $code );
		} catch ( \Throwable $e ) {
			$throwable = $e;
		}

		restore_error_handler();

		self::respond( [
			'output'     => self::drain_buffers(),
			'result'     => $throwable ? null : $result,
			'has_result' => ! $throwable && null !== $result,
			'throwable'  => $throwable,
			'exited'     => false,
		], $started, $start_memory );
	}

	public function save_snippet(): void {
		Admin::verify_request();

		$name = sanitize_text_field( wp_unslash( $_POST['name'] ?? '' ) );
		$code = (string) wp_unslash( $_POST['code'] ?? '' );
		$key  = sanitize_key( str_replace( ' ', '-', $name ) );

		if ( '' === $name || '' === $key ) {
			wp_send_json_error( [ 'message' => __( 'Snippet name is required.', 'wptravelengine-devzone' ) ] );
		}

		$snippets         = self::get_snippets();
		$snippets[ $key ] = [
			'name'    => $name,
			'code'    => $code,
			'updated' => time(),
		];

		update_option( self::SNIPPETS_OPTION, $snippets, false );

		wp_send_json_success( [ 'key' => $key, 'snippets' => $snippets ] );
	}

	public function delete_snippet(): void {
		Admin::verify_request();

		$key      = sanitize_key( $_POST['key'] ?? '' );
		$snippets = self::get_snippets();

		if ( ! isset( $snippets[ $key ] ) ) {
			wp_send_json_error( [ 'message' => __( 'Snippet not found.', 'wptravelengine-devzone' ) ] );
		}

		unset( $snippets[ $key ] );
		update_option( self::SNIPPETS_OPTION, $snippets, false );

		wp_send_json_success( [ 'snippets' => $snippets ] );
	}

	// -------------------------------------------------------------------------
	// Run capture
	// -------------------------------------------------------------------------

	/**
	 * Error handler installed for the duration of a run. Returning true keeps
	 * PHP from printing the notice into the captured output.
	 */
	public static function collect_diagnostic( int $errno, string $message, string $file = '', int $line = 0 ): bool {
		self::$diagnostics[] = [
			'type'    => self::error_label( $errno ),
			'message' => $message,
			'file'    => self::relative_path( $file ),
			'line'    => $line,
		];
		return true;
	}

	/**
	 * Last-resort responder: the snippet called die()/exit() or triggered a
	 * fatal that try/catch cannot see.
	 */
	public static function respond_on_shutdown( float $started, int $start_memory ): void {
		if ( self::$responded ) {
			return;
		}

		$output = self::drain_buffers();
		$fatal  = error_get_last();
		$types  = E_ERROR | E_PARSE | E_CORE_ERROR | E_COMPILE_ERROR | E_USER_ERROR | E_RECOVERABLE_ERROR;

		self::respond( [
			'output'     => $output,
			'result'     => null,
			'has_result' => false,
			'throwable'  => null,
			'exited'     => true,
			'fatal'      => ( $fatal && ( $fatal['type'] & $types ) )
				? [
					'type'    => self::error_label( $fatal['type'] ),
					'message' => $fatal['message'],
					'file'    => self::relative_path( $fatal['file'] ?? '' ),
					'line'    => (int) ( $fatal['line'] ?? 0 ),
				]
				: null,
		], $started, $start_memory );
	}

	/**
	 * Builds and sends the JSON payload for a completed run.
	 *
	 * @param array $run Keys: output, result, has_result, throwable, exited, fatal.
	 */
	private static function respond( array $run, float $started, int $start_memory ): void {
		if ( self::$responded ) {
			return;
		}
		self::$responded = true;

		$throwable = $run['throwable'] ?? null;
		$fatal     = $run['fatal'] ?? null;

		if ( $throwable instanceof \Throwable ) {
			$fatal = [
				'type'    => get_class( $throwable ),
				'message' => $throwable->getMessage(),
				'file'    => self::relative_path( $throwable->getFile() ),
				'line'    => $throwable->getLine(),
				'trace'   => self::format_trace( $throwable ),
			];
		}

		$has_result = (bool) ( $run['has_result'] ?? false );
		$result     = $run['result'] ?? null;
		$is_tree    = $has_result && ( is_array( $result ) || is_object( $result ) );

		wp_send_json_success( [
			'output'      => $run['output'] ?? '',
			'has_result'  => $has_result,
			'result'      => $has_result ? self::format_value( $result ) : '',
			'result_type' => $has_result ? self::type_label( $result ) : '',
			// Structured mirror of the array/object return value, for the collapsible
			// tree view (same UnserTree renderer the Query tab's beautifier uses).
			'result_tree' => $is_tree ? self::build_tree( $result ) : null,
			'diagnostics' => self::$diagnostics,
			'fatal'       => $fatal,
			'exited'      => (bool) ( $run['exited'] ?? false ),
			'time_ms'     => round( ( microtime( true ) - $started ) * 1000, 2 ),
			'memory'      => size_format( max( 0, memory_get_usage() - $start_memory ), 2 ) ?: '0 B',
			'peak_memory' => size_format( memory_get_peak_usage(), 2 ) ?: '0 B',
		] );
	}

	/**
	 * Output-buffer callback. Accumulates the chunk and emits nothing, so snippet
	 * output never reaches the JSON response body.
	 */
	public static function capture_chunk( string $chunk ): string {
		self::$captured .= $chunk;
		return '';
	}

	/**
	 * Closes every buffer the snippet left open — innermost first, so nested
	 * buffers land in capture order — and returns everything printed.
	 */
	private static function drain_buffers(): string {
		while ( ob_get_level() > self::$base_ob_level ) {
			ob_end_flush();
		}
		return self::$captured;
	}

	// -------------------------------------------------------------------------
	// Formatting helpers
	// -------------------------------------------------------------------------

	private static function format_value( $value ): string {
		if ( is_null( $value ) ) {
			return 'null';
		}
		if ( is_bool( $value ) ) {
			return $value ? 'true' : 'false';
		}
		if ( is_string( $value ) ) {
			return $value;
		}
		if ( is_scalar( $value ) ) {
			return (string) $value;
		}
		return print_r( $value, true );
	}

	private static function type_label( $value ): string {
		if ( is_object( $value ) ) {
			return get_class( $value );
		}
		if ( is_array( $value ) ) {
			return 'array(' . count( $value ) . ')';
		}
		if ( is_string( $value ) ) {
			return 'string(' . strlen( $value ) . ')';
		}
		return gettype( $value );
	}

	/**
	 * Frames between the throw site and the eval wrapper — everything below that
	 * is Dev Zone plumbing and only adds noise.
	 */
	private static function format_trace( \Throwable $e ): array {
		$frames = [];
		foreach ( array_slice( $e->getTrace(), 0, 12 ) as $frame ) {
			$is_wrapper = ( $frame['class'] ?? '' ) === self::class || 'eval' === ( $frame['function'] ?? '' );
			if ( $is_wrapper ) {
				break;
			}
			$frames[] = sprintf(
				'%s%s%s() — %s:%s',
				$frame['class'] ?? '',
				isset( $frame['class'] ) ? ( $frame['type'] ?? '::' ) : '',
				$frame['function'] ?? '{closure}',
				self::relative_path( $frame['file'] ?? '' ),
				$frame['line'] ?? 0
			);
		}
		return $frames;
	}

	/** Trims ABSPATH, and labels eval'd frames as the snippet itself. */
	private static function relative_path( string $file ): string {
		if ( '' === $file ) {
			return '';
		}
		if ( false !== strpos( $file, "eval()'d code" ) ) {
			return __( 'Tinker snippet', 'wptravelengine-devzone' );
		}
		return str_replace( wp_normalize_path( ABSPATH ), '', wp_normalize_path( $file ) );
	}

	private static function error_label( int $errno ): string {
		$labels = [
			E_ERROR             => 'Fatal error',
			E_WARNING           => 'Warning',
			E_PARSE             => 'Parse error',
			E_NOTICE            => 'Notice',
			E_CORE_ERROR        => 'Core error',
			E_CORE_WARNING      => 'Core warning',
			E_COMPILE_ERROR     => 'Compile error',
			E_COMPILE_WARNING   => 'Compile warning',
			E_USER_ERROR        => 'Error',
			E_USER_WARNING      => 'Warning',
			E_USER_NOTICE       => 'Notice',
			E_RECOVERABLE_ERROR => 'Recoverable error',
			E_DEPRECATED        => 'Deprecated',
			E_USER_DEPRECATED   => 'Deprecated',
		];
		return $labels[ $errno ] ?? 'Error';
	}
}
