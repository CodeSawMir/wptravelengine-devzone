/**
 * WPTE Dev Zone — PerfTab
 * Shows site performance metrics and provides one-click cleanup actions.
 */
/* global wpteDbg */

import { DomHelper } from '../dom-helper.js';

const { ajaxurl, nonce } = wpteDbg;

export class PerfTab {
	constructor( contentEl ) {
		this.contentEl  = contentEl;
		this._fetchCtrl = null;
	}

	destroy() {
		if ( this._fetchCtrl ) {
			DomHelper.setStatus( 'Cancelled \u2014 performance data', 'cancelled' );
			this._fetchCtrl.abort();
			this._fetchCtrl = null;
		}
	}

	init() {
		this._statsBar      = this.contentEl.querySelector( '.wte-dbg-perf-stats-bar' );
		this._cleanupList   = this.contentEl.querySelector( '.wte-dbg-perf-cleanup-list' );
		this._wteList       = this.contentEl.querySelector( '.wte-dbg-perf-wte-list' );
		this._autoloadWrap  = this.contentEl.querySelector( '.wte-dbg-perf-autoload-wrap' );
		this._pluginsWrap   = this.contentEl.querySelector( '.wte-dbg-perf-plugins-wrap' );
		this._refreshBtn    = this.contentEl.querySelector( '.wte-dbg-refresh-btn' );

		this._refreshBtn?.addEventListener( 'click', () => this._loadAll() );

		this._loadAll();
		return this;
	}

	_loadAll() {
		this._fetchCtrl?.abort();
		this._fetchCtrl = new AbortController();
		const { signal } = this._fetchCtrl;

		if ( this._refreshBtn ) {
			this._refreshBtn.disabled = true;
			this._refreshBtn.classList.add( 'is-spinning' );
		}
		DomHelper.setStatus( 'Refreshing\u2026', 'info' );

		// All sections load in parallel.
		Promise.all( [
			this._loadStats( signal ),
			this._loadCleanupCounts( signal ),
			this._loadWteCounts( undefined, signal ),
			this._loadAutoloadedOptions( signal ),
			this._loadPluginHealth( signal ),
		] ).then( () => {
			this._fetchCtrl = null;
			if ( this._refreshBtn ) {
				this._refreshBtn.disabled = false;
				this._refreshBtn.classList.remove( 'is-spinning' );
			}
			DomHelper.setStatus( 'Performance data refreshed.', 'success', 4 );
		} );
	}

	// -----------------------------------------------------------------------
	// Section 1 — Quick Stats
	// -----------------------------------------------------------------------

	_loadStats( signal ) {
		this._clear( this._statsBar );
		this._statsBar.appendChild( this._makeStatsSkeleton() );

		return this._post( 'wpte_devzone_perf_stats', null, signal )
			.then( ( res ) => {
				this._clear( this._statsBar );
				if ( ! res.success ) {
					this._statsBar.appendChild( this._makeError( 'Failed to load stats.' ) );
					return;
				}
				this._renderStats( res.data.stats );
			} )
			.catch( ( err ) => {
				if ( err.name === 'AbortError' ) return;
				this._clear( this._statsBar );
				this._statsBar.appendChild( this._makeError( 'Request failed.' ) );
			} );
	}

	_renderStats( stats ) {
		const cards = [
			{
				label: 'PHP Memory',
				value: stats.memory_usage_human + ' / ' + stats.memory_limit,
				warn:  stats.memory_limit_bytes > 0 && ( stats.memory_usage / stats.memory_limit_bytes ) > 0.8,
			},
			{
				label: 'DB Size',
				value: stats.db_total_size_human || 'Unavailable',
				sub:   stats.db_table_count != null ? stats.db_table_count + ' tables' : null,
			},
			{
				label: 'Autoloaded',
				value: stats.autoload_size_human,
				warn:  stats.autoload_size > 1048576, // > 1 MB is worth noting
			},
			{
				label: 'Transients',
				value: stats.transient_total,
				sub:   stats.transient_expired + ' expired',
				warn:  stats.transient_expired > 0,
			},
			{
				label: 'Active Plugins',
				value: stats.active_plugins,
			},
			{
				label: 'Revisions',
				value: stats.revisions,
				warn:  stats.revisions > 100,
			},
		];

		const frag = document.createDocumentFragment();
		cards.forEach( ( card ) => {
			const el = document.createElement( 'div' );
			el.className = 'wte-dbg-perf-stat-card' + ( card.warn ? ' is-warn' : '' );

			const labelEl = document.createElement( 'span' );
			labelEl.className   = 'wte-dbg-perf-stat-label';
			labelEl.textContent = card.label;

			const valueEl = document.createElement( 'span' );
			valueEl.className   = 'wte-dbg-perf-stat-value';
			valueEl.textContent = card.value;

			el.appendChild( labelEl );
			el.appendChild( valueEl );

			if ( card.sub ) {
				const subEl = document.createElement( 'span' );
				subEl.className   = 'wte-dbg-perf-stat-sub';
				subEl.textContent = card.sub;
				el.appendChild( subEl );
			}

			frag.appendChild( el );
		} );

		this._statsBar.appendChild( frag );
	}

