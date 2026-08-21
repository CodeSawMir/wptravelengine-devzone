<?php
/**
 * Dev Zone admin page shell.
 *
 * @var \WPTravelEngineDevZone\Tools\AbstractTool[] $tools      All registered tools.
 * @var \WPTravelEngineDevZone\Tools\AbstractTool   $active_tool Currently active tool.
 */
defined( 'ABSPATH' ) || exit;

$active_slug = $active_tool->get_slug();

// Normalize plain-string entries to [ 'title' => '...' ].
$tabs = array_map(
	static fn( $g ) => is_string( $g ) ? [ 'title' => $g ] : $g,
	\WPTravelEngineDevZone\Admin::get_tabs()
);

// All group slugs except 'devzone'. Old filter preserved for compat.
$group_slugs = apply_filters(
	'wpte_devzone_group_slugs',
	array_values( array_filter( array_keys( $tabs ), static fn( string $k ): bool => $k !== 'devzone' ) )
);

// Slug-to-title map. Old filter preserved for compat.
$group_buttons = apply_filters(
	'wpte_devzone_group_buttons',
	array_map( static fn( array $g ): string => $g['title'], $tabs )
);

$dev_features = \WPTravelEngineDevZone\Admin::get_dev_features();
$is_dev_group = static fn( string $slug ): bool =>
	! empty( $tabs[ $slug ]['on_dev'] ) || ( $dev_features[ $slug ] ?? '' ) === '__all';

$is_dev_tab = static function( string $slug ) use ( $tabs ): bool {
	foreach ( $tabs as $group ) {
		$def = $group['subtabs'][ $slug ] ?? null;
		if ( is_array( $def ) && ! empty( $def['on_dev'] ) ) {
			return true;
		}
	}
	return false;
};

// subtab slug → parent group slug.
$subtab_parent = [];
foreach ( $tabs as $group_slug => $group ) {
	if ( ! in_array( $group_slug, $group_slugs, true ) ) {
		continue;
	}
	foreach ( array_keys( $group['subtabs'] ?? [] ) as $sub_slug ) {
		$subtab_parent[ $sub_slug ] = $group_slug;
	}
}

