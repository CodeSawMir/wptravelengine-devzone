/**
 * TabLoader — AJAX tab loading, navigate-to (detail drill-down), go-back.
 */
/* global wpteDbg */

import { DomHelper }   from './dom-helper.js';
import { isDevSlug }   from './header-controls.js';

const { ajaxurl, nonce } = wpteDbg;
const TAB_KEY = 'wte_dbg_tab';

const TAB_LABELS = {
	overview: 'settings', trips: 'trips', bookings: 'bookings',
	payments: 'payments', customers: 'customers', logs: 'logs',
	query: 'query', cron: 'cron', perf: 'performance', marketplace: 'marketplace',
	tinker: 'tinker',
};

export class TabLoader {
	constructor( nav, tabRegistry ) {
		this._nav             = nav;
		this._tabRegistry     = tabRegistry;
		this._contentEl       = document.querySelector( '.wte-dbg-content' );
		this._fetchController = null;
		this._noteTimer       = null;
		this._pendingPostId   = null;
		this._currentSlug     = null;
		this._currentInstance = null;
	}

	get currentSlug()   { return this._currentSlug; }
	get currentPostId() { return this._currentInstance?.currentPostId ?? null; }

	navigateTo( slug, postId ) {
		if ( this._currentSlug && this.currentPostId ) {
			this._nav.push( this._currentSlug, this.currentPostId, this._contentEl?.innerHTML ?? '' );
		}
		this._pendingPostId = postId;
		this.loadTab( slug, undefined, true );
	}

	goBack() {
		if ( ! this._nav.stackSize ) return;
		const { slug, postId, html } = this._nav.pop();

		if ( html ) {
			this._currentInstance?.destroy?.();
			this._currentInstance = null;
			this._fetchController?.abort();
			this._fetchController = null;
			if ( this._noteTimer ) { clearInterval( this._noteTimer ); this._noteTimer = null; }

			this._nav.updateGroupState( slug );
			document.querySelectorAll( '.wte-dbg-tab' ).forEach( t => {
				const tSlug = new URL( t.href ).searchParams.get( 'tab' ) || 'overview';
				t.classList.toggle( 'is-active', tSlug === slug );
				t.setAttribute( 'aria-selected', tSlug === slug ? 'true' : 'false' );
			} );
			try { localStorage.setItem( TAB_KEY, slug ); } catch ( e ) {}
			try {
				const url = new URL( window.location.href );
				url.searchParams.set( 'tab', slug );
				url.searchParams.set( 'post_id', String( postId ) );
				history.replaceState( null, '', url.toString() );
			} catch ( e ) {}

			const content = this._contentEl;
			DomHelper.setServerHtml( content, html );
			this._currentSlug     = slug;
			this._currentInstance = this._tabRegistry[ slug ]?.( content, postId, true );
			DomHelper.clearStatus();
			return;
		}

		this._pendingPostId = postId;
		this.loadTab( slug );
	}

	_isDevModeOn() {
		return !! document.querySelector( '.wte-devzone-wrap.wte-dbg-dev-mode' );
	}

	_firstAllowedSlug( slug ) {
		const groupSubtabs = wpteDbg.groupSubtabs || {};
		for ( const subs of Object.values( groupSubtabs ) ) {
			if ( ! ( slug in subs ) ) continue;
			for ( const subSlug of Object.keys( subs ) ) {
				if ( ! isDevSlug( subSlug ) ) return subSlug;
			}
			return 'overview'; // all siblings are dev-only
		}
		return 'overview';
	}

	initRendered( slug, postId ) {
		if ( isDevSlug( slug ) && ! this._isDevModeOn() ) {
			this.loadTab( 'overview' );
			return;
		}
		this._currentSlug     = slug;
		this._currentInstance = this._tabRegistry[ slug ]?.( this._contentEl, postId );
		if ( typeof window.wpteDbgInitSearch === 'function' ) {
			window.wpteDbgInitSearch();
		}
		this._nav.updateGroupState( slug );
	}

