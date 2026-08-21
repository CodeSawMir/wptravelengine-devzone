/**
 * WPTE Dev Zone — MarketplaceTab
 * Discovers and installs WP Travel Engine add-on plugins.
 */
/* global wpteDbg */

import { DomHelper } from '../dom-helper.js';

const { ajaxurl, nonce } = wpteDbg;

export class MarketplaceTab {
	constructor( contentEl ) {
		this.contentEl        = contentEl;
		this._allPlugins      = [];
		this._filter          = 'all';
		this._search          = '';
		this._fetchCtrl       = null;
		this._outsideHandler  = null;
	}

	destroy() {
		this._fetchCtrl?.abort();
		this._fetchCtrl = null;
		if ( this._outsideHandler ) {
			document.removeEventListener( 'click', this._outsideHandler );
			this._outsideHandler = null;
		}
	}

	init() {
		this._gridEl      = this.contentEl.querySelector( '.wte-dbg-marketplace-grid' );
		this._searchInput = this.contentEl.querySelector( '.wte-dbg-marketplace-search' );
		this._refreshBtn  = this.contentEl.querySelector( '.wte-dbg-refresh-btn' );
		this._tokenBtn    = this.contentEl.querySelector( '.wte-dbg-marketplace-token-btn' );
		this._tokenPanel  = this.contentEl.querySelector( '.wte-dbg-marketplace-token-panel' );
		this._tokenInput   = this.contentEl.querySelector( '.wte-dbg-marketplace-token-input' );
		this._tokenConnect = this.contentEl.querySelector( '.wte-dbg-marketplace-token-connect' );
		this._tokenClear   = this.contentEl.querySelector( '.wte-dbg-marketplace-token-clear' );
		this._tokenStatus  = this.contentEl.querySelector( '.wte-dbg-marketplace-token-status' );

		this._refreshBtn?.addEventListener( 'click', () => this._load( true ) );

		this._searchInput?.addEventListener( 'input', () => {
			this._search = this._searchInput.value.trim().toLowerCase();
			this._renderGrid();
		} );

		this.contentEl.querySelectorAll( '.wte-dbg-marketplace-filter' ).forEach( ( btn ) => {
			btn.addEventListener( 'click', () => {
				this.contentEl.querySelectorAll( '.wte-dbg-marketplace-filter' )
					.forEach( ( b ) => b.classList.remove( 'is-active' ) );
				btn.classList.add( 'is-active' );
				this._filter = btn.dataset.filter;
				this._renderGrid();
			} );
		} );

		this._tokenBtn?.addEventListener( 'click', () => {
			const hidden = this._tokenPanel?.classList.toggle( 'is-hidden' );
			this._tokenBtn.classList.toggle( 'is-open', ! hidden );
		} );
		this._tokenConnect?.addEventListener( 'click', () => this._saveToken() );
		this._tokenClear?.addEventListener( 'click', () => this._saveToken( true ) );

		const tokenWrap = this.contentEl.querySelector( '.wte-dbg-marketplace-token-wrap' );
		this._outsideHandler = ( e ) => {
			if ( tokenWrap && ! tokenWrap.contains( e.target ) ) {
				this._tokenPanel?.classList.add( 'is-hidden' );
				this._tokenBtn?.classList.remove( 'is-open' );
			}
		};
		document.addEventListener( 'click', this._outsideHandler );

		this._load();
		return this;
	}