	// -----------------------------------------------------------------------
	// Section 2 — DB Cleanup
	// -----------------------------------------------------------------------

	_loadCleanupCounts( signal ) {
		if ( ! this._cleanupList.hasChildNodes() ) {
			this._renderCleanupRows();
		}

		return this._post( 'wpte_devzone_perf_cleanup_counts', null, signal )
			.then( ( res ) => {
				if ( ! res.success ) return;
				const counts = res.data.counts;
				this._cleanupList.querySelectorAll( '.wte-dbg-perf-action-row' ).forEach( ( row ) => {
					const key = row.dataset.action;
					if ( key && counts[ key ] != null ) {
						this._setBadge( row, counts[ key ] );
					}
				} );
			} )
			.catch( () => {} );
	}

	_renderCleanupRows() {
		const actions = [
			{ action: 'revisions',          label: 'Post Revisions' },
			{ action: 'expired_transients', label: 'Expired Transients' },
			{ action: 'orphan_meta',        label: 'Orphaned Post Meta' },
			{ action: 'bad_comments',       label: 'Spam & Trash Comments' },
			{ action: 'auto_drafts',        label: 'Auto-Draft Posts' },
		];

		const frag = document.createDocumentFragment();
		actions.forEach( ( item ) => {
			frag.appendChild( this._makeActionRow( item.action, item.label, ( btn ) => {
				this._doCleanup( item.action, btn );
			} ) );
		} );
		this._cleanupList.appendChild( frag );
	}

	_doCleanup( action, btn ) {
		const row   = btn.closest( '.wte-dbg-perf-action-row' );
		const badge = row?.querySelector( '.wte-dbg-perf-badge' );
		const count = badge ? parseInt( badge.textContent, 10 ) : 0;

		if ( ! window.confirm( 'Delete ' + count + ' item(s)? This cannot be undone.' ) ) return;

		btn.disabled    = true;
		btn.textContent = 'Cleaning\u2026';
		row?.classList.add( 'is-running' );

		this._post( 'wpte_devzone_perf_do_cleanup', { cleanup_action: action } )
			.then( ( res ) => {
				row?.classList.remove( 'is-running' );
				btn.textContent = 'Clean';
				if ( res.success ) {
					row?.classList.add( 'is-success' );
					DomHelper.setStatus( res.data.message, 'success', 4 );
					setTimeout( () => row?.classList.remove( 'is-success' ), 2000 );
				} else {
					row?.classList.add( 'is-error' );
					DomHelper.setStatus( res.data?.message || 'Failed.', 'error', 4 );
					setTimeout( () => row?.classList.remove( 'is-error' ), 2000 );
				}
				btn.disabled = false;
				this._loadCleanupCounts();
			} )
			.catch( () => {
				row?.classList.remove( 'is-running' );
				row?.classList.add( 'is-error' );
				btn.textContent = 'Clean';
				btn.disabled    = false;
				DomHelper.setStatus( 'Request failed.', 'error', 4 );
				setTimeout( () => row?.classList.remove( 'is-error' ), 2000 );
			} );
	}

	// -----------------------------------------------------------------------
	// Section 3 — WTE Cleanup
	// -----------------------------------------------------------------------

