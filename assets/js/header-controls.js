/**
 * Header controls — theme toggle, dev-mode toggle, meta collapse.
 */
/* global wpteDbg */

import { DomHelper } from './dom-helper.js';

export function isDevSlug( slug ) {
	const devFeatures  = wpteDbg.devFeatures  || {};
	const groupSubtabs = wpteDbg.groupSubtabs || {};

	// Slug is a group button whose entire group is dev-only.
	if ( devFeatures[ slug ] === '__all' ) return true;

	// Slug is a subtab of a group that is entirely dev-only.
	for ( const [ group, subs ] of Object.entries( groupSubtabs ) ) {
		if ( devFeatures[ group ] === '__all' && slug in subs ) return true;
	}

	// Slug appears in a comma-separated dev list for any group.
	for ( const [ , scope ] of Object.entries( devFeatures ) ) {
		if ( scope !== '__all' && scope.split( ',' ).map( s => s.trim() ).includes( slug ) ) {
			return true;
		}
	}

	return false;
}

export function initThemeToggle() {
	const wrap = document.querySelector( '.wte-devzone-wrap' );
	const btn  = document.querySelector( '.wte-dbg-theme-toggle' );
	const icon = btn && btn.querySelector( '.wte-dbg-theme-icon' );
	const KEY  = 'wte_dbg_theme';

	if ( ! wrap || ! btn ) return;

	if ( wrap.classList.contains( 'wte-dbg-dark' ) ) {
		if ( icon ) icon.textContent = '\u263e'; // ☾
	}

	btn.addEventListener( 'click', () => {
		const isDark = wrap.classList.toggle( 'wte-dbg-dark' );
		document.body.classList.toggle( 'wte-dbg-page-dark', isDark );
		if ( icon ) icon.textContent = isDark ? '\u263e' : '\u2600'; // ☾ / ☀
		localStorage.setItem( KEY, isDark ? 'dark' : 'light' );
		DomHelper.setStatus( isDark ? 'Dark mode enabled' : 'Light mode enabled', 'success' );
	} );
}

function makeToggleIcon( pathData, color ) {
	const ns   = 'http://www.w3.org/2000/svg';
	const svg  = document.createElementNS( ns, 'svg' );
	svg.setAttribute( 'width', '22' );
	svg.setAttribute( 'height', '22' );
	svg.setAttribute( 'viewBox', '0 0 24 24' );
	svg.setAttribute( 'fill', color || 'currentColor' );
	svg.setAttribute( 'aria-hidden', 'true' );
	const path = document.createElementNS( ns, 'path' );
	path.setAttribute( 'd', pathData );
	svg.appendChild( path );
	return svg;
}

const PATH_FIRE = 'M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8c0-5.39-2.59-10.2-6.5-13.33zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z';

function makeLogoSvg() {
	const ns  = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS( ns, 'svg' );
	svg.setAttribute( 'width', '22' );
	svg.setAttribute( 'height', '22' );
	svg.setAttribute( 'viewBox', '0 0 24 24' );
	svg.setAttribute( 'fill', 'orange' );
	svg.setAttribute( 'aria-hidden', 'true' );
	const path = document.createElementNS( ns, 'path' );
	path.setAttribute( 'd', 'M20 8h-2.81A6 6 0 0 0 6.81 8H4a1 1 0 0 0 0 2h2v1a8 8 0 0 0 .07 1H4a1 1 0 0 0 0 2h2.64A6 6 0 0 0 18 14v-1h2a1 1 0 0 0 0-2h-2.07A8 8 0 0 0 18 11v-1h2a1 1 0 0 0 0-2zM9 7.5a3 3 0 0 1 6 0H9zm3 10.5a4 4 0 0 1-4-4v-3h8v3a4 4 0 0 1-4 4zm-1-6v2h2v-2h-2z' );
	svg.appendChild( path );
	const c1 = document.createElementNS( ns, 'circle' );
	c1.setAttribute( 'cx', '9' ); c1.setAttribute( 'cy', '3' ); c1.setAttribute( 'r', '1.5' );
	svg.appendChild( c1 );
	const c2 = document.createElementNS( ns, 'circle' );
	c2.setAttribute( 'cx', '15' ); c2.setAttribute( 'cy', '3' ); c2.setAttribute( 'r', '1.5' );
	svg.appendChild( c2 );
	return svg;
}

export function initDevModeToggle( onLoadTab, getCurrentSlug ) {
	const wrap = document.querySelector( '.wte-devzone-wrap' );
	const btn  = document.querySelector( '.wte-dbg-dev-toggle' );
	const icon = btn && btn.querySelector( '.wte-dbg-dev-icon' );
	const KEY  = 'wte_dbg_dev_mode';

	if ( ! wrap || ! btn ) return;

	if ( ! Object.keys( wpteDbg.devFeatures || {} ).length ) {
		btn.hidden = true;
		return;
	}

	const tip = document.createElement( 'div' );
	tip.className = 'wte-dbg-float-tooltip';
	document.body.appendChild( tip );

	btn.addEventListener( 'mouseenter', () => {
		const r = btn.getBoundingClientRect();
		tip.textContent = btn.dataset.tooltip || '';
		tip.style.left  = ( r.left + r.width / 2 ) + 'px';
		tip.style.top   = ( r.bottom + 7 ) + 'px';

		const tipRect  = tip.getBoundingClientRect();
		const overflow = tipRect.right - ( window.innerWidth - 8 );
		if ( overflow > 0 ) {
			tip.style.left = ( r.left + r.width / 2 - overflow ) + 'px';
		}

		tip.classList.add( 'is-visible' );
	} );
	btn.addEventListener( 'mouseleave', () => tip.classList.remove( 'is-visible' ) );
	btn.addEventListener( 'click',      () => tip.classList.remove( 'is-visible' ) );

	const syncBtn = ( on ) => {
		if ( icon ) icon.replaceChildren( on ? makeToggleIcon( PATH_FIRE, '#ff4500' ) : makeLogoSvg() );
		btn.dataset.tooltip = on ? 'Hide hot features' : 'Show hot features';
	};

	syncBtn( wrap.classList.contains( 'wte-dbg-dev-mode' ) );

	btn.addEventListener( 'click', () => {
		const nowOn = wrap.classList.toggle( 'wte-dbg-dev-mode' );
		syncBtn( nowOn );
		try { localStorage.setItem( KEY, nowOn ? '1' : '0' ); } catch ( e ) {}

		if ( ! nowOn ) {
			const slug = getCurrentSlug?.();
			if ( slug && isDevSlug( slug ) ) {
				onLoadTab( 'overview' );
			}
		}
	} );
}

export function initMetaCollapse() {
	const wrap = document.querySelector( '.wte-devzone-wrap' );
	const btn  = document.querySelector( '.wte-dbg-meta-collapse-btn' );
	const KEY  = 'wte_dbg_meta_expanded';

	if ( ! wrap || ! btn ) return;

	const syncBtn = ( expanded ) => {
		btn.setAttribute( 'aria-expanded', expanded ? 'true' : 'false' );
		btn.title = expanded ? 'Collapse info' : 'Show info';
	};

	syncBtn( wrap.classList.contains( 'wte-dbg-meta-expanded' ) );

	btn.addEventListener( 'click', () => {
		const nowExpanded = wrap.classList.toggle( 'wte-dbg-meta-expanded' );
		syncBtn( nowExpanded );
		try { localStorage.setItem( KEY, nowExpanded ? '1' : '0' ); } catch ( e ) {}
	} );
}
