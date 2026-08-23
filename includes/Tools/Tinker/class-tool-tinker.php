<?php

namespace WPTravelEngineDevZone\Tools\Tinker;

use WPTravelEngineDevZone\Admin;
use WPTravelEngineDevZone\Tools\AbstractTool;

defined( 'ABSPATH' ) || exit;

/**
 * Tinker tab — a PHP scratchpad that runs snippets inside a fully booted
 * WordPress request.
 *
 * No eval() anywhere: the snippet is always written to a temp .php file and
 * run via include(), never passed to eval() as a string. run_isolated()/
 * run_snippet_file() and the run_in_process() fallback both use the same
 * mechanism — see NO_RETURN_SENTINEL_VAR for how a snippet's own `return` is
 * told apart from include()'s default return of int(1) without eval() or
 * parsing the code.
 *
 * Runs isolated by default: the snippet executes in a disposable child PHP
 * process (spawned via a CLI binary, or `wp eval-file` as a fallback launcher)
 * rather than inline in the web-serving worker that handled the AJAX request.
 * A crash, segfault, or runaway loop in the snippet only kills that child —
 * never the request that spawned it. Falls back to the previous in-process
 * behaviour when no CLI PHP binary or wp-cli is reachable (e.g. some
 * locked-down shared hosts), so the feature still works, just without the
 * containment. Either way, every run is appended to a capped audit log
 * (option `wpte_devzone_tinker_audit_log`) recording who ran what and when —
 * inspect it with `wp option get wpte_devzone_tinker_audit_log --format=json`.
 *
 * Code runs through admin-ajax.php (or, in isolated mode, `wp-load.php`
 * directly), so every WP function, every WPTravelEngine class and every
 * active add-on is available to the snippet.
 *
 * Captured per run: echoed output (raw, so Kint `d()` dumps render), the
 * return value, notices/warnings, fatal errors, `die()`/`exit()` calls,
 * wall time and peak memory.
 */
class ToolTinker extends AbstractTool {

	/** Option holding saved snippets, keyed by sanitized name. */
	private const SNIPPETS_OPTION = 'wpte_devzone_tinker_snippets';

	/** Wall-clock ceiling (seconds) for an isolated run before it's killed. */
	private const ISOLATION_TIMEOUT = 10;

	/** memory_limit passed to the isolated child process. */
	private const ISOLATION_MEMORY_LIMIT = '256M';

	/**
	 * Functions disabled inside the isolated child — isolation contains crashes,
	 * not intent, so this closes off the most direct way a snippet running in
	 * that disposable process could shell out and do something that outlives it.
	 * Only applied on the CLI-binary launch path: disable_functions is a
	 * PHP_INI_SYSTEM directive (startup-only, no runtime override), and wp-cli
	 * (the fallback launcher) gives no reliable way to inject one into its own
	 * internal interpreter invocation — confirmed WP_CLI_PHP_ARGS does not work
	 * for this. A wp-cli-launched run does not get this hardening.
	 */
	private const ISOLATION_DISABLED_FUNCTIONS = 'exec,shell_exec,proc_open,popen,pcntl_exec,pcntl_fork,dl';

	/**
	 * Variable name shared between run_isolated() (which appends a trailing
	 * `return $<this>;` to the snippet file) and run_snippet_file() (which
	 * defines that same variable before include()ing it). include() shares its
	 * caller's local scope with the included file, so the trailing line only
	 * executes — and only then does include() return this exact object — when
	 * the snippet itself never returned anything. That's how "no result" is
	 * told apart from a snippet that legitimately returns int(1), without
	 * resorting to eval() or parsing the snippet to check for a `return`.
	 */
	private const NO_RETURN_SENTINEL_VAR = '__wpte_tinker_no_return_sentinel__';

	/** Diagnostics (notices/warnings) collected during the current run. */
	private static array $diagnostics = [];

	/** Everything the snippet printed, accumulated by the output-buffer callback. */
	private static string $captured = '';

	/** Output-buffer nesting level captured before the snippet ran. */
	private static int $base_ob_level = 0;

	/** True once a run has been delivered, so the shutdown hook stands down. */
	private static bool $responded = false;

	/** The as-submitted code for the run in progress — only used for audit logging. */
	private static string $current_code = '';

