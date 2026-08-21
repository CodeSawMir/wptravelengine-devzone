/**
 * WPTE Dev Zone — DomHelper
 * Static DOM utility methods shared across tab modules.
 */

import { Icons } from './constants.js';

export class DomHelper {
	static buildRow() {
		const row = document.createElement( 'div' );
		row.className = 'wte-dbg-row';
		return row;
	}

	static makeKeySpan( text ) {
		const span = document.createElement( 'span' );
		span.className = 'wte-dbg-key';
		span.textContent = text;
		return span;
	}

	static makeValueSpan( raw ) {
		const span = document.createElement( 'span' );
		span.className = 'wte-dbg-value';
		span.dataset.raw = raw;
		span.textContent = DomHelper.formatScalar( raw );
		return span;
	}

	/**
	 * Toggle a .wte-dbg-value span between truncated and full content.
	 * @param {HTMLElement} el  The value span (must have data-raw).
	 * @param {boolean}     [expand]  Force expand (true) or collapse (false). Omit to toggle.
	 * @param {number}      [maxLen=80]  Truncation length.
	 */
	static toggleValueExpand( el, expand, maxLen = 200 ) {
		const raw = el.dataset.raw ?? '';
		if ( raw.length <= maxLen ) return;
		const expanding = expand !== undefined ? expand : el.dataset.expanded !== '1';
		el.dataset.expanded = expanding ? '1' : '0';
		el.textContent      = expanding ? raw : raw.substring( 0, maxLen ) + Icons.ELLIPSIS;
		el.title            = expanding ? 'Click to collapse' : 'Click to expand';
	}

	/**
	 * Wire up delegated click handling on a container so that long .wte-dbg-value
	 * spans expand/collapse on click.
	 * @param {HTMLElement} container
	 * @param {number}      [maxLen=200]
	 */
	static setupValueClicks( container, maxLen = 200 ) {
		let downX = 0, downY = 0;
		container.addEventListener( 'mousedown', ( e ) => { downX = e.clientX; downY = e.clientY; } );
		container.addEventListener( 'click', ( e ) => {
			// If the mouse moved more than 4px between mousedown and click the
			// user is dragging to select text — don't toggle.
			if ( Math.abs( e.clientX - downX ) > 4 || Math.abs( e.clientY - downY ) > 4 ) return;
			const val = e.target.closest( '.wte-dbg-value[data-raw]' );
			if ( val ) DomHelper.toggleValueExpand( val, undefined, maxLen );
		} );
	}

	static makeEditBtn() {
		const btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'wte-dbg-edit-btn';
		btn.title = 'Edit';
		btn.textContent = Icons.EDIT;
		return btn;
	}

	static makeButton( text, className ) {
		const btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = className;
		btn.textContent = text;
		return btn;
	}

	static makePara( className, text ) {
		const p = document.createElement( 'p' );
		p.className = className;
		p.textContent = text;
		return p;
	}

	static setTextContent( el, text ) {
		while ( el.firstChild ) el.removeChild( el.firstChild );
		if ( text ) el.textContent = text;
	}

	/**
	 * Safely insert server-rendered HTML into an element, then re-execute any
	 * inline <script> tags. insertAdjacentHTML intentionally does not run scripts;
	 * cloning them into fresh DOM <script> nodes is the standard workaround.
	 */
	static setServerHtml( el, html ) {
		DomHelper.setTextContent( el, '' );
		el.insertAdjacentHTML( 'beforeend', html );
		el.querySelectorAll( 'script' ).forEach( ( oldScript ) => {
			const newScript = document.createElement( 'script' );
			[ ...oldScript.attributes ].forEach( ( a ) => newScript.setAttribute( a.name, a.value ) );
			newScript.textContent = oldScript.textContent;
			oldScript.replaceWith( newScript );
		} );
	}

	/**
	 * Stamp .is-stripe on every even-indexed .wte-dbg-row within a container,
	 * counting only sibling rows (skipping details.wte-dbg-node and others).
	 * Recurses into every nested .wte-dbg-children container independently.
	 */
	static applyRowStripes( container ) {
		let idx = 0;
		for ( const el of container.children ) {
			if ( el.classList.contains( 'wte-dbg-row' ) || el.classList.contains( 'wte-dbg-node' ) ) {
				el.classList.toggle( 'is-stripe', ( idx++ ) % 2 !== 0 );
			}
		}
		container.querySelectorAll( '.wte-dbg-children' ).forEach( DomHelper.applyRowStripes );
	}

