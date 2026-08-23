<?php

namespace WPTravelEngineDevZone;

use WPTravelEngineDevZone\Tools\AbstractPostTool;

defined( 'ABSPATH' ) || exit;

class Admin {

	public const PAGE_SLUG = 'wptravelengine-devzone';
	public const NONCE     = 'wpte_devzone_nonce';

	/** SVG icon path for the Dev Zone — circuit-board style, currentColor fill. */
	private const ICON_PATH = 'M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C13.03 5.06 12.52 5 12 5c-.52 0-1.03.06-1.52.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z';

	/**
	 * Cached result of get_dev_features().
	 *
	 * @var array<string,string>
	 */
	public static array $dev_features = [];

	/**
	 * Registered tools.
	 *
	 * @var Tools\AbstractTool[]
	 */
	private array $tools;

	/**
	 * @param Tools\AbstractTool[] $tools
	 */
	public function __construct( array $tools ) {
		$this->tools = $tools;
		add_action( 'admin_menu', [ $this, 'register_menu' ] );
		add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_assets' ] );
		add_action( 'admin_enqueue_scripts', [ $this, 'maybe_show_activation_pointer' ] );
		add_action( 'current_screen', [ $this, 'suppress_notices_on_our_page' ] );
		add_action( 'admin_bar_menu', [ $this, 'add_toolbar_node' ], 100 );
		add_action( 'admin_head', [ $this, 'add_toolbar_styles' ] );

		( new SharedAjax( $tools ) )->register();
		( new Tools\ToolBeautifier() )->register();
		foreach ( $tools as $tool ) {
			$tool->register_ajax();
		}
	}

	/**
	 * Returns the full navigation structure.
	 *
	 * Filterable via 'wpte_devzone_tabs'.
	 *
	 * @return array<string,mixed>
	 */
	public static function get_tabs(): array {
		$tabs = [
			'marketplace' => [
				'title' => __( 'Market', 'wptravelengine-devzone' ),
				'priority' => 2,
				'on_dev' => true,
			],
			'query'   => __( 'Query', 'wptravelengine-devzone' ),
			'cron'    => __( 'Crontrol',     'wptravelengine-devzone' ),
			'logs'  => [
				'title'    => __( 'Logs', 'wptravelengine-devzone' ),
				'priority' => 10,
				'subtabs'  => [
					'wordpress'      => [ 'title' => __( 'WordPress', 'wptravelengine-devzone' ), 'on_dev' => true ],
				],
			],
			'tinker' => [
				'title'    => __( 'Tinker', 'wptravelengine-devzone' ),
				'priority' => 11,
				// 'on_dev' => true
			],
		];

		// Inspector tab and WTE log subtab only make sense with WP Travel
		// Engine's data model present.
		if ( Plugin::is_wte_active() ) {
			// 'perf'    => [
			// 	'title'  => __( 'Perf', 'wptravelengine-devzone' ),
			// 	'on_dev' => true,
			// ],
			$tabs['devzone'] = [
				'title'   => __( 'Inspect', 'wptravelengine-devzone' ),
				'priority' => 5,
				'subtabs' => [
					'overview'  => __( 'Overview',   'wptravelengine-devzone' ),
					'trips'     => __( 'Trips',       'wptravelengine-devzone' ),
					'bookings'  => __( 'Bookings',    'wptravelengine-devzone' ),
					'payments'  => __( 'Payments',    'wptravelengine-devzone' ),
					'customers' => __( 'Customers',   'wptravelengine-devzone' ),
				],
			];
			$tabs['logs']['subtabs']['wptravelengine'] = __( 'WP Travel Engine', 'wptravelengine-devzone' );
		}

		$tabs = apply_filters( 'wpte_devzone_tabs', $tabs );

		uasort( $tabs, static function ( $a, $b ): int {
			$pa = is_array( $a ) ? ( (float) ( $a['priority'] ?? 6 ) ) : 6;
			$pb = is_array( $b ) ? ( (float) ( $b['priority'] ?? 6 ) ) : 6;
			return $pa <=> $pb;
		} );

		return $tabs;
	}

