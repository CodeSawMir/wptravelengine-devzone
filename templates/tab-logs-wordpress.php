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
];

// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
$log_contents = file_exists( $log_path ) ? file_get_contents( $log_path ) : '';
$log_lines    = $log_contents ? array_reverse( array_filter( explode( "\n", $log_contents ) ) ) : [];

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
?>
<div class="wte-dbg-wp-wrap">

	<div class="wte-dbg-perf-section" style="margin-bottom:16px;">
		<div class="wte-dbg-perf-section-header">
			<span class="wte-dbg-perf-section-title"><?php esc_html_e( 'Debug Constants', 'wptravelengine-devzone' ); ?></span>
			<span class="wte-dbg-perf-section-note"><?php esc_html_e( 'active while DevZone plugin is active', 'wptravelengine-devzone' ); ?></span>
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
			<span class="wte-dbg-perf-section-note"><?php echo esc_html( $log_path ); ?></span>
			<?php if ( file_exists( $log_path ) && $log_contents ) : ?>
			<button type="button" id="wte-dbg-clear-log" class="button button-small" style="margin-left:auto;">
				<?php esc_html_e( 'Clear Log', 'wptravelengine-devzone' ); ?>
			</button>
			<?php endif; ?>
		</div>
		<div id="wte-dbg-log-body">
			<?php if ( ! file_exists( $log_path ) ) : ?>
				<p class="wte-dbg-wp-empty"><?php esc_html_e( 'No debug.log found. Enable WP_DEBUG_LOG to start capturing errors.', 'wptravelengine-devzone' ); ?></p>
			<?php elseif ( empty( $log_lines ) ) : ?>
				<p class="wte-dbg-wp-empty"><?php esc_html_e( 'Debug log is empty.', 'wptravelengine-devzone' ); ?></p>
			<?php else : ?>
				<div class="wte-dbg-wp-log-legend">
					<span class="wte-dbg-wp-log-badge is-fatal"><?php esc_html_e( 'Fatal', 'wptravelengine-devzone' ); ?></span>
					<span class="wte-dbg-wp-log-badge is-warning"><?php esc_html_e( 'Warning', 'wptravelengine-devzone' ); ?></span>
					<span class="wte-dbg-wp-log-badge is-deprecated"><?php esc_html_e( 'Deprecated', 'wptravelengine-devzone' ); ?></span>
					<span class="wte-dbg-wp-log-badge is-notice"><?php esc_html_e( 'Notice', 'wptravelengine-devzone' ); ?></span>
				</div>
				<div class="wte-dbg-wp-log-list"><?php
					foreach ( $log_lines as $line ) {
						$type = wpte_devzone_log_line_type( $line );
						echo '<div class="wte-dbg-wp-log-line is-' . esc_attr( $type ) . '">' . esc_html( $line ) . '</div>';
					}
				?></div>
			<?php endif; ?>
		</div>
	</div>

</div>
