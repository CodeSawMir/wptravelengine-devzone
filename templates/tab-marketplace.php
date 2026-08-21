<?php
/**
 * Marketplace tab shell.
 * All dynamic content is rendered by MarketplaceTab (assets/js/tabs/marketplace-tab.js).
 */
defined( 'ABSPATH' ) || exit;
?>
<div class="wte-dbg-marketplace-tab">

	<div class="wte-dbg-marketplace-toolbar wte-dbg-bar">
		<input
			type="search"
			class="wte-dbg-marketplace-search wte-dbg-search-input"
			placeholder="<?php esc_attr_e( 'Filter plugins…', 'wptravelengine-devzone' ); ?>"
			aria-label="<?php esc_attr_e( 'Search plugins', 'wptravelengine-devzone' ); ?>"
		>
		<button
			type="button"
			class="wte-dbg-refresh-btn"
			title="<?php esc_attr_e( 'Refresh marketplace', 'wptravelengine-devzone' ); ?>"
		></button>

		<?php $has_token = ! empty( get_option( 'wpte_dz_github_token' ) ); ?>
		<div class="wte-dbg-marketplace-token-wrap">
			<button
				type="button"
				class="wte-dbg-marketplace-token-btn<?php echo $has_token ? ' has-token' : ''; ?>"
				title="<?php echo $has_token ? esc_attr__( 'GitHub token connected — click to manage', 'wptravelengine-devzone' ) : esc_attr__( 'Set up GitHub token to increase rate limit', 'wptravelengine-devzone' ); ?>"
			><?php echo $has_token ? esc_html__( 'Connected Github', 'wptravelengine-devzone' ) : esc_html__( 'Connect Github', 'wptravelengine-devzone' ); ?></button>

			<div class="wte-dbg-marketplace-token-panel is-hidden">
				<p class="wte-dbg-marketplace-token-info">
					<?php esc_html_e( 'Add a GitHub', 'wptravelengine-devzone' ); ?>
					<a href="https://github.com/settings/tokens/new?scopes=repo,read:org" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Personal Access Token', 'wptravelengine-devzone' ); ?></a>
					<?php esc_html_e( ' to raise the API rate limit from 60 to 5,000 req/hr and access private repositories. Requires the', 'wptravelengine-devzone' ); ?>
					<code>repo</code> <?php esc_html_e( 'scope.', 'wptravelengine-devzone' ); ?>
				</p>
				<form class="wte-dbg-marketplace-token-row" onsubmit="return false;">
					<input
						type="password"
						class="wte-dbg-marketplace-token-input wte-dbg-search-input"
						placeholder="<?php esc_attr_e( 'ghp_…', 'wptravelengine-devzone' ); ?>"
						autocomplete="new-password"
					>
					<button type="button" class="wte-dbg-marketplace-token-connect"><?php esc_html_e( 'Connect', 'wptravelengine-devzone' ); ?></button>
					<button type="button" class="wte-dbg-marketplace-token-clear"<?php echo $has_token ? '' : ' style="display:none"'; ?>><?php esc_html_e( 'Disconnect', 'wptravelengine-devzone' ); ?></button>
				</form>
				<div class="wte-dbg-marketplace-token-status is-hidden"></div>
			</div>
		</div>
	</div>

	<div class="wte-dbg-marketplace-filters">
		<button type="button" class="wte-dbg-marketplace-filter is-active" data-filter="all"><?php esc_html_e( 'All', 'wptravelengine-devzone' ); ?></button>
		<button type="button" class="wte-dbg-marketplace-filter" data-filter="registry"><?php esc_html_e( 'Official', 'wptravelengine-devzone' ); ?></button>
		<button type="button" class="wte-dbg-marketplace-filter" data-filter="installed"><?php esc_html_e( 'Installed', 'wptravelengine-devzone' ); ?></button>
	</div>

	<div class="wte-dbg-marketplace-grid"></div>

</div>
