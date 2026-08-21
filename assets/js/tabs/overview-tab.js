/**
 * WPTE Dev Zone — OverviewTab
 * Settings tree: search, pagination, lazy-load, edit, delete.
 */
/* global wpteDbg */

import { DomHelper }    from '../dom-helper.js';
import { InlineEditor } from '../inline-editor.js';
import { Icons }        from '../constants.js';

const { ajaxurl, nonce } = wpteDbg;
const OPTS_PER_PAGE = 20;

export class OverviewTab {
	constructor( contentEl ) {
		this.contentEl   = contentEl;
		this.optionsPage = 1;
		this.editor      = new InlineEditor( () => null, () => null );
		this._optionCtrl = null;
	}

	destroy() {
		if ( this._optionCtrl ) {
			DomHelper.setStatus( 'Cancelled \u2014 settings', 'cancelled' );
			this._optionCtrl.abort();
			this._optionCtrl = null;
		}
	}

	init() {
		// Section collapse toggles
		this.contentEl.querySelectorAll( '.wte-dbg-section-header' ).forEach( ( hdr ) => {
			hdr.addEventListener( 'click', () => {
				hdr.closest( '.wte-dbg-section' ).classList.toggle( 'is-collapsed' );
			} );
		} );

		const tree = this.contentEl.querySelector( '.wte-dbg-options-tree' );
		if ( ! tree ) return;

		// Search input
		const searchInput = document.createElement( 'input' );
		searchInput.type        = 'text';
		searchInput.className   = 'wte-dbg-option-search wte-dbg-search-input';
		searchInput.placeholder = `Search options${ Icons.ELLIPSIS }`;
		tree.insertAdjacentElement( 'beforebegin', searchInput );

		const paginEl = this.contentEl.querySelector( '.wte-dbg-options-pagination' );

		const renderPage = () => this._renderOptionsPage( tree, searchInput, paginEl );

		searchInput.addEventListener( 'input', () => {
			this.optionsPage = 1;
			renderPage();
		} );

		renderPage();

		// Lazy-load on first expand
		tree.querySelectorAll( '.wte-dbg-option-root' ).forEach( ( details ) => {
			details.addEventListener( 'toggle', () => this._onOptionToggle( details ) );
		} );

		// Edit button delegation
		tree.addEventListener( 'click', ( e ) => {
			const btn = e.target.closest( '.wte-dbg-edit-btn' );
			if ( btn ) {
				const row = btn.closest( '.wte-dbg-row' );
				if ( row ) this.editor.activateEdit( row );
			}
		} );

		// Value truncation — click to expand/collapse (shared utility)
		DomHelper.setupValueClicks( tree );

		// Delete option button delegation
		const settingsTab = tree.closest( '.wte-dbg-settings-tab' );
		if ( settingsTab ) {
			settingsTab.addEventListener( 'click', ( e ) => {
				const btn = e.target.closest( '.wte-dbg-delete-option-btn' );
				if ( ! btn ) return;

				e.stopPropagation();
				e.preventDefault();

				const optionName = btn.dataset.optionName;
				// eslint-disable-next-line no-alert
				if ( ! window.confirm( 'Delete option "' + optionName + '"?\n\nThis removes it from the database and cannot be undone.' ) ) return;

				this.editor.doDeleteOption( btn, optionName );
			} );
		}
	}

	_renderOptionsPage( tree, searchInput, paginEl ) {
		const q      = searchInput.value.toLowerCase().trim();
		const blocks = [ ...tree.querySelectorAll( '.wte-dbg-option-block' ) ];

		blocks.forEach( ( b ) => {
			const name = ( b.querySelector( '.wte-dbg-option-root' )?.dataset.optionName || '' ).toLowerCase();
			b.dataset.searchVisible = ( ! q || name.includes( q ) ) ? '1' : '0';
		} );

		const visible    = blocks.filter( ( b ) => b.dataset.searchVisible === '1' );
		const totalPages = Math.max( 1, Math.ceil( visible.length / OPTS_PER_PAGE ) );

		if ( this.optionsPage > totalPages ) this.optionsPage = 1;

		blocks.forEach( ( b ) => ( b.style.display = 'none' ) );
		const start = ( this.optionsPage - 1 ) * OPTS_PER_PAGE;
		visible.slice( start, start + OPTS_PER_PAGE ).forEach( ( b ) => ( b.style.display = '' ) );

		DomHelper.buildPagination( paginEl, this.optionsPage, totalPages, ( p ) => {
			this.optionsPage = p;
			this._renderOptionsPage( tree, searchInput, paginEl );
		} );
	}

	_onOptionToggle( details ) {
		if ( ! details.open ) return;

		const body = details.querySelector( '.wte-dbg-option-body' );
		if ( ! body || ! body.classList.contains( 'wte-dbg-lazy' ) ) return;

		body.classList.remove( 'wte-dbg-lazy' );
		body.classList.add( 'wte-dbg-skeleton' );

		this._optionCtrl?.abort();
		this._optionCtrl = new AbortController();
		const { signal } = this._optionCtrl;

		const params = new URLSearchParams( {
			action:      'wpte_devzone_get_option',
			option_name: details.dataset.optionName,
			_ajax_nonce: nonce,
		} );

		DomHelper.setStatus( `Loading${ Icons.ELLIPSIS }`, 'info' );

		fetch( ajaxurl + '?' + params, { signal } )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				this._optionCtrl = null;
				body.classList.remove( 'wte-dbg-skeleton' );
				DomHelper.clearStatus();
				if ( res.success ) {
					DomHelper.setServerHtml( body, res.data.html );
					DomHelper.applyRowStripes( body );
					if ( res.data.count != null ) {
						let badge = details.querySelector( 'summary .wte-dbg-count' );
						if ( ! badge ) {
							badge = document.createElement( 'span' );
							badge.className = 'wte-dbg-count';
							details.querySelector( 'summary' ).appendChild( badge );
						}
						badge.textContent = '[' + res.data.count + ' item' + ( res.data.count !== 1 ? 's' : '' ) + ']';
					}

					// Add expand-all toggle if the body contains nested tree nodes
					if ( body.querySelector( '.wte-dbg-node' ) ) {
						const summary   = details.querySelector( 'summary' );
						const expandBtn = document.createElement( 'span' );
						expandBtn.className = 'wte-dbg-expand-all-inline';
						expandBtn.textContent = Icons.EXPAND_ALL;
						expandBtn.title       = 'Expand all';

						// Prevent the summary toggle when clicking the expand button
						summary.addEventListener( 'click', ( e ) => {
							if ( expandBtn.contains( e.target ) ) e.preventDefault();
						} );

						expandBtn.addEventListener( 'click', () => {
							const expanding         = expandBtn.dataset.state !== 'expanded';
							expandBtn.dataset.state = expanding ? 'expanded' : '';
							expandBtn.textContent   = expanding ? Icons.COLLAPSE_ALL : Icons.EXPAND_ALL;
							expandBtn.title         = expanding ? 'Collapse all' : 'Expand all';
							body.querySelectorAll( '.wte-dbg-node' ).forEach( ( el ) => {
								el.open = expanding;
							} );
						} );

						summary.appendChild( expandBtn );
					}
				} else {
					body.textContent = 'Error loading option.';
				}
			} )
			.catch( ( err ) => {
				if ( err.name === 'AbortError' ) return;
				body.classList.remove( 'wte-dbg-skeleton' );
				DomHelper.clearStatus();
				body.textContent = 'Request failed.';
			} );
	}

}
