/**
 * WPTE Dev Zone — CronTab
 * Lists all WP scheduled events, segmented by WPTE vs other, with pagination
 * and a Run Now action per event.
 */
/* global wpteDbg */

import { DomHelper } from '../dom-helper.js';

const { ajaxurl, nonce } = wpteDbg;

const PAGE_SIZE = 10;

// Prefixes that identify WP Travel Engine cron hooks.
const WPTE_PREFIXES = [ 'wptravelengine', 'wptravelengine/', 'wp_travel_engine', 'wpte_' ];

function isWpteCron( hook ) {
	return WPTE_PREFIXES.some( ( p ) => hook.startsWith( p ) );
}

export class CronTab {
	constructor( contentEl ) {
		this.contentEl  = contentEl;
		this._allCrons  = [];
		this._pages     = { wpte: 1, other: 1 };
		this._search    = '';
		this._fetchCtrl = null;
	}

	destroy() {
		if ( this._fetchCtrl ) {
			DomHelper.setStatus( 'Cancelled \u2014 cron list', 'cancelled' );
			this._fetchCtrl.abort();
			this._fetchCtrl = null;
		}
	}

	init() {
		this._listEl          = this.contentEl.querySelector( '.wte-dbg-cron-list' );
		this._refreshBtn      = this.contentEl.querySelector( '.wte-dbg-refresh-btn' );
		this._searchInput     = this.contentEl.querySelector( '.wte-dbg-cron-search-wrap .wte-dbg-cron-search' );
		this._searchCount     = this.contentEl.querySelector( '.wte-dbg-cron-search-wrap .wte-dbg-cron-search-count' );

		this._refreshBtn?.addEventListener( 'click', () => {
			this._pages = { wpte: 1, other: 1 };
			this._load();
		} );

		this._searchInput?.addEventListener( 'input', () => {
			this._search = this._searchInput.value.trim().toLowerCase();
			this._pages  = { wpte: 1, other: 1 };
			this._renderAll();
		} );

		this._load();
		return this;
	}

	// -----------------------------------------------------------------------
	// Fetch
	// -----------------------------------------------------------------------

