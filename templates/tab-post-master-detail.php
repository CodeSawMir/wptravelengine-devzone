<?php
/**
 * Shared master-detail template for all post-type tools.
 *
 * Expected variables (set by SharedAjax::load_tab or Admin::render_page):
 * 
 * @var \WPTravelEngineDevZone\Tools\AbstractPostTool $tool
 */
defined( 'ABSPATH' ) || exit;

$post_type = $tool->get_post_type();
$noun      = $tool->get_noun();
$label     = strtoupper( $tool->get_label() );
?>
<div class="wte-dbg-master-detail" data-post-type="<?php echo esc_attr( $post_type ); ?>">
	<div class="wte-dbg-list-panel">
		<div class="wte-dbg-list-header">
			<strong><?php echo esc_html( $label ); ?></strong>
			<span class="wte-dbg-list-count"></span>
			<button type="button" class="wte-dbg-sidebar-toggle" title="<?php esc_attr_e( 'Collapse sidebar', 'wptravelengine-devzone' ); ?>"><?php echo '&#x2039;'; ?></button>
		</div>
		<div class="wte-dbg-search-wrap">
			<input type="search"
				class="wte-dbg-search wte-dbg-search-input"
				placeholder="<?php
					/* translators: %s: singular noun for the post type, e.g. "trip" */
					echo esc_attr( sprintf( __( 'Search %s…', 'wptravelengine-devzone' ), $noun ) );
				?>">
		</div>
		<?php $toolbar_actions = $tool->get_toolbar_actions(); ?>
		<?php if ( ! empty( $toolbar_actions ) ) : ?>
		<div class="wte-dbg-ei-toolbar">
			<?php if ( in_array( 'export', $toolbar_actions, true ) ) : ?>
			<button type="button" class="wte-dbg-ei-btn wte-dbg-ei-select-btn" aria-label="<?php esc_attr_e( 'Select trips to export', 'wptravelengine-devzone' ); ?>">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
				<span class="wte-dbg-ei-select-label"><?php esc_html_e( 'SELECT TO EXPORT', 'wptravelengine-devzone' ); ?></span>
				<span class="wte-dbg-ei-export-label" aria-hidden="true"><?php esc_html_e( 'EXPORT', 'wptravelengine-devzone' ); ?>&nbsp;(<span class="wte-dbg-ei-count">0</span>)</span>
			</button>
			<button type="button" class="wte-dbg-ei-cancel-btn" aria-label="<?php esc_attr_e( 'Cancel export selection', 'wptravelengine-devzone' ); ?>" title="<?php esc_attr_e( 'Cancel', 'wptravelengine-devzone' ); ?>">&#x2715;</button>
			<?php endif; ?>
			<?php if ( in_array( 'import', $toolbar_actions, true ) ) : ?>
			<button type="button" class="wte-dbg-ei-btn wte-dbg-ei-import-btn" aria-label="<?php esc_attr_e( 'Import trips from JSON', 'wptravelengine-devzone' ); ?>">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
				<?php esc_html_e( 'IMPORT', 'wptravelengine-devzone' ); ?>
			</button>
			<input type="file" class="wte-dbg-ei-file-input" accept=".json" aria-hidden="true" tabindex="-1">
			<?php endif; ?>
		</div>
		<div class="wte-dbg-ei-select-all-row">
			<label class="wte-dbg-ei-select-all-label">
				<input type="checkbox" class="wte-dbg-ei-select-all-cb">
				<span><?php esc_html_e( 'SELECT ALL', 'wptravelengine-devzone' ); ?></span>
			</label>
		</div>
		<?php endif; ?>
		<div class="wte-dbg-list-items">
			<p class="wte-dbg-loading"><?php esc_html_e( 'Loading…', 'wptravelengine-devzone' ); ?></p>
		</div>
		<div class="wte-dbg-pagination"></div>
	</div>

	<div class="wte-dbg-inspector-panel">
		<div class="wte-dbg-inspector-placeholder">
			<p><?php
				/* translators: %s: singular noun for the post type, e.g. "trip" */
				echo esc_html( sprintf( __( '← Select a %s to inspect', 'wptravelengine-devzone' ), $noun ) );
			?></p>
		</div>
	</div>

	<div class="wte-dbg-relations-resize-handle"></div>

	<div class="wte-dbg-relations-sidebar">
		<div class="wte-dbg-relations-sidebar-header">
			<button type="button" class="wte-dbg-relations-toggle" title="<?php esc_attr_e( 'Collapse sidebar', 'wptravelengine-devzone' ); ?>">&#x203a;</button>
			<span><?php esc_html_e( 'Relations', 'wptravelengine-devzone' ); ?></span>
		</div>
		<div class="wte-dbg-relations-sidebar-body">
			<div class="wte-dbg-relation-empty"><?php esc_html_e( 'Select a record to see relations.', 'wptravelengine-devzone' ); ?></div>
		</div>
	</div>
</div>