	_load( bustCache = false ) {
		this._fetchCtrl?.abort();
		this._fetchCtrl = new AbortController();
		const { signal } = this._fetchCtrl;

		if ( this._refreshBtn ) {
			this._refreshBtn.disabled = true;
			this._refreshBtn.classList.add( 'is-spinning' );
		}
		DomHelper.setStatus( 'Loading marketplace\u2026', 'info' );
		this._renderSkeleton();

		const doLoad = () => this._post( 'wpte_devzone_marketplace_plugins', null, signal );

		const run = bustCache
			? this._post( 'wpte_devzone_marketplace_bust_cache', null, signal ).then( doLoad )
			: doLoad();

		run.then( ( res ) => {
			this._fetchCtrl = null;
			this._setRefreshIdle();

			if ( ! res.success ) {
				DomHelper.setStatus( 'Failed to load marketplace.', 'error', 4 );
				this._renderError( 'Failed to load plugins.' );
				return;
			}

			this._applyTokenState( res.data.has_token );

			// User info returned inline — no separate verify call needed on load.
			if ( res.data.has_token && res.data.user ) {
				const u = res.data.user;
				this._setTokenStatus(
					'\u2714 Connected as @' + u.login + ( u.name ? ' (' + u.name + ')' : '' ),
					'ok'
				);
			}

			this._allPlugins = res.data.plugins || [];
			DomHelper.setStatus( 'Marketplace loaded.', 'success', 3 );
			this._renderGrid();

			// T4 is included in the response when cached; only lazy-load if cache was cold.
			if ( res.data.tier4_pending ) {
				this._loadTier4( signal );
			}
		} ).catch( ( err ) => {
			if ( err.name === 'AbortError' ) return;
			this._fetchCtrl = null;
			this._setRefreshIdle();
			DomHelper.setStatus( 'Request failed.', 'error', 4 );
			this._renderError( 'Request failed.' );
		} );
	}

	_loadTier4( signal ) {
		this._post( 'wpte_devzone_marketplace_tier4', null, signal )
			.then( ( res ) => {
				if ( ! res.success ) {
					console.error( '[marketplace] tier4 fetch failed:', res.data?.message );
					return;
				}
				if ( ! res.data.plugins?.length ) return;
				const existing = new Set( this._allPlugins.map( ( p ) => p.slug ) );
				const added = res.data.plugins.filter( ( p ) => ! existing.has( p.slug ) );
				if ( ! added.length ) return;
				this._allPlugins = [ ...this._allPlugins, ...added ];
				this._renderGrid();
			} )
			.catch( ( err ) => {
				if ( err.name === 'AbortError' ) return;
				console.error( '[marketplace] tier4 request error:', err );
			} );
	}

	_setRefreshIdle() {
		if ( this._refreshBtn ) {
			this._refreshBtn.disabled = false;
			this._refreshBtn.classList.remove( 'is-spinning' );
		}
	}

	_renderGrid() {
		this._clear( this._gridEl );

		let plugins = this._allPlugins;

		if ( this._filter === 'registry' ) {
			plugins = plugins.filter( ( p ) => p.source === 'registry' );
		} else if ( this._filter === 'installed' ) {
			plugins = plugins.filter( ( p ) => p.is_installed );
		}

		if ( this._search ) {
			const q = this._search;
			plugins = plugins.filter( ( p ) =>
				p.name.toLowerCase().includes( q ) ||
				p.description.toLowerCase().includes( q ) ||
				p.author.toLowerCase().includes( q ) ||
				( p.tags || [] ).some( ( t ) => t.includes( q ) )
			);
		}

		if ( ! plugins.length ) {
			this._gridEl.appendChild( this._makeEmpty( 'No plugins found.' ) );
			return;
		}

		const frag = document.createDocumentFragment();
		plugins.forEach( ( plugin ) => frag.appendChild( this._makeCard( plugin ) ) );
		this._gridEl.appendChild( frag );
	}