	_load() {
		this._fetchCtrl?.abort();
		this._fetchCtrl = new AbortController();
		const { signal } = this._fetchCtrl;

		if ( this._refreshBtn ) {
			this._refreshBtn.disabled = true;
			this._refreshBtn.classList.add( 'is-spinning' );
		}
		DomHelper.setStatus( 'Refreshing\u2026', 'info' );
		this._clear( this._listEl );
		this._listEl.appendChild( this._makeSkeleton() );

		fetch( ajaxurl, {
			method: 'POST',
			signal,
			body: new URLSearchParams( {
				action:      'wpte_devzone_cron_list',
				_ajax_nonce: nonce,
			} ),
		} )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				this._fetchCtrl = null;
				if ( this._refreshBtn ) {
					this._refreshBtn.disabled = false;
					this._refreshBtn.classList.remove( 'is-spinning' );
				}
				if ( ! res.success ) {
					DomHelper.setStatus( 'Failed to load cron events.', 'error', 4 );
					this._renderError( 'Failed to load cron events.' );
					return;
				}
				this._allCrons = res.data.crons || [];
				DomHelper.setStatus( 'Cron list refreshed.', 'success', 4 );
				this._renderAll();
			} )
			.catch( ( err ) => {
				if ( err.name === 'AbortError' ) return;
				this._fetchCtrl = null;
				if ( this._refreshBtn ) {
					this._refreshBtn.disabled = false;
					this._refreshBtn.classList.remove( 'is-spinning' );
				}
				DomHelper.setStatus( 'Refresh failed.', 'error', 4 );
				this._renderError( 'Request failed.' );
			} );
	}

	// -----------------------------------------------------------------------
	// Render
	// -----------------------------------------------------------------------

	_renderAll() {
		this._clear( this._listEl );

		const q       = this._search;
		const visible = q
			? this._allCrons.filter( ( c ) => c.hook.toLowerCase().includes( q ) )
			: this._allCrons;

		const wpte  = visible.filter( ( c ) => isWpteCron( c.hook ) );
		const other = visible.filter( ( c ) => ! isWpteCron( c.hook ) );

		// Count pill — total at rest, "N / total" when searching
		if ( this._searchCount ) {
			const total = this._allCrons.length;
			if ( q ) {
				this._searchCount.textContent = visible.length + '\u202f/\u202f' + total;
				this._searchCount.classList.toggle( 'is-empty', visible.length === 0 );
			} else {
				this._searchCount.textContent = total + '\u00a0event' + ( total !== 1 ? 's' : '' );
				this._searchCount.classList.remove( 'is-empty' );
			}
		}

		if ( ! visible.length ) {
			const p = document.createElement( 'p' );
			p.className   = 'wte-dbg-empty';
			p.textContent = q ? 'No hooks match \u201c' + q + '\u201d.' : 'No scheduled cron events found.';
			this._listEl.appendChild( p );
			return;
		}

		if ( wpte.length ) {
			this._listEl.appendChild(
				this._renderSection( 'WP Travel Engine', wpte, 'wpte', true )
			);
		}

		if ( other.length ) {
			this._listEl.appendChild(
				this._renderSection( 'Others', other, 'other', false )
			);
		}
	}

	_renderSection( title, crons, key, isWpte ) {
		const page     = this._pages[ key ] || 1;
		const total    = crons.length;
		const pages    = Math.ceil( total / PAGE_SIZE );
		const start    = ( page - 1 ) * PAGE_SIZE;
		const slice    = crons.slice( start, start + PAGE_SIZE );

		const section = document.createElement( 'div' );
		section.className = 'wte-dbg-cron-section' + ( isWpte ? ' is-wpte' : '' );

		// Section header
		const header = document.createElement( 'div' );
		header.className = 'wte-dbg-cron-section-header';

		const headerLeft = document.createElement( 'div' );
		headerLeft.className = 'wte-dbg-cron-header-left';

		const titleEl = document.createElement( 'span' );
		titleEl.className   = 'wte-dbg-cron-section-title';
		titleEl.textContent = title;

		const countPill = document.createElement( 'span' );
		countPill.className   = 'wte-dbg-cron-section-count';
		countPill.textContent = total;

		headerLeft.appendChild( titleEl );
		headerLeft.appendChild( countPill );
		header.appendChild( headerLeft );

		// Inline pagination in header (only when multiple pages)
		if ( pages > 1 ) {
			header.appendChild( this._renderInlinePagination( key, page, pages ) );
		}

		section.appendChild( header );

		// Table
		const table = document.createElement( 'table' );
		table.className = 'wte-dbg-cron-table';

		const thead = table.createTHead();
		const hrow  = thead.insertRow();
		[ 'Hook', 'Schedule', 'Next Run', 'Args', 'Actions' ].forEach( ( text ) => {
			const th      = document.createElement( 'th' );
			th.textContent = text;
			hrow.appendChild( th );
		} );

		const tbody = table.createTBody();
		slice.forEach( ( cron, idx ) => {
			tbody.appendChild( this._renderRow( cron, ( start + idx ) % 2 === 0 ) );
		} );

		section.appendChild( table );

		return section;
	}

	_renderRow( cron ) {
		const now     = Math.floor( Date.now() / 1000 );
		const overdue = cron.timestamp > 0 && cron.timestamp < now;

		const tr = document.createElement( 'tr' );
		tr.dataset.hook      = cron.hook;
		tr.dataset.timestamp = String( cron.timestamp );
		if ( overdue ) tr.classList.add( 'is-overdue' );

		// Hook
		const tdHook = tr.insertCell();
		tdHook.className = 'wte-dbg-cron-hook';

		const hookInner      = document.createElement( 'div' );
		hookInner.className   = 'wte-dbg-cron-hook-inner';

		const hookCode      = document.createElement( 'code' );
		hookCode.className   = 'wte-dbg-cron-hook-code';
		hookCode.textContent = cron.hook;
		hookInner.appendChild( hookCode );

		hookInner.addEventListener( 'click', () => this._copyHookCode( hookCode, cron.hook ) );
		DomHelper.attachCopyLabel( hookInner );

		if ( overdue ) {
			const badge      = document.createElement( 'span' );
			badge.className   = 'wte-dbg-cron-overdue-badge';
			badge.textContent = 'overdue';
			hookInner.appendChild( badge );
		}

		tdHook.appendChild( hookInner );

		// Schedule
		const tdSchedule     = tr.insertCell();
		tdSchedule.className  = 'wte-dbg-cron-schedule';
		const schedBadge      = document.createElement( 'span' );
		schedBadge.className  = 'wte-dbg-cron-sched-badge ' + this._schedTier( cron.interval );
		schedBadge.textContent = cron.schedule;
		if ( cron.interval ) schedBadge.title = this._intervalLabel( cron.interval );
		tdSchedule.appendChild( schedBadge );

		// Next Run
		const tdNext     = tr.insertCell();
		tdNext.className  = 'wte-dbg-cron-next';
		if ( cron.action_type === 'schedule' ) {
			const dash      = document.createElement( 'span' );
			dash.className   = 'wte-dbg-cron-dash';
			dash.textContent = '\u2014';
			tdNext.appendChild( dash );
		} else {
			const [ datePart, timePart ] = cron.next_run.split( ' ' );

			const abs     = document.createElement( 'time' );
			abs.className = 'wte-dbg-cron-next-abs';
			abs.dateTime  = cron.next_run + 'Z';

			const dateSpan = document.createElement( 'span' );
			dateSpan.className   = 'wte-dbg-cron-next-date';
			dateSpan.textContent = datePart;

			const timeRow = document.createElement( 'span' );
			timeRow.className = 'wte-dbg-cron-next-time-row';
			const timeSpan = document.createElement( 'span' );
			timeSpan.className   = 'wte-dbg-cron-next-time';
			timeSpan.textContent = timePart;
			const tzSpan = document.createElement( 'span' );
			tzSpan.className   = 'wte-dbg-cron-next-tz';
			tzSpan.textContent = 'UTC';
			timeRow.appendChild( timeSpan );
			timeRow.appendChild( tzSpan );
			abs.appendChild( dateSpan );
			abs.appendChild( timeRow );

			const rel = document.createElement( 'span' );
			rel.className   = 'wte-dbg-cron-next-rel' + ( overdue ? ' is-overdue' : '' );
			rel.textContent = this._relativeTime( cron.timestamp );

			tdNext.appendChild( rel );
			tdNext.appendChild( abs );
		}

		// Args
		const tdArgs    = tr.insertCell();
		tdArgs.className = 'wte-dbg-cron-args';
		const argCount   = Array.isArray( cron.args )
			? cron.args.length
			: Object.keys( cron.args || {} ).length;

		if ( argCount === 0 ) {
			const dash      = document.createElement( 'span' );
			dash.className   = 'wte-dbg-cron-dash';
			dash.textContent = '\u2014';
			tdArgs.appendChild( dash );
		} else {
			const toggle      = document.createElement( 'button' );
			toggle.className   = 'wte-dbg-cron-args-toggle';
			toggle.textContent = argCount + ' arg' + ( argCount !== 1 ? 's' : '' );

			const pre      = document.createElement( 'pre' );
			pre.className   = 'wte-dbg-cron-args-pre is-hidden';
			pre.textContent = JSON.stringify( cron.args, null, 2 );

			toggle.addEventListener( 'click', () => pre.classList.toggle( 'is-hidden' ) );
			tdArgs.appendChild( toggle );
			tdArgs.appendChild( pre );
		}

		// Actions
		const tdActions = tr.insertCell();
		tdActions.className = 'wte-dbg-cron-actions';
		const actionBtn = document.createElement( 'button' );
		actionBtn.className = 'wte-dbg-cron-run-btn';
		if ( cron.action_type === 'schedule' ) {
			actionBtn.textContent = ( cron.action_label || 'Schedule' ) + '\u00a0\u26a1';
			actionBtn.classList.add( 'is-schedule' );
			actionBtn.addEventListener( 'click', () => this._scheduleCron( cron.hook, actionBtn ) );
		} else {
			actionBtn.textContent = 'Run Now\u00a0\u26a1';
			actionBtn.addEventListener( 'click', () => this._runCron( cron.hook, cron.timestamp, actionBtn ) );
		}
		tdActions.appendChild( actionBtn );

		return tr;
	}

	_renderInlinePagination( key, current, pages ) {
		const wrap = document.createElement( 'div' );
		wrap.className = 'wte-dbg-cron-header-pager';

		const prevBtn      = document.createElement( 'button' );
		prevBtn.className   = 'wte-dbg-cron-page-btn is-compact';
		prevBtn.textContent = '\u2039';
		prevBtn.title       = 'Previous page';
		prevBtn.disabled    = current <= 1;
		prevBtn.addEventListener( 'click', () => {
			this._pages[ key ] = current - 1;
			this._rerenderSection( key );
		} );

		const label      = document.createElement( 'span' );
		label.className   = 'wte-dbg-cron-page-label';
		label.textContent = current + '\u200a/\u200a' + pages;

		const nextBtn      = document.createElement( 'button' );
		nextBtn.className   = 'wte-dbg-cron-page-btn is-compact';
		nextBtn.textContent = '\u203a';
		nextBtn.title       = 'Next page';
		nextBtn.disabled    = current >= pages;
		nextBtn.addEventListener( 'click', () => {
			this._pages[ key ] = current + 1;
			this._rerenderSection( key );
		} );

		wrap.appendChild( prevBtn );
		wrap.appendChild( label );
		wrap.appendChild( nextBtn );
		return wrap;
	}

	_renderPagination( key, current, total, itemTotal ) {
		const wrap = document.createElement( 'div' );
		wrap.className = 'wte-dbg-cron-pagination';

		const info      = document.createElement( 'span' );
		info.className   = 'wte-dbg-cron-page-info';
		const start      = ( current - 1 ) * PAGE_SIZE + 1;
		const end        = Math.min( current * PAGE_SIZE, itemTotal );
		info.textContent = start + '\u2013' + end + ' of ' + itemTotal;
		wrap.appendChild( info );

		const nav = document.createElement( 'div' );
		nav.className = 'wte-dbg-cron-page-nav';

		const prevBtn      = document.createElement( 'button' );
		prevBtn.className   = 'wte-dbg-cron-page-btn';
		prevBtn.textContent = '\u2039 Prev';
		prevBtn.disabled    = current <= 1;
		prevBtn.addEventListener( 'click', () => {
			this._pages[ key ] = current - 1;
			this._rerenderSection( key );
		} );

		const pageLabel      = document.createElement( 'span' );
		pageLabel.className   = 'wte-dbg-cron-page-label';
		pageLabel.textContent = current + ' / ' + total;

		const nextBtn      = document.createElement( 'button' );
		nextBtn.className   = 'wte-dbg-cron-page-btn';
		nextBtn.textContent = 'Next \u203a';
		nextBtn.disabled    = current >= total;
		nextBtn.addEventListener( 'click', () => {
			this._pages[ key ] = current + 1;
			this._rerenderSection( key );
		} );

		nav.appendChild( prevBtn );
		nav.appendChild( pageLabel );
		nav.appendChild( nextBtn );
		wrap.appendChild( nav );

		return wrap;
	}

	_rerenderSection( key ) {
		// Re-render only the changed section by replacing it in the list.
		const isWpte    = key === 'wpte';
		const q         = this._search;
		const pool      = q ? this._allCrons.filter( ( c ) => c.hook.toLowerCase().includes( q ) ) : this._allCrons;
		const crons     = pool.filter( ( c ) => ( isWpte ? isWpteCron( c.hook ) : ! isWpteCron( c.hook ) ) );
		const title     = isWpte ? 'WP Travel Engine' : 'Others';
		const newSect   = this._renderSection( title, crons, key, isWpte );
		const existing  = this._listEl.querySelector( '.wte-dbg-cron-section' + ( isWpte ? '.is-wpte' : ':not(.is-wpte)' ) );

		if ( existing ) {
			this._listEl.replaceChild( newSect, existing );
		}
	}

	_renderError( msg ) {
		this._clear( this._listEl );
		const p      = document.createElement( 'p' );
		p.className   = 'wte-dbg-empty';
		p.textContent = msg;
		this._listEl.appendChild( p );
	}

	// -----------------------------------------------------------------------
	// Run Now
	// -----------------------------------------------------------------------

	_runCron( hook, timestamp, btn ) {
		const row = btn.closest( 'tr' );
		btn.disabled = true;
		row?.classList.add( 'is-running' );

		fetch( ajaxurl, {
			method: 'POST',
			body: new URLSearchParams( {
				action:      'wpte_devzone_cron_run',
				_ajax_nonce: nonce,
				hook,
				timestamp:   String( timestamp ),
			} ),
		} )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				btn.disabled = false;
				row?.classList.remove( 'is-running' );
				if ( res.success ) {
					row?.classList.add( 'is-success' );
					DomHelper.setStatus( res.data.message, 'success', 4 );
				} else {
					row?.classList.add( 'is-error' );
					DomHelper.setStatus( res.data?.message || 'Failed to run cron.', 'error', 4 );
				}
				setTimeout( () => this._load(), 800 );
			} )
			.catch( () => {
				btn.disabled = false;
				row?.classList.remove( 'is-running' );
				row?.classList.add( 'is-error' );
				DomHelper.setStatus( 'Request failed.', 'error', 4 );
				setTimeout( () => row?.classList.remove( 'is-error' ), 2000 );
			} );
	}

	_scheduleCron( hook, btn ) {
		const row = btn.closest( 'tr' );
		btn.disabled = true;
		row?.classList.add( 'is-running' );

		fetch( ajaxurl, {
			method: 'POST',
			body: new URLSearchParams( {
				action:      'wpte_devzone_cron_schedule',
				_ajax_nonce: nonce,
				hook,
			} ),
		} )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				btn.disabled = false;
				row?.classList.remove( 'is-running' );
				if ( res.success ) {
					row?.classList.add( 'is-success' );
					DomHelper.setStatus( res.data.message, 'success', 4 );
				} else {
					row?.classList.add( 'is-error' );
					DomHelper.setStatus( res.data?.message || 'Failed.', 'error', 4 );
				}
				setTimeout( () => this._load(), 800 );
			} )
			.catch( () => {
				btn.disabled = false;
				row?.classList.remove( 'is-running' );
				row?.classList.add( 'is-error' );
				DomHelper.setStatus( 'Request failed.', 'error', 4 );
				setTimeout( () => row?.classList.remove( 'is-error' ), 2000 );
			} );
	}

	// -----------------------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------------------

	_copyHookCode( el, val ) {
		DomHelper.copyWithFeedback( el, val );
	}

	_makeSkeleton() {
		const HOOK_WIDTHS = [ '55%', '72%', '48%', '83%', '60%', '67%', '44%', '76%' ];
		const frag        = document.createDocumentFragment();

		[ 5, 3 ].forEach( ( rowCount, gi ) => {
			const section = document.createElement( 'div' );
			section.className = 'wte-dbg-cron-section wte-dbg-cron-skeleton' + ( gi === 0 ? ' is-wpte' : '' );
			section.setAttribute( 'aria-hidden', 'true' );

			// ── Header ──
			const header = document.createElement( 'div' );
			header.className = 'wte-dbg-cron-section-header';
			const hLeft = document.createElement( 'div' );
			hLeft.className = 'wte-dbg-cron-header-left';

			const bTitle = document.createElement( 'div' );
			bTitle.className = 'wte-dbg-loader-block';
			bTitle.style.cssText = 'width:120px;height:13px';

			const bBadge = document.createElement( 'div' );
			bBadge.className = 'wte-dbg-loader-block';
			bBadge.style.cssText = 'width:26px;height:20px;border-radius:10px';

			hLeft.appendChild( bTitle );
			hLeft.appendChild( bBadge );
			header.appendChild( hLeft );
			section.appendChild( header );

			// ── Flex rows (avoid table-layout issues) ──
			const rowsWrap = document.createElement( 'div' );
			rowsWrap.className = 'wte-dbg-cron-skel-rows';

			for ( let i = 0; i < rowCount; i++ ) {
				const delay = ( gi * 5 + i ) * 0.07;
				const row   = document.createElement( 'div' );
				row.className = 'wte-dbg-cron-skel-row';

				// Hook name (flexible width)
				const bHook = document.createElement( 'div' );
				bHook.className = 'wte-dbg-loader-block wte-dbg-cron-skel-hook';
				bHook.style.cssText = `width:${ HOOK_WIDTHS[ ( gi * 5 + i ) % HOOK_WIDTHS.length ] };height:13px;animation-delay:${ delay.toFixed( 2 ) }s`;

				// Schedule badge
				const bSched = document.createElement( 'div' );
				bSched.className = 'wte-dbg-loader-block';
				bSched.style.cssText = `width:68px;height:20px;border-radius:10px;animation-delay:${ ( delay + 0.04 ).toFixed( 2 ) }s`;

				// Next run time
				const bNext = document.createElement( 'div' );
				bNext.className = 'wte-dbg-loader-block';
				bNext.style.cssText = `width:82px;height:13px;animation-delay:${ ( delay + 0.08 ).toFixed( 2 ) }s`;

				// Run Now button shape
				const bBtn = document.createElement( 'div' );
				bBtn.className = 'wte-dbg-loader-block';
				bBtn.style.cssText = `width:72px;height:26px;border-radius:4px;animation-delay:${ ( delay + 0.12 ).toFixed( 2 ) }s`;

				row.appendChild( bHook );
				row.appendChild( bSched );
				row.appendChild( bNext );
				row.appendChild( bBtn );
				rowsWrap.appendChild( row );
			}

			section.appendChild( rowsWrap );
			frag.appendChild( section );
		} );

		return frag;
	}

	_clear( el ) {
		while ( el.firstChild ) el.removeChild( el.firstChild );
	}

	/** Map an interval (seconds) to a CSS tier class for the schedule badge. */
	_schedTier( interval ) {
		if ( ! interval )       return 'tier-onetime';   // one-time event
		if ( interval < 300 )   return 'tier-realtime';  // < 5 min  — red/rose
		if ( interval < 3600 )  return 'tier-frequent';  // 5–60 min — amber
		if ( interval < 7200 )  return 'tier-hourly';    // ~1 h      — blue
		if ( interval < 43200 ) return 'tier-subday';    // 1–12 h   — teal
		if ( interval < 86400 ) return 'tier-daily';     // ~12–24 h — green
		if ( interval < 604800 ) return 'tier-weekly';   // 1–7 days  — violet
		return 'tier-rare';                               // > 7 days  — slate
	}

	_relativeTime( timestamp ) {
		const now  = Math.floor( Date.now() / 1000 );
		const diff = timestamp - now;
		const abs  = Math.abs( diff );

		if ( abs < 60 )    return diff >= 0 ? 'in ' + abs + 's'                       : abs + 's ago';
		if ( abs < 3600 )  return diff >= 0 ? 'in ' + Math.round( abs / 60 ) + 'm'   : Math.round( abs / 60 ) + 'm ago';
		if ( abs < 86400 ) return diff >= 0 ? 'in ' + Math.round( abs / 3600 ) + 'h' : Math.round( abs / 3600 ) + 'h ago';
		return                 diff >= 0 ? 'in ' + Math.round( abs / 86400 ) + 'd' : Math.round( abs / 86400 ) + 'd ago';
	}

	_intervalLabel( seconds ) {
		if ( seconds < 60 )    return seconds + ' seconds';
		if ( seconds < 3600 )  return Math.round( seconds / 60 ) + ' minutes';
		if ( seconds < 86400 ) return Math.round( seconds / 3600 ) + ' hours';
		return Math.round( seconds / 86400 ) + ' days';
	}
}