	loadTab( slug, extra, preserveStack = false ) {
		slug = this._nav.resolveSlug( slug );

		if ( isDevSlug( slug ) && ! this._isDevModeOn() ) {
			slug = this._firstAllowedSlug( slug );
		}

		if ( ! preserveStack ) {
			this._nav.clearStack();
		}

		this._nav.updateGroupState( slug );

		document.querySelectorAll( '.wte-dbg-tab' ).forEach( t => {
			const tSlug = new URL( t.href ).searchParams.get( 'tab' ) || 'overview';
			t.classList.toggle( 'is-active', tSlug === slug );
			t.setAttribute( 'aria-selected', tSlug === slug ? 'true' : 'false' );
		} );

		if ( 'tinker' === slug ) document.querySelector( '.wte-dbg-header-meta .wte-dbg-header-tinker-btn' ).classList.add('is-active')
		else document.querySelector( '.wte-dbg-header-meta .wte-dbg-header-tinker-btn' ).classList.remove('is-active')

		try {
			const url = new URL( window.location.href );
			if ( slug === 'overview' ) {
				url.searchParams.delete( 'tab' );
			} else {
				url.searchParams.set( 'tab', slug );
			}
			url.searchParams.delete( 'post_id' );
			history.replaceState( null, '', url.toString() );
		} catch ( e ) {}

		const content = this._contentEl;
		if ( ! content ) return;

		this._currentInstance?.destroy?.();
		this._currentInstance = null;

		this._fetchController?.abort();
		this._fetchController = new AbortController();
		const { signal } = this._fetchController;

		if ( this._noteTimer ) {
			clearInterval( this._noteTimer );
			this._noteTimer = null;
		}

		DomHelper.setTextContent( content, '' );
		content.style.visibility = '';

		const label = TAB_LABELS[ slug ] || slug;
		const noteMessages = [
			'Loading ' + label + '\u2026',
			'Fetching ' + label + ' data\u2026',
			'Parsing records\u2026',
			'Rendering ' + label + '\u2026',
		];
		let noteIdx = 0;
		content.appendChild( DomHelper.makeLoader( noteMessages[ 0 ], slug ) );
		this._noteTimer = setInterval( () => {
			noteIdx = ( noteIdx + 1 ) % noteMessages.length;
			DomHelper.updateLoaderNote( noteMessages[ noteIdx ] );
		}, 800 );

		fetch( ajaxurl, {
			method: 'POST',
			signal,
			body:   new URLSearchParams( Object.assign( {
				action:      'wpte_devzone_load_tab',
				tab:         slug,
				_ajax_nonce: nonce,
			}, extra || {} ) ),
		} )
			.then( r => r.json() )
			.then( res => {
				clearInterval( this._noteTimer );
				this._noteTimer = null;
				DomHelper.setTextContent( content, '' );
				content.style.visibility = '';
				if ( ! res.success ) {
					// Slug no longer valid (e.g. a tab that has since been removed).
					// Clear the stale entry and fall back to overview so the user isn't stuck.
					DomHelper.setStatus( 'Tab unavailable \u2014 falling back to overview', 'error', 2 );
					try { localStorage.removeItem( TAB_KEY ); } catch ( e ) {}
					this.loadTab( 'overview' );
					return;
				}
				try { localStorage.setItem( TAB_KEY, slug ); } catch ( e ) {}
				DomHelper.setServerHtml( content, res.data.html );
				const pendingId = this._pendingPostId;
				this._pendingPostId   = null;
				this._currentSlug     = slug;
				this._currentInstance = this._tabRegistry[ slug ]?.( content, pendingId );
				if ( typeof window.wpteDbgInitSearch === 'function' ) {
					window.wpteDbgInitSearch();
				}
				DomHelper.setStatus( label.charAt( 0 ).toUpperCase() + label.slice( 1 ) + ' loaded', 'success', 2 );
			} )
			.catch( err => {
				clearInterval( this._noteTimer );
				this._noteTimer = null;
				if ( err.name === 'AbortError' ) {
					DomHelper.setStatus( 'Cancelled \u2014 ' + label + ' loading', 'cancelled', 2 );
					return;
				}
				DomHelper.setTextContent( content, '' );
				content.style.visibility = '';
				content.appendChild( DomHelper.makePara( 'wte-dbg-empty', 'Request failed.' ) );
				DomHelper.setStatus( 'Failed to load ' + label, 'error', 2 );
			} );
	}
}
