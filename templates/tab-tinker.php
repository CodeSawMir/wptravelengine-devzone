<?php
/**
 * Dev Zone Tinker tab — PHP scratchpad.
 *
 * Snippets run through admin-ajax.php, so WordPress, WP Travel Engine and every
 * active add-on are fully booted (same guarantee as the init-hooked
 * .wpte-devzone/snippets/_playground.php bootstrap).
 */
defined( 'ABSPATH' ) || exit;

use WPTravelEngineDevZone\Tools\Tinker\ToolTinker;

$snippets   = ToolTinker::get_snippets();
$is_enabled = ToolTinker::is_enabled();

$boilerplate = "\$settings = wptravelengine_settings();\n\nreturn \$settings;\n";
?>
<div class="wte-dbg-tinker-tab" data-enabled="<?php echo $is_enabled ? '1' : '0'; ?>">

	<?php if ( ! $is_enabled ) : ?>
		<p class="wte-dbg-tinker-disabled">
			<?php esc_html_e( 'Tinker is disabled because this site reports a production environment. Set WP_ENVIRONMENT_TYPE to a non-production value, or return true from the wpte_devzone_tinker_enabled filter.', 'wptravelengine-devzone' ); ?>
		</p>
	<?php endif; ?>

	<div class="wte-dbg-tinker-split">
		<div class="wte-dbg-tinker-pane wte-dbg-tinker-editor-pane">
			<div class="wte-dbg-tinker-pane-head">
				<span class="wte-dbg-tinker-pane-title"><?php esc_html_e( 'Code', 'wptravelengine-devzone' ); ?></span>
				<span class="wte-dbg-tinker-hint"><?php esc_html_e( 'WP fully loaded · return a value to inspect it', 'wptravelengine-devzone' ); ?></span>
				<span class="wte-dbg-tinker-head-actions">
					<button type="button" class="wte-dbg-tinker-btn wte-dbg-tinker-clear">
						<?php esc_html_e( 'Clear', 'wptravelengine-devzone' ); ?>
					</button>
					<button type="button" class="wte-dbg-tinker-btn is-primary wte-dbg-tinker-run" <?php disabled( ! $is_enabled ); ?>>
						<?php esc_html_e( 'Run', 'wptravelengine-devzone' ); ?>
						<kbd class="wte-dbg-tinker-kbd"><?php echo esc_html( '⌘ + ⏎' ); ?></kbd>
					</button>
				</span>
			</div>
			<div class="wte-dbg-tinker-php-tag" aria-hidden="true">&lt;?php</div>
			<div class="wte-dbg-tinker-editor">
				<div class="wte-dbg-tinker-gutter" aria-hidden="true"></div>
				<textarea class="wte-dbg-tinker-code"
				          spellcheck="false"
				          autocomplete="off"
				          autocapitalize="off"
				          data-boilerplate="<?php echo esc_attr( $boilerplate ); ?>"
				          aria-label="<?php esc_attr_e( 'PHP code', 'wptravelengine-devzone' ); ?>"></textarea>
			</div>
		</div>

		<div class="wte-dbg-tinker-resizer"
		     role="separator"
		     aria-orientation="vertical"
		     aria-label="<?php esc_attr_e( 'Resize code and output panes', 'wptravelengine-devzone' ); ?>"
		     tabindex="0"></div>

		<div class="wte-dbg-tinker-pane wte-dbg-tinker-output-pane">
			<div class="wte-dbg-tinker-pane-head">
				<span class="wte-dbg-tinker-pane-title"><?php esc_html_e( 'Output', 'wptravelengine-devzone' ); ?></span>
				<span class="wte-dbg-tinker-metrics"></span>
				<span class="wte-dbg-tinker-head-actions">
					<select class="wte-dbg-tinker-snippet-select" aria-label="<?php esc_attr_e( 'Saved snippets', 'wptravelengine-devzone' ); ?>">
						<option value=""><?php esc_html_e( 'Choose…', 'wptravelengine-devzone' ); ?></option>
						<?php foreach ( $snippets as $key => $snippet ) : ?>
							<option value="<?php echo esc_attr( $key ); ?>"
							        data-code="<?php echo esc_attr( $snippet['code'] ?? '' ); ?>">
								<?php echo esc_html( $snippet['name'] ?? $key ); ?>
							</option>
						<?php endforeach; ?>
					</select>
					<input type="text"
					       class="wte-dbg-tinker-name"
					       placeholder="<?php esc_attr_e( 'Name&hellip;', 'wptravelengine-devzone' ); ?>"
					       aria-label="<?php esc_attr_e( 'Snippet name', 'wptravelengine-devzone' ); ?>">
					<span class="wte-dbg-tinker-actions-sep" aria-hidden="true"></span>
					<button type="button" class="wte-dbg-tinker-icon-btn wte-dbg-tinker-save"
					        title="<?php esc_attr_e( 'Save snippet (⌘/Ctrl + S)', 'wptravelengine-devzone' ); ?>"
					        aria-label="<?php esc_attr_e( 'Save snippet', 'wptravelengine-devzone' ); ?>">
						<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
					</button>
					<button type="button" class="wte-dbg-tinker-icon-btn is-danger wte-dbg-tinker-delete" disabled
					        title="<?php esc_attr_e( 'Delete snippet', 'wptravelengine-devzone' ); ?>"
					        aria-label="<?php esc_attr_e( 'Delete snippet', 'wptravelengine-devzone' ); ?>">
						<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
					</button>
				</span>
			</div>
			<div class="wte-dbg-tinker-output"></div>
		</div>

		<!-- Covers the brief window on a cold load where the raw markup is
		     painted but CodeMirror's own scripts haven't finished loading and
		     running TinkerTab.init() yet. Removed by init() once it's done —
		     see tinker-tab.js. -->
		<div class="wte-dbg-tinker-skeleton" aria-hidden="true">
			<div class="wte-dbg-tinker-skeleton-pane">
				<div class="wte-dbg-loader-block" style="width:50px;height:11px"></div>
				<div class="wte-dbg-loader-block" style="width:88%;height:14px;animation-delay:.1s"></div>
				<div class="wte-dbg-loader-block" style="width:70%;height:14px;animation-delay:.2s"></div>
				<div class="wte-dbg-loader-block" style="width:80%;height:14px;animation-delay:.3s"></div>
				<div class="wte-dbg-loader-block" style="width:55%;height:14px;animation-delay:.4s"></div>
				<div class="wte-dbg-loader-block" style="width:75%;height:14px;animation-delay:.5s"></div>
			</div>
			<div class="wte-dbg-tinker-skeleton-pane">
				<div class="wte-dbg-loader-block" style="width:60px;height:11px"></div>
				<div class="wte-dbg-loader-block" style="width:92%;height:60px;animation-delay:.15s"></div>
				<div class="wte-dbg-loader-block" style="width:65%;height:14px;animation-delay:.25s"></div>
			</div>
		</div>
	</div>
</div>