	_makeCard( plugin ) {
		const AVATAR_COLORS = [ '#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#4f46e5' ];
		const label = plugin.name || plugin.slug || '?';
		const avatarColor = AVATAR_COLORS[ ( plugin.slug || '' ).charCodeAt( 0 ) % AVATAR_COLORS.length ];

		const card = document.createElement( 'div' );
		card.className = 'wte-dbg-marketplace-card' +
			( plugin.featured ? ' is-featured' : '' ) +
			( plugin.is_active ? ' is-active' : '' ) +
			( plugin.is_installed && ! plugin.is_active ? ' is-installed' : '' );

		// Card body wrapper
		const body = document.createElement( 'div' );
		body.className = 'wte-dbg-marketplace-card-body';

		// Header: avatar + title area + stars
		const header = document.createElement( 'div' );
		header.className = 'wte-dbg-marketplace-card-header';

		const avatarEl = document.createElement( 'div' );
		avatarEl.className       = 'wte-dbg-marketplace-card-avatar';
		avatarEl.style.background = avatarColor;
		avatarEl.textContent     = label.charAt( 0 );
		header.appendChild( avatarEl );

		const titleArea = document.createElement( 'div' );
		titleArea.className = 'wte-dbg-marketplace-card-title';

		const nameEl = document.createElement( 'div' );
		nameEl.className   = 'wte-dbg-marketplace-card-name';
		nameEl.textContent = label;
		titleArea.appendChild( nameEl );

		const authorWrap = document.createElement( 'div' );
		authorWrap.className = 'wte-dbg-marketplace-card-author-wrap';

		if ( plugin.author ) {
			const authorEl = document.createElement( 'div' );
			authorEl.className   = 'wte-dbg-marketplace-card-author';
			authorEl.textContent = plugin.author;
			authorWrap.appendChild( authorEl );
		}

		if ( plugin.is_installed ) {
			const titleMeta = document.createElement( 'div' );
			titleMeta.className = 'wte-dbg-marketplace-card-title-meta';
			if ( plugin.installed_ver ) {
				const verEl = document.createElement( 'span' );
				verEl.className   = 'wte-dbg-marketplace-card-ver';
				verEl.textContent = 'v' + plugin.installed_ver;
				titleMeta.appendChild( verEl );
			}
			const statusInline = document.createElement( 'span' );
			statusInline.className   = 'wte-dbg-marketplace-status ' + ( plugin.is_active ? 'is-active' : 'is-installed' );
			statusInline.textContent = plugin.is_active ? 'Active' : 'Installed';
			titleMeta.appendChild( statusInline );
			authorWrap.appendChild( titleMeta );
		}

		titleArea.appendChild( authorWrap )

		header.appendChild( titleArea );

		if ( plugin.stars ) {
			const starsEl = document.createElement( 'span' );
			starsEl.className   = 'wte-dbg-marketplace-card-stars';
			starsEl.textContent = plugin.stars;
			header.appendChild( starsEl );
		}

		if ( plugin.github_repo ) {
			const NS = 'http://www.w3.org/2000/svg';
			const svgEl = document.createElementNS( NS, 'svg' );
			svgEl.setAttribute( 'width', '16' );
			svgEl.setAttribute( 'height', '16' );
			svgEl.setAttribute( 'viewBox', '0 0 24 24' );
			svgEl.setAttribute( 'fill', 'currentColor' );
			svgEl.setAttribute( 'aria-hidden', 'true' );
			const pathEl = document.createElementNS( NS, 'path' );
			pathEl.setAttribute( 'd', 'M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.34-3.369-1.34-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.741 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z' );
			svgEl.appendChild( pathEl );

			const repoLink = document.createElement( 'a' );
			repoLink.className = 'wte-dbg-marketplace-card-repo-link';
			repoLink.href      = 'https://github.com/' + plugin.github_repo;
			repoLink.target    = '_blank';
			repoLink.rel       = 'noopener noreferrer';
			repoLink.title     = plugin.github_repo;
			repoLink.appendChild( svgEl );
			header.appendChild( repoLink );
		}

		body.appendChild( header );

		// Source badge — only registry and org sources get a visible badge.
		const sourceMap = { registry: [ 'Official', 'badge-registry' ], org: [ 'Private', 'badge-org' ] };
		const badgeDef = sourceMap[ plugin.source ];
		if ( badgeDef ) {
			const badge = document.createElement( 'span' );
			badge.className   = 'wte-dbg-marketplace-source-badge ' + badgeDef[ 1 ];
			badge.textContent = badgeDef[ 0 ];
			body.appendChild( badge );
		}

		// Description
		if ( plugin.description ) {
			const desc = document.createElement( 'p' );
			desc.className   = 'wte-dbg-marketplace-card-desc';
			desc.textContent = plugin.description;
			body.appendChild( desc );
		}

		// Tags
		if ( plugin.tags?.length ) {
			const tagsEl = document.createElement( 'div' );
			tagsEl.className = 'wte-dbg-marketplace-card-tags';
			plugin.tags.slice( 0, 4 ).forEach( ( tag ) => {
				const t = document.createElement( 'span' );
				t.className   = 'wte-dbg-marketplace-tag';
				t.textContent = tag;
				tagsEl.appendChild( t );
			} );
			body.appendChild( tagsEl );
		}

		card.appendChild( body );

		// Footer: action buttons only — version and status live in title-meta above.
		const footer = document.createElement( 'div' );
		footer.className = 'wte-dbg-marketplace-card-footer';

		// Detached statusEl kept so _delete can clear it (noop if already removed).
		const statusEl = document.createElement( 'span' );
		statusEl.className = 'wte-dbg-marketplace-status';

		const actionBtn = document.createElement( 'button' );
		actionBtn.type      = 'button';
		actionBtn.className = 'wte-dbg-marketplace-action-btn';

		if ( plugin.is_active ) {
			actionBtn.textContent = 'Deactivate';
			actionBtn.className   = 'wte-dbg-marketplace-action-btn is-deactivate';
			actionBtn.addEventListener( 'click', () => this._deactivate( plugin, actionBtn, card, statusEl ) );

			const reinstallBtn = document.createElement( 'button' );
			reinstallBtn.type        = 'button';
			reinstallBtn.className   = 'wte-dbg-marketplace-action-btn is-reinstall';
			reinstallBtn.textContent = 'Reinstall';
			reinstallBtn.addEventListener( 'click', () => this._install( plugin, reinstallBtn, card, statusEl, true ) );

			const deleteBtn = document.createElement( 'button' );
			deleteBtn.type        = 'button';
			deleteBtn.className   = 'wte-dbg-marketplace-action-btn is-delete';
			deleteBtn.textContent = 'Delete';
			deleteBtn.addEventListener( 'click', () => this._delete( plugin, deleteBtn, card, statusEl ) );

			const actionsEl = document.createElement( 'div' );
			actionsEl.className = 'wte-dbg-marketplace-card-actions';
			actionsEl.appendChild( actionBtn );
			actionsEl.appendChild( reinstallBtn );
			actionsEl.appendChild( deleteBtn );

			footer.appendChild( actionsEl );
		} else if ( plugin.is_installed ) {
			actionBtn.textContent = 'Activate';
			actionBtn.classList.add( 'is-activate' );
			actionBtn.addEventListener( 'click', () => this._activate( plugin, actionBtn, card, statusEl ) );

			const reinstallBtn = document.createElement( 'button' );
			reinstallBtn.type        = 'button';
			reinstallBtn.className   = 'wte-dbg-marketplace-action-btn is-reinstall';
			reinstallBtn.textContent = 'Reinstall';
			reinstallBtn.addEventListener( 'click', () => this._install( plugin, reinstallBtn, card, statusEl, true ) );

			const deleteBtn = document.createElement( 'button' );
			deleteBtn.type        = 'button';
			deleteBtn.className   = 'wte-dbg-marketplace-action-btn is-delete';
			deleteBtn.textContent = 'Delete';
			deleteBtn.addEventListener( 'click', () => this._delete( plugin, deleteBtn, card, statusEl ) );

			const actionsEl = document.createElement( 'div' );
			actionsEl.className = 'wte-dbg-marketplace-card-actions';
			actionsEl.appendChild( actionBtn );
			actionsEl.appendChild( reinstallBtn );
			actionsEl.appendChild( deleteBtn );

			footer.appendChild( actionsEl );
		} else if ( plugin.github_repo ) {
			actionBtn.textContent = 'Install';
			actionBtn.addEventListener( 'click', () => this._install( plugin, actionBtn, card, statusEl ) );
			footer.appendChild( actionBtn );
		} else if ( plugin.author_url ) {
			actionBtn.textContent = 'View';
			actionBtn.addEventListener( 'click', () => window.open( plugin.author_url, '_blank', 'noopener' ) );
			footer.appendChild( actionBtn );
		} else {
			footer.appendChild( actionBtn );
		}

		card.appendChild( footer );

		return card;
	}

