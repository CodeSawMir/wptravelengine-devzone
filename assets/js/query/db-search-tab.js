import { Dom }        from './dom.js';
import { Beautifier } from './beautifier.js';
import { DomHelper }  from '../dom-helper.js';

export class DbSearchTab {
	// AbortControllers for cancelling in-flight requests.
	static _fetchTablesCtrl    = null;
	static _loadTableCtrl      = null;
	static _runQueryCtrl       = null;
	static _executeActionCtrl  = null;

	constructor( wrap, { ajaxurl, nonce } ) {
		this.wrap             = wrap;
		this.ajaxurl          = ajaxurl;
		this.nonce            = nonce;
		this._selectedRow     = null;
		this._actionSection   = null;
		this._actionIndicator = null;
		this._insertBtn       = null;
		this._actionExecBtn   = null;
		this._actionType        = 'update';
		this._actionTabs        = null;
		this._actionToggleIcon  = null;
		this._addSection        = null;
		this._updateSection     = null;
		this._insertLabelSep    = null;
		this._actionLabelSep    = null;
		this._pendingRestore    = null;
	}

	init() {
		const wrap = this.wrap;

		// Cancel any fetches still in flight from a previous tab visit so their
		// callbacks cannot interfere with the freshly-rendered DOM.
		DbSearchTab._fetchTablesCtrl?.abort();
		DbSearchTab._loadTableCtrl?.abort();
		DbSearchTab._runQueryCtrl?.abort();
		DbSearchTab._executeActionCtrl?.abort();

		this._initTablesSidebar();
		this._initTableFilter();
		this.fetchTables();

		new Beautifier( wrap, { ajaxurl: this.ajaxurl, nonce: this.nonce } ).init();
	}

	_initTablesSidebar() {
		const wrap           = this.wrap;
		const sidebarToggle  = wrap.querySelector( '.wte-dbg-db-tables-header .wte-dbg-sidebar-toggle' );
		const DB_SIDEBAR_KEY = 'wte_dbg_query_sidebar_collapsed';

		// Always start expanded when the query tab loads.
		wrap.classList.remove( 'sidebar-collapsed' );
		if ( sidebarToggle ) sidebarToggle.textContent = '\u2039'; // ‹
		try { localStorage.setItem( DB_SIDEBAR_KEY, '0' ); } catch ( e ) {}

		if ( sidebarToggle ) {
			sidebarToggle.addEventListener( 'click', () => {
				const collapsed = wrap.classList.toggle( 'sidebar-collapsed' );
				sidebarToggle.textContent = collapsed ? '\u203a' : '\u2039'; // › / ‹
				try { localStorage.setItem( DB_SIDEBAR_KEY, collapsed ? '1' : '0' ); } catch ( e ) {}
			} );
		}
	}

	_initTableFilter() {
		const wrap        = this.wrap;
		const tablesList  = wrap.querySelector( '.wte-dbg-db-tables-list' );
		const tableFilter = wrap.querySelector( '.wte-dbg-db-tables-filter' );

		// Filter the table list client-side (hide group headers with no visible items)
		if ( tableFilter ) {
			tableFilter.addEventListener( 'input', () => {
				const q = tableFilter.value.toLowerCase();
				tablesList.querySelectorAll( '.wte-dbg-table-item' ).forEach( ( item ) => {
					item.style.display = ( ! q || item.dataset.table.includes( q ) ) ? '' : 'none';
				} );
				// Hide a group header if all its following items are hidden
				tablesList.querySelectorAll( '.wte-dbg-table-group-hdr' ).forEach( ( hdr ) => {
					let next = hdr.nextElementSibling;
					let hasVisible = false;
					while ( next && ! next.classList.contains( 'wte-dbg-table-group-hdr' ) ) {
						if ( next.style.display !== 'none' ) hasVisible = true;
						next = next.nextElementSibling;
					}
					hdr.style.display = hasVisible ? '' : 'none';
				} );
			} );
		}
	}

