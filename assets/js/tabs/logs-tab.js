/**
 * WPTE Dev Zone — LogsTab + WordPress debug subtab init.
 */
/* global wpteDbg */

import { DomHelper } from '../dom-helper.js';

function _block( cls, styles = {} ) {
	const el = document.createElement( 'div' );
	el.className = 'wte-dbg-loader-block ' + cls;
	Object.assign( el.style, styles );
	return el;
}

function _wpReloadingState( el ) {
	DomHelper.setTextContent( el, '' );

	const wrap = document.createElement( 'div' );
	wrap.className = 'wte-dbg-wp-wrap';

	// Section 1 — Debug Constants skeleton
	const sec1 = document.createElement( 'div' );
	sec1.className = 'wte-dbg-perf-section';
	sec1.style.marginBottom = '16px';

	const hdr1 = document.createElement( 'div' );
	hdr1.className = 'wte-dbg-perf-section-header';
	hdr1.appendChild( _block( 'wte-dbg-wp-skel-title' ) );
	hdr1.appendChild( _block( 'wte-dbg-wp-skel-note' ) );
	sec1.appendChild( hdr1 );

	for ( let i = 0; i < 4; i++ ) {
		const delay = ( i * 0.06 ).toFixed( 2 ) + 's';
		const row   = document.createElement( 'div' );
		row.className = 'wte-dbg-wp-debug-row';
		const left = document.createElement( 'div' );
		left.appendChild( _block( 'wte-dbg-wp-skel-code', { animationDelay: delay } ) );
		left.appendChild( _block( 'wte-dbg-wp-skel-desc', { animationDelay: delay } ) );
		row.appendChild( left );
		row.appendChild( _block( 'wte-dbg-wp-skel-toggle', { animationDelay: delay } ) );
		sec1.appendChild( row );
	}
	wrap.appendChild( sec1 );

	// Section 2 — Debug Log skeleton
	const sec2 = document.createElement( 'div' );
	sec2.className = 'wte-dbg-perf-section';

	const hdr2 = document.createElement( 'div' );
	hdr2.className = 'wte-dbg-perf-section-header';
	hdr2.appendChild( _block( 'wte-dbg-wp-skel-title' ) );
	hdr2.appendChild( _block( 'wte-dbg-wp-skel-log-path' ) );
	sec2.appendChild( hdr2 );

	const logLines = document.createElement( 'div' );
	logLines.className = 'wte-dbg-wp-skel-log-lines';
	[ '95%', '78%', '88%', '62%', '91%', '74%' ].forEach( ( w, i ) => {
		logLines.appendChild( _block( 'wte-dbg-wp-skel-log-line', {
			width:          w,
			animationDelay: ( i * 0.07 ).toFixed( 2 ) + 's',
		} ) );
	} );
	sec2.appendChild( logLines );
	wrap.appendChild( sec2 );

	el.appendChild( wrap );
}

function initWordpressTab( el ) {
	const { ajaxurl, nonce } = wpteDbg;
	const notice      = document.getElementById( 'wte-dbg-wp-debug-notice' );
	const noticeSpan  = notice?.querySelector( '.wte-dbg-loader-note' );
	if ( notice ) notice.style.display = 'none';

	el.querySelectorAll( '.wte-dbg-wp-debug-toggle input' ).forEach( ( checkbox ) => {
		checkbox.addEventListener( 'change', () => {
			const row      = checkbox.closest( '.wte-dbg-wp-debug-row' );
			const constant = checkbox.dataset.constant;
			const value    = checkbox.checked ? '1' : '0';

			row.classList.add( 'is-loading' );
			DomHelper.setStatus( 'Saving\u2026', 'info' );

			fetch( ajaxurl, {
				method: 'POST',
				body:   new URLSearchParams( { action: 'wpte_devzone_logs_wp_save_flags', _ajax_nonce: nonce, constant, value } ),
			} )
				.then( r => r.json() )
				.then( data => {
					row.classList.remove( 'is-loading' );
					if ( ! data.success ) {
						checkbox.checked = ! checkbox.checked;
						DomHelper.setStatus( data.data?.message ?? 'Error.', 'error', 4 );
						return;
					}
					if ( notice ) {
					if ( noticeSpan ) noticeSpan.textContent = 'Reload the page for changes to take effect.';
					notice.style.display = 'flex';
				}
					DomHelper.setStatus( constant + ' \u2192 ' + ( checkbox.checked ? 'true' : 'false' ), 'success' );
					_wpReloadingState( el );
					setTimeout( () => window.location.reload(), 800 );
				} )
				.catch( () => {
					row.classList.remove( 'is-loading' );
					checkbox.checked = ! checkbox.checked;
					DomHelper.setStatus( 'Request failed.', 'error', 4 );
				} );
		} );
	} );

	const clearBtn = el.querySelector( '#wte-dbg-clear-log' );
	if ( clearBtn ) {
		clearBtn.addEventListener( 'click', () => {
			clearBtn.disabled = true;
			DomHelper.setStatus( 'Clearing log\u2026', 'info' );

			fetch( ajaxurl, {
				method: 'POST',
				body:   new URLSearchParams( { action: 'wpte_devzone_logs_wp_clear_log', _ajax_nonce: nonce } ),
			} )
				.then( r => r.json() )
				.then( data => {
					clearBtn.disabled = false;
					if ( data.success ) {
						const logBody = el.querySelector( '#wte-dbg-log-body' );
						const empty   = document.createElement( 'p' );
						empty.className   = 'wte-dbg-wp-empty';
						empty.textContent = 'Debug log is empty.';
						logBody.replaceChildren( empty );
						clearBtn.remove();
						DomHelper.setStatus( 'Log cleared.', 'success', 3 );
					} else {
						DomHelper.setStatus( data.data?.message ?? 'Error.', 'error', 4 );
					}
				} )
				.catch( () => {
					clearBtn.disabled = false;
					DomHelper.setStatus( 'Request failed.', 'error', 4 );
				} );
		} );
	}

	return el;
}