	_install( plugin, btn, card, statusEl, reinstall = false ) {
		const label = plugin.name || plugin.slug;
		if ( ! reinstall && ! window.confirm( 'Install "' + label + '"?' ) ) return;
		if ( reinstall && ! window.confirm( 'Reinstall "' + label + '"?' ) ) return;

		btn.disabled    = true;
		btn.textContent = reinstall ? 'Reinstalling\u2026' : 'Installing\u2026';
		card.classList.add( 'is-loading' );

		this._post( 'wpte_devzone_marketplace_install', {
			github_repo: plugin.github_repo,
			reinstall:   reinstall ? 1 : 0,
			plugin_file: reinstall ? ( plugin.plugin_file || '' ) : '',
		} )
			.then( ( res ) => {
				card.classList.remove( 'is-loading' );
				if ( res.success ) {
					DomHelper.setStatus( res.data.message, 'success', 2 );
					setTimeout( () => window.location.reload(), 2000 );
				} else {
					btn.textContent = reinstall ? 'Reinstall' : 'Install';
					btn.disabled    = false;
					DomHelper.setStatus( res.data?.message || 'Installation failed.', 'error', 5 );
				}
			} )
			.catch( () => {
				card.classList.remove( 'is-loading' );
				btn.textContent = reinstall ? 'Reinstall' : 'Install';
				btn.disabled    = false;
				DomHelper.setStatus( 'Request failed.', 'error', 4 );
			} );
	}

