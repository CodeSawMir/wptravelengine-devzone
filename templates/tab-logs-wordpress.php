<?php
/**
 * DevZone Logs — WordPress subtab.
 *
 * Toggle WP debug constants and view debug.log.
 */

defined( 'ABSPATH' ) || exit;

$log_path    = defined( 'WP_DEBUG_LOG' ) && is_string( WP_DEBUG_LOG )
	? WP_DEBUG_LOG
	: WP_CONTENT_DIR . '/debug.log';

$saved_flags = (array) get_option( 'wpte_devzone_debug_flags', [] );

$defines = [
	'WP_DEBUG'         => [ 'label' => 'WP_DEBUG',         'desc' => 'Master debug switch',          'value' => ! empty( $saved_flags['WP_DEBUG'] ) ],
	'WP_DEBUG_LOG'     => [ 'label' => 'WP_DEBUG_LOG',     'desc' => 'Write errors to debug.log',    'value' => ! empty( $saved_flags['WP_DEBUG_LOG'] ) ],
	'WP_DEBUG_DISPLAY' => [ 'label' => 'WP_DEBUG_DISPLAY', 'desc' => 'Show errors on screen',        'value' => ! empty( $saved_flags['WP_DEBUG_DISPLAY'] ) ],
	'SCRIPT_DEBUG'     => [ 'label' => 'SCRIPT_DEBUG',     'desc' => 'Load non-minified JS/CSS',     'value' => ! empty( $saved_flags['SCRIPT_DEBUG'] ) ],
	'WP_DEVZONE_DEBUG' => [ 'label' => 'WP_DEVZONE_DEBUG', 'desc' => 'Force-enable the Tinker code editor outside production', 'value' => ! empty( $saved_flags['WP_DEVZONE_DEBUG'] ) ],
];

// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
$log_contents = file_exists( $log_path ) ? file_get_contents( $log_path ) : '';

if ( ! function_exists( 'wpte_devzone_log_line_type' ) ) {
	/**
	 * Classify a log line into a severity key.
	 */
	function wpte_devzone_log_line_type( string $line ): string {
		if ( stripos( $line, 'PHP Fatal' ) !== false )       { return 'fatal'; }
		if ( stripos( $line, 'PHP Parse error' ) !== false ) { return 'fatal'; }
		if ( stripos( $line, 'PHP Warning' ) !== false )     { return 'warning'; }
		if ( stripos( $line, 'PHP Deprecated' ) !== false )  { return 'deprecated'; }
		if ( stripos( $line, 'PHP Notice' ) !== false )      { return 'notice'; }
		return 'default';
	}
}

if ( ! function_exists( 'wpte_devzone_parse_log_entries' ) ) {
	/**
	 * Groups raw debug.log lines into entries, attaching stack-trace /
	 * continuation lines (e.g. "#0 /path/file.php(12): ...") to the entry
	 * they belong to instead of treating every physical line as its own row.
	 *
	 * Grouping happens in file order (oldest first), then only the resulting
	 * entries are reversed for newest-first display — so a trace's frames
	 * stay attached to their parent error and in their original order,
	 * instead of the previous line-by-line reversal scattering them.
	 *
	 * @param string[] $lines Raw lines in file order.
	 * @return array<int,array{type:string,timestamp:string,message:string,file:string,line:string,raw:string,extra:string[]}>
	 */
	function wpte_devzone_parse_log_entries( array $lines ): array {
		$entries = [];
		$current = null;

		foreach ( $lines as $line ) {
			if ( preg_match( '/^\[([^\]]+)\]\s*(.*)$/', $line, $m ) ) {
				if ( null !== $current ) {
					$entries[] = $current;
				}

				$message = $m[2];
				$file    = '';
				$lineno  = '';

				if ( preg_match( '/^(.*?)\s+in\s+(\S+)\s+on\s+line\s+(\d+)\s*$/', $message, $fm ) ) {
					$message = $fm[1];
					$file    = $fm[2];
					$lineno  = $fm[3];
				}

				$current = [
					'type'      => wpte_devzone_log_line_type( $line ),
					'timestamp' => $m[1],
					'message'   => $message,
					'file'      => $file,
					'line'      => $lineno,
					'raw'       => $line,
					'extra'     => [],
				];
			} elseif ( null !== $current ) {
				$current['extra'][] = $line;
			} else {
				// A line before any timestamped entry — surface it standalone.
				$entries[] = [
					'type'      => wpte_devzone_log_line_type( $line ),
					'timestamp' => '',
					'message'   => $line,
					'file'      => '',
					'line'      => '',
					'raw'       => $line,
					'extra'     => [],
				];
			}
		}
		if ( null !== $current ) {
			$entries[] = $current;
		}

		return array_reverse( $entries );
	}
}