	fetchTables() {
		const wrap       = this.wrap;
		const tablesList = wrap.querySelector( '.wte-dbg-db-tables-list' );

		DbSearchTab._fetchTablesCtrl?.abort();
		DbSearchTab._fetchTablesCtrl = new AbortController();

		Dom.setTextContent( tablesList, '' );
		Dom.appendShimmer( tablesList, 8, 'Loading tables\u2026' );

		const params = new URLSearchParams( {
			action:      'wpte_devzone_db_tables',
			_ajax_nonce: this.nonce,
		} );

		fetch( this.ajaxurl + '?' + params, { signal: DbSearchTab._fetchTablesCtrl.signal } )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				Dom.setTextContent( tablesList, '' );
				window.wteDbgClearStatus?.();
				if ( ! res.success ) {
					tablesList.appendChild( Dom.makePara( 'wte-dbg-empty', 'Error loading tables.' ) );
					return;
				}
				const groupLabels = { wte: 'WP Travel Engine', wp: 'WordPress', other: 'Other' };
				let   currentGroup = null;

				res.data.tables.forEach( ( t ) => {
					if ( t.group !== currentGroup ) {
						currentGroup = t.group;
						const hdr = document.createElement( 'div' );
						hdr.className   = 'wte-dbg-table-group-hdr';
						hdr.textContent = groupLabels[ t.group ] || t.group;
						tablesList.appendChild( hdr );
					}

					const item = document.createElement( 'div' );
					item.className    = 'wte-dbg-table-item';
					item.dataset.table = t.name;

					const nameSpan = document.createElement( 'span' );
					nameSpan.className   = 'wte-dbg-table-name';
					nameSpan.textContent = t.name;

					const countSpan = document.createElement( 'span' );
					countSpan.className   = 'wte-dbg-table-rows';
					countSpan.textContent = t.rows.toLocaleString();

					item.appendChild( nameSpan );
					item.appendChild( countSpan );

					item.addEventListener( 'click', () => {
						tablesList.querySelectorAll( '.wte-dbg-table-item' ).forEach( ( i ) => i.classList.remove( 'is-active' ) );
						item.classList.add( 'is-active' );
						this.loadTable( t.name, t.group );
					} );

					tablesList.appendChild( item );
				} );
				const saved     = this._loadQueryState();
				this._pendingRestore = saved;
				const savedItem = saved.table
					? tablesList.querySelector( '.wte-dbg-table-item[data-table="' + CSS.escape( saved.table ) + '"]' )
					: null;
				if ( savedItem ) {
					savedItem.click();
				} else {
					this._pendingRestore = null;
					tablesList.querySelector( '.wte-dbg-table-item' )?.click();
				}
			} )
			.catch( ( e ) => {
				if ( e.name === 'AbortError' ) return;
				Dom.setTextContent( tablesList, '' );
				window.wteDbgClearStatus?.();
				tablesList.appendChild( Dom.makePara( 'wte-dbg-empty', 'Request failed.' ) );
			} );
	}

	loadTable( tableName, group = 'other' ) {
		const wrap       = this.wrap;
		const queryPanel = wrap.querySelector( '.wte-dbg-db-query-panel' );

		DbSearchTab._loadTableCtrl?.abort();
		DbSearchTab._loadTableCtrl = new AbortController();

		Dom.setTextContent( queryPanel, '' );
		Dom.appendShimmer( queryPanel, 5, 'Loading columns\u2026' );

		const params = new URLSearchParams( {
			action:      'wpte_devzone_db_columns',
			table:       tableName,
			_ajax_nonce: this.nonce,
		} );

		fetch( this.ajaxurl + '?' + params, { signal: DbSearchTab._loadTableCtrl.signal } )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				Dom.setTextContent( queryPanel, '' );
				window.wteDbgClearStatus?.();
				if ( ! res.success ) {
					queryPanel.appendChild( Dom.makePara( 'wte-dbg-empty', 'Error loading columns.' ) );
					return;
				}
				const columns = res.data.columns.map( ( c ) => c.Field );
				this.renderQueryBuilder( tableName, columns, group );
			} )
			.catch( ( e ) => {
				if ( e.name === 'AbortError' ) {
					window.wteDbgSetStatus?.( 'Cancelled \u2014 ' + tableName + ' columns', 'cancelled', 2 );
					return;
				}
				Dom.setTextContent( queryPanel, '' );
				window.wteDbgClearStatus?.();
				queryPanel.appendChild( Dom.makePara( 'wte-dbg-empty', 'Request failed.' ) );
			} );
	}

	renderQueryBuilder( tableName, columns, group = 'other' ) {
		const wrap       = this.wrap;
		const queryPanel = wrap.querySelector( '.wte-dbg-db-query-panel' );

		const builder = document.createElement( 'div' );
		builder.className = 'wte-dbg-query-builder';

		// Header
		const header = document.createElement( 'div' );
		header.className = 'wte-dbg-query-header';

		const titleSpan = document.createElement( 'span' );
		titleSpan.className   = 'wte-dbg-query-title';
		titleSpan.textContent = tableName;
		header.appendChild( titleSpan );

		const colsSpan = document.createElement( 'span' );
		colsSpan.className   = 'wte-dbg-query-cols-hint';
		colsSpan.textContent = columns.length + ' columns';
		header.appendChild( colsSpan );

		// "Delete All Rows" — only for WTE tables.
		if ( group === 'wte' ) {
			const truncateBtn = document.createElement( 'button' );
			truncateBtn.type        = 'button';
			truncateBtn.className   = 'wte-dbg-truncate-btn';
			truncateBtn.textContent = 'Delete All Rows';

			truncateBtn.addEventListener( 'click', () => {
				if ( ! window.confirm( 'Delete ALL rows from ' + tableName + '?\n\nThis cannot be undone.' ) ) {
					return;
				}

				truncateBtn.disabled    = true;
				truncateBtn.textContent = 'Deleting\u2026';

				fetch( this.ajaxurl, {
					method: 'POST',
					body:   new URLSearchParams( {
						action:      'wpte_devzone_db_truncate',
						_ajax_nonce: this.nonce,
						table:       tableName,
					} ),
				} )
					.then( ( r ) => r.json() )
					.then( ( res ) => {
						truncateBtn.disabled    = false;
						truncateBtn.textContent = 'Delete All Rows';
						if ( res.success ) {
							window.wteDbgSetStatus?.( res.data.message, 'success', 4 );
							this.loadTable( tableName, group );
						} else {
							window.wteDbgSetStatus?.( res.data?.message || 'Truncate failed.', 'error', 4 );
						}
					} )
					.catch( () => {
						truncateBtn.disabled    = false;
						truncateBtn.textContent = 'Delete All Rows';
						window.wteDbgSetStatus?.( 'Request failed.', 'error', 4 );
					} );
			} );

			header.appendChild( truncateBtn );
		}

		builder.appendChild( header );

		// Declare refs up front so getState closure and action section can reference them.
		let andFilterRows, orFilterRows, resultsWrap;

		// Lazy state snapshot — called at click-time so forward refs are safe.
		const getState = () => ( {
			andFilters:  this.collectFilters( andFilterRows ),
			orFilters:   this.collectFilters( orFilterRows ),
			limit:       50,
			resultsWrap,
		} );

		// Filters
		const filtersSection = document.createElement( 'div' );
		filtersSection.className = 'wte-dbg-filters-section';

		const filtersLabel = document.createElement( 'div' );
		filtersLabel.className = 'wte-dbg-filters-label';

		const filtersToggleIcon = document.createElement( 'span' );
		filtersToggleIcon.className   = 'wte-dbg-filters-toggle-icon';
		filtersToggleIcon.textContent = '\u25b6'; // ▶
		filtersToggleIcon.classList.add( 'is-toggle-disabled' ); // disabled until filter rows exist
		filtersLabel.appendChild( filtersToggleIcon );

		const filtersLabelText = document.createElement( 'span' );
		filtersLabelText.textContent = 'Filters';
		filtersLabel.appendChild( filtersLabelText );

		// Add Filter button in the label
		resultsWrap = document.createElement( 'div' );
		resultsWrap.className = 'wte-dbg-results';

		const addAndBtn = document.createElement( 'button' );
		addAndBtn.type        = 'button';
		addAndBtn.className   = 'wte-dbg-add-filter-btn wte-dbg-add-and-btn';
		addAndBtn.textContent = '+ AND';
		addAndBtn.addEventListener( 'click', ( e ) => {
			e.stopPropagation();
			this.addFilterRow( andFilterRows, columns, updateFiltersToggle,
				() => this.runQuery( tableName, this.collectFilters( andFilterRows ), [], 50, 0, resultsWrap )
			);
			filtersSection.classList.add( 'is-open' );
		} );
		filtersLabel.appendChild( addAndBtn );

		const addOrBtn = document.createElement( 'button' );
		addOrBtn.type        = 'button';
		addOrBtn.className   = 'wte-dbg-add-filter-btn wte-dbg-add-or-btn';
		addOrBtn.textContent = '+ OR';
		addOrBtn.addEventListener( 'click', ( e ) => {
			e.stopPropagation();
			this.addFilterRow( orFilterRows, columns, updateFiltersToggle,
				() => this.runQuery( tableName, [], this.collectFilters( orFilterRows ), 50, 0, resultsWrap )
			);
			filtersSection.classList.add( 'is-open' );
		} );
		filtersLabel.appendChild( addOrBtn );

		// Separator before Run Query
		const runSep = document.createElement( 'span' );
		runSep.className    = 'wte-dbg-action-label-sep';
		runSep.style.display = 'none';
		filtersLabel.appendChild( runSep );

		// Run Query button — runs both AND + OR combined; hidden until any filter exists
		const runBtn = document.createElement( 'button' );
		runBtn.type          = 'button';
		runBtn.className     = 'wte-dbg-run-btn wte-dbg-run-both-btn';
		runBtn.textContent   = 'Run Query';
		runBtn.style.display = 'none';
		runBtn.addEventListener( 'click', ( e ) => {
			e.stopPropagation();
			this.runQuery( tableName, this.collectFilters( andFilterRows ), this.collectFilters( orFilterRows ), 50, 0, resultsWrap );
		} );
		filtersLabel.appendChild( runBtn );

		filtersLabel.addEventListener( 'click', () => {
			if ( andFilterRows.children.length > 0 || orFilterRows.children.length > 0 ) {
				filtersSection.classList.toggle( 'is-open' );
			}
		} );
		filtersSection.appendChild( filtersLabel );

		// Collapsible body: only filter rows
		const filtersBody = document.createElement( 'div' );
		filtersBody.className = 'wte-dbg-filters-body';

		// Two-column layout: AND (left) | OR (right)
		const filterColsWrap = document.createElement( 'div' );
		filterColsWrap.className = 'wte-dbg-filter-cols-wrap';

		// AND column — hidden until rows are added
		const andCol = document.createElement( 'div' );
		andCol.className    = 'wte-dbg-filter-column wte-dbg-filter-column-and';
		andCol.style.display = 'none';

		const andHdrWrap = document.createElement( 'div' );
		andHdrWrap.className = 'wte-dbg-filter-col-header-wrap';

		const andHdr = document.createElement( 'div' );
		andHdr.className   = 'wte-dbg-filter-col-header';
		andHdr.textContent = 'AND';

		const andClearBtn = document.createElement( 'button' );
		andClearBtn.type      = 'button';
		andClearBtn.className = 'wte-dbg-filter-col-clear';
		andClearBtn.title     = 'Remove all AND filters';
		andClearBtn.textContent = '\u00d7';

		andHdrWrap.appendChild( andHdr );
		andHdrWrap.appendChild( andClearBtn );
		andCol.appendChild( andHdrWrap );

		andFilterRows = document.createElement( 'div' );
		andFilterRows.className = 'wte-dbg-filter-rows';
		andCol.appendChild( andFilterRows );
		filterColsWrap.appendChild( andCol );

		// Vertical divider — hidden until both columns are visible
		const colSep = document.createElement( 'div' );
		colSep.className    = 'wte-dbg-filter-col-sep';
		colSep.style.display = 'none';
		filterColsWrap.appendChild( colSep );

		// OR column — hidden until rows are added
		const orCol = document.createElement( 'div' );
		orCol.className    = 'wte-dbg-filter-column wte-dbg-filter-column-or';
		orCol.style.display = 'none';

		const orHdrWrap = document.createElement( 'div' );
		orHdrWrap.className = 'wte-dbg-filter-col-header-wrap';

		const orHdr = document.createElement( 'div' );
		orHdr.className   = 'wte-dbg-filter-col-header';
		orHdr.textContent = 'OR';

		const orClearBtn = document.createElement( 'button' );
		orClearBtn.type      = 'button';
		orClearBtn.className = 'wte-dbg-filter-col-clear';
		orClearBtn.title     = 'Remove all OR filters';
		orClearBtn.textContent = '\u00d7';

		orHdrWrap.appendChild( orHdr );
		orHdrWrap.appendChild( orClearBtn );
		orCol.appendChild( orHdrWrap );

		orFilterRows = document.createElement( 'div' );
		orFilterRows.className = 'wte-dbg-filter-rows';
		orCol.appendChild( orFilterRows );
		filterColsWrap.appendChild( orCol );

		filtersBody.appendChild( filterColsWrap );

		filtersSection.appendChild( filtersBody );

		// Enable/disable toggle icon and show/hide Run Query based on whether filter rows exist
		const updateFiltersToggle = () => {
			andClearBtn.style.display = andFilterRows.children.length > 0 ? 'inline-flex' : 'none';
			orClearBtn.style.display  = orFilterRows.children.length  > 0 ? 'inline-flex' : 'none';
			const hasAndRows = andFilterRows.children.length > 0;
			const hasOrRows  = orFilterRows.children.length > 0;
			const hasRows    = hasAndRows || hasOrRows;
			filtersToggleIcon.classList.toggle( 'is-toggle-disabled', ! hasRows );
			runSep.style.display = hasRows ? '' : 'none';
			runBtn.style.display = hasRows ? '' : 'none';
			andCol.style.display = hasAndRows ? '' : 'none';
			orCol.style.display  = hasOrRows  ? '' : 'none';
			colSep.style.display = ( hasAndRows && hasOrRows ) ? '' : 'none';
			// OR appears first until AND has rows; then AND is left, OR is right.
			andCol.style.order = hasAndRows ? '0' : '2';
			colSep.style.order = '1';
			orCol.style.order  = hasAndRows ? '2' : '0';
			if ( ! hasRows ) {
				filtersSection.classList.remove( 'is-open' );
				this.runQuery( tableName, [], [], 50, 0, resultsWrap );
			}
		};

		builder.appendChild( filtersSection );

		builder.appendChild( resultsWrap );

		// Action section (below results)
		builder.appendChild( this._buildActionSection( tableName, columns, getState ) );

		Dom.setTextContent( queryPanel, '' );
		queryPanel.appendChild( builder );

		// Restore saved filters or auto-run fresh
		const restore       = this._pendingRestore;
		this._pendingRestore = null;

		const onEnterAnd = () => this.runQuery( tableName, this.collectFilters( andFilterRows ), [], 50, 0, resultsWrap );
		const onEnterOr  = () => this.runQuery( tableName, [], this.collectFilters( orFilterRows ), 50, 0, resultsWrap );

		andClearBtn.addEventListener( 'click', () => {
			Dom.setTextContent( andFilterRows, '' );
			updateFiltersToggle();
		} );
		orClearBtn.addEventListener( 'click', () => {
			Dom.setTextContent( orFilterRows, '' );
			updateFiltersToggle();
		} );

		if ( restore?.andFilters?.length || restore?.orFilters?.length ) {
			( restore.andFilters || [] ).forEach( ( f ) => this.addFilterRow( andFilterRows, columns, updateFiltersToggle, onEnterAnd, f ) );
			( restore.orFilters  || [] ).forEach( ( f ) => this.addFilterRow( orFilterRows,  columns, updateFiltersToggle, onEnterOr,  f ) );
			filtersSection.classList.add( 'is-open' );
			updateFiltersToggle();
			this.runQuery( tableName, restore.andFilters || [], restore.orFilters || [], 50, 0, resultsWrap );
		} else {
			this.runQuery( tableName, [], [], 50, 0, resultsWrap );
		}
	}

	_buildActionSection( tableName, columns, getState ) {
		const section = document.createElement( 'div' );
		section.className   = 'wte-dbg-action-section';
		this._actionSection = section;

		// Toggle label
		const label = document.createElement( 'div' );
		label.className = 'wte-dbg-action-label';

		const toggleIcon = document.createElement( 'span' );
		toggleIcon.className      = 'wte-dbg-action-toggle-icon';
		toggleIcon.textContent    = '\u25b6'; // ▶
		this._actionToggleIcon    = toggleIcon;
		label.appendChild( toggleIcon );

		const labelText = document.createElement( 'span' );
		labelText.textContent = 'Action';
		label.appendChild( labelText );

		// Row-indicator badge in the title
		const indicator = document.createElement( 'span' );
		indicator.className   = 'wte-dbg-action-indicator';
		this._actionIndicator = indicator;
		label.appendChild( indicator );

		// Update / Delete tab buttons
		const tabsWrap = document.createElement( 'span' );
		tabsWrap.className = 'wte-dbg-action-tabs';
		this._actionTabs   = tabsWrap;
		[ [ 'update', 'Updation' ], [ 'delete', 'Deletion' ] ].forEach( ( [ type, text ] ) => {
			const tab = document.createElement( 'button' );
			tab.type      = 'button';
			tab.className = 'wte-dbg-action-tab' + ( type === 'update' ? ' is-active' : '' );
			tab.textContent  = text;
			tab.dataset.type = type;
			tab.addEventListener( 'click', ( e ) => {
				e.stopPropagation();
				this._actionType = type;
				tabsWrap.querySelectorAll( '.wte-dbg-action-tab' ).forEach( ( t ) => t.classList.remove( 'is-active' ) );
				tab.classList.add( 'is-active' );
				this._updateActionRow( type );
				// Auto-expand for update; delete auto-collapses inside _updateActionRow
				if ( 'update' === type ) section.classList.add( 'is-open' );
			} );
			tabsWrap.appendChild( tab );
		} );
		label.appendChild( tabsWrap );

		// Separator + Execute UPDATE/DELETE button in the label
		const labelSep = document.createElement( 'span' );
		labelSep.className = 'wte-dbg-action-label-sep';
		this._actionLabelSep = labelSep;
		label.appendChild( labelSep );

		const executeBtn = document.createElement( 'button' );
		executeBtn.type        = 'button';
		executeBtn.className   = 'wte-dbg-execute-btn wte-dbg-execute-update';
		executeBtn.textContent = 'Execute UPDATE';
		this._actionExecBtn    = executeBtn;
		label.appendChild( executeBtn );

		// Separator + Execute INSERT button in the label (Add mode only, hidden by default)
		const insertLabelSep = document.createElement( 'span' );
		insertLabelSep.className    = 'wte-dbg-action-label-sep';
		insertLabelSep.style.display = 'none';
		this._insertLabelSep = insertLabelSep;
		label.appendChild( insertLabelSep );

		const insertBtn = document.createElement( 'button' );
		insertBtn.type         = 'button';
		insertBtn.className    = 'wte-dbg-execute-btn wte-dbg-execute-add';
		insertBtn.textContent  = 'Execute INSERT';
		insertBtn.style.display = 'none';
		this._insertBtn = insertBtn;
		label.appendChild( insertBtn );

		// Dismiss button — hides the action section and clears the selection
		const dismissBtn = document.createElement( 'button' );
		dismissBtn.type        = 'button';
		dismissBtn.className   = 'wte-dbg-action-dismiss';
		dismissBtn.textContent = '\u00d7'; // ×
		dismissBtn.title       = 'Dismiss';
		dismissBtn.addEventListener( 'click', ( e ) => {
			e.stopPropagation();
			this._selectedRow = null;
			this.wrap.querySelectorAll( '.wte-dbg-row-radio:checked' ).forEach( ( r ) => { r.checked = false; } );
			this.wrap.querySelectorAll( 'tr.is-row-selected' ).forEach( ( r ) => r.classList.remove( 'is-row-selected' ) );
			this._clearRowIndicator();
			this._expandLeftSidebar();
			section.closest( '.wte-dbg-query-builder' )
				?.querySelector( '.wte-dbg-filters-section' )
				?.classList.add( 'is-open' );
		} );
		label.appendChild( dismissBtn );

		label.addEventListener( 'click', () => {
			if ( ! toggleIcon.classList.contains( 'is-toggle-disabled' ) ) {
				section.classList.toggle( 'is-open' );
			}
		} );
		section.appendChild( label );

		// Body
		const body = document.createElement( 'div' );
		body.className = 'wte-dbg-action-body';

		// ── Add section: full-column insert table ──────────────────────────────
		const addSection = document.createElement( 'div' );
		addSection.className    = 'wte-dbg-action-add-section';
		addSection.style.display = 'none';
		this._addSection = addSection;

		const insertTableWrap = document.createElement( 'div' );
		insertTableWrap.className = 'wte-dbg-table-wrap';

		const insertTable = document.createElement( 'table' );
		insertTable.className = 'wte-dbg-result-table wte-dbg-insert-table';

		// Header row — same column names as results table
		const ithead    = document.createElement( 'thead' );
		const itheadRow = document.createElement( 'tr' );
		columns.forEach( ( col ) => {
			const th = document.createElement( 'th' );
			th.textContent = col;
			itheadRow.appendChild( th );
		} );
		ithead.appendChild( itheadRow );
		insertTable.appendChild( ithead );

		// Single editable input row
		const itbody   = document.createElement( 'tbody' );
		const inputRow = document.createElement( 'tr' );
		columns.forEach( ( col ) => {
			const td  = document.createElement( 'td' );
			const inp = this._makeEditableCell( 'wte-dbg-insert-input', col, 'NULL' );
			td.appendChild( inp );
			inputRow.appendChild( td );
		} );
		itbody.appendChild( inputRow );
		insertTable.appendChild( itbody );

		insertTableWrap.appendChild( insertTable );
		addSection.appendChild( insertTableWrap );
		body.appendChild( addSection );

		// ── Update section: result-table style with pre-filled editable row ──────
		const updateSection = document.createElement( 'div' );
		updateSection.className = 'wte-dbg-action-update-section';
		this._updateSection = updateSection;

		const updateTableWrap = document.createElement( 'div' );
		updateTableWrap.className = 'wte-dbg-table-wrap';

		const updateTable = document.createElement( 'table' );
		updateTable.className = 'wte-dbg-result-table wte-dbg-update-table';

		const uthead    = document.createElement( 'thead' );
		const utheadRow = document.createElement( 'tr' );
		columns.forEach( ( col ) => {
			const th = document.createElement( 'th' );
			th.textContent = col;
			utheadRow.appendChild( th );
		} );
		uthead.appendChild( utheadRow );
		updateTable.appendChild( uthead );

		const utbody      = document.createElement( 'tbody' );
		const updateInputRow = document.createElement( 'tr' );
		columns.forEach( ( col ) => {
			const td  = document.createElement( 'td' );
			const inp = this._makeEditableCell( 'wte-dbg-update-input', col, '' );
			td.appendChild( inp );
			updateInputRow.appendChild( td );
		} );
		utbody.appendChild( updateInputRow );
		updateTable.appendChild( utbody );

		updateTableWrap.appendChild( updateTable );
		updateSection.appendChild( updateTableWrap );

		const warning = document.createElement( 'div' );
		warning.className   = 'wte-dbg-action-warning';
		warning.textContent = '\u26a0 Select a row from the results table first.';
		updateSection.appendChild( warning );

		body.appendChild( updateSection );
		section.appendChild( body );

		executeBtn.addEventListener( 'click', ( e ) => {
			e.stopPropagation();
			this._executeAction( this._actionType, tableName, getState, executeBtn );
		} );

		insertBtn.addEventListener( 'click', ( e ) => {
			e.stopPropagation();
			this._executeAction( 'add', tableName, getState, insertBtn );
		} );

		// Set initial state to Update
		this._updateActionRow( 'update' );

		return section;
	}

	_updateActionRow( type ) {
		if ( ! this._actionExecBtn ) return;
		this._actionExecBtn.classList.remove( 'wte-dbg-execute-update', 'wte-dbg-execute-delete' );
		const warning = this._updateSection?.querySelector( '.wte-dbg-action-warning' );

		if ( 'update' === type ) {
			if ( this._updateSection ) this._updateSection.style.display = '';
			this._actionExecBtn.classList.add( 'wte-dbg-execute-update' );
			this._actionExecBtn.textContent = 'Execute UPDATE';
			if ( warning ) warning.style.display = this._selectedRow ? 'none' : '';
			if ( this._actionToggleIcon ) this._actionToggleIcon.classList.remove( 'is-toggle-disabled' );
		} else {
			if ( this._updateSection ) this._updateSection.style.display = 'none';
			this._actionExecBtn.classList.add( 'wte-dbg-execute-delete' );
			this._actionExecBtn.textContent = 'Execute DELETE';
			if ( this._actionToggleIcon ) this._actionToggleIcon.classList.add( 'is-toggle-disabled' );
			this._actionSection?.classList.remove( 'is-open' );
		}
	}

	_executeAction( type, tableName, getState, executeBtn ) {
		DbSearchTab._executeActionCtrl?.abort();
		DbSearchTab._executeActionCtrl = new AbortController();

		// Client-side guard: require selected row for update/delete
		if ( ( 'update' === type || 'delete' === type ) && ! this._selectedRow ) {
			const warning = this._updateSection?.querySelector( '.wte-dbg-action-warning' );
			if ( warning ) warning.style.display = '';
			return;
		}

		if ( 'delete' === type ) {
			const label = this._selectedRow
				? this._selectedRow.col + ' = ' + this._selectedRow.val
				: 'the selected row';
			if ( ! window.confirm( 'Delete ' + label + '?\n\nThis cannot be undone.' ) ) {
				return;
			}
		}

		const { andFilters, orFilters, limit, resultsWrap } = getState();

		const origText = executeBtn.textContent;
		executeBtn.disabled    = true;
		executeBtn.textContent = 'Executing\u2026';

		const params = new URLSearchParams( {
			action:      'wpte_devzone_db_action',
			type,
			table:       tableName,
			_ajax_nonce: this.nonce,
		} );

		if ( 'add' === type ) {
			this._addSection?.querySelectorAll( '.wte-dbg-insert-input' ).forEach( ( inp ) => {
				params.append( 'columns[' + inp.dataset.col + ']', inp.value );
			} );
		} else if ( 'update' === type ) {
			this._updateSection?.querySelectorAll( '.wte-dbg-update-input' ).forEach( ( inp ) => {
				params.append( 'columns[' + inp.dataset.col + ']', inp.value );
			} );
		}

		if ( 'update' === type || 'delete' === type ) {
			params.set( 'where_column', this._selectedRow.col );
			params.set( 'where_value',  String( this._selectedRow.val ) );
		}

		window.wteDbgSetStatus?.( 'Executing…', 'info' );
		fetch( this.ajaxurl + '?' + params, { signal: DbSearchTab._executeActionCtrl.signal } )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				if ( res.success ) {
					window.wteDbgSetStatus?.( res.data.message, 'success', 2 );
					if ( 'delete' === type || 'add' === type ) {
						this._expandLeftSidebar();
					}
					this.runQuery( tableName, andFilters, orFilters, limit, 0, resultsWrap );
				} else {
					window.wteDbgSetStatus?.( res.data?.message || 'Action failed.', 'error', 3 );
				}
			} )
			.catch( ( e ) => {
				if ( e.name === 'AbortError' ) {
					window.wteDbgSetStatus?.( 'Cancelled.', 'cancelled', 2 );
					return;
				}
				window.wteDbgSetStatus?.( 'Request failed.', 'error', 3 );
			} )
			.finally( () => {
				executeBtn.disabled    = false;
				executeBtn.textContent = origText;
			} );
	}

	/**
	 * Wrap a <select> in a pill div so the native browser picker button is never
	 * visible — same pattern as .wte-dbg-status-select-wrap.
	 */
	_wrapSelect( sel, wrapClass ) {
		const wrap = document.createElement( 'div' );
		wrap.className = wrapClass;

		const display = document.createElement( 'span' );
		display.className   = 'wte-dbg-filter-sel-display';
		display.textContent = sel.options[ sel.selectedIndex ]?.text || '';

		sel.addEventListener( 'change', () => {
			display.textContent = sel.options[ sel.selectedIndex ]?.text || '';
		} );

		wrap.appendChild( display );
		wrap.appendChild( sel );
		return wrap;
	}

	addFilterRow( container, columns, onCountChange = null, onEnter = null, initialValues = null ) {
		const row = document.createElement( 'div' );
		row.className = 'wte-dbg-filter-row';

		const colSel = document.createElement( 'select' );
		colSel.className = 'wte-dbg-filter-col wte-dbg-input';
		columns.forEach( ( col ) => {
			const opt = document.createElement( 'option' );
			opt.value = opt.textContent = col;
			colSel.appendChild( opt );
		} );

		const opSel = document.createElement( 'select' );
		opSel.className = 'wte-dbg-filter-op wte-dbg-input';
		[ 'LIKE', 'NOT LIKE', '=', '!=', '>', '<', '>=', '<=', 'IS NULL', 'IS NOT NULL' ].forEach( ( op ) => {
			const opt = document.createElement( 'option' );
			opt.value = opt.textContent = op;
			opSel.appendChild( opt );
		} );

		const valInput = document.createElement( 'input' );
		valInput.type        = 'text';
		valInput.className   = 'wte-dbg-filter-val wte-dbg-input';
		valInput.placeholder = 'value\u2026';
		if ( onEnter ) {
			valInput.addEventListener( 'keydown', ( e ) => {
				if ( e.key === 'Enter' ) { e.preventDefault(); onEnter(); }
			} );
		}

		opSel.addEventListener( 'change', () => {
			const noVal = opSel.value === 'IS NULL' || opSel.value === 'IS NOT NULL';
			valInput.style.display = noVal ? 'none' : '';
		} );

		const removeBtn = document.createElement( 'button' );
		removeBtn.type      = 'button';
		removeBtn.className = 'wte-dbg-filter-remove';
		removeBtn.textContent = '\u00d7';
		removeBtn.addEventListener( 'click', () => {
			row.remove();
			onCountChange?.();
		} );

		const fieldsGroup = document.createElement( 'div' );
		fieldsGroup.className = 'wte-dbg-filter-fields';
		fieldsGroup.appendChild( this._wrapSelect( colSel, 'wte-dbg-filter-col-wrap' ) );
		fieldsGroup.appendChild( this._wrapSelect( opSel,  'wte-dbg-filter-op-wrap' ) );
		fieldsGroup.appendChild( valInput );

		row.appendChild( removeBtn );
		row.appendChild( fieldsGroup );
		container.appendChild( row );

		// Restore saved values — dispatch change so display spans and visibility sync.
		if ( initialValues ) {
			if ( initialValues.column && [ ...colSel.options ].some( ( o ) => o.value === initialValues.column ) ) {
				colSel.value = initialValues.column;
				colSel.dispatchEvent( new Event( 'change' ) );
			}
			if ( initialValues.operator ) {
				opSel.value = initialValues.operator;
				opSel.dispatchEvent( new Event( 'change' ) );
			}
			if ( initialValues.value ) {
				valInput.value = initialValues.value;
			}
		}

		onCountChange?.();
	}

	collectFilters( container ) {
		const filters = [];
		container.querySelectorAll( '.wte-dbg-filter-row' ).forEach( ( row ) => {
			const col = row.querySelector( '.wte-dbg-filter-col' )?.value;
			const op  = row.querySelector( '.wte-dbg-filter-op' )?.value;
			const val = row.querySelector( '.wte-dbg-filter-val' )?.value || '';
			if ( col && op ) {
				filters.push( { column: col, operator: op, value: val } );
			}
		} );
		return filters;
	}

	runQuery( tableName, andFilters, orFilters, limit, offset, resultsWrap ) {
		this._saveQueryState( tableName, andFilters, orFilters );
		this._selectedRow = null;
		this._clearRowIndicator();

		DbSearchTab._runQueryCtrl?.abort();
		DbSearchTab._runQueryCtrl = new AbortController();

		Dom.setTextContent( resultsWrap, '' );
		Dom.appendShimmer( resultsWrap, 6, 'Running query\u2026' );

		const params = new URLSearchParams( {
			action:      'wpte_devzone_db_query',
			table:       tableName,
			limit,
			offset,
			_ajax_nonce: this.nonce,
		} );

		andFilters.forEach( ( f, i ) => {
			params.append( 'filters[' + i + '][column]',   f.column );
			params.append( 'filters[' + i + '][operator]', f.operator );
			params.append( 'filters[' + i + '][value]',    f.value );
		} );
		orFilters.forEach( ( f, i ) => {
			params.append( 'or_filters[' + i + '][column]',   f.column );
			params.append( 'or_filters[' + i + '][operator]', f.operator );
			params.append( 'or_filters[' + i + '][value]',    f.value );
		} );

		fetch( this.ajaxurl + '?' + params, { signal: DbSearchTab._runQueryCtrl.signal } )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				Dom.setTextContent( resultsWrap, '' );
				window.wteDbgClearStatus?.();
				if ( ! res.success ) {
					resultsWrap.appendChild( Dom.makePara( 'wte-dbg-empty', 'Query error.' ) );
					return;
				}
				this.renderResults( res.data, tableName, andFilters, orFilters, limit, resultsWrap );
			} )
			.catch( ( e ) => {
				if ( e.name === 'AbortError' ) {
					window.wteDbgSetStatus?.( 'Cancelled \u2014 ' + tableName + ' query', 'cancelled', 2 );
					return;
				}
				Dom.setTextContent( resultsWrap, '' );
				window.wteDbgClearStatus?.();
				resultsWrap.appendChild( Dom.makePara( 'wte-dbg-empty', 'Request failed.' ) );
			} );
	}

	renderResults( data, tableName, andFilters, orFilters, limit, resultsWrap ) {
		const rows   = data.rows;
		const total  = data.total;
		const offset = data.offset;

		// Refresh sidebar row count when no filters are active.
		if ( andFilters.length === 0 && orFilters.length === 0 ) {
			const countEl = this.wrap.querySelector( '.wte-dbg-table-item[data-table="' + CSS.escape( tableName ) + '"] .wte-dbg-table-rows' );
			if ( countEl ) countEl.textContent = total.toLocaleString();
		}

		const summary = document.createElement( 'div' );
		summary.className = 'wte-dbg-results-summary';
		const showing = rows.length < total
			? ' (showing ' + ( offset + 1 ) + '\u2013' + ( offset + rows.length ) + ')'
			: '';
		summary.textContent = total.toLocaleString() + ' row' + ( total !== 1 ? 's' : '' ) + showing;
		resultsWrap.appendChild( summary );

		const cols = rows.length ? Object.keys( rows[ 0 ] ) : ( data.columns || [] );

		const tableWrap = document.createElement( 'div' );
		tableWrap.className = 'wte-dbg-table-wrap';

		const table = document.createElement( 'table' );
		table.className = 'wte-dbg-result-table';

		const thead = document.createElement( 'thead' );
		const headerRow = document.createElement( 'tr' );
		const radioTh = document.createElement( 'th' );
		radioTh.className = 'wte-dbg-radio-th';
		const addRowBtn = document.createElement( 'button' );
		addRowBtn.type        = 'button';
		addRowBtn.className   = 'wte-dbg-add-row-btn';
		addRowBtn.textContent = '+';
		addRowBtn.title       = 'Add new row';
		addRowBtn.addEventListener( 'click', () => this._openAddAction() );
		radioTh.appendChild( addRowBtn );
		headerRow.appendChild( radioTh );
		cols.forEach( ( col ) => {
			const th = document.createElement( 'th' );
			th.textContent = col;
			headerRow.appendChild( th );
		} );
		thead.appendChild( headerRow );
		table.appendChild( thead );

		const tbody = document.createElement( 'tbody' );
		if ( ! rows.length ) {
			const emptyTr = document.createElement( 'tr' );
			const emptyTd = document.createElement( 'td' );
			emptyTd.colSpan   = cols.length + 1; // +1 for the radio column
			emptyTd.className = 'wte-dbg-empty wte-dbg-empty-row';
			emptyTd.textContent = 'No rows found.';
			emptyTr.appendChild( emptyTd );
			tbody.appendChild( emptyTr );
		}
		rows.forEach( ( row ) => {
			const tr = document.createElement( 'tr' );

			// Radio cell — not a data cell, no copy listener
			const radioTd = document.createElement( 'td' );
			radioTd.className = 'wte-dbg-radio-td';
			const radio = document.createElement( 'input' );
			radio.type      = 'radio';
			radio.className = 'wte-dbg-row-radio';
			radio.name      = 'wte-dbg-row-sel';
			radio.addEventListener( 'change', () => {
				tbody.querySelectorAll( 'tr.is-row-selected' ).forEach( ( r ) => r.classList.remove( 'is-row-selected' ) );
				tr.classList.add( 'is-row-selected' );
				this._selectRow( cols[ 0 ], row[ cols[ 0 ] ], row );
				resultsWrap.closest( '.wte-dbg-query-builder' )
					?.querySelector( '.wte-dbg-filters-section' )
					?.classList.remove( 'is-open' );
			} );
			radioTd.appendChild( radio );
			tr.appendChild( radioTd );

			cols.forEach( ( col ) => {
				const td  = document.createElement( 'td' );
				const val = row[ col ];
				const text = val === null ? '(null)' : String( val );
				td.textContent = text;
				if ( val === null ) td.classList.add( 'is-null' );

				td.addEventListener( 'click', () => this._copyCell( td, val ) );
				DomHelper.attachCopyLabel( td );

				tr.appendChild( td );
			} );
			tbody.appendChild( tr );
		} );
		table.appendChild( tbody );
		tableWrap.appendChild( table );
		resultsWrap.appendChild( tableWrap );

		// Pagination
		if ( total > limit ) {
			const paginEl = document.createElement( 'div' );
			paginEl.className = 'wte-dbg-pagination';
			Dom.buildPagination(
				paginEl,
				Math.floor( offset / limit ) + 1,
				Math.ceil( total / limit ),
				( page ) => this.runQuery( tableName, andFilters, orFilters, limit, ( page - 1 ) * limit, resultsWrap )
			);
			summary.appendChild( paginEl );
		}
	}

	_openAddAction() {
		this._selectedRow = null;
		this._collapseSidebars();
		// Deselect any checked radio and remove row highlight
		this.wrap.querySelectorAll( '.wte-dbg-row-radio:checked' ).forEach( ( r ) => { r.checked = false; } );
		this.wrap.querySelectorAll( 'tr.is-row-selected' ).forEach( ( r ) => r.classList.remove( 'is-row-selected' ) );
		if ( this._actionSection ) {
			this._actionSection.classList.add( 'is-row-visible', 'is-open' );
		}
		if ( this._actionIndicator ) {
			this._actionIndicator.textContent = '\u2295 New row';
			this._actionIndicator.classList.add( 'is-row-visible' );
		}
		// Show add section + label insert btn; hide update section + row-mode label controls
		if ( this._addSection )      this._addSection.style.display      = '';
		if ( this._updateSection )   this._updateSection.style.display   = 'none';
		if ( this._actionTabs )      this._actionTabs.style.display      = 'none';
		if ( this._actionLabelSep )  this._actionLabelSep.style.display  = 'none';
		if ( this._actionExecBtn )   this._actionExecBtn.style.display   = 'none';
		if ( this._insertLabelSep )  this._insertLabelSep.style.display  = '';
		if ( this._insertBtn )       this._insertBtn.style.display       = '';
		if ( this._actionToggleIcon ) this._actionToggleIcon.classList.remove( 'is-toggle-disabled' );
		// Clear all insert inputs
		this._addSection?.querySelectorAll( '.wte-dbg-insert-input' ).forEach( ( inp ) => { inp.value = ''; } );
	}

	_selectRow( col, val, rowData = {} ) {
		this._selectedRow = { col, val };
		this._collapseSidebars();
		if ( this._actionSection ) {
			this._actionSection.classList.add( 'is-row-visible', 'is-open' );
		}
		if ( this._actionIndicator ) {
			this._actionIndicator.textContent = '\u25c9 ' + col + ' = ' + val;
			this._actionIndicator.classList.add( 'is-row-visible' );
		}
		// Hide add section + label insert btn; show label controls for row-mode; reset to Update
		if ( this._addSection )     this._addSection.style.display     = 'none';
		if ( this._updateSection )  this._updateSection.style.display  = '';
		if ( this._insertLabelSep ) this._insertLabelSep.style.display = 'none';
		if ( this._insertBtn )      this._insertBtn.style.display      = 'none';
		if ( this._actionLabelSep ) this._actionLabelSep.style.display = '';
		this._actionType = 'update';
		if ( this._actionTabs ) {
			this._actionTabs.style.display = '';
			this._actionTabs.querySelectorAll( '.wte-dbg-action-tab' ).forEach( ( t ) => {
				t.classList.toggle( 'is-active', t.dataset.type === 'update' );
			} );
		}
		if ( this._actionExecBtn ) this._actionExecBtn.style.display = '';
		// Pre-populate the update table with the selected row's current values
		this._updateSection?.querySelectorAll( '.wte-dbg-update-input' ).forEach( ( inp ) => {
			const v = rowData[ inp.dataset.col ];
			inp.value       = ( v === null || v === undefined ) ? '' : String( v );
			inp.placeholder = v === null ? 'NULL' : '';
			inp.style.height = 'auto';
			inp.style.height = ( inp.scrollHeight || 0 ) + 'px';
		} );
		this._updateActionRow( 'update' );
	}

	_clearRowIndicator() {
		this._actionSection?.classList.remove( 'is-row-visible', 'is-open' );
		if ( this._actionIndicator ) {
			this._actionIndicator.textContent = '';
			this._actionIndicator.classList.remove( 'is-row-visible' );
		}
		// Reset to row-mode defaults (add section hidden, tabs + exec visible)
		if ( this._addSection )     this._addSection.style.display     = 'none';
		if ( this._insertLabelSep ) this._insertLabelSep.style.display = 'none';
		if ( this._insertBtn )      this._insertBtn.style.display      = 'none';
		if ( this._actionLabelSep ) this._actionLabelSep.style.display = '';
		if ( this._actionTabs )     this._actionTabs.style.display     = '';
		if ( this._actionExecBtn )  this._actionExecBtn.style.display  = '';
	}

	_makeEditableCell( className, col, placeholder ) {
		const ta = document.createElement( 'textarea' );
		ta.className   = className;
		ta.rows        = 1;
		ta.placeholder = placeholder;
		ta.dataset.col = col;
		const autoGrow = () => {
			ta.style.height = 'auto';
			ta.style.height = ta.scrollHeight + 'px';
		};
		ta.addEventListener( 'input', autoGrow );
		ta.addEventListener( 'focus', autoGrow );
		ta.addEventListener( 'mousedown', ( e ) => {
			const rect = ta.getBoundingClientRect();
			if ( e.clientY >= rect.bottom - 15 ) {
				ta.style.maxHeight = 'none';
			}
		} );
		ta.addEventListener( 'blur', () => {
			ta.style.maxHeight = '';
			autoGrow();
		} );
		return ta;
	}

	_expandLeftSidebar() {
		const wrap       = this.wrap;
		const leftToggle = wrap.querySelector( '.wte-dbg-db-tables-header .wte-dbg-sidebar-toggle' );
		wrap.classList.remove( 'sidebar-collapsed' );
		if ( leftToggle ) leftToggle.textContent = '\u2039'; // ‹
		try { localStorage.setItem( 'wte_dbg_query_sidebar_collapsed', '0' ); } catch ( e ) {}
	}

	_collapseSidebars() {
		const wrap = this.wrap;
		if ( ! wrap.classList.contains( 'sidebar-collapsed' ) ) {
			wrap.classList.add( 'sidebar-collapsed' );
			const leftToggle = wrap.querySelector( '.wte-dbg-db-tables-header .wte-dbg-sidebar-toggle' );
			if ( leftToggle ) leftToggle.textContent = '\u203a'; // ›
			try { localStorage.setItem( 'wte_dbg_query_sidebar_collapsed', '1' ); } catch ( e ) {}
		}
		wrap.classList.remove( 'unser-maximized', 'unser-restoring' );
		const maxBtn = wrap.querySelector( '.wte-dbg-unser-maximize' );
		if ( maxBtn ) { maxBtn.textContent = '\u2922'; maxBtn.title = 'Maximize'; }
		const sidebar = wrap.querySelector( '.wte-dbg-unserializer' );
		if ( sidebar ) sidebar.style.width = '';
		if ( ! wrap.classList.contains( 'unser-collapsed' ) ) {
			wrap.classList.add( 'unser-collapsed' );
			const rightToggle = wrap.querySelector( '.wte-dbg-unser-header .wte-dbg-sidebar-toggle' );
			if ( rightToggle ) rightToggle.textContent = '\u2039'; // ‹
			try { localStorage.setItem( 'wte_dbg_unser_collapsed', '1' ); } catch ( e ) {}
		}
	}

	_saveQueryState( tableName, andFilters, orFilters ) {
		try {
			sessionStorage.setItem( 'wte_dbg_query_table',       tableName );
			sessionStorage.setItem( 'wte_dbg_query_and_filters', JSON.stringify( andFilters ) );
			sessionStorage.setItem( 'wte_dbg_query_or_filters',  JSON.stringify( orFilters ) );
		} catch ( e ) {}
	}

	_loadQueryState() {
		try {
			return {
				table:      sessionStorage.getItem( 'wte_dbg_query_table' ) || null,
				andFilters: JSON.parse( sessionStorage.getItem( 'wte_dbg_query_and_filters' ) || '[]' ),
				orFilters:  JSON.parse( sessionStorage.getItem( 'wte_dbg_query_or_filters' )  || '[]' ),
			};
		} catch ( e ) {
			return { table: null, andFilters: [], orFilters: [] };
		}
	}

	_copyCell( td, val ) {
		DomHelper.copyWithFeedback( td, val );
	}
}