	/**
	 * Overrides how a finished run gets delivered. Null (default) sends it as
	 * the AJAX response; the isolated-runner script points this at a file
	 * write instead, since a CLI child process has no HTTP response to send.
	 *
	 * @var callable|null
	 */
	private static $delivery = null;

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
	 * Admin::writes_enabled() is the outer, unbypassable gate — production is a
	 * hard no, and this filter cannot override it. Off production, the filter
	 * can still disable Tinker specifically while leaving the rest of the Dev
	 * Zone writable.
	 */
	public static function is_enabled(): bool {
		if ( ! Admin::writes_enabled() ) {
			return false;
		}
		return (bool) apply_filters( 'wpte_devzone_tinker_enabled', true );
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

		if ( self::can_isolate() ) {
			$payload = self::run_isolated( $code );
			TinkerAuditLog::record( $code, $payload, true );
			wp_send_json_success( $payload );
			return;
		}

		self::run_in_process( $code );
	}

	/**
	 * Fallback path: evaluates the snippet inline, in this same request/process.
	 * Used only when no isolated child process could be spawned (see
	 * can_isolate()). A fatal here can take down the AJAX request itself —
	 * the shutdown-hook plumbing below exists specifically to still report
	 * that back to the browser instead of a blank 500.
	 */
	private static function run_in_process( string $code ): void {
		self::$current_code = $code;

		// No eval() here either — same include()-of-a-temp-file mechanism as
		// run_snippet_file(), just without a separate process around it. This
		// is the tool's entire purpose — an admin-only PHP scratchpad, gated by
		// manage_options + nonce (Admin::verify_write_request()) and a hard,
		// unfilterable production block (Admin::writes_enabled()) — the same
		// trust boundary as WP's own Plugin/Theme File Editor, which already
		// lets an admin execute arbitrary PHP. See run_isolated()/can_isolate()
		// above for the default, process-isolated path; this in-process path
		// only runs when that isolation isn't available.
		$normalized = (string) preg_replace( '/^<\?(?:php|=)?/', '', $code );
		$normalized = (string) preg_replace( '/\?>\s*$/', '', $normalized );

		$file = trailingslashit( get_temp_dir() ) . 'wpte-tinker-' . wp_generate_password( 12, false, false ) . '.php';
		file_put_contents(
			$file,
			"<?php\n" . $normalized . "\nreturn $" . self::NO_RETURN_SENTINEL_VAR . ';'
		);

		// Registered before capture() so it still fires on a genuine fatal,
		// which jumps straight to the shutdown queue and skips everything
		// after capture() below.
		register_shutdown_function( static function () use ( $file ) {
			if ( file_exists( $file ) ) {
				wp_delete_file( $file );
			}
		} );

		self::capture( static function () use ( $file ) {
			${self::NO_RETURN_SENTINEL_VAR} = new \stdClass();
			$result = include $file;
			return $result === ${self::NO_RETURN_SENTINEL_VAR} ? null : $result;
		} );
	}