	/**
	 * Returns dev-only tab slugs derived from get_tabs().
	 *
	 * Filterable via 'wpte_devzone_dev_features'.
	 *
	 * @return array<string,string>
	 */
	public static function get_dev_features(): array {
		if ( self::$dev_features ) {
			return self::$dev_features;
		}
		$derived = [];
		foreach ( self::get_tabs() as $group_slug => $group ) {
			if ( is_string( $group ) ) {
				continue;
			}
			if ( ! empty( $group['on_dev'] ) ) {
				$derived[ $group_slug ] = '__all';
				continue;
			}
			if ( ! empty( $group['subtabs'] ) ) {
				$dev_slugs    = [];
				$real_subtabs = array_filter( array_keys( $group['subtabs'] ), static fn( $k ) => $k !== '__inject_markup' );
				foreach ( $real_subtabs as $tab_slug ) {
					$tab_def = $group['subtabs'][ $tab_slug ];
					if ( is_array( $tab_def ) && ! empty( $tab_def['on_dev'] ) ) {
						$dev_slugs[] = $tab_slug;
					}
				}
				if ( $dev_slugs ) {
					$derived[ $group_slug ] = count( $dev_slugs ) === count( $real_subtabs )
						? '__all'
						: implode( ',', $dev_slugs );
				}
			}
		}
		self::$dev_features = apply_filters( 'wpte_devzone_dev_features', $derived );
		return self::$dev_features;
	}

