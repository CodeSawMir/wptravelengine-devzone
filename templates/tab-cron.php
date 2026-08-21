<?php
/**
 * Dev Zone Cron tab shell.
 * Content is populated entirely by cron-tab.js via AJAX.
 */
defined( 'ABSPATH' ) || exit;
?>
<div class="wte-dbg-cron-tab">
	<div class="wte-dbg-cron-toolbar wte-dbg-bar">
		<div class="wte-dbg-cron-search-wrap">
			<input type="search"
				class="wte-dbg-cron-search wte-dbg-search-input"
				placeholder="<?php esc_attr_e( 'Search hooks&hellip;', 'wptravelengine-devzone' ); ?>"
				aria-label="<?php esc_attr_e( 'Search cron hooks', 'wptravelengine-devzone' ); ?>">
			<span class="wte-dbg-cron-search-count"></span>
		</div>
		<button type="button" class="wte-dbg-refresh-btn" title="<?php esc_attr_e( 'Refresh', 'wptravelengine-devzone' ); ?>"></button>
	</div>
	<div class="wte-dbg-cron-list"></div>
</div>