$active_parent = $subtab_parent[ $active_slug ] ?? null;
?>
<div class="wrap wte-devzone-wrap">
<script>(function(){try{if(localStorage.getItem('wte_dbg_theme')==='dark'){document.currentScript.parentElement.classList.add('wte-dbg-dark');document.body.classList.add('wte-dbg-page-dark');}}catch(e){}}());</script>
<script>(function(){try{if(localStorage.getItem('wte_dbg_dev_mode')==='1'){document.currentScript.parentElement.classList.add('wte-dbg-dev-mode');}}catch(e){}}());</script>
<script>(function(){try{if(localStorage.getItem('wte_dbg_meta_expanded')==='1'){document.currentScript.parentElement.classList.add('wte-dbg-meta-expanded');}}catch(e){}}());</script>
<script>(function(){try{var k='wte_dbg_brand_animated';if(!sessionStorage.getItem(k)){sessionStorage.setItem(k,'1');document.addEventListener('DOMContentLoaded',function(){var el=document.querySelector('.wte-dbg-header-brand-link');if(el){el.classList.add('wte-dbg-brand-animate');}});}}catch(e){}}());</script>
	<div class="wte-dbg-header">
		<div class="wte-dbg-header-brand">
			<?php if ( \WPTravelEngineDevZone\Admin::get_dev_features() ) : ?>
			<button type="button" class="wte-dbg-dev-toggle" title="<?php esc_attr_e( 'Show hot features', 'wptravelengine-devzone' ); ?>">
				<span class="wte-dbg-dev-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="orange" aria-hidden="true"><path d="M20 8h-2.81A6 6 0 0 0 6.81 8H4a1 1 0 0 0 0 2h2v1a8 8 0 0 0 .07 1H4a1 1 0 0 0 0 2h2.64A6 6 0 0 0 18 14v-1h2a1 1 0 0 0 0-2h-2.07A8 8 0 0 0 18 11v-1h2a1 1 0 0 0 0-2zM9 7.5a3 3 0 0 1 6 0H9zm3 10.5a4 4 0 0 1-4-4v-3h8v3a4 4 0 0 1-4 4zm-1-6v2h2v-2h-2z"/><circle cx="9" cy="3" r="1.5"/><circle cx="15" cy="3" r="1.5"/></svg></span>
			</button>
			<a class="wte-dbg-header-brand-link" href="<?php echo esc_url( add_query_arg( [ 'page' => \WPTravelEngineDevZone\Admin::PAGE_SLUG ], admin_url( 'tools.php' ) ) ); ?>">
				<span class="wte-dbg-header-product"><?php esc_html_e( 'WP Travel Engine - Dev Zone', 'wptravelengine-devzone' ); ?></span>
			</a>
			<?php else : ?>
			<svg class="wte-dbg-header-icon" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="orange">
				<path d="M20 8h-2.81A6 6 0 0 0 6.81 8H4a1 1 0 0 0 0 2h2v1a8 8 0 0 0 .07 1H4a1 1 0 0 0 0 2h2.64A6 6 0 0 0 18 14v-1h2a1 1 0 0 0 0-2h-2.07A8 8 0 0 0 18 11v-1h2a1 1 0 0 0 0-2zM9 7.5a3 3 0 0 1 6 0H9zm3 10.5a4 4 0 0 1-4-4v-3h8v3a4 4 0 0 1-4 4zm-1-6v2h2v-2h-2z"/>
				<circle cx="9" cy="3" r="1.5"/>
				<circle cx="15" cy="3" r="1.5"/>
			</svg>
			<a class="wte-dbg-header-brand-link" href="<?php echo esc_url( add_query_arg( [ 'page' => \WPTravelEngineDevZone\Admin::PAGE_SLUG ], admin_url( 'tools.php' ) ) ); ?>">
				<span class="wte-dbg-header-product"><?php esc_html_e( 'WP Travel Engine - Dev Zone', 'wptravelengine-devzone' ); ?></span>
			</a>
			<?php endif; ?>
			<?php foreach ( $group_buttons as $slug => $label ) :
				$is_dev    = $is_dev_group( $slug );
				$is_active = $slug === 'devzone'
					? ( null === $active_parent && ! in_array( $active_slug, $group_slugs, true ) )
					: ( $active_slug === $slug || $active_parent === $slug );
			?>
			<span class="wte-dbg-header-divider" aria-hidden="true"<?php echo $is_dev ? ' data-dev="1"' : ''; ?>></span>
			<button type="button"
			        class="wte-dbg-group-btn<?php echo $is_active ? ' is-active' : ''; ?>"
			        data-group="<?php echo esc_attr( $slug ); ?>"
			        <?php echo $is_dev ? 'data-dev="1"' : ''; ?>>
				<?php echo esc_html( $label ); ?>
			</button>
			<?php endforeach; ?>
			<?php do_action( 'wpte_devzone_header_buttons', $active_slug ); ?>
		</div>
		<div id="wte-dbg-wp-debug-notice" class="wte-dbg-wp-notice" style="display:none;" aria-live="polite" aria-atomic="true"><span class="wte-dbg-loader-note"><?php esc_html_e( 'Reload the page for changes to take effect.', 'wptravelengine-devzone' ); ?></span></div>
		<div class="wte-dbg-header-meta">
			<button type="button" class="wte-dbg-meta-collapse-btn" aria-expanded="false" title="<?php esc_attr_e( 'Show info', 'wptravelengine-devzone' ); ?>">
				<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
			</button>
			<div class="wte-dbg-header-meta-inner">
				<span class="wte-dbg-meta-pill">PHP&nbsp;<?php echo esc_html( PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION ); ?></span>
				<span class="wte-dbg-meta-pill">WP&nbsp;<?php echo esc_html( get_bloginfo( 'version' ) ); ?></span>
				<span class="wte-dbg-meta-pill">WPTE&nbsp;<?php echo esc_html( WP_TRAVEL_ENGINE_VERSION ); ?></span>
				<button type="button" class="wte-dbg-theme-toggle" title="<?php esc_attr_e( 'Toggle dark mode', 'wptravelengine-devzone' ); ?>">
					<span class="wte-dbg-theme-icon">&#9728;</span>
				</button>
			</div>
		</div>
	</div>

	<?php
	// Named-group subtabs to show in the nav (empty = show inspector tools).
	$nav_group    = $active_parent ?? ( in_array( $active_slug, $group_slugs, true ) ? $active_slug : null );
	$nav_subtabs  = $nav_group ? ( $tabs[ $nav_group ]['subtabs'] ?? [] ) : [];
	$real_subtabs = array_filter(
		$nav_subtabs,
		static fn( string $k ): bool => $k !== '__inject_markup',
		ARRAY_FILTER_USE_KEY
	);
	$has_inject = isset( $nav_subtabs['__inject_markup'] ) && is_callable( $nav_subtabs['__inject_markup'] );
	$nav_hidden = ! empty( $nav_group ) && empty( $real_subtabs ) && ! $has_inject;
	?>
	<nav class="wte-dbg-tabs wte-dbg-bar <?php echo $nav_hidden ? 'is-hidden' : ''; ?>" role="tablist">
		<?php foreach ( $tools as $tool ) : ?>
			<?php if ( in_array( $tool->get_slug(), $group_slugs, true ) ) continue; ?>
			<?php if ( isset( $subtab_parent[ $tool->get_slug() ] ) ) continue; ?>
			<?php
			$tab_slug   = $tool->get_slug();
			$tab_url    = $tool->get_tab_url() ?? add_query_arg( [ 'page' => \WPTravelEngineDevZone\Admin::PAGE_SLUG, 'tab' => $tab_slug ], admin_url( 'tools.php' ) );
			$subtab_def = $tabs['devzone']['subtabs'][ $tab_slug ] ?? null;
			$tab_label  = is_array( $subtab_def )
				? ( $subtab_def['title'] ?? $tool->get_label() )
				: ( is_string( $subtab_def ) ? $subtab_def : $tool->get_label() );
			?>
			<a href="<?php echo esc_url( $tab_url ); ?>"
			   class="wte-dbg-tab <?php echo $active_slug === $tab_slug ? 'is-active' : ''; ?>"
			   role="tab"
			   data-inspector-tab="1"
			   <?php if ( $is_dev_tab( $tab_slug ) ) echo 'data-dev="1"'; ?>
			   <?php echo $nav_group ? 'style="display:none"' : ''; ?>
			   aria-selected="<?php echo $active_slug === $tab_slug ? 'true' : 'false'; ?>"
			   <?php if ( null !== $tool->get_tab_url() ) : ?>data-page-nav="1"<?php endif; ?>>
				<?php echo esc_html( $tab_label ); ?>
			</a>
		<?php endforeach; ?>
		<?php foreach ( $nav_subtabs as $sub_slug => $sub_def ) : ?>
			<?php if ( '__inject_markup' === $sub_slug ) continue; ?>
			<?php
			$sub_label  = is_array( $sub_def ) ? ( $sub_def['title'] ?? $sub_slug ) : (string) $sub_def;
			$sub_url    = add_query_arg( [ 'page' => \WPTravelEngineDevZone\Admin::PAGE_SLUG, 'tab' => $sub_slug ], admin_url( 'tools.php' ) );
			$sub_is_dev = is_array( $sub_def ) && ! empty( $sub_def['on_dev'] );
			?>
			<a href="<?php echo esc_url( $sub_url ); ?>"
			   class="wte-dbg-tab <?php echo $active_slug === $sub_slug ? 'is-active' : ''; ?>"
			   role="tab"
			   data-group-sub="1"
			   <?php if ( $sub_is_dev ) echo 'data-dev="1"'; ?>
			   aria-selected="<?php echo $active_slug === $sub_slug ? 'true' : 'false'; ?>">
				<?php echo esc_html( $sub_label ); ?>
			</a>
		<?php endforeach; ?>
		<?php foreach ( $tabs as $group_slug => $group_def ) : ?>
			<?php
			$inject = is_array( $group_def ) ? ( $group_def['subtabs']['__inject_markup'] ?? null ) : null;
			if ( ! is_callable( $inject ) ) continue;
			?>
			<div class="wte-dbg-nav-inject" data-group="<?php echo esc_attr( $group_slug ); ?>"<?php echo $nav_group !== $group_slug ? ' style="display:none;"' : ''; ?>><?php call_user_func( $inject, $group_slug ); ?></div>
		<?php endforeach; ?>
		<?php if ( ! $nav_hidden ) : ?>
		<button type="button" class="wte-dbg-back-btn" title="<?php esc_attr_e( 'Go back', 'wptravelengine-devzone' ); ?>">&#8592; <?php esc_html_e( 'Back', 'wptravelengine-devzone' ); ?></button>
		<?php endif; ?>
	</nav>

	<div class="wte-dbg-content" data-rendered-tab="<?php echo esc_attr( $active_slug ); ?>">
		<script>(function(){try{var s=localStorage.getItem('wte_dbg_tab');if(!s)return;var c=document.currentScript.parentElement.dataset.renderedTab||'overview';if(s===c)return;document.querySelectorAll('.wte-dbg-tab').forEach(function(t){var slug=new URL(t.href).searchParams.get('tab')||'overview';t.classList.toggle('is-active',slug===s);t.setAttribute('aria-selected',slug===s?'true':'false');});document.currentScript.parentElement.style.visibility='hidden';}catch(e){}}());</script>
		<?php
		$tool     = $active_tool;
		$template = $active_tool->get_template();
		if ( file_exists( $template ) ) {
			require $template;
		}
		?>
	</div>

</div>