	_delete( plugin, btn, card, statusEl ) {
		if ( ! window.confirm( 'Delete "' + ( plugin.name || plugin.slug ) + '"? This cannot be undone.' ) ) return;

		btn.disabled    = true;
		btn.textContent = 'Deleting\u2026';
		card.classList.add( 'is-loading' );

		this._post( 'wpte_devzone_marketplace_delete', { plugin_file: plugin.plugin_file } )
			.then( ( res ) => {
				card.classList.remove( 'is-loading' );
				if ( res.success ) {
					plugin.is_installed = false;
					plugin.is_active    = false;
					plugin.plugin_file  = '';
					card.classList.remove( 'is-installed', 'is-active' );
					card.querySelector( '.wte-dbg-marketplace-card-title-meta' )?.remove();
					// Replace footer buttons with a fresh Install button.
					const footer = card.querySelector( '.wte-dbg-marketplace-card-footer' );
					footer?.querySelector( '.wte-dbg-marketplace-card-actions' )?.remove();
					footer?.querySelectorAll( '.wte-dbg-marketplace-action-btn' ).forEach( ( b ) => b.remove() );
					const installBtn = document.createElement( 'button' );
					installBtn.type        = 'button';
					installBtn.className   = 'wte-dbg-marketplace-action-btn';
					installBtn.textContent = 'Install';
					installBtn.addEventListener( 'click', () => this._install( plugin, installBtn, card, statusEl ) );
					footer?.appendChild( installBtn );
					DomHelper.setStatus( res.data.message, 'success', 4 );
				} else {
					btn.disabled    = false;
					btn.textContent = 'Delete';
					DomHelper.setStatus( res.data?.message || 'Delete failed.', 'error', 5 );
				}
			} )
			.catch( () => {
				card.classList.remove( 'is-loading' );
				btn.disabled    = false;
				btn.textContent = 'Delete';
				DomHelper.setStatus( 'Request failed.', 'error', 4 );
			} );
	}

