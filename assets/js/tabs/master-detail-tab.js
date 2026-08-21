/**
 * WPTE Dev Zone — MasterDetailTab
 * List + inspector panel for trips/bookings/payments/customers.
 */
/* global wpteDbg */

import { DomHelper }    from '../dom-helper.js';
import { InlineEditor } from '../inline-editor.js';

const { ajaxurl, nonce } = wpteDbg;

/**
 * Build the pin/thumbtack SVG icon using safe DOM APIs (no innerHTML).
 * @param {boolean} filled — true for the active/pinned state (filled body).
 * @returns {SVGElement}
 */
function makePinIcon( filled ) {
	const ns  = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS( ns, 'svg' );
	svg.setAttribute( 'width', '12' );
	svg.setAttribute( 'height', '12' );
	svg.setAttribute( 'viewBox', '0 0 24 24' );
	svg.setAttribute( 'fill', filled ? 'currentColor' : 'none' );
	svg.setAttribute( 'stroke', 'currentColor' );
	svg.setAttribute( 'stroke-width', '2' );
	svg.setAttribute( 'stroke-linecap', 'round' );
	svg.setAttribute( 'stroke-linejoin', 'round' );
	svg.setAttribute( 'aria-hidden', 'true' );
	svg.style.pointerEvents = 'none';

	const line = document.createElementNS( ns, 'line' );
	line.setAttribute( 'x1', '12' );
	line.setAttribute( 'y1', '17' );
	line.setAttribute( 'x2', '12' );
	line.setAttribute( 'y2', '22' );

	const path = document.createElementNS( ns, 'path' );
	path.setAttribute( 'd', 'M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z' );

	svg.appendChild( line );
	svg.appendChild( path );
	return svg;
}

const RELATION_LABELS = {
	trip:      { singular: 'Trip',     plural: 'Trips' },
	trips:     { singular: 'Trip',     plural: 'Trips' },
	booking:   { singular: 'Booking',  plural: 'Bookings' },
	bookings:  { singular: 'Booking',  plural: 'Bookings' },
	payment:   { singular: 'Payment',  plural: 'Payments' },
	payments:  { singular: 'Payment',  plural: 'Payments' },
	customer:  { singular: 'Customer', plural: 'Customers' },
	customers: { singular: 'Customer', plural: 'Customers' },
};

const POST_TYPE_TO_TAB = {
	'trip':         'trips',
	'booking':      'bookings',
	'wte-payments': 'payments',
	'customer':     'customers',
};

export class MasterDetailTab {
	constructor( postType, contentEl, initialPostId = null, onNavigate = null ) {
		this.postType              = postType;
		this.contentEl             = contentEl;
		this.currentPostId         = null;
		this.searchTimeout         = null;
		this._listController       = null;
		this._inspectorController  = null;
		this._relationsController  = null;
		this.initialPostId         = initialPostId ? parseInt( initialPostId, 10 ) : null;
		this._onNavigate           = onNavigate;
		this._currentSearch        = '';
		this._currentPage          = 1;
		this._reloadList           = null;
		this._exportMode           = false;
		this._selectedIds          = new Set();
		this.editor                = new InlineEditor(
			() => this.currentPostId,
			() => this.postType
		);
	}