	static buildPagination( paginEl, page, totalPages, onPage ) {
		DomHelper.setTextContent( paginEl, '' );
		if ( totalPages <= 1 ) return;

		const prev = document.createElement( 'button' );
		prev.className = 'wte-dbg-page-btn';
		prev.textContent = Icons.PREV;
		prev.dataset.page = page - 1;
		if ( page <= 1 ) prev.disabled = true;

		const info = document.createElement( 'span' );
		info.style.cssText = 'font-size:12px;padding:0 8px;';
		info.textContent = page + ' / ' + totalPages;

		const next = document.createElement( 'button' );
		next.className = 'wte-dbg-page-btn';
		next.textContent = Icons.NEXT;
		next.dataset.page = page + 1;
		if ( page >= totalPages ) next.disabled = true;

		[ prev, next ].forEach( ( btn ) => {
			if ( ! btn.disabled ) {
				btn.addEventListener( 'click', () => onPage( parseInt( btn.dataset.page, 10 ) ) );
			}
		} );

		paginEl.appendChild( prev );
		paginEl.appendChild( info );
		paginEl.appendChild( next );
	}

	/**
	 * Full-content spinner overlay shown while a tab AJAX request is in flight.
	 * Covers .wte-dbg-content absolutely with a centred spinner + status note.
	 */
	static makeLoader( msg ) {
		DomHelper.setStatus( msg || `Loading${ Icons.ELLIPSIS }` );

		const wrap = document.createElement( 'div' );
		wrap.className = 'wte-dbg-loader';

		const spinner = document.createElement( 'div' );
		spinner.className = 'wte-dbg-loader-spinner';
		wrap.appendChild( spinner );

		return wrap;
	}

	/** Show the global status note with a message. type: 'info' | 'success' | 'error' | 'cancelled' */
	static setStatus( msg, type = null, secs = null ) {
		const wrap = document.getElementById( 'wte-dbg-wp-debug-notice' );
		if ( ! wrap ) return;
		const note = wrap.querySelector( '.wte-dbg-loader-note' );
		if ( note ) note.textContent = msg;
		wrap.classList.remove( 'is-status-info', 'is-status-success', 'is-status-error', 'is-status-cancelled' );
		if ( type ) wrap.classList.add( 'is-status-' + type );
		wrap.style.display = 'flex';
		clearTimeout( DomHelper._statusTimer );
		if ( secs ) DomHelper._statusTimer = setTimeout( () => DomHelper.clearStatus(), secs * 1000 );
	}

	/** Hide the global status note and reset its type. */
	static clearStatus() {
		clearTimeout( DomHelper._statusTimer );
		const wrap = document.getElementById( 'wte-dbg-wp-debug-notice' );
		if ( ! wrap ) return;
		wrap.style.display = 'none';
		wrap.classList.remove( 'is-status-info', 'is-status-success', 'is-status-error', 'is-status-cancelled' );
	}

	/** Update cycling note text with fade transition (used by outer loader timer). */
	static updateLoaderNote( msg ) {
		const wrap = document.getElementById( 'wte-dbg-wp-debug-notice' );
		if ( ! wrap ) return;
		const note = wrap.querySelector( '.wte-dbg-loader-note' );
		if ( ! note ) return;
		note.classList.add( 'is-changing' );
		setTimeout( () => {
			note.textContent = msg;
			note.classList.remove( 'is-changing' );
		}, 150 );
	}

	/**
	 * Build a skeleton placeholder that mimics the real relation groups layout.
	 * @param {number} groups        Number of group blocks to render (default 2).
	 * @param {number} itemsPerGroup Number of skeleton item cards per group (default 3).
	 * @returns {HTMLElement}
	 */
	static buildRelationSkeleton( groups = 2, itemsPerGroup = 3 ) {
		const TITLE_WIDTHS = [ '85%', '68%', '78%', '60%', '90%' ];
		const wrap = document.createElement( 'div' );

		for ( let g = 0; g < groups; g++ ) {
			const group = document.createElement( 'div' );
			group.className = 'wte-dbg-relation-group';

			const header = document.createElement( 'div' );
			header.className = 'wte-dbg-relation-header';

			const label = document.createElement( 'div' );
			label.className = 'wte-dbg-loader-block wte-dbg-skel-label';
			label.setAttribute( 'aria-hidden', 'true' );

			const badge = document.createElement( 'div' );
			badge.className = 'wte-dbg-loader-block wte-dbg-skel-badge';
			badge.setAttribute( 'aria-hidden', 'true' );

			header.appendChild( label );
			header.appendChild( badge );
			group.appendChild( header );

			const list = document.createElement( 'div' );
			list.className = 'wte-dbg-relation-list';

			for ( let i = 0; i < itemsPerGroup; i++ ) {
				const delay = ( ( g * itemsPerGroup ) + i ) * 0.08;

				const item = document.createElement( 'div' );
				item.className = 'wte-dbg-relation-skeleton-item';

				const title = document.createElement( 'div' );
				title.className = 'wte-dbg-loader-block';
				title.style.cssText = `width:${ TITLE_WIDTHS[ ( g * itemsPerGroup + i ) % TITLE_WIDTHS.length ] };height:11px;animation-delay:${ delay.toFixed( 2 ) }s`;

				const meta = document.createElement( 'div' );
				meta.className = 'wte-dbg-loader-block';
				meta.style.cssText = `width:38px;height:11px;flex-shrink:0;animation-delay:${ ( delay + 0.04 ).toFixed( 2 ) }s`;

				item.appendChild( title );
				item.appendChild( meta );
				list.appendChild( item );
			}

			group.appendChild( list );
			wrap.appendChild( group );
		}

		return wrap;
	}