	_loadWteCounts( days, signal ) {
		const d = days || this._getStaledays();

		if ( ! this._wteList.hasChildNodes() ) {
			this._renderWteRows();
		}

		return this._post( 'wpte_devzone_perf_wte_counts', { days: d }, signal )
			.then( ( res ) => {
				if ( ! res.success ) return;
				const counts = res.data.counts;
				this._wteList.querySelectorAll( '.wte-dbg-perf-action-row' ).forEach( ( row ) => {
					const key = row.dataset.action;
					if ( key && counts[ key ] != null ) {
						this._setBadge( row, counts[ key ] );
					}
				} );
			} )
			.catch( () => {} );
	}

	_renderWteRows() {
		const frag = document.createDocumentFragment();

		// Stale bookings row (with days input)
		const bookingRow = this._makeActionRow( 'stale_bookings', 'Stale Pending Bookings', ( btn ) => {
			this._doWteCleanup( 'stale_bookings', btn );
		} );
		const daysWrap = document.createElement( 'span' );
		daysWrap.className = 'wte-dbg-perf-days-wrap';
		const daysLabel = document.createElement( 'label' );
		daysLabel.textContent = 'Older than\u00a0';
		const daysInput = document.createElement( 'input' );
		daysInput.type      = 'number';
		daysInput.className = 'wte-dbg-perf-stale-days';
		daysInput.value     = '30';
		daysInput.min       = '1';
		daysInput.max       = '365';
		daysInput.style.cssText = 'width:56px';
		daysInput.addEventListener( 'change', () => this._loadWteCounts( parseInt( daysInput.value, 10 ) || 30 ) );
		const daysUnit = document.createElement( 'span' );
		daysUnit.textContent = '\u00a0days';
		daysLabel.appendChild( daysInput );
		daysWrap.appendChild( daysLabel );
		daysWrap.appendChild( daysUnit );
		bookingRow.querySelector( '.wte-dbg-perf-action-meta' )?.appendChild( daysWrap );
		frag.appendChild( bookingRow );

		// WTE transients row
		frag.appendChild( this._makeActionRow( 'wte_transients', 'WTE Transient Cache', ( btn ) => {
			this._doWteCleanup( 'wte_transients', btn );
		} ) );

		this._wteList.appendChild( frag );
	}

	_getStaledays() {
		const input = this._wteList.querySelector( '.wte-dbg-perf-stale-days' );
		return parseInt( input?.value, 10 ) || 30;
	}

	_doWteCleanup( action, btn ) {
		const row   = btn.closest( '.wte-dbg-perf-action-row' );
		const badge = row?.querySelector( '.wte-dbg-perf-badge' );
		const count = badge ? parseInt( badge.textContent, 10 ) : 0;

		const confirmMsg = action === 'stale_bookings'
			? 'Trash ' + count + ' pending booking(s)? They will be moved to trash.'
			: 'Delete ' + count + ' WTE transient(s)?';

		if ( ! window.confirm( confirmMsg ) ) return;

		const body = { cleanup_action: action };
		if ( action === 'stale_bookings' ) {
			body.days = this._getStaledays();
		}

		btn.disabled    = true;
		btn.textContent = 'Cleaning\u2026';
		row?.classList.add( 'is-running' );

		this._post( 'wpte_devzone_perf_do_wte_cleanup', body )
			.then( ( res ) => {
				row?.classList.remove( 'is-running' );
				btn.textContent = 'Clean';
				if ( res.success ) {
					row?.classList.add( 'is-success' );
					DomHelper.setStatus( res.data.message, 'success', 4 );
					setTimeout( () => row?.classList.remove( 'is-success' ), 2000 );
				} else {
					row?.classList.add( 'is-error' );
					DomHelper.setStatus( res.data?.message || 'Failed.', 'error', 4 );
					setTimeout( () => row?.classList.remove( 'is-error' ), 2000 );
				}
				btn.disabled = false;
				this._loadWteCounts();
			} )
			.catch( () => {
				row?.classList.remove( 'is-running' );
				row?.classList.add( 'is-error' );
				btn.textContent = 'Clean';
				btn.disabled    = false;
				DomHelper.setStatus( 'Request failed.', 'error', 4 );
				setTimeout( () => row?.classList.remove( 'is-error' ), 2000 );
			} );
	}

	// -----------------------------------------------------------------------
	// Section 4 — Autoloaded Options
	// -----------------------------------------------------------------------