	init( restoreOnly = false ) {
		const panel = this.contentEl.querySelector( '.wte-dbg-master-detail' );
		if ( ! panel ) return;

		// Sidebar collapse toggle — persisted in localStorage.
		const toggleBtn   = panel.querySelector( '.wte-dbg-sidebar-toggle' );
		const SIDEBAR_KEY = 'wte_dbg_sidebar_collapsed';

		try {
			if ( localStorage.getItem( SIDEBAR_KEY ) === '1' ) {
				panel.classList.add( 'sidebar-collapsed' );
				if ( toggleBtn ) toggleBtn.textContent = '\u203a'; // ›
			}
		} catch ( e ) {}

		if ( toggleBtn ) {
			toggleBtn.addEventListener( 'click', () => {
				const collapsed = panel.classList.toggle( 'sidebar-collapsed' );
				toggleBtn.textContent = collapsed ? '\u203a' : '\u2039'; // › / ‹
				try { localStorage.setItem( SIDEBAR_KEY, collapsed ? '1' : '0' ); } catch ( e ) {}
			} );
		}

		const searchEl  = panel.querySelector( '.wte-dbg-search' );
		const listEl    = panel.querySelector( '.wte-dbg-list-items' );
		const paginEl   = panel.querySelector( '.wte-dbg-pagination' );
		const inspector = panel.querySelector( '.wte-dbg-inspector-panel' );

		this._reloadList = () => this._loadList(
			this._currentSearch, this._currentPage, listEl, paginEl, panel, inspector
		);

		if ( restoreOnly ) {
			// Re-attach click listeners to existing rendered items without hitting AJAX.
			listEl?.querySelectorAll( '.wte-dbg-list-item' ).forEach( ( item ) => {
				item.addEventListener( 'click', ( e ) => {
					if ( e.target.closest( '.wte-dbg-ei-cb' ) ) return;
					listEl.querySelectorAll( '.wte-dbg-list-item' ).forEach( ( i ) => i.classList.remove( 'is-active' ) );
					item.classList.add( 'is-active' );
					this._loadInspector( parseInt( item.dataset.postId, 10 ), inspector );
				} );
				const cb = item.querySelector( '.wte-dbg-ei-cb' );
				if ( cb ) this._attachCheckboxHandler( cb );
			} );
			const activeItem = listEl?.querySelector( '.wte-dbg-list-item.is-active' );
			if ( activeItem ) this.currentPostId = parseInt( activeItem.dataset.postId, 10 ) || null;

			// Re-attach relation item navigation handlers — the cached HTML has the href but
			// no JS click handler, so without this a left-click would follow the link in a new tab.
			panel.querySelectorAll( '.wte-dbg-relation-item[href]' ).forEach( ( el ) => {
				el.addEventListener( 'click', ( e ) => {
					if ( e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1 ) return;
					e.preventDefault();
					try {
						const url    = new URL( el.href );
						const tab    = url.searchParams.get( 'tab' );
						const postId = parseInt( url.searchParams.get( 'post_id' ), 10 );
						if ( tab && postId && this._onNavigate ) {
							this._onNavigate( tab, postId );
						}
					} catch ( err ) {}
				} );
			} );
		} else {
			this._loadList( '', 1, listEl, paginEl, panel, inspector );
		}

		if ( searchEl ) {
			searchEl.addEventListener( 'input', () => {
				clearTimeout( this.searchTimeout );
				this.searchTimeout = setTimeout( () => {
					this._loadList( searchEl.value, 1, listEl, paginEl, panel, inspector );
				}, 400 );
			} );
		}

		// Event delegation for section collapse toggles, inline edit, and status-select.
		// Attached to `panel` (not contentEl) so it is not re-accumulated on each loadTab call.
		panel.addEventListener( 'click', ( e ) => {
			const hdr = e.target.closest( '.wte-dbg-inspector-panel .wte-dbg-section-header' );
			if ( hdr ) {
				hdr.closest( '.wte-dbg-section' ).classList.toggle( 'is-collapsed' );
				return;
			}

			const editBtn = e.target.closest( '.wte-dbg-inspector-panel .wte-dbg-edit-btn' );
			if ( editBtn ) {
				const row = editBtn.closest( '.wte-dbg-row' );
				if ( row ) this.editor.activateEdit( row );
				return;
			}

			const link = e.target.closest( '.wte-dbg-inspector-panel .wte-dbg-link[data-post-id]' );
			if ( link ) {
				const linkedId = parseInt( link.dataset.postId, 10 );
				this._loadInspector( linkedId, inspector );
			}
		} );

		panel.addEventListener( 'change', ( e ) => {
			const sel = e.target.closest( '.wte-dbg-inspector-panel .wte-dbg-status-select' );
			if ( sel ) {
				const postId = this.currentPostId;
				this.editor.savePostField( postId, 'post_status', sel.value, sel );
			}
		} );

		// Relations sidebar — collapse toggle + drag-resize
		const relSidebar = panel.querySelector( '.wte-dbg-relations-sidebar' );
		const relBody    = panel.querySelector( '.wte-dbg-relations-sidebar-body' );
		const relToggle  = panel.querySelector( '.wte-dbg-relations-toggle' );
		const relHandle  = panel.querySelector( '.wte-dbg-relations-resize-handle' );

		this._relSidebarBody = relBody || null;

		const REL_KEY   = 'wte_dbg_relations_collapsed';
		const REL_W_KEY = 'wte_dbg_relations_width_' + this.postType;

		try {
			if ( localStorage.getItem( REL_KEY ) === '1' ) {
				panel.classList.add( 'relations-collapsed' );
				if ( relToggle ) relToggle.textContent = '\u2039'; // ‹
				// Do NOT restore inline width when collapsed — CSS width:32px must win.
			} else {
				const savedW = localStorage.getItem( REL_W_KEY );
				if ( savedW && relSidebar ) relSidebar.style.width = savedW + 'px';
			}
		} catch ( e ) {}

		if ( relToggle ) {
			relToggle.addEventListener( 'click', () => {
				const collapsed = panel.classList.toggle( 'relations-collapsed' );
				relToggle.textContent = collapsed ? '\u2039' : '\u203a'; // ‹ / ›
				if ( collapsed ) {
					// Clear inline width so the CSS class rule (width: 32px) takes effect.
					relSidebar.style.width = '';
				} else {
					// Restore the user-resized width on expand.
					try {
						const savedW = localStorage.getItem( REL_W_KEY );
						if ( savedW ) relSidebar.style.width = savedW + 'px';
					} catch ( e ) {}
				}
				try { localStorage.setItem( REL_KEY, collapsed ? '1' : '0' ); } catch ( e ) {}
			} );
		}

		if ( relHandle && relSidebar ) {
			relHandle.addEventListener( 'mousedown', ( e ) => {
				e.preventDefault();
				const startX     = e.clientX;
				const startWidth = relSidebar.offsetWidth;
				relSidebar.style.transition = 'none';

				const onMove = ( ev ) => {
					const delta    = startX - ev.clientX;
					const newWidth = Math.min( 800, Math.max( 200, startWidth + delta ) );
					relSidebar.style.width = newWidth + 'px';
				};
				const onUp = () => {
					relSidebar.style.transition = '';
					try { localStorage.setItem( REL_W_KEY, parseInt( relSidebar.style.width, 10 ) ); } catch ( e ) {}
					document.removeEventListener( 'mousemove', onMove );
					document.removeEventListener( 'mouseup', onUp );
				};
				document.addEventListener( 'mousemove', onMove );
				document.addEventListener( 'mouseup', onUp );
			} );
		}

		this._initExportImportToolbar( panel, listEl );

		return this;
	}