	_activate( plugin, btn, card, statusEl ) {
		btn.disabled    = true;
		btn.textContent = 'Activating\u2026';

		this._post( 'wpte_devzone_marketplace_activate', { plugin_file: plugin.plugin_file } )
			.then( ( res ) => {
				if ( res.success ) {
					DomHelper.setStatus( res.data.message, 'success', 2 );
					setTimeout( () => window.location.reload(), 2000 );
				} else {
					btn.disabled    = false;
					btn.textContent = 'Activate';
					DomHelper.setStatus( res.data?.message || 'Activation failed.', 'error', 5 );
				}
			} )
			.catch( () => {
				btn.disabled    = false;
				btn.textContent = 'Activate';
				DomHelper.setStatus( 'Request failed.', 'error', 4 );
			} );
	}

	_deactivate( plugin, btn, card, statusEl ) {
		if ( ! window.confirm( 'Deactivate "' + ( plugin.name || plugin.slug ) + '"?' ) ) return;

		btn.disabled    = true;
		btn.textContent = 'Deactivating…';

		this._post( 'wpte_devzone_marketplace_deactivate', { plugin_file: plugin.plugin_file } )
			.then( ( res ) => {
				if ( res.success ) {
					DomHelper.setStatus( res.data.message, 'success', 2 );
					setTimeout( () => window.location.reload(), 2000 );
				} else {
					btn.disabled    = false;
					btn.textContent = 'Deactivate';
					DomHelper.setStatus( res.data?.message || 'Deactivation failed.', 'error', 5 );
				}
			} )
			.catch( () => {
				btn.disabled    = false;
				btn.textContent = 'Deactivate';
				DomHelper.setStatus( 'Request failed.', 'error', 4 );
			} );
	}

	_saveToken( clear = false ) {
		const token = clear ? '' : ( this._tokenInput?.value.trim() || '' );
		this._post( 'wpte_devzone_marketplace_save_token', { token } )
			.then( ( res ) => {
				if ( ! res.success ) return;
				DomHelper.setStatus( res.data.message, 'success', 3 );
				if ( this._tokenInput ) this._tokenInput.value = '';
				if ( clear ) {
					this._applyTokenState( false );
					this._setTokenStatus( '' );
					this._tokenPanel?.classList.add( 'is-hidden' );
					this._tokenBtn?.classList.remove( 'is-open' );
					this._load();
				} else {
					this._applyTokenState( true );
					// Keep panel open so "Connected as @user" is visible after connect.
					this._tokenPanel?.classList.remove( 'is-hidden' );
					this._tokenBtn?.classList.add( 'is-open' );
					this._verifyToken();
					this._load();
				}
			} )
			.catch( ( err ) => console.error( '[marketplace] save token failed', err ) );
	}

	_verifyToken() {
		this._setTokenStatus( 'Verifying\u2026', 'pending' );

		this._post( 'wpte_devzone_marketplace_verify_token', null )
			.then( ( res ) => {
				if ( res.success ) {
					const u = res.data;
					this._setTokenStatus(
						'\u2714 Connected as @' + u.login + ( u.name ? ' (' + u.name + ')' : '' ),
						'ok'
					);
				} else {
					this._setTokenStatus( '\u2716 ' + ( res.data?.message || 'Invalid token' ), 'error' );
				}
			} )
			.catch( () => {
				this._setTokenStatus( '\u2716 Request failed', 'error' );
			} );
	}

	_applyTokenState( hasToken ) {
		if ( ! this._tokenBtn ) return;
		this._tokenBtn.classList.toggle( 'has-token', !! hasToken );
		this._tokenBtn.textContent = hasToken ? 'Connected Github' : 'Connect Github';
		this._tokenBtn.title = hasToken
			? 'GitHub token connected \u2014 click to manage'
			: 'Set up GitHub token to increase rate limit';

		if ( this._tokenClear ) {
			this._tokenClear.style.display = hasToken ? '' : 'none';
		}
	}