	/**
	 * Append an inline shimmer + status note directly to a container.
	 * The note is a sibling of the shimmer (not nested inside it) so that
	 * position:absolute top:50% right:18px anchors to the container itself.
	 */
	static appendShimmer( container, count, msg ) {
		const lines = count || 4;
		const wrap  = document.createElement( 'div' );
		wrap.className = 'wte-dbg-shimmer-lines';
		const widths = [ '90%', '75%', '85%', '65%', '80%', '70%' ];
		for ( let i = 0; i < lines; i++ ) {
			const b = document.createElement( 'div' );
			b.className = 'wte-dbg-loader-block';
			b.style.cssText = `width:${ widths[ i % widths.length ] };height:18px;animation-delay:${ ( i * 0.1 ).toFixed( 1 ) }s`;
			wrap.appendChild( b );
		}
		container.appendChild( wrap );

		if ( msg ) DomHelper.setStatus( msg, 'info' );
	}

	static formatScalar( value ) {
		if ( value === null || value === undefined || value === '' ) {
			if ( value === '' ) return '(empty)';
			return '(null)';
		}
		if ( typeof value === 'boolean' ) return value ? 'true' : 'false';
		const str = String( value );
		return str.length > 200 ? str.substring( 0, 200 ) + Icons.ELLIPSIS : str;
	}

	/**
	 * Attach a cursor-following "copy" label to an element.
	 * The label appears on mouseenter and tracks the pointer via mousemove.
	 * Call once per element (e.g. on creation).
	 * @param {HTMLElement} el  The element to attach the tooltip to.
	 */
	static attachCopyLabel( el ) {
		if ( ! DomHelper._copyLabelEl ) {
			const tip = document.createElement( 'div' );
			tip.className = 'wte-dbg-copy-label';
			tip.textContent = 'copy';
			document.body.appendChild( tip );
			DomHelper._copyLabelEl = tip;
		}

		const tip = DomHelper._copyLabelEl;

		el.addEventListener( 'mouseenter', () => tip.classList.add( 'is-visible' ) );
		el.addEventListener( 'mouseleave', () => tip.classList.remove( 'is-visible' ) );
		el.addEventListener( 'mousemove', ( e ) => {
			tip.style.left = e.clientX + 'px';
			tip.style.top  = e.clientY + 'px';
		} );
	}

	/**
	 * Copy a value to the clipboard and flash the element with "Copied!" feedback.
	 * @param {HTMLElement} el   Element to flash (must have .is-copied CSS state).
	 * @param {*}           val  Value to copy (null → empty string).
	 */
	static copyWithFeedback( el, val ) {
		if ( el.classList.contains( 'is-copied' ) ) return;
		const text = val === null ? '' : String( val );
		const prev = el.textContent;

		const showFeedback = () => {
			el.classList.add( 'is-copied' );
			el.textContent = 'Copied!';
			setTimeout( () => {
				el.classList.remove( 'is-copied' );
				el.textContent = prev;
			}, 1000 );
		};

		if ( navigator.clipboard && navigator.clipboard.writeText ) {
			navigator.clipboard.writeText( text ).then( showFeedback );
		} else {
			// Fallback for HTTP / older browsers
			const ta = document.createElement( 'textarea' );
			ta.value = text;
			ta.style.cssText = 'position:fixed;opacity:0;';
			document.body.appendChild( ta );
			ta.select();
			// eslint-disable-next-line no-restricted-properties
			document.execCommand( 'copy' );
			document.body.removeChild( ta );
			showFeedback();
		}
	}
}