export class LogsTab {

	static initWordpress( el ) {
		return initWordpressTab( el );
	}

	/**
	 * @param {Element}  contentEl — the tab content container
	 * @param {Function} loadTab   — DevZoneApp.instance.loadTab bound callback
	 */
	constructor( contentEl, loadTab ) {
		this.contentEl  = contentEl;
		this._loadTab   = loadTab;
	}

	init() {
		const logsExtra = ( params ) => {
			const extra = {};
			params.forEach( ( v, k ) => {
				if ( k !== 'page' && k !== 'tab' ) extra[ k ] = String( v );
			} );
			return extra;
		};

		// Delegate link clicks — intercept any Logs-tab <a> link.
		this.contentEl.addEventListener( 'click', ( e ) => {
			const link = e.target.closest( 'a[href]' );
			if ( ! link ) return;

			// Skip anchor-only links (e.g. href="#") — they are in-page toggles,
			// not navigation; resolving them against the current URL would
			// incorrectly inherit tab=logs and trigger an unwanted tab reload.
			const rawHref = link.getAttribute( 'href' ) || '';
			if ( ! rawHref || rawHref.startsWith( '#' ) ) return;

			let url;
			try { url = new URL( link.href ); } catch ( _ ) { return; }

			if ( url.searchParams.get( 'tab' ) !== 'wptravelengine' ) return;

			e.preventDefault();
			this._loadTab( 'wptravelengine', { extra_get: JSON.stringify( logsExtra( url.searchParams ) ) } );
		} );

		// Delegate GET form submissions
		this.contentEl.addEventListener( 'submit', ( e ) => {
			const form = e.target.closest( 'form' );
			if ( ! form ) return;
			if ( ( form.method || 'get' ).toLowerCase() !== 'get' ) return;

			const tabInput = form.querySelector( 'input[name="tab"]' );
			if ( ! tabInput || tabInput.value !== 'wptravelengine' ) return;

			e.preventDefault();
			this._loadTab( 'wptravelengine', { extra_get: JSON.stringify( logsExtra( new FormData( form ) ) ) } );
		} );

		// Delegate POST form submissions (e.g. settings save).
		// The browser URL may not contain tab=logs, so a normal submit would land on
		// the wrong DevZone tab and the save would never run.  Route through the
		// DevZone AJAX call instead, merging the form fields into the request body.
		this.contentEl.addEventListener( 'submit', ( e ) => {
			const form = e.target.closest( 'form' );
			if ( ! form ) return;
			if ( ( form.method || 'get' ).toLowerCase() !== 'post' ) return;

			e.preventDefault();

			// Strip keys that would clash with DevZone AJAX reserved params.
			const skipKeys = new Set( [ 'action', 'tab', '_ajax_nonce', 'page' ] );
			const postFields = {};
			new FormData( form ).forEach( ( v, k ) => {
				if ( ! skipKeys.has( k ) ) postFields[ k ] = String( v );
			} );

			// FormData excludes submit inputs; add the submitter manually so PHP
			// triggers like isset($_POST['wte_save_logger_settings']) work correctly.
			if ( e.submitter && e.submitter.name && ! skipKeys.has( e.submitter.name ) ) {
				postFields[ e.submitter.name ] = e.submitter.value || '';
			}

			// Preserve the current view (settings, files, entries…) so the response
			// re-renders the same view with a success/error notice.
			const viewInput = form.querySelector( 'input[name="view"]' );
			const view = viewInput
				? viewInput.value
				: ( new URLSearchParams( window.location.search ).get( 'view' ) || 'settings' );

			this._loadTab( 'wptravelengine', Object.assign(
				{ extra_get: JSON.stringify( { view } ) },
				postFields
			) );
		} );

		return this;
	}
}