	// -------------------------------------------------------------------------
	// Export / Import
	// -------------------------------------------------------------------------

	_initExportImportToolbar( panel, listEl ) {
		const selectBtn   = panel.querySelector( '.wte-dbg-ei-select-btn' );
		const cancelBtn   = panel.querySelector( '.wte-dbg-ei-cancel-btn' );
		const importBtn   = panel.querySelector( '.wte-dbg-ei-import-btn' );
		const fileInput   = panel.querySelector( '.wte-dbg-ei-file-input' );
		const selectAllCb = panel.querySelector( '.wte-dbg-ei-select-all-cb' );

		if ( ! selectBtn && ! importBtn ) return;

		if ( selectBtn ) {
			selectBtn.addEventListener( 'click', () => {
				if ( this._exportMode ) {
					this._doExport( panel );
				} else {
					this._enterExportMode( panel, listEl, selectAllCb );
				}
			} );
		}

		if ( cancelBtn ) {
			cancelBtn.addEventListener( 'click', () => this._exitExportMode( panel ) );
		}

		if ( importBtn && fileInput ) {
			importBtn.addEventListener( 'click', () => fileInput.click() );
			fileInput.addEventListener( 'change', () => {
				const file = fileInput.files && fileInput.files[0];
				if ( ! file ) return;
				this._readAndImport( file, panel );
				fileInput.value = '';
			} );
		}

		if ( selectAllCb ) {
			selectAllCb.addEventListener( 'change', () => {
				const checked = selectAllCb.checked;
				listEl.querySelectorAll( '.wte-dbg-ei-cb' ).forEach( ( cb ) => {
					cb.checked = checked;
					const postId = parseInt( cb.closest( '.wte-dbg-list-item' )?.dataset.postId, 10 );
					if ( postId ) {
						checked ? this._selectedIds.add( postId ) : this._selectedIds.delete( postId );
					}
				} );
				this._syncExportCount( panel );
			} );
		}
	}

	_enterExportMode( panel, listEl, selectAllCb ) {
		this._exportMode = true;
		this._selectedIds.clear();
		panel.classList.add( 'is-export-mode' );
		this._syncExportCount( panel );
		if ( selectAllCb ) selectAllCb.checked = false;

		// Attach checkbox change handlers to items already in the list.
		listEl.querySelectorAll( '.wte-dbg-ei-cb' ).forEach( ( cb ) => {
			this._attachCheckboxHandler( cb );
		} );
	}

	_exitExportMode( panel ) {
		this._exportMode = false;
		this._selectedIds.clear();
		panel.classList.remove( 'is-export-mode' );
		const selectAllCb = panel.querySelector( '.wte-dbg-ei-select-all-cb' );
		if ( selectAllCb ) selectAllCb.checked = false;
		panel.querySelectorAll( '.wte-dbg-ei-cb' ).forEach( ( cb ) => { cb.checked = false; } );
		this._syncExportCount( panel );
	}

	_syncExportCount( panel ) {
		const countEl = panel.querySelector( '.wte-dbg-ei-count' );
		if ( countEl ) countEl.textContent = this._selectedIds.size;
	}

	_attachCheckboxHandler( cb ) {
		if ( cb.dataset.handlerAttached ) return;
		cb.dataset.handlerAttached = '1';
		cb.addEventListener( 'change', () => {
			const postId = parseInt( cb.closest( '.wte-dbg-list-item' )?.dataset.postId, 10 );
			if ( ! postId ) return;
			cb.checked ? this._selectedIds.add( postId ) : this._selectedIds.delete( postId );
			const panel = this.contentEl.querySelector( '.wte-dbg-master-detail' );
			if ( panel ) this._syncExportCount( panel );
		} );
	}