	_setTokenStatus( msg, type ) {
		if ( ! this._tokenStatus ) return;
		this._tokenStatus.textContent = msg;
		this._tokenStatus.className   = 'wte-dbg-marketplace-token-status';
		if ( ! msg ) {
			this._tokenStatus.classList.add( 'is-hidden' );
			return;
		}
		this._tokenStatus.classList.remove( 'is-hidden' );
		if ( type ) this._tokenStatus.classList.add( 'is-' + type );
	}

	_renderSkeleton() {
		this._clear( this._gridEl );
		const frag = document.createDocumentFragment();
		for ( let i = 0; i < 6; i++ ) {
			const card = document.createElement( 'div' );
			card.className = 'wte-dbg-marketplace-card wte-dbg-marketplace-card-skel';
			card.setAttribute( 'aria-hidden', 'true' );

			const body = document.createElement( 'div' );
			body.className = 'wte-dbg-marketplace-card-body';

			// Avatar + name row
			const headerSkel = document.createElement( 'div' );
			headerSkel.style.cssText = 'display:flex;gap:11px;align-items:center';
			const avatarSkel = document.createElement( 'div' );
			avatarSkel.className = 'wte-dbg-loader-block';
			avatarSkel.style.cssText = `width:38px;height:38px;border-radius:8px;flex-shrink:0;animation-delay:${ ( i * 0.1 ).toFixed( 2 ) }s`;
			const titleSkel = document.createElement( 'div' );
			titleSkel.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:6px';
			[ [ '60%', 13 ], [ '40%', 10 ] ].forEach( ( [ w, h ], j ) => {
				const b = document.createElement( 'div' );
				b.className = 'wte-dbg-loader-block';
				b.style.cssText = `width:${w};height:${h}px;animation-delay:${ ( i * 0.1 + j * 0.06 ).toFixed( 2 ) }s`;
				titleSkel.appendChild( b );
			} );
			headerSkel.appendChild( avatarSkel );
			headerSkel.appendChild( titleSkel );
			body.appendChild( headerSkel );

			// Badge + desc blocks
			[ [ '55px', 14 ], [ '100%', 11 ], [ '80%', 11 ] ].forEach( ( [ w, h ], j ) => {
				const b = document.createElement( 'div' );
				b.className = 'wte-dbg-loader-block';
				b.style.cssText = `width:${w};height:${h}px;animation-delay:${ ( i * 0.1 + ( j + 2 ) * 0.06 ).toFixed( 2 ) }s`;
				body.appendChild( b );
			} );
			card.appendChild( body );

			const footerSkel = document.createElement( 'div' );
			footerSkel.style.cssText = 'padding:10px 14px;border-top:1px solid var(--dbg-border-faint);display:flex;justify-content:flex-end';
			const btnSkel = document.createElement( 'div' );
			btnSkel.className = 'wte-dbg-loader-block';
			btnSkel.style.cssText = `width:64px;height:28px;border-radius:6px;animation-delay:${ ( i * 0.1 + 0.3 ).toFixed( 2 ) }s`;
			footerSkel.appendChild( btnSkel );
			card.appendChild( footerSkel );

			frag.appendChild( card );
		}
		this._gridEl.appendChild( frag );
	}

	_renderError( msg ) {
		this._clear( this._gridEl );
		this._gridEl.appendChild( this._makeEmpty( msg ) );
	}

	_post( action, extra, signal ) {
		const body = Object.assign( { action, _ajax_nonce: nonce }, extra || {} );
		const sig  = signal ?? ( AbortSignal.timeout ? AbortSignal.timeout( 30000 ) : null );
		const opts = { method: 'POST', body: new URLSearchParams( body ) };
		if ( sig ) opts.signal = sig;
		return fetch( ajaxurl, opts ).then( ( r ) => r.json() );
	}

	_makeEmpty( msg ) {
		const p = document.createElement( 'p' );
		p.className   = 'wte-dbg-empty';
		p.textContent = msg;
		return p;
	}

	_clear( el ) {
		while ( el.firstChild ) el.removeChild( el.firstChild );
	}
}