	/**
	 * Verifies nonce and manage_options capability.
	 *
	 * Call at the top of every AJAX handler.
	 */
	public static function verify_request(): void {
		check_ajax_referer( self::NONCE );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( [ 'message' => 'Forbidden' ], 403 );
		}
	}

	/**
	 * Whether the Dev Zone's code-execution surface is permitted here.
	 *
	 * On production this is a HARD block with no escape hatch — deliberately
	 * not filterable, because Tinker executes arbitrary PHP and that must never
	 * be reachable on a live client site regardless of what a stray mu-plugin
	 * or a copy-pasted filter asks for.
	 *
	 * wp_get_environment_type() returns 'production' when WP_ENVIRONMENT_TYPE
	 * is unset, so an ordinary live site is blocked with no configuration.
	 *
	 * Off production this is on by default, and the filter can only ever
	 * tighten it further — it cannot grant execution anywhere it isn't already
	 * allowed:
	 *   add_filter( 'wpte_devzone_allow_writes', '__return_false' );
	 *
	 * Scope note: this currently guards Tinker's three endpoints only. The
	 * other mutating endpoints (arbitrary-table writes via db_action, plugin
	 * install/activate/delete, on-demand cron_run, bulk import_trips, option
	 * writes, debug-flag writes) remain guarded by manage_options + nonce alone
	 * and ARE live on production. Widening this gate to cover them is a
	 * deliberate open decision, not an oversight.
	 */
	public static function writes_enabled(): bool {
		if ( 'production' === wp_get_environment_type() ) {
			return false;
		}
		return false !== apply_filters( 'wpte_devzone_allow_writes', true );
	}

	/**
	 * Verifies nonce + capability, then the unbypassable production gate.
	 *
	 * Used by Tinker's run/save/delete endpoints. Available to any other
	 * handler that should inherit the same hard production block.
	 */
	public static function verify_write_request(): void {
		self::verify_request();

		if ( ! self::writes_enabled() ) {
			wp_send_json_error(
				[
					'message'   => __( 'Tinker is disabled on this environment.', 'wptravelengine-devzone' ),
					'read_only' => true,
				],
				403
			);
		}
	}

	/**
	 * Suppresses all admin notices on the Dev Zone page.
	 *
	 * @param \WP_Screen $screen Current screen.
	 */
	public function suppress_notices_on_our_page( \WP_Screen $screen ): void {
		if ( strpos( $screen->id, self::PAGE_SLUG ) === false ) {
			return;
		}
		remove_all_actions( 'admin_notices' );
		remove_all_actions( 'all_admin_notices' );
		remove_all_actions( 'user_admin_notices' );
		remove_all_actions( 'network_admin_notices' );
	}

	public function add_toolbar_node( \WP_Admin_Bar $wp_admin_bar ): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"'
			. ' fill="currentColor" class="wte-dz-abicon" aria-hidden="true">'
			. '<path d="' . self::ICON_PATH . '"/>'
			. '</svg>';

		$wp_admin_bar->add_node( [
			'id'    => 'wpte-devzone',
			'title' => $svg . esc_html__( 'Dev Zone', 'wptravelengine-devzone' ),
			'href'  => admin_url( 'tools.php?page=' . self::PAGE_SLUG ),
			'meta'  => [ 'title' => __( 'WP Travel Engine Dev Zone', 'wptravelengine-devzone' ) ],
		] );
	}

	public function add_toolbar_styles(): void {
		if ( ! is_admin_bar_showing() || ! current_user_can( 'manage_options' ) ) {
			return;
		}
		echo '<style>#wpadminbar #wp-admin-bar-wpte-devzone .ab-item .wte-dz-abicon{vertical-align:middle;margin:-2px 4px 0 0;}</style>';
	}

	public function register_menu(): void {
		add_submenu_page(
			'tools.php',
			__( 'WP Travel Engine Dev Zone', 'wptravelengine-devzone' ),
			__( 'WPTE Dev Zone', 'wptravelengine-devzone' ),
			'manage_options',
			self::PAGE_SLUG,
			[ $this, 'render_page' ]
		);
	}

	public function maybe_show_activation_pointer(): void {
		if ( 'wptravelengine-devzone' === ( $_GET['page'] ?? '' ) ) {
			return;
		}

		$pointer_id = 'wpte_devzone_activation_v1';
		$dismissed  = explode( ',', (string) get_user_meta( get_current_user_id(), 'dismissed_wp_pointers', true ) );

		if ( \in_array( $pointer_id, $dismissed, true ) ) {
			return;
		}

		wp_add_inline_script(
			'common',
			\sprintf(
				'(function(){
					var css=[
						"#wte-dz-tip{position:absolute;z-index:9999;width:260px;background:#fff;border:1px solid #c3c4c7;border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,.18);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;}",
						".wte-dz-head{background:#1d2327;padding:10px 14px;display:flex;align-items:center;gap:8px;position:relative;}",
						".wte-dz-title{color:#fff;font-size:13px;font-weight:600;margin:0;line-height:1.4;flex:1;}",
						".wte-dz-close{background:none;border:none;color:rgba(255,255,255,.6);font-size:18px;line-height:1;cursor:pointer;padding:0;margin-left:auto;}",
						".wte-dz-close:hover{color:#fff;}",
						".wte-dz-body{padding:12px 14px 14px;}",
						".wte-dz-msg{margin:0 0 12px;font-size:12px;color:#50575e;line-height:1.6;}",
						".wte-dz-foot{text-align:right;}",
						".wte-dz-btn{background:#2271b1;color:#fff;border:none;border-radius:3px;padding:5px 14px;font-size:13px;cursor:pointer;}",
						".wte-dz-btn:hover{background:#135e96;}"
					].join("");
					var st=document.createElement("style");st.textContent=css;document.head.appendChild(st);
					document.addEventListener("DOMContentLoaded",function(){
						var anchor=document.querySelector("#menu-tools > a");
						if(!anchor)return;
						var tip=document.createElement("div");tip.id="wte-dz-tip";
						var cb=document.createElement("div");
						cb.style.cssText="position:absolute;left:-9px;top:50%%;transform:translateY(-50%%);width:0;height:0;border:9px solid transparent;border-left:0;border-right-color:#c3c4c7;";
						var cf=document.createElement("div");
						cf.style.cssText="position:absolute;left:-8px;top:50%%;transform:translateY(-50%%);width:0;height:0;border:8px solid transparent;border-left:0;border-right-color:#fff;";
						var head=document.createElement("div");head.className="wte-dz-head";
						var ns="http://www.w3.org/2000/svg";
						var icon=document.createElementNS(ns,"svg");
						icon.setAttribute("width","16");icon.setAttribute("height","16");icon.setAttribute("viewBox","0 0 24 24");
						var path=document.createElementNS(ns,"path");
						path.setAttribute("fill","#a7aaad");
						path.setAttribute("d","M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C13.03 5.06 12.52 5 12 5c-.52 0-1.03.06-1.52.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z");
						icon.appendChild(path);
						var titleEl=document.createElement("strong");titleEl.className="wte-dz-title";titleEl.textContent=%s;
						var closeBtn=document.createElement("button");closeBtn.type="button";closeBtn.className="wte-dz-close";closeBtn.textContent="\u00d7";
						head.appendChild(icon);head.appendChild(titleEl);head.appendChild(closeBtn);
						var body=document.createElement("div");body.className="wte-dz-body";
						var msg=document.createElement("p");msg.className="wte-dz-msg";msg.textContent=%s;
						var foot=document.createElement("div");foot.className="wte-dz-foot";
						var visitBtn=document.createElement("button");visitBtn.type="button";visitBtn.className="wte-dz-btn";visitBtn.textContent=%s;
						foot.appendChild(visitBtn);body.appendChild(msg);body.appendChild(foot);
						tip.appendChild(cb);tip.appendChild(cf);tip.appendChild(head);tip.appendChild(body);
						var r=anchor.getBoundingClientRect();
						tip.style.top=(r.top+window.scrollY+r.height/2-60)+"px";
						tip.style.left=(r.right+12)+"px";
						document.body.appendChild(tip);
						function dismiss(){
							tip.remove();st.remove();
							fetch(ajaxurl,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"action=dismiss-wp-pointer&pointer="+%s});
						}
						closeBtn.addEventListener("click",dismiss);
						visitBtn.addEventListener("click",function(){
							dismiss();
							window.location.href=%s;
						});
					});
				})();',
				wp_json_encode( __( 'WP Travel Engine Dev Zone', 'wptravelengine-devzone' ) ),
				wp_json_encode( __( 'Active and ready! Find it here under Tools → WTE Dev Zone.', 'wptravelengine-devzone' ) ),
				wp_json_encode( __( 'Visit', 'wptravelengine-devzone' ) ),
				wp_json_encode( $pointer_id ),
				wp_json_encode( admin_url( 'tools.php?page=' . self::PAGE_SLUG ) )
			)
		);
	}

	public function enqueue_assets( string $hook ): void {
		if ( strpos( $hook, self::PAGE_SLUG ) === false ) {
			return;
		}

		wp_enqueue_style(
			'wpte-devzone',
			WPTE_DEVZONE_URL . 'assets/css/devzone.css',
			[],
			WPTE_DEVZONE_VERSION
		);

		wp_enqueue_script(
			'wpte-devzone',
			WPTE_DEVZONE_URL . 'assets/js/devzone.js',
			[],
			WPTE_DEVZONE_VERSION,
			true
		);

		// wp_script_add_data( 'type', 'module' ) requires WP 6.3+.
		// Use script_loader_tag for broad compatibility.
		add_filter(
			'script_loader_tag',
			static function ( $tag, $handle ) {
				if ( 'wpte-devzone' === $handle || 'wpte-devzone-search' === $handle || 'wpte-devzone-marketplace' === $handle ) {
					return str_replace( ' src=', ' type="module" src=', $tag );
				}
				return $tag;
			},
			10,
			2
		);

		// Build post_types map dynamically from registered PostTools.
		$post_types = [];
		foreach ( $this->tools as $tool ) {
			if ( $tool instanceof AbstractPostTool ) {
				$post_types[ $tool->get_post_type() ] = $tool->get_label();
			}
		}

		$group_subtabs = [];
		foreach ( self::get_tabs() as $group_slug => $tab ) {
			if ( $group_slug === 'devzone' || is_string( $tab ) || empty( $tab['subtabs'] ) ) {
				continue;
			}
			foreach ( $tab['subtabs'] as $sub_slug => $sub_def ) {
				if ( '__inject_markup' === $sub_slug ) continue;
				$label                                   = is_array( $sub_def ) ? ( $sub_def['title'] ?? $sub_slug ) : (string) $sub_def;
				$group_subtabs[ $group_slug ][ $sub_slug ] = $label;
			}
		}

		wp_localize_script( 'wpte-devzone', 'wpteDbg', [
			'ajaxurl'      => admin_url( 'admin-ajax.php' ),
			'nonce'        => wp_create_nonce( self::NONCE ),
			'post_types'   => $post_types,
			'devFeatures'  => self::get_dev_features(),
			'groupSubtabs' => $group_subtabs,
			'wteActive'    => Plugin::is_wte_active(),
		] );

		// Let each tool enqueue its own assets (e.g. ToolQuery loads tabs/query.js).
		foreach ( $this->tools as $tool ) {
			$tool->enqueue_assets();
		}
	}

	public function render_page(): void {
		$tools       = $this->tools;
		$active_slug = sanitize_key( $_GET['tab'] ?? $tools[0]->get_slug() );
		$active_tool = null;

		foreach ( $tools as $tool ) {
			if ( $tool->get_slug() === $active_slug ) {
				$active_tool = $tool;
				break;
			}
		}

		if ( ! $active_tool ) {
			$active_tool = $tools[0];
		}

		require WPTE_DEVZONE_DIR . 'templates/layout.php';
	}
}