	_doExport( panel ) {
		if ( this._selectedIds.size === 0 ) {
			DomHelper.setStatus( 'Select at least one trip to export.', 'error', 3 );
			return;
		}

		DomHelper.setStatus( 'Exporting\u2026', 'loading' );

		const body = new URLSearchParams( {
			action:      'wpte_devzone_export_trips',
			ids:         Array.from( this._selectedIds ).join( ',' ),
			_ajax_nonce: nonce,
		} );

		fetch( ajaxurl, { method: 'POST', body } )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				if ( ! res.success ) {
					DomHelper.setStatus( 'Export failed: ' + ( res.data?.message || 'Unknown error' ), 'error', 5 );
					return;
				}

				const json     = JSON.stringify( res.data, null, 2 );
				const blob     = new Blob( [ json ], { type: 'application/json' } );
				const url      = URL.createObjectURL( blob );
				const a        = document.createElement( 'a' );
				const date     = new Date().toISOString().slice( 0, 10 );
				a.href         = url;
				a.download     = `wte-trips-export-${date}.json`;
				a.style.display = 'none';
				document.body.appendChild( a );
				a.click();
				document.body.removeChild( a );
				URL.revokeObjectURL( url );

				DomHelper.setStatus(
					res.data.trips.length + ' trip(s) exported.',
					'success',
					4
				);
				this._exitExportMode( panel );
			} )
			.catch( () => {
				DomHelper.setStatus( 'Export request failed.', 'error', 5 );
			} );
	}

	_readAndImport( file, panel ) {
		const reader = new FileReader();
		reader.onload = ( e ) => {
			const json = e.target.result;
			let data;
			try {
				data = JSON.parse( json );
			} catch ( err ) {
				DomHelper.setStatus( 'Invalid JSON file.', 'error', 5 );
				return;
			}
			this._sendImport( json, panel );
		};
		reader.readAsText( file );
	}

	_sendImport( jsonString, panel ) {
		DomHelper.setStatus( 'Importing\u2026', 'loading' );

		const body = new URLSearchParams( {
			action:      'wpte_devzone_import_trips',
			data:        jsonString,
			_ajax_nonce: nonce,
		} );

		fetch( ajaxurl, { method: 'POST', body } )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				if ( ! res.success ) {
					DomHelper.setStatus( 'Import failed: ' + ( res.data?.message || 'Unknown error' ), 'error', 6 );
					return;
				}
				DomHelper.setStatus( res.data.message, 'success', 6 );
				if ( res.data.created.length > 0 && this._reloadList ) {
					this._reloadList();
				}
			} )
			.catch( () => {
				DomHelper.setStatus( 'Import request failed.', 'error', 5 );
			} );
	}

	destroy() {
		const hasActive = this._listController || this._inspectorController || this._relationsController;
		if ( hasActive ) {
			DomHelper.setStatus( 'Cancelled \u2014 ' + this.postType, 'cancelled' );
			this._listController?.abort();
			this._inspectorController?.abort();
			this._relationsController?.abort();
			this._listController       = null;
			this._inspectorController  = null;
			this._relationsController  = null;
		}
	}

	_loadList( search, page, listEl, paginEl, panel, inspector ) {
		this._listController?.abort();
		this._listController = new AbortController();
		const { signal: listSignal } = this._listController;

		this._currentSearch = search;
		this._currentPage   = page;

		DomHelper.setTextContent( listEl, '' );
		DomHelper.appendShimmer( listEl, 6, 'Loading ' + this.postType + ' list\u2026' );

		const pinnedIds = this._getPinnedIds();

		const params = new URLSearchParams( {
			action:      'wpte_devzone_list_posts',
			post_type:   this.postType,
			search:      search || '',
			paged:       page,
			pinned_ids:  pinnedIds.join( ',' ),
			_ajax_nonce: nonce,
		} );

		const addItemListener = ( item ) => {
			item.addEventListener( 'click', ( e ) => {
				// Let the checkbox handle its own state; don't open the inspector.
				if ( e.target.closest( '.wte-dbg-ei-cb' ) ) return;

				if ( this._exportMode ) {
					// In export mode, clicking an item toggles its checkbox.
					const cb = item.querySelector( '.wte-dbg-ei-cb' );
					if ( cb ) {
						cb.checked = ! cb.checked;
						cb.dispatchEvent( new Event( 'change' ) );
					}
					return;
				}

				listEl.querySelectorAll( '.wte-dbg-list-item' ).forEach( ( i ) => i.classList.remove( 'is-active' ) );
				item.classList.add( 'is-active' );
				this._loadInspector( parseInt( item.dataset.postId, 10 ), inspector );
			} );
		};

		fetch( ajaxurl + '?' + params, { signal: listSignal } )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				DomHelper.setTextContent( listEl, '' );
				DomHelper.clearStatus();

				if ( ! res.success ) {
					listEl.appendChild( DomHelper.makePara( 'wte-dbg-empty', 'Error: ' + ( res.data && res.data.message ? res.data.message : 'Unknown' ) ) );
					return;
				}

				const pinned     = res.data.pinned || [];
				const pinnedIds  = new Set( pinned.map( ( p ) => p.id ) );
				const posts      = ( res.data.posts || [] ).filter( ( p ) => ! pinnedIds.has( p.id ) );
				const total      = res.data.total;
				const totalPages = res.data.total_pages;

				const countEl = panel.querySelector( '.wte-dbg-list-count' );
				if ( countEl ) countEl.textContent = '(' + ( total + pinned.length ) + ')';

				if ( ! posts.length && ! pinned.length ) {
					listEl.appendChild( DomHelper.makePara( 'wte-dbg-empty', 'No records found.' ) );
				} else {
					pinned.forEach( ( p ) => {
						const item = this._buildListItem( p, true );
						addItemListener( item );
						listEl.appendChild( item );
					} );

					if ( pinned.length && posts.length ) {
						const sep = document.createElement( 'div' );
						sep.className = 'wte-dbg-list-pin-separator';
						listEl.appendChild( sep );
					}

					posts.forEach( ( p ) => {
						const item = this._buildListItem( p, false );
						addItemListener( item );
						listEl.appendChild( item );
					} );

					if ( this.initialPostId ) {
						const target = listEl.querySelector( `.wte-dbg-list-item[data-post-id="${this.initialPostId}"]` );
						if ( target ) {
							target.click();
						} else {
							this._loadInspector( this.initialPostId, inspector );
						}
						this.initialPostId = null;
					} else {
						listEl.querySelector( '.wte-dbg-list-item' )?.click();
					}
				}

				DomHelper.buildPagination( paginEl, page, totalPages, ( newPage ) => {
					this._loadList( search, newPage, listEl, paginEl, panel, inspector );
				} );
			} )
			.catch( ( e ) => {
				if ( e.name === 'AbortError' ) {
					DomHelper.setStatus( 'Cancelled \u2014 ' + this.postType + ' list', 'cancelled' );
					return;
				}
				DomHelper.setTextContent( listEl, '' );
				DomHelper.clearStatus();
				listEl.appendChild( DomHelper.makePara( 'wte-dbg-empty', 'Request failed.' ) );
			} );
	}

	_buildListItem( post, isPinned = false ) {
		const item = document.createElement( 'div' );
		item.className = 'wte-dbg-list-item' + ( isPinned ? ' is-pinned' : '' );
		item.dataset.postId = post.id;

		// Export checkbox — always present, visible only in export mode (via CSS).
		const cb = document.createElement( 'input' );
		cb.type      = 'checkbox';
		cb.className = 'wte-dbg-ei-cb';
		cb.setAttribute( 'aria-label', 'Select ' + post.title );
		cb.checked   = this._selectedIds.has( post.id );
		this._attachCheckboxHandler( cb );
		item.appendChild( cb );

		const content = document.createElement( 'div' );
		content.className = 'wte-dbg-list-item-content';

		const title = document.createElement( 'span' );
		title.className = 'wte-dbg-list-item-title';
		title.textContent = post.title;

		const meta = document.createElement( 'span' );
		meta.className = 'wte-dbg-list-item-meta';

		const badge = document.createElement( 'span' );
		badge.className = 'wte-dbg-status wte-dbg-status-' + post.status;
		badge.textContent = post.status;

		const date   = post.date ? post.date.split( ' ' )[ 0 ] : '';
		const idSpan = document.createTextNode( '\u00a0 ID:' + post.id + '\u00a0\u00a0' + date );

		meta.appendChild( badge );
		meta.appendChild( idSpan );
		content.appendChild( title );
		content.appendChild( meta );

		const pinBtn = document.createElement( 'button' );
		pinBtn.className = 'wte-dbg-pin-btn';
		pinBtn.title = isPinned ? 'Unpin' : 'Pin to top';
		pinBtn.setAttribute( 'aria-label', isPinned ? 'Unpin' : 'Pin to top' );
		pinBtn.appendChild( makePinIcon( isPinned ) );
		pinBtn.addEventListener( 'click', ( e ) => {
			e.stopPropagation();
			const ids = this._getPinnedIds();
			if ( isPinned ) {
				this._setPinnedIds( ids.filter( ( id ) => id !== post.id ) );
			} else {
				this._setPinnedIds( [ post.id, ...ids ] );
			}
			this._reloadList();
		} );

		item.appendChild( content );
		item.appendChild( pinBtn );

		return item;
	}

	_getPinnedIds() {
		try { return JSON.parse( localStorage.getItem( 'wte_dbg_pins_' + this.postType ) || '[]' ); }
		catch ( e ) { return []; }
	}

	_setPinnedIds( ids ) {
		try { localStorage.setItem( 'wte_dbg_pins_' + this.postType, JSON.stringify( ids ) ); }
		catch ( e ) {}
	}

	_loadInspector( postId, inspector ) {
		this._inspectorController?.abort();
		this._inspectorController = new AbortController();
		const { signal: inspectorSignal } = this._inspectorController;

		this.currentPostId = postId;

		DomHelper.setTextContent( inspector, '' );
		DomHelper.appendShimmer( inspector, 4, 'Loading inspector\u2026' );

		if ( this._relSidebarBody ) {
			DomHelper.setTextContent( this._relSidebarBody, '' );
			this._relSidebarBody.appendChild( DomHelper.buildRelationSkeleton() );
		}

		const params = new URLSearchParams( {
			action:      'wpte_devzone_get_post',
			post_id:     postId,
			_ajax_nonce: nonce,
		} );

		fetch( ajaxurl + '?' + params, { signal: inspectorSignal } )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				DomHelper.setTextContent( inspector, '' );
				DomHelper.clearStatus();

				if ( ! res.success ) {
					const err = document.createElement( 'div' );
					err.className = 'wte-dbg-error-notice';
					err.textContent = 'Error: ' + ( res.data && res.data.message ? res.data.message : 'Unknown' );
					inspector.appendChild( err );
					return;
				}
				this._renderInspector( res.data, inspector );
			} )
			.catch( ( e ) => {
				if ( e.name === 'AbortError' ) {
					DomHelper.setStatus( 'Cancelled \u2014 ' + this.postType + ' inspector', 'cancelled' );
					return;
				}
				DomHelper.setTextContent( inspector, '' );
				DomHelper.clearStatus();
				const errEl = document.createElement( 'div' );
				errEl.className = 'wte-dbg-error-notice';
				errEl.textContent = 'Request failed.';
				inspector.appendChild( errEl );
			} );
	}

	_renderInspector( data, inspector ) {
		const post       = data.post;
		const meta       = data.meta;
		const taxonomies = data.taxonomies;

		// Header
		const header = document.createElement( 'div' );
		header.className = 'wte-dbg-inspector-header';

		const titleEl = document.createElement( 'div' );
		titleEl.className = 'wte-dbg-inspector-title';
		titleEl.textContent = post.post_title || '#' + post.ID;

		const subEl = document.createElement( 'div' );
		subEl.className = 'wte-dbg-inspector-subtitle';
		subEl.textContent = 'ID: ' + post.ID + ' \u2022 Type: ' + post.post_type;

		header.appendChild( titleEl );
		header.appendChild( subEl );
		inspector.appendChild( header );

		// Body
		const body = document.createElement( 'div' );
		body.className = 'wte-dbg-inspector-body';

		body.appendChild( this._buildInspectorSection( 'Post Fields', this._buildPostFieldsDOM( post ) ) );
		body.appendChild( this._buildInspectorSection( 'Meta', this._buildMetaTreeDOM( meta ) ) );
		body.appendChild( this._buildInspectorSection( 'Taxonomies', this._buildTaxonomiesDOM( taxonomies ) ) );

		DomHelper.setupValueClicks( body );
		inspector.appendChild( body );

		this._loadRelations( post.ID );
	}

	_buildInspectorSection( title, contentNode ) {
		const section = document.createElement( 'div' );
		section.className = 'wte-dbg-section';

		const hdr = document.createElement( 'div' );
		hdr.className = 'wte-dbg-section-header';
		hdr.textContent = title;

		const bodyDiv = document.createElement( 'div' );
		bodyDiv.className = 'wte-dbg-section-body';
		bodyDiv.appendChild( contentNode );

		section.appendChild( hdr );
		section.appendChild( bodyDiv );
		return section;
	}

	_buildPostFieldsDOM( post ) {
		const wrap = document.createElement( 'div' );

		// Status dropdown
		const statuses  = [ 'publish', 'pending', 'draft', 'private', 'trash', 'booked', 'completed', 'cancelled' ];
		const statusRow = DomHelper.buildRow();
		statusRow.classList.add( 'wte-dbg-post-field' );
		statusRow.dataset.postId = post.ID;
		statusRow.dataset.field  = 'post_status';

		// Wrapper provides the visual pill; the invisible select sits on top for native events
		const selWrap = document.createElement( 'div' );
		selWrap.className    = 'wte-dbg-status-select-wrap';
		selWrap.dataset.status = post.post_status;

		const display = document.createElement( 'span' );
		display.className   = 'wte-dbg-status-display';
		display.textContent = post.post_status;

		const sel = document.createElement( 'select' );
		sel.className = 'wte-dbg-status-select';
		statuses.forEach( ( s ) => {
			const opt = document.createElement( 'option' );
			opt.value = s;
			opt.textContent = s;
			if ( post.post_status === s ) opt.selected = true;
			sel.appendChild( opt );
		} );
		sel.addEventListener( 'change', () => {
			selWrap.dataset.status  = sel.value;
			display.textContent     = sel.value;
		} );

		selWrap.appendChild( display );
		selWrap.appendChild( sel );
		statusRow.appendChild( DomHelper.makeKeySpan( 'post_status' ) );
		statusRow.appendChild( selWrap );
		wrap.appendChild( statusRow );

		// Title (editable)
		const titleRow = DomHelper.buildRow();
		titleRow.dataset.postId = post.ID;
		titleRow.dataset.field  = 'post_title';
		titleRow.appendChild( DomHelper.makeKeySpan( 'post_title' ) );
		titleRow.appendChild( DomHelper.makeValueSpan( post.post_title || '' ) );
		titleRow.appendChild( DomHelper.makeEditBtn() );
		wrap.appendChild( titleRow );

		// Date (read-only)
		const dateRow = DomHelper.buildRow();
		dateRow.appendChild( DomHelper.makeKeySpan( 'post_date' ) );
		dateRow.appendChild( DomHelper.makeValueSpan( post.post_date || '' ) );
		wrap.appendChild( dateRow );

		return wrap;
	}

	_buildTaxonomiesDOM( taxonomies ) {
		const wrap = document.createElement( 'div' );
		let hasAny = false;

		for ( const [ tax, terms ] of Object.entries( taxonomies ) ) {
			if ( ! terms.length ) continue;
			hasAny = true;

			const rowDiv = document.createElement( 'div' );
			rowDiv.style.cssText = 'padding:4px 20px;display:flex;align-items:flex-start;gap:8px;';

			const keySpan = DomHelper.makeKeySpan( tax );
			keySpan.style.cssText = 'min-width:120px;flex-shrink:0;padding-top:2px;';
			rowDiv.appendChild( keySpan );

			const termsWrap = document.createElement( 'span' );
			termsWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;flex:1;';
			terms.forEach( ( t ) => {
				const badge = document.createElement( 'span' );
				badge.className = 'wte-dbg-tax-term';
				badge.textContent = t;
				termsWrap.appendChild( badge );
			} );

			rowDiv.appendChild( termsWrap );
			wrap.appendChild( rowDiv );
		}

		if ( ! hasAny ) {
			wrap.appendChild( DomHelper.makePara( 'wte-dbg-tax-empty', 'No taxonomy terms.' ) );
		}

		return wrap;
	}

	_buildMetaTreeDOM( meta ) {
		const wrap = document.createElement( 'div' );
		wrap.className = 'wte-dbg-meta-tree';

		if ( ! meta || ! Object.keys( meta ).length ) {
			wrap.appendChild( DomHelper.makePara( 'wte-dbg-empty', 'No meta found.' ) );
			return wrap;
		}

		const keys = Object.keys( meta ).sort( ( a, b ) => {
			if ( a === 'wp_travel_engine_setting' ) return -1;
			if ( b === 'wp_travel_engine_setting' ) return 1;
			return a.localeCompare( b );
		} );

		keys.forEach( ( key ) => {
			wrap.appendChild( this._buildMetaNodeDOM( key, meta[ key ], '' ) );
		} );

		DomHelper.applyRowStripes( wrap );
		return wrap;
	}

	_loadRelations( postId ) {
		this._relationsController?.abort();
		this._relationsController = new AbortController();
		const { signal } = this._relationsController;

		const sidebarBody = this._relSidebarBody;
		if ( ! sidebarBody ) return;

		DomHelper.setStatus( 'Loading relations\u2026', 'info' );

		const params = new URLSearchParams( {
			action:      'wpte_devzone_get_relations',
			post_id:     postId,
			post_type:   this.postType,
			_ajax_nonce: nonce,
		} );

		fetch( ajaxurl + '?' + params, { signal } )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				DomHelper.setTextContent( sidebarBody, '' );
				DomHelper.clearStatus();
				if ( ! res.success ) {
					const errEl = document.createElement( 'div' );
				errEl.className = 'wte-dbg-relation-empty';
				errEl.textContent = 'Error: ' + ( res.data?.message || 'Unknown' );
				sidebarBody.appendChild( errEl );
					return;
				}
				sidebarBody.appendChild( this._buildRelationsDOM( res.data.relations, postId ) );
			} )
			.catch( ( e ) => {
				if ( e.name === 'AbortError' ) {
					DomHelper.setStatus( 'Cancelled \u2014 relations', 'cancelled' );
					return;
				}
				DomHelper.setTextContent( sidebarBody, '' );
				DomHelper.clearStatus();
				const failEl = document.createElement( 'div' );
				failEl.className = 'wte-dbg-relation-empty';
				failEl.textContent = 'Request failed.';
				sidebarBody.appendChild( failEl );
			} );
	}

	_loadRelationPage( postId, group, page ) {
		this._relationsController?.abort();
		this._relationsController = new AbortController();
		const { signal } = this._relationsController;

		const sidebarBody = this._relSidebarBody;
		if ( ! sidebarBody ) return;

		const existingGroup = sidebarBody.querySelector( `.wte-dbg-relation-group[data-group="${ group }"]` );
		if ( existingGroup ) {
			const listEl = existingGroup.querySelector( '.wte-dbg-relation-list' );
			if ( listEl ) {
				DomHelper.setTextContent( listEl, '' );
				DomHelper.appendShimmer( listEl, 3 );
			}
		}

		DomHelper.setStatus( 'Loading page ' + page + '\u2026', 'info' );

		const params = new URLSearchParams( {
			action:      'wpte_devzone_get_relations',
			post_id:     postId,
			post_type:   this.postType,
			group,
			page,
			_ajax_nonce: nonce,
		} );

		fetch( ajaxurl + '?' + params, { signal } )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				DomHelper.clearStatus();
				if ( ! res.success || ! res.data.relations[ group ] ) return;
				const newGroupEl = this._buildRelationGroup( group, res.data.relations[ group ], postId );
				existingGroup ? existingGroup.replaceWith( newGroupEl ) : sidebarBody.appendChild( newGroupEl );
			} )
			.catch( ( e ) => {
				if ( e.name === 'AbortError' ) {
					DomHelper.setStatus( 'Cancelled \u2014 relations', 'cancelled' );
					return;
				}
				DomHelper.clearStatus();
			} );
	}

	_buildRelationsDOM( relations, postId ) {
		const wrap = document.createElement( 'div' );
		let hasAny = false;

		for ( const [ key, groupData ] of Object.entries( relations ) ) {
			if ( ! groupData || ! Array.isArray( groupData.items ) ) continue;
			hasAny = true;
			wrap.appendChild( this._buildRelationGroup( key, groupData, postId ) );
		}

		if ( ! hasAny ) {
			const empty = document.createElement( 'div' );
			empty.className = 'wte-dbg-relation-empty';
			empty.textContent = 'No related records found.';
			wrap.appendChild( empty );
		}

		return wrap;
	}

	_buildRelationGroup( key, groupData, postId ) {
		const { items, total, total_pages, page } = groupData;

		const group = document.createElement( 'div' );
		group.className = 'wte-dbg-relation-group';
		group.dataset.group = key;

		const header = document.createElement( 'div' );
		header.className = 'wte-dbg-relation-header';

		const label = document.createElement( 'span' );
		label.className = 'wte-dbg-relation-label';
		const defaults  = RELATION_LABELS[ key ] || {};
		const singular  = groupData.label        || defaults.singular || key;
		const plural    = groupData.label_plural  || defaults.plural   || singular;
		label.textContent = total === 1 ? singular : plural;

		const count = document.createElement( 'span' );
		count.className = 'wte-dbg-relation-count';
		count.textContent = total;

		header.appendChild( label );
		header.appendChild( count );

		// Pagination controls — rendered inside the header as its last child
		if ( total_pages > 1 ) {
			const pagEl = document.createElement( 'div' );
			pagEl.className = 'wte-dbg-relation-pagination';

			const prevBtn = document.createElement( 'button' );
			prevBtn.className = 'wte-dbg-rel-page-btn';
			prevBtn.textContent = '\u2039'; // ‹
			prevBtn.disabled = page <= 1;
			prevBtn.addEventListener( 'click', () => this._loadRelationPage( postId, key, page - 1 ) );

			const info = document.createElement( 'span' );
			info.className = 'wte-dbg-rel-page-info';
			info.textContent = page + '\u00a0/\u00a0' + total_pages;

			const nextBtn = document.createElement( 'button' );
			nextBtn.className = 'wte-dbg-rel-page-btn';
			nextBtn.textContent = '\u203a'; // ›
			nextBtn.disabled = page >= total_pages;
			nextBtn.addEventListener( 'click', () => this._loadRelationPage( postId, key, page + 1 ) );

			pagEl.appendChild( prevBtn );
			pagEl.appendChild( info );
			pagEl.appendChild( nextBtn );
			header.appendChild( pagEl );
		}

		group.appendChild( header );

		// Filter input for larger lists (filters within current page)
		let filterInput = null;
		if ( items.length > 4 ) {
			filterInput = document.createElement( 'input' );
			filterInput.type = 'text';
			filterInput.className = 'wte-dbg-relation-filter wte-dbg-search-input';
			filterInput.placeholder = 'Filter\u2026';
			group.appendChild( filterInput );
		}

		const list = document.createElement( 'div' );
		list.className = 'wte-dbg-relation-list';

		if ( items.length === 0 ) {
			const empty = document.createElement( 'div' );
			empty.className = 'wte-dbg-relation-empty';
			empty.textContent = 'None.';
			list.appendChild( empty );
		} else {
			items.forEach( ( item ) => {
				list.appendChild( this._buildRelationItem( item ) );
			} );
		}

		group.appendChild( list );

		// Wire up filter
		if ( filterInput ) {
			filterInput.addEventListener( 'input', () => {
				const q = filterInput.value.toLowerCase();
				list.querySelectorAll( '.wte-dbg-relation-item' ).forEach( ( el ) => {
					const title = el.querySelector( '.wte-dbg-relation-item-title' )?.textContent.toLowerCase() || '';
					el.style.display = title.includes( q ) ? '' : 'none';
				} );
			} );
		}

		return group;
	}

	_buildRelationItem( item ) {
		const tab  = POST_TYPE_TO_TAB[ item.post_type ];
		const href = tab
			? ajaxurl.replace( /\/admin-ajax\.php(\?.*)?$/, '/tools.php' )
				+ '?page=wptravelengine-devzone&tab=' + tab + '&post_id=' + item.id
			: '#';

		const el = document.createElement( 'a' );
		el.className  = 'wte-dbg-relation-item';
		el.href       = href;
		el.target     = '_blank';
		el.rel        = 'noopener';
		el.tabIndex   = 0;

		const titleSpan = document.createElement( 'span' );
		titleSpan.className = 'wte-dbg-relation-item-title';
		titleSpan.textContent = item.title;

		const metaSpan = document.createElement( 'span' );
		metaSpan.className = 'wte-dbg-relation-item-meta';

		const badge = document.createElement( 'span' );
		badge.className = 'wte-dbg-status wte-dbg-status-' + item.status;
		badge.textContent = item.status;

		const idText = document.createTextNode( '\u00a0#' + item.id );
		metaSpan.appendChild( badge );
		metaSpan.appendChild( idText );

		el.appendChild( titleSpan );
		el.appendChild( metaSpan );

		// Regular click → SPA navigation (stay in current tab); middle/Ctrl/Meta → new tab via href.
		el.addEventListener( 'click', ( e ) => {
			if ( e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1 ) return;
			e.preventDefault();
			if ( tab && this._onNavigate ) {
				this._onNavigate( tab, item.id );
			}
		} );

		el.addEventListener( 'keydown', ( e ) => {
			if ( e.key === 'Enter' ) {
				e.preventDefault();
				if ( tab && this._onNavigate ) this._onNavigate( tab, item.id );
			}
		} );

		return el;
	}

	_buildMetaNodeDOM( key, value, parentPath ) {
		const path = parentPath ? parentPath + '.' + key : key;

		if ( value !== null && typeof value === 'object' ) {
			const details = document.createElement( 'details' );
			details.className = 'wte-dbg-node';

			const summary = document.createElement( 'summary' );
			summary.className = 'wte-dbg-key';

			const keyText   = document.createTextNode( key + '\u00a0' );
			const countSpan = document.createElement( 'span' );
			countSpan.className = 'wte-dbg-count';
			const entries = Object.entries( value );
			countSpan.textContent = '[' + entries.length + ' item' + ( entries.length !== 1 ? 's' : '' ) + ']';

			summary.appendChild( keyText );
			summary.appendChild( countSpan );
			details.appendChild( summary );

			const children = document.createElement( 'div' );
			children.className = 'wte-dbg-children';
			entries.forEach( ( [ k, v ] ) => {
				children.appendChild( this._buildMetaNodeDOM( k, v, path ) );
			} );
			details.appendChild( children );

			return details;
		}

		// Scalar leaf
		const raw     = ( value === null || value === undefined ) ? '' : String( value );
		const row     = DomHelper.buildRow();
		row.dataset.metaKey = key;
		row.dataset.path    = path;
		const valSpan = DomHelper.makeValueSpan( raw );
		valSpan.dataset.type = value === null             ? 'null'
		                     : typeof value === 'boolean' ? 'boolean'
		                     : typeof value === 'number'  ? 'number'
		                     : 'string';
		row.appendChild( DomHelper.makeKeySpan( key ) );
		row.appendChild( valSpan );
		row.appendChild( DomHelper.makeEditBtn() );

		return row;
	}
}