	/**
	 * Runs $execute() inside the shared output/diagnostic capture scaffold and
	 * delivers the result. Shared by the in-process fallback (run_in_process())
	 * and by run_snippet_file() (called from the isolated-runner child process
	 * — see isolated-runner.php).
	 */
	private static function capture( callable $execute ): void {
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
			$result = $execute();
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

	/**
	 * Entry point called from inside the isolated child process
	 * (isolated-runner.php) — runs the snippet file the parent wrote out via
	 * `include`, through the same capture scaffold as the in-process fallback.
	 */
	public static function run_snippet_file( string $file ): void {
		// include(), never eval() — nothing in the isolated path evaluates a
		// string as PHP. include() returns int(1) by default when the file
		// completes without an explicit `return` (standard PHP behaviour for a
		// successful include with nothing returned); left alone, that 1 would
		// leak through as a phantom "return value" for every snippet that
		// doesn't return anything. run_isolated() appends a trailing
		// `return $<sentinel>;` to the file, referencing a variable defined
		// right here — include() shares the including scope's local variables
		// with the included file, so that line sees the exact same object.
		// The snippet's own `return` (if any) exits before reaching it, so
		// include() only ever comes back with $sentinel when nothing else was
		// returned, telling the two cases apart with no eval() and no parsing.
		self::capture( static function () use ( $file ) {
			${self::NO_RETURN_SENTINEL_VAR} = new \stdClass();
			$result = include $file;
			return $result === ${self::NO_RETURN_SENTINEL_VAR} ? null : $result;
		} );
	}

	/** Overrides how a finished run is delivered — see the $delivery property. */
	public static function set_delivery( ?callable $fn ): void {
		self::$delivery = $fn;
	}

	// -------------------------------------------------------------------------
	// Process isolation
	// -------------------------------------------------------------------------

	/** Whether a snippet can be run in an isolated child process on this server. */
	public static function can_isolate(): bool {
		return function_exists( 'proc_open' ) && null !== self::find_isolation_binary();
	}

	/**
	 * Runs the snippet in a disposable child process and returns the same
	 * payload shape build_response_payload() produces, whether that came from
	 * the child's own result file or was synthesised because the child never
	 * wrote one (crash, kill, timeout).
	 */
	private static function run_isolated( string $code ): array {
		$normalized = (string) preg_replace( '/^<\?(?:php|=)?/', '', $code );
		$normalized = (string) preg_replace( '/\?>\s*$/', '', $normalized );

		$tmp_dir     = trailingslashit( get_temp_dir() );
		$token       = 'wpte-tinker-' . wp_generate_password( 12, false, false );
		$code_file   = $tmp_dir . $token . '.php';
		$result_file = $tmp_dir . $token . '.json';
		$stdout_file = $tmp_dir . $token . '.out';
		$stderr_file = $tmp_dir . $token . '.err';
		$runner_path = __DIR__ . '/isolated-runner.php';

		// The trailing return only executes — and is only what include() ends
		// up returning — if the snippet above never hit its own `return`. See
		// NO_RETURN_SENTINEL_VAR and run_snippet_file().
		file_put_contents(
			$code_file,
			"<?php\n" . $normalized . "\nreturn $" . self::NO_RETURN_SENTINEL_VAR . ';'
		);

		$binary  = self::find_isolation_binary();
		$command = $binary ? self::build_isolation_command( $binary, $runner_path, $code_file, $result_file ) : null;

		$payload = $command
			? self::spawn_isolated( $command, $result_file, $stdout_file, $stderr_file )
			: self::crash_payload( __( 'No isolated PHP process available on this server.', 'wptravelengine-devzone' ) );

		foreach ( [ $code_file, $result_file, $stdout_file, $stderr_file ] as $file ) {
			if ( file_exists( $file ) ) {
				wp_delete_file( $file );
			}
		}

		return $payload;
	}

	/** Spawns $command, waits (with a hard timeout kill), and reads back its result file. */
	private static function spawn_isolated( array $command, string $result_file, string $stdout_file, string $stderr_file ): array {
		$descriptors = [
			0 => [ 'pipe', 'r' ], // stdin — unused, closed immediately.
			1 => [ 'file', $stdout_file, 'w' ],
			2 => [ 'file', $stderr_file, 'w' ],
		];

		$process = @proc_open( $command, $descriptors, $pipes, ABSPATH );

		if ( ! is_resource( $process ) ) {
			return self::crash_payload( __( 'Could not start an isolated PHP process.', 'wptravelengine-devzone' ) );
		}

		fclose( $pipes[0] );

		// A grace period beyond the child's own max_execution_time ini override —
		// that ini setting isn't honoured by every SAPI/build, so this wall-clock
		// kill is the real backstop that guarantees the child can't hang forever.
		$deadline = microtime( true ) + self::ISOLATION_TIMEOUT + 2;
		do {
			$status = proc_get_status( $process );
			if ( ! $status['running'] ) {
				break;
			}
			usleep( 25000 );
		} while ( microtime( true ) < $deadline );

		if ( $status['running'] ) {
			proc_terminate( $process, 9 ); // SIGKILL — no cleanup handlers to wait on.
			usleep( 100000 );
			proc_close( $process );

			return self::crash_payload( sprintf(
				/* translators: %d: timeout in seconds */
				__( 'Snippet timed out after %d seconds and was terminated.', 'wptravelengine-devzone' ),
				self::ISOLATION_TIMEOUT
			) );
		}

		proc_close( $process );

		if ( file_exists( $result_file ) ) {
			$decoded = json_decode( (string) file_get_contents( $result_file ), true );
			if ( is_array( $decoded ) ) {
				return $decoded;
			}
		}

		// The child exited without writing a result — a segfault, or an error
		// even our own shutdown hook couldn't reach. Either way only the
		// isolated process was lost, never the request that spawned it.
		$stderr = file_exists( $stderr_file ) ? trim( (string) file_get_contents( $stderr_file ) ) : '';
		return self::crash_payload(
			'' !== $stderr ? $stderr : __( 'The isolated process exited without a result (likely a crash).', 'wptravelengine-devzone' )
		);
	}

	/** A CLI PHP binary, or wp-cli, that can be used to launch the isolated runner — whichever is found first. */
	private static function find_isolation_binary(): ?array {
		$php = self::find_cli_php_binary();
		if ( $php ) {
			return [ 'type' => 'php', 'path' => $php ];
		}
		$wp_cli = self::find_wp_cli_binary();
		if ( $wp_cli ) {
			return [ 'type' => 'wpcli', 'path' => $wp_cli ];
		}
		return null;
	}

	/**
	 * Locates a CLI-capable PHP binary. PHP_BINARY is often a php-fpm or
	 * php-cgi binary under a web request — invoking that as if it were the
	 * CLI SAPI doesn't work — so this falls back to the sibling `php` binary
	 * that build/package layouts (Homebrew, apt, yum) install alongside it.
	 */
	private static function find_cli_php_binary(): ?string {
		if ( ! defined( 'PHP_BINARY' ) || '' === PHP_BINARY ) {
			return null;
		}
		if ( ! preg_match( '/(fpm|cgi)/i', basename( PHP_BINARY ) ) && is_executable( PHP_BINARY ) ) {
			return PHP_BINARY;
		}
		$sibling = str_replace( '/sbin/', '/bin/', PHP_BINARY );
		$sibling = preg_replace( '/php-?fpm/i', 'php', $sibling );
		$sibling = preg_replace( '/php-?cgi/i', 'php', $sibling );
		if ( $sibling !== PHP_BINARY && is_executable( $sibling ) ) {
			return $sibling;
		}
		return null;
	}

	/**
	 * Best-effort wp-cli discovery. Only absolute paths are tried — proc_open's
	 * array form doesn't do a shell-style PATH search, and PATH itself is often
	 * empty/minimal inside a PHP-FPM worker's environment.
	 */
	private static function find_wp_cli_binary(): ?string {
		$home       = getenv( 'HOME' ) ?: ( $_SERVER['HOME'] ?? '' );
		$candidates = array_filter( [
			$home ? $home . '/bin/wp' : null,
			$home ? $home . '/.composer/vendor/bin/wp' : null,
			$home ? $home . '/.config/composer/vendor/bin/wp' : null,
			'/usr/local/bin/wp',
			'/opt/homebrew/bin/wp',
			'/usr/bin/wp',
		] );
		foreach ( $candidates as $path ) {
			if ( is_executable( $path ) ) {
				return $path;
			}
		}
		return null;
	}

	/** Builds the proc_open command array for the chosen binary. */
	private static function build_isolation_command( array $binary, string $runner_path, string $code_file, string $result_file ): array {
		if ( 'php' === $binary['type'] ) {
			return [
				$binary['path'],
				'-d', 'display_errors=0',
				'-d', 'memory_limit=' . self::ISOLATION_MEMORY_LIMIT,
				'-d', 'max_execution_time=' . self::ISOLATION_TIMEOUT,
				'-d', 'disable_functions=' . self::ISOLATION_DISABLED_FUNCTIONS,
				$runner_path,
				rtrim( ABSPATH, '/' ),
				$code_file,
				$result_file,
			];
		}
		// wp-cli bootstraps WordPress itself; the extra positional args land in
		// the included file's $args local, which isolated-runner.php checks for.
		// --exec runs before that bootstrap, which is the only point the
		// WP_DISABLE_FATAL_ERROR_HANDLER define can still land in time.
		return [
			$binary['path'],
			'--exec=define("WP_DISABLE_FATAL_ERROR_HANDLER", true);',
			'eval-file',
			$runner_path,
			$code_file,
			$result_file,
		];
	}

	/** A payload shaped like a normal run's, for when the isolated process itself couldn't be observed running the snippet. */
	private static function crash_payload( string $message ): array {
		return [
			'output'      => '',
			'has_result'  => false,
			'result'      => '',
			'result_type' => '',
			'result_tree' => null,
			'diagnostics' => [],
			'fatal'       => [
				'type'    => __( 'Process error', 'wptravelengine-devzone' ),
				'message' => $message,
				'file'    => '',
				'line'    => 0,
				'trace'   => [],
			],
			'exited'      => true,
			'time_ms'     => 0,
			'memory'      => '0 B',
			'peak_memory' => '0 B',
		];
	}

	// -------------------------------------------------------------------------
	// Audit log
	// -------------------------------------------------------------------------

	public function save_snippet(): void {
		Admin::verify_write_request();

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
		Admin::verify_write_request();

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

		self::deliver_payload( [
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
	 * Sends the finished payload. In-process runs (the only path where
	 * $delivery is unset) log the run here, since that's the one call site
	 * reachable both after a normal return and after a fatal — the shutdown
	 * hook calls straight into respond() too, so this is the only place
	 * guaranteed to run exactly once per request either way.
	 */
	private static function deliver_payload( array $payload ): void {
		if ( self::$delivery ) {
			( self::$delivery )( $payload );
			return;
		}
		TinkerAuditLog::record( self::$current_code, $payload, false );
		wp_send_json_success( $payload );
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
		// wpte-tinker-*.php — the temp file both the in-process fallback and an
		// isolated run include the snippet from; "eval()'d code" is kept as a
		// defensive match too, in case something upstream still reports a trace
		// frame that way. Either way it's the snippet itself, not a real file
		// worth showing the path of.
		if ( false !== strpos( $file, "eval()'d code" ) || false !== strpos( $file, 'wpte-tinker-' ) ) {
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