	_loadAutoloadedOptions( signal ) {
		this._clear( this._autoloadWrap );
		this._autoloadWrap.appendChild( this._makeBlockSkeleton( 8 ) );

		return this._post( 'wpte_devzone_perf_autoload', null, signal )
			.then( ( res ) => {
				this._clear( this._autoloadWrap );
				if ( ! res.success ) {
					this._autoloadWrap.appendChild( this._makeError( 'Failed to load options.' ) );
					return;
				}
				this._renderAutoloadTable( res.data.options );
			} )
			.catch( ( err ) => {
				if ( err.name === 'AbortError' ) return;
				this._clear( this._autoloadWrap );
				this._autoloadWrap.appendChild( this._makeError( 'Request failed.' ) );
			} );
	}

	_renderAutoloadTable( options ) {
		if ( ! options.length ) {
			this._autoloadWrap.appendChild( this._makeEmpty( 'No autoloaded options found.' ) );
			return;
		}

		const table = document.createElement( 'table' );
		table.className = 'wte-dbg-perf-table';

		const thead = table.createTHead();
		const hrow  = thead.insertRow();
		[ 'Option Name', 'Size' ].forEach( ( text ) => {
			const th = document.createElement( 'th' );
			th.textContent = text;
			hrow.appendChild( th );
		} );

		const tbody = table.createTBody();
		options.forEach( ( opt ) => {
			const tr = tbody.insertRow();
			const tdName = tr.insertCell();
			tdName.className = 'wte-dbg-perf-opt-name';
			const code = document.createElement( 'code' );
			code.textContent = opt.name;
			tdName.appendChild( code );

			const tdSize = tr.insertCell();
			tdSize.className   = 'wte-dbg-perf-opt-size';
			tdSize.textContent = opt.size_human;
		} );

		this._autoloadWrap.appendChild( table );
	}

	// -----------------------------------------------------------------------
	// Section 5 — Plugin Health
	// -----------------------------------------------------------------------

	_loadPluginHealth( signal ) {
		this._clear( this._pluginsWrap );
		this._pluginsWrap.appendChild( this._makeBlockSkeleton( 6 ) );

		return this._post( 'wpte_devzone_perf_plugins', null, signal )
			.then( ( res ) => {
				this._clear( this._pluginsWrap );
				if ( ! res.success ) {
					this._pluginsWrap.appendChild( this._makeError( 'Failed to load plugin data.' ) );
					return;
				}
				this._renderPlugins( res.data.plugins );
			} )
			.catch( ( err ) => {
				if ( err.name === 'AbortError' ) return;
				this._clear( this._pluginsWrap );
				this._pluginsWrap.appendChild( this._makeError( 'Request failed.' ) );
			} );
	}

	_renderPlugins( plugins ) {
		const active   = plugins.filter( ( p ) => p.is_active );
		const inactive = plugins.filter( ( p ) => ! p.is_active );

		const frag = document.createDocumentFragment();

		if ( active.length ) {
			frag.appendChild( this._makePluginGroup( 'Active (' + active.length + ')', active ) );
		}
		if ( inactive.length ) {
			frag.appendChild( this._makePluginGroup( 'Inactive (' + inactive.length + ')', inactive ) );
		}
		if ( ! plugins.length ) {
			frag.appendChild( this._makeEmpty( 'No plugins found.' ) );
		}

		this._pluginsWrap.appendChild( frag );
	}

	_makePluginGroup( title, plugins ) {
		const wrap = document.createElement( 'div' );
		wrap.className = 'wte-dbg-perf-plugin-group';

		const heading = document.createElement( 'div' );
		heading.className   = 'wte-dbg-perf-plugin-group-title';
		heading.textContent = title;
		wrap.appendChild( heading );

		const table = document.createElement( 'table' );
		table.className = 'wte-dbg-perf-table';

		const thead = table.createTHead();
		const hrow  = thead.insertRow();
		[ 'Plugin', 'Version', 'Size' ].forEach( ( text ) => {
			const th = document.createElement( 'th' );
			th.textContent = text;
			hrow.appendChild( th );
		} );

		const tbody = table.createTBody();
		plugins.forEach( ( plugin ) => {
			const tr = tbody.insertRow();

			const tdName = tr.insertCell();
			tdName.className   = 'wte-dbg-perf-plugin-name';
			tdName.textContent = plugin.name;

			const tdVer = tr.insertCell();
			tdVer.className   = 'wte-dbg-perf-plugin-ver';
			tdVer.textContent = plugin.version || '\u2014';

			const tdSize = tr.insertCell();
			tdSize.className   = 'wte-dbg-perf-plugin-size';
			tdSize.textContent = plugin.size_human;
		} );

		wrap.appendChild( table );
		return wrap;
	}

