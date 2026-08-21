<?php
/**
 * Performance tab shell.
 * All content is rendered by PerfTab (assets/js/perf-tab.js).
 */
defined( 'ABSPATH' ) || exit;
?>
<div class="wte-dbg-perf-tab">

	<div class="wte-dbg-perf-toolbar wte-dbg-bar">
		<span class="wte-dbg-perf-toolbar-title"><?php esc_html_e( 'Performance', 'wptravelengine-devzone' ); ?></span>
		<button type="button" class="wte-dbg-refresh-btn" title="<?php esc_attr_e( 'Refresh all', 'wptravelengine-devzone' ); ?>"></button>
	</div>

	<div class="wte-dbg-perf-body">

		<!-- Section 1: Quick Stats -->
		<div class="wte-dbg-perf-section wte-dbg-perf-stats-section">
			<div class="wte-dbg-perf-section-header">
				<span class="wte-dbg-perf-section-title"><?php esc_html_e( 'Quick Stats', 'wptravelengine-devzone' ); ?></span>
			</div>
			<div class="wte-dbg-perf-stats-bar"></div>
		</div>

		<!-- Section 2: Database Cleanup -->
		<div class="wte-dbg-perf-section wte-dbg-perf-cleanup-section">
			<div class="wte-dbg-perf-section-header">
				<span class="wte-dbg-perf-section-title"><?php esc_html_e( 'Database Cleanup', 'wptravelengine-devzone' ); ?></span>
				<span class="wte-dbg-perf-section-note"><?php esc_html_e( 'Actions cannot be undone.', 'wptravelengine-devzone' ); ?></span>
			</div>
			<div class="wte-dbg-perf-cleanup-list"></div>
		</div>

		<!-- Section 3: WTE-Specific Cleanup -->
		<div class="wte-dbg-perf-section wte-dbg-perf-wte-section">
			<div class="wte-dbg-perf-section-header">
				<span class="wte-dbg-perf-section-title"><?php esc_html_e( 'WP Travel Engine Cleanup', 'wptravelengine-devzone' ); ?></span>
			</div>
			<div class="wte-dbg-perf-wte-list"></div>
		</div>

		<!-- Section 4: Autoloaded Options -->
		<div class="wte-dbg-perf-section wte-dbg-perf-autoload-section">
			<div class="wte-dbg-perf-section-header">
				<span class="wte-dbg-perf-section-title"><?php esc_html_e( 'Autoloaded Options', 'wptravelengine-devzone' ); ?></span>
				<span class="wte-dbg-perf-section-note"><?php esc_html_e( 'Top 20 by size.', 'wptravelengine-devzone' ); ?></span>
			</div>
			<div class="wte-dbg-perf-autoload-wrap"></div>
		</div>

		<!-- Section 5: Plugin Health -->
		<div class="wte-dbg-perf-section wte-dbg-perf-plugins-section">
			<div class="wte-dbg-perf-section-header">
				<span class="wte-dbg-perf-section-title"><?php esc_html_e( 'Plugin Health', 'wptravelengine-devzone' ); ?></span>
				<span class="wte-dbg-perf-section-note"><?php esc_html_e( 'Sorted by directory size.', 'wptravelengine-devzone' ); ?></span>
			</div>
			<div class="wte-dbg-perf-plugins-wrap"></div>
		</div>

	</div>

</div>
