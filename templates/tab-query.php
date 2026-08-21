<?php
defined( 'ABSPATH' ) || exit;
?>

<div class="wte-dbg-db-search">

	<div class="wte-dbg-db-tables-panel">
		<div class="wte-dbg-db-tables-header">
			<span><?php esc_html_e( 'Tables', 'wptravelengine-devzone' ); ?></span>
			<button type="button" class="wte-dbg-sidebar-toggle" title="<?php esc_attr_e( 'Collapse sidebar', 'wptravelengine-devzone' ); ?>"><?php echo '&#x2039;'; ?></button>
		</div>
		<div class="wte-dbg-db-tables-search-wrap">
			<input type="text"
				class="wte-dbg-db-tables-filter wte-dbg-search-input"
				placeholder="<?php esc_attr_e( 'Filter tables…', 'wptravelengine-devzone' ); ?>">
		</div>
		<div class="wte-dbg-db-tables-list">
			<p class="wte-dbg-loading"><?php esc_html_e( 'Loading…', 'wptravelengine-devzone' ); ?></p>
		</div>
	</div>

	<div class="wte-dbg-db-query-panel">
		<div class="wte-dbg-db-placeholder">
			<p><?php esc_html_e( 'Select a table to start querying.', 'wptravelengine-devzone' ); ?></p>
		</div>
	</div>

	<div class="wte-dbg-unserializer">
		<div class="wte-dbg-unser-header">
			<button type="button" class="wte-dbg-sidebar-toggle" title="<?php esc_attr_e( 'Collapse sidebar', 'wptravelengine-devzone' ); ?>">&#x203a;</button>
			<span><?php esc_html_e( 'Beautifier', 'wptravelengine-devzone' ); ?></span>
<button type="button" class="wte-dbg-unser-maximize"
				title="<?php esc_attr_e( 'Maximize', 'wptravelengine-devzone' ); ?>">&#10562;</button>
		</div>
		<div class="wte-dbg-unser-body">
			<textarea class="wte-dbg-unser-input"
				placeholder="<?php esc_attr_e( 'Paste PHP serialized or JSON string…', 'wptravelengine-devzone' ); ?>"></textarea>

			<div class="wte-dbg-unser-actions">
				<button type="button" class="wte-dbg-unser-btn"><?php esc_html_e( 'Beautify', 'wptravelengine-devzone' ); ?></button>
				<!-- <button type="button" class="wte-dbg-vardump-btn"> -->
					<?php // esc_html_e( 'Var Dump', 'wptravelengine-devzone' ); ?>
				<!-- </button> -->
			</div>
			<div class="wte-dbg-unser-output"></div>
		</div>
	</div>

</div>