	// -----------------------------------------------------------------------
	// Shared helpers
	// -----------------------------------------------------------------------

	_makeActionRow( action, label, onClean ) {
		const row = document.createElement( 'div' );
		row.className    = 'wte-dbg-perf-action-row';
		row.dataset.action = action;

		const meta = document.createElement( 'div' );
		meta.className = 'wte-dbg-perf-action-meta';

		const labelEl = document.createElement( 'span' );
		labelEl.className   = 'wte-dbg-perf-action-label';
		labelEl.textContent = label;

		const badge = document.createElement( 'span' );
		badge.className   = 'wte-dbg-perf-badge is-loading';
		badge.textContent = '\u2026';

		meta.appendChild( labelEl );
		meta.appendChild( badge );
		row.appendChild( meta );

		const btn = document.createElement( 'button' );
		btn.type      = 'button';
		btn.className = 'wte-dbg-perf-clean-btn';
		btn.textContent = 'Clean';
		btn.addEventListener( 'click', () => onClean( btn ) );
		row.appendChild( btn );

		return row;
	}

	_setBadge( rowEl, count ) {
		const badge = rowEl.querySelector( '.wte-dbg-perf-badge' );
		if ( ! badge ) return;
		badge.textContent = count;
		badge.classList.remove( 'is-loading' );
		badge.classList.toggle( 'is-zero', count === 0 );
	}

	_post( action, extra, signal ) {
		const body = Object.assign( { action, _ajax_nonce: nonce }, extra || {} );
		return fetch( ajaxurl, {
			method: 'POST',
			signal,
			body:   new URLSearchParams( body ),
		} ).then( ( r ) => r.json() );
	}

	_clear( el ) {
		while ( el.firstChild ) el.removeChild( el.firstChild );
	}

	_makeError( msg ) {
		const p = document.createElement( 'p' );
		p.className   = 'wte-dbg-empty';
		p.textContent = msg;
		return p;
	}

	_makeEmpty( msg ) {
		const p = document.createElement( 'p' );
		p.className   = 'wte-dbg-empty';
		p.textContent = msg;
		return p;
	}

	_makeStatsSkeleton() {
		const frag = document.createDocumentFragment();
		for ( let i = 0; i < 6; i++ ) {
			const card = document.createElement( 'div' );
			card.className = 'wte-dbg-perf-stat-card wte-dbg-perf-stat-skel';
			card.setAttribute( 'aria-hidden', 'true' );

			const bLabel = document.createElement( 'div' );
			bLabel.className = 'wte-dbg-loader-block';
			bLabel.style.cssText = `width:70px;height:11px;animation-delay:${ ( i * 0.06 ).toFixed( 2 ) }s`;

			const bValue = document.createElement( 'div' );
			bValue.className = 'wte-dbg-loader-block';
			bValue.style.cssText = `width:90px;height:18px;margin-top:6px;animation-delay:${ ( i * 0.06 + 0.04 ).toFixed( 2 ) }s`;

			card.appendChild( bLabel );
			card.appendChild( bValue );
			frag.appendChild( card );
		}
		return frag;
	}

	_makeBlockSkeleton( rows ) {
		const wrap = document.createElement( 'div' );
		wrap.className = 'wte-dbg-perf-block-skel';
		wrap.setAttribute( 'aria-hidden', 'true' );
		for ( let i = 0; i < rows; i++ ) {
			const b = document.createElement( 'div' );
			b.className = 'wte-dbg-loader-block';
			b.style.cssText = `width:${ 55 + ( i % 4 ) * 10 }%;height:13px;margin-bottom:8px;animation-delay:${ ( i * 0.07 ).toFixed( 2 ) }s`;
			wrap.appendChild( b );
		}
		return wrap;
	}
}