$log_entries = $log_contents ? wpte_devzone_parse_log_entries( array_filter( explode( "\n", $log_contents ) ) ) : [];
?>
<div class="wte-dbg-wp-wrap">

	<div class="wte-dbg-perf-section" style="margin-bottom:16px;">
		<div class="wte-dbg-perf-section-header">
			<span class="wte-dbg-perf-section-title"><?php esc_html_e( 'Debug Constants', 'wptravelengine-devzone' ); ?></span>
			<span class="wte-dbg-perf-section-note"><?php esc_html_e( 'only works while DevZone plugin is active', 'wptravelengine-devzone' ); ?></span>
		</div>
		<?php foreach ( $defines as $constant => $info ) : ?>
		<div class="wte-dbg-wp-debug-row" data-constant="<?php echo esc_attr( $constant ); ?>">
			<div>
				<code class="wte-dbg-wp-code"><?php echo esc_html( $info['label'] ); ?></code>
				<span class="wte-dbg-wp-desc"><?php echo esc_html( $info['desc'] ); ?></span>
			</div>
			<label class="wte-dbg-wp-debug-toggle">
				<input type="checkbox"
				       data-constant="<?php echo esc_attr( $constant ); ?>"
				       <?php checked( $info['value'] ); ?>>
				<span class="wte-dbg-wp-debug-slider"></span>
			</label>
		</div>
		<?php endforeach; ?>
	</div>

	<div class="wte-dbg-perf-section">
		<div class="wte-dbg-perf-section-header">
			<span class="wte-dbg-perf-section-title"><?php esc_html_e( 'Debug Log', 'wptravelengine-devzone' ); ?></span>
			<span class="wte-dbg-wp-log-path" title="<?php echo esc_attr( $log_path ); ?>"><?php echo esc_html( $log_path ); ?></span>
			<?php if ( file_exists( $log_path ) && $log_contents ) : ?>
			<button type="button" id="wte-dbg-clear-log" class="button button-small" style="margin-left:auto;">
				<?php esc_html_e( 'Clear Log', 'wptravelengine-devzone' ); ?>
			</button>
			<?php endif; ?>
		</div>
		<div id="wte-dbg-log-body">
			<?php if ( ! file_exists( $log_path ) ) : ?>
				<p class="wte-dbg-wp-empty"><?php esc_html_e( 'No debug.log found. Enable WP_DEBUG_LOG to start capturing errors.', 'wptravelengine-devzone' ); ?></p>
			<?php elseif ( empty( $log_entries ) ) : ?>
				<p class="wte-dbg-wp-empty"><?php esc_html_e( 'Debug log is empty.', 'wptravelengine-devzone' ); ?></p>
			<?php else : ?>
				<div class="wte-dbg-wp-log-legend">
					<span class="wte-dbg-wp-log-badge is-fatal"><?php esc_html_e( 'Fatal', 'wptravelengine-devzone' ); ?></span>
					<span class="wte-dbg-wp-log-badge is-warning"><?php esc_html_e( 'Warning', 'wptravelengine-devzone' ); ?></span>
					<span class="wte-dbg-wp-log-badge is-deprecated"><?php esc_html_e( 'Deprecated', 'wptravelengine-devzone' ); ?></span>
					<span class="wte-dbg-wp-log-badge is-notice"><?php esc_html_e( 'Notice', 'wptravelengine-devzone' ); ?></span>
				</div>
				<div class="wte-dbg-wp-log-list"><?php
					foreach ( $log_entries as $entry ) {
						$type = $entry['type'];
						?>
						<div class="wte-dbg-wp-log-entry is-<?php echo esc_attr( $type ); ?>">
							<div class="wte-dbg-wp-log-entry-header">
								<span class="wte-dbg-wp-log-badge is-<?php echo esc_attr( $type ); ?>"><?php echo esc_html( ucfirst( $type ) ); ?></span>
								<?php if ( $entry['timestamp'] ) : ?>
								<span class="wte-dbg-wp-log-ts"><?php echo esc_html( $entry['timestamp'] ); ?></span>
								<?php endif; ?>
								<?php if ( $entry['file'] ) : ?>
								<span class="wte-dbg-wp-log-loc" title="<?php echo esc_attr( $entry['file'] ); ?>">
									<?php echo esc_html( basename( $entry['file'] ) . ( $entry['line'] ? ':' . $entry['line'] : '' ) ); ?>
								</span>
								<?php endif; ?>
							</div>
							<div class="wte-dbg-wp-log-message"><?php echo esc_html( $entry['message'] ); ?></div>
							<?php if ( ! empty( $entry['extra'] ) ) : ?>
							<details class="wte-dbg-wp-log-trace">
								<summary>
									<?php
									echo esc_html( sprintf(
										/* translators: %d: number of stack trace lines */
										__( 'Stack trace (%d)', 'wptravelengine-devzone' ),
										count( $entry['extra'] )
									) );
									?>
								</summary>
								<pre><?php echo esc_html( implode( "\n", $entry['extra'] ) ); ?></pre>
							</details>
							<?php endif; ?>
						</div>
						<?php
					}
				?></div>
			<?php endif; ?>
		</div>
	</div>

</div>
