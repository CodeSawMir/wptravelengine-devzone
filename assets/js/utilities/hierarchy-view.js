/**
 * WPTE Dev Zone — HierarchyView
 *
 * Renders any nested array/object as a collapsible tree, read-only or
 * editable, and — for the editable case — can drive the whole "fetch raw
 * serialized/JSON string, unserialize it via AJAX, show it as a tree in place
 * of whatever was showing the raw value" flow on its own. One class because
 * it's one job at different depths: Beautifier and Tinker just want the
 * static renderer for data they already have in hand; the Query tab wants the
 * full fetch-and-swap orchestration too. Nothing here is tied to a table or
 * any specific tab — any feature that needs a hierarchy view of serialized
 * data, read-only or editable, can reuse it the same way.
 *
 * Deliberately NOT included here: DomHelper.setupValueClicks()/toggleValueExpand().
 * Those toggle any .wte-dbg-value[data-raw] span, including ones the Settings
 * and master-detail tabs render server-side (class-renderer.php) and never
 * build through this class at all — moving them here would make those
 * unrelated tabs import a tree *builder* just for a generic expand-on-click
 * utility. wireExpandAll() below only covers what's actually tree-shape-aware.
 */
import { Icons }     from '../constants.js';
import { DomHelper } from '../dom-helper.js';
import { GraphView } from './graph-view.js';

export class HierarchyView {
	/** Values longer than this are truncated with an ellipsis (read-only view) or rendered as a growable textarea (editable view). */
	static TRUNCATE_LEN = 80;

	constructor( { ajaxurl, nonce } = {} ) {
		this.ajaxurl = ajaxurl;
		this.nonce   = nonce;
	}

	// -------------------------------------------------------------------------
	// Read-only tree — Beautifier's paste-and-view panel, Tinker's result tree.
	// -------------------------------------------------------------------------

	static build( data ) {
		const wrap = document.createElement( 'div' );
		wrap.className = 'wte-dbg-unser-tree';

		if ( data === null || data === undefined ) {
			const p = document.createElement( 'p' );
			p.className   = 'wte-dbg-empty';
			p.textContent = '(null)';
			wrap.appendChild( p );
			return wrap;
		}

		if ( typeof data !== 'object' ) {
			const row = document.createElement( 'div' );
			row.className = 'wte-dbg-row';
			const val = document.createElement( 'span' );
			val.className   = 'wte-dbg-value';
			val.dataset.raw = String( data );
			val.textContent = String( data );
			row.appendChild( val );
			wrap.appendChild( row );
			return wrap;
		}

		const entries = Object.entries( data );
		if ( ! entries.length ) {
			const p = document.createElement( 'p' );
			p.className   = 'wte-dbg-empty';
			p.textContent = '(empty)';
			wrap.appendChild( p );
			return wrap;
		}

		entries.forEach( ( [ key, value ] ) => {
			wrap.appendChild( HierarchyView.buildNode( key, value ) );
		} );

		HierarchyView.applyStripes( wrap );
		return wrap;
	}

	static buildNode( key, value ) {
		if ( value !== null && typeof value === 'object' ) {
			const details = document.createElement( 'details' );
			details.className = 'wte-dbg-node';

			const summary = document.createElement( 'summary' );
			summary.className = 'wte-dbg-key';

			const entries = Object.entries( value );
			summary.appendChild( document.createTextNode( key + '\u00a0' ) );

			const countSpan = document.createElement( 'span' );
			countSpan.className   = 'wte-dbg-count';
			countSpan.textContent = '[' + entries.length + ' item' + ( entries.length !== 1 ? 's' : '' ) + ']';
			summary.appendChild( countSpan );
			details.appendChild( summary );

			const children = document.createElement( 'div' );
			children.className = 'wte-dbg-unser-children';
			entries.forEach( ( [ k, v ] ) => {
				children.appendChild( HierarchyView.buildNode( k, v ) );
			} );
			details.appendChild( children );
			return details;
		}

		// Scalar leaf
		const raw = ( value === null || value === undefined ) ? '' : String( value );
		const row = document.createElement( 'div' );
		row.className = 'wte-dbg-row';

		const keySpan = document.createElement( 'span' );
		keySpan.className   = 'wte-dbg-key';
		keySpan.textContent = key;

		const typeLabel = value === null ? 'null'
			: typeof value === 'boolean' ? 'bool'
				: typeof value === 'number' ? ( Number.isInteger( value ) ? 'int' : 'float' )
					: 'string';

		const typeBadge = document.createElement( 'span' );
		typeBadge.className   = 'wte-dbg-type-badge wte-dbg-type-' + typeLabel;
		typeBadge.textContent = typeLabel;

		const valSpan = document.createElement( 'span' );
		valSpan.className    = 'wte-dbg-value';
		valSpan.dataset.raw  = raw;
		valSpan.dataset.type = typeLabel === 'null' ? 'null' : ( typeLabel === 'bool' ? 'boolean' : ( typeLabel === 'string' ? 'string' : 'number' ) );
		if ( raw.length > HierarchyView.TRUNCATE_LEN ) {
			// Initial truncated render only — click-to-expand and drag-to-select
			// are wired by the caller via DomHelper.setupValueClicks(), which
			// distinguishes a click from a drag-select. A second listener here
			// would double-toggle on every click and cancel itself out.
			valSpan.textContent = raw.substring( 0, HierarchyView.TRUNCATE_LEN ) + '\u2026';
			valSpan.title       = 'Click to expand';
			valSpan.style.cursor = 'pointer';
		} else {
			valSpan.textContent = raw === '' && value !== null ? '(empty)' : raw;
		}

		row.appendChild( keySpan );
		row.appendChild( typeBadge );
		row.appendChild( valSpan );
		return row;
	}

	static applyStripes( container ) {
		let idx = 0;
		for ( const el of container.children ) {
			if ( el.classList.contains( 'wte-dbg-row' ) || el.classList.contains( 'wte-dbg-node' ) ) {
				el.classList.toggle( 'is-stripe', ( idx++ ) % 2 !== 0 );
			}
		}
		container.querySelectorAll( '.wte-dbg-unser-children' ).forEach( HierarchyView.applyStripes );
	}

	/**
	 * Wires an "expand all / collapse all" toggle button for a tree built by
	 * build(). Toggles every node's open state; optionally also expands
	 * truncated leaf values (Beautifier wants that, Tinker's output tree
	 * doesn't — truncation there should only ever open on an explicit click).
	 *
	 * @param {HTMLElement} btn                     The toggle control (icon/label swapped in place).
	 * @param {HTMLElement} treeEl                  Root element returned by build().
	 * @param {Object}      [opts]
	 * @param {boolean}     [opts.toggleValues=true]  Also expand/collapse truncated .wte-dbg-value leaves.
	 * @param {number}      [opts.maxLen]             Truncation length, passed through to toggleValueExpand.
	 */
	static wireExpandAll( btn, treeEl, { toggleValues = true, maxLen = HierarchyView.TRUNCATE_LEN } = {} ) {
		btn.addEventListener( 'click', () => {
			const expanding = btn.dataset.state !== 'expanded';
			btn.dataset.state = expanding ? 'expanded' : '';
			btn.textContent   = expanding ? Icons.COLLAPSE_ALL : Icons.EXPAND_ALL;
			btn.title         = expanding ? 'Collapse all' : 'Expand all';

			treeEl.querySelectorAll( '.wte-dbg-node' ).forEach( ( el ) => { el.open = expanding; } );

			if ( toggleValues ) {
				treeEl.querySelectorAll( '.wte-dbg-value' ).forEach( ( el ) => {
					DomHelper.toggleValueExpand( el, expanding, maxLen );
				} );
			}
		} );
	}

	/**
	 * Builds the read-only tree plus its expand-all control, fully wired —
	 * the one part of Beautifier's paste-and-view panel and Tinker's
	 * return-value block that's actually identical between them. Everything
	 * around it (badge labels, "Return value — TYPE" text, wrapper markup,
	 * what to show when there's no tree at all) is tab-specific copy, not
	 * tree shape, so callers assemble that themselves around what this returns.
	 *
	 * @param {*}       tree                       Decoded data, as returned by the unserialize/var_dump endpoints.
	 * @param {Object}  [opts]
	 * @param {boolean} [opts.toggleValues=true]    Passed through to wireExpandAll().
	 * @param {number}  [opts.maxLen]               Truncation length for both the initial render and expand-all.
	 * @returns {{ expandAllBtn: HTMLElement, treeEl: HTMLElement, graphToggleBtn: HTMLElement, graphEl: HTMLElement }}
	 */
	static renderTreeSection( tree, { toggleValues = true, maxLen = HierarchyView.TRUNCATE_LEN } = {} ) {
		const treeEl = HierarchyView.build( tree );
		DomHelper.setupValueClicks( treeEl, maxLen );

		const expandAllBtn = document.createElement( 'span' );
		expandAllBtn.className   = 'wte-dbg-count wte-dbg-expand-all';
		expandAllBtn.textContent = Icons.EXPAND_ALL;
		expandAllBtn.title       = 'Expand all';
		HierarchyView.wireExpandAll( expandAllBtn, treeEl, { toggleValues, maxLen } );

		// Graph view is built lazily on first switch — laying it out costs real
		// work (force relax) that a caller who never clicks "Graph" shouldn't pay.
		const graphEl = document.createElement( 'div' );
		graphEl.className = 'wte-dbg-graph-mount';
		graphEl.style.display = 'none';

		const graphToggleBtn = document.createElement( 'span' );
		graphToggleBtn.className   = 'wte-dbg-count wte-dbg-graph-toggle';
		graphToggleBtn.textContent = Icons.GRAPH_VIEW;
		graphToggleBtn.title       = 'Switch to graph view';

		graphToggleBtn.addEventListener( 'click', () => {
			const showingGraph = graphEl.style.display !== 'none';
			if ( showingGraph ) {
				graphEl.style.display = 'none';
				treeEl.style.display  = '';
				graphToggleBtn.textContent = Icons.GRAPH_VIEW;
				graphToggleBtn.title       = 'Switch to graph view';
			} else {
				if ( ! graphEl.firstChild ) graphEl.appendChild( GraphView.build( tree ) );
				treeEl.style.display  = 'none';
				graphEl.style.display = '';
				graphToggleBtn.textContent = Icons.TREE_VIEW;
				graphToggleBtn.title       = 'Switch to tree view';
			}
		} );

		return { expandAllBtn, treeEl, graphToggleBtn, graphEl };
	}

	// -------------------------------------------------------------------------
	// Editable tree — same shape as build(), but leaves are live inputs and
	// every leaf carries its full dot-path. Only the leaves the user actually
	// changed are ever collected back out (see collectChanges).
	// -------------------------------------------------------------------------

	static buildEditable( data ) {
		const wrap = document.createElement( 'div' );
		wrap.className = 'wte-dbg-unser-tree wte-dbg-unser-tree-editable';

		const entries = ( data !== null && typeof data === 'object' )
			? Object.entries( data )
			: [ [ '', data ] ];

		entries.forEach( ( [ key, value ] ) => {
			wrap.appendChild( HierarchyView._buildEditableNode( key, value, key ) );
		} );

		HierarchyView.applyStripes( wrap );
		return wrap;
	}

	static _buildEditableNode( key, value, path ) {
		if ( value !== null && typeof value === 'object' ) {
			const details = document.createElement( 'details' );
			details.className = 'wte-dbg-node';
			details.open = true;

			const summary = document.createElement( 'summary' );
			summary.className = 'wte-dbg-key';
			summary.appendChild( document.createTextNode( key + ' ' ) );

			const entries = Object.entries( value );
			const countSpan = document.createElement( 'span' );
			countSpan.className   = 'wte-dbg-count';
			countSpan.textContent = '[' + entries.length + ' item' + ( entries.length !== 1 ? 's' : '' ) + ']';
			summary.appendChild( countSpan );
			details.appendChild( summary );

			const children = document.createElement( 'div' );
			children.className = 'wte-dbg-unser-children';
			entries.forEach( ( [ k, v ] ) => {
				children.appendChild( HierarchyView._buildEditableNode( k, v, path === '' ? k : path + '.' + k ) );
			} );
			details.appendChild( children );
			return details;
		}

		return HierarchyView._buildEditableLeaf( key, value, path );
	}

	static _buildEditableLeaf( key, value, path ) {
		const row = document.createElement( 'div' );
		row.className = 'wte-dbg-row wte-dbg-tree-leaf';

		const type = value === null ? 'null'
			: typeof value === 'boolean' ? 'bool'
				: typeof value === 'number' ? ( Number.isInteger( value ) ? 'int' : 'float' )
					: 'string';

		const orig = value === null ? '' : String( value );
		row.dataset.path = path;
		row.dataset.type = type;
		row.dataset.orig = orig;

		const keySpan = document.createElement( 'span' );
		keySpan.className   = 'wte-dbg-key';
		keySpan.textContent = key;
		row.appendChild( keySpan );

		const typeBadge = document.createElement( 'span' );
		typeBadge.className   = 'wte-dbg-type-badge wte-dbg-type-' + type;
		typeBadge.textContent = type;
		row.appendChild( typeBadge );

		let field;
		if ( type === 'bool' ) {
			field = document.createElement( 'select' );
			[ 'true', 'false' ].forEach( ( v ) => {
				const opt = document.createElement( 'option' );
				opt.value      = v;
				opt.textContent = v;
				opt.selected   = ( v === 'true' ) === value;
				field.appendChild( opt );
			} );
		} else if ( orig.length > HierarchyView.TRUNCATE_LEN ) {
			// Long enough to actually be truncated — use a textarea, collapsed to
			// one line by CSS until focused, then it grows to show the full value
			// (auto-height, wrapping) the same way the Query tab's other editable
			// cells do. Short values stay a plain <input>; there's nothing to expand.
			// Native double-click-to-select-word and drag-to-select need nothing
			// extra; truncation was the only thing hiding them.
			field = document.createElement( 'textarea' );
			field.rows  = 1;
			field.value = orig;

			const autoGrow = () => {
				field.style.height = 'auto';
				field.style.height = field.scrollHeight + 'px';
			};
			field.addEventListener( 'input', autoGrow );
			// On focus, the :focus rule is what switches white-space to pre-wrap
			// and widens the box — scrollHeight measured before that style
			// actually applies would still reflect the collapsed single-line
			// layout. Deferring one frame lets the browser settle it first.
			field.addEventListener( 'focus', () => requestAnimationFrame( autoGrow ) );
			field.addEventListener( 'blur', () => { field.style.height = ''; } );
		} else {
			field = document.createElement( 'input' );
			field.type  = 'text';
			field.value = orig;
			if ( type === 'null' ) field.placeholder = 'null';
		}
		field.className = 'wte-dbg-tree-input';

		// Flag the row so changed leaves are visually obvious before saving.
		const markDirty = () => {
			row.classList.toggle( 'is-dirty', field.value !== row.dataset.orig );
		};
		field.addEventListener( 'input', markDirty );
		field.addEventListener( 'change', markDirty );

		row.appendChild( field );
		return row;
	}

	/**
	 * Collect only the leaves whose value differs from what was loaded.
	 * `treeEl` is the tree's own root (as returned by buildEditable(), or
	 * found via `.wte-dbg-tree-viewer` — see collectContainerChanges()).
	 *
	 * @returns {Array<{path: string, value: string}>}
	 */
	/**
	 * @returns {Array<{path: string, value: string, type: string}>} `type` is
	 *   the leaf's original scalar type ('string'|'int'|'float'|'bool'|'null'),
	 *   so a caller that sends this over the wire can pass it along too —
	 *   every form value is a string regardless of what's typed into it, so
	 *   without the original type a save can't tell "40" the string from 40
	 *   the int.
	 */
	static collectChanges( treeEl ) {
		const changes = [];
		treeEl.querySelectorAll( '.wte-dbg-tree-leaf' ).forEach( ( row ) => {
			const field = row.querySelector( '.wte-dbg-tree-input' );
			if ( ! field ) return;
			if ( field.value === row.dataset.orig ) return;
			changes.push( { path: row.dataset.path, value: field.value, type: row.dataset.type } );
		} );
		return changes;
	}

	/** Re-baseline a tree after a successful save so it stops reporting stale diffs. */
	static commitChanges( treeEl ) {
		treeEl.querySelectorAll( '.wte-dbg-tree-leaf' ).forEach( ( row ) => {
			const field = row.querySelector( '.wte-dbg-tree-input' );
			if ( ! field ) return;
			row.dataset.orig = field.value;
			row.classList.remove( 'is-dirty' );
		} );
	}

	// -------------------------------------------------------------------------
	// Fetch-and-swap orchestration — turns a raw serialized-PHP or JSON string
	// held by some "source" element (a textarea, a value span, ...) into an
	// editable tree in place. Fetches + unserializes via the shared
	// 'wpte_devzone_unserialize' AJAX action.
	// -------------------------------------------------------------------------

	/** Cheap sniff — only a PHP-serialized or JSON array/object is worth a tree view. */
	static looksSerializedTree( str ) {
		const s = ( str ?? '' ).toString();
		if ( /^a:\d+:\{/.test( s ) || /^O:\d+:"/.test( s ) ) return true;
		const trimmed = s.trim();
		return ( trimmed.startsWith( '{' ) && trimmed.endsWith( '}' ) ) || ( trimmed.startsWith( '[' ) && trimmed.endsWith( ']' ) );
	}

	/** Whether `container` currently holds a tree built by load(). */
	static isActive( container ) {
		return !! container?.querySelector( '.wte-dbg-tree-viewer' );
	}

	/** Only the leaves the user actually changed within `container`'s tree, as `{ path, value }` pairs. */
	static collectContainerChanges( container ) {
		const treeEl = container?.querySelector( '.wte-dbg-tree-viewer' );
		return treeEl ? HierarchyView.collectChanges( treeEl ) : [];
	}

	/**
	 * Fetches + unserializes `raw`, then appends an editable tree into
	 * `container` and hides `source`. No-ops (via onFail) if the value doesn't
	 * parse as a PHP-serialized or JSON array/object.
	 *
	 * A per-container token guards against a stale response landing after the
	 * caller has already reset or reused `container` for something else.
	 *
	 * @param {HTMLElement} container  Element the tree gets appended to.
	 * @param {HTMLElement} source     Element to hide while the tree is shown.
	 * @param {string}      raw        The current serialized/JSON string value.
	 * @param {Object}      [hooks]
	 * @param {Function}    [hooks.onShown]  (treeEl) => void — tree appended and visible.
	 * @param {Function}    [hooks.onFail]   () => void — couldn't parse, or the request failed.
	 * @returns {Promise<void>}
	 */
	load( container, source, raw, hooks = {} ) {
		const token = ( container.dataset.treeToken = String( Date.now() + Math.random() ) );

		const loader = document.createElement( 'div' );
		loader.className = 'wte-dbg-tree-loader';
		loader.appendChild( document.createElement( 'span' ) ).className = 'wte-dbg-tree-loader-spinner';
		if ( source ) source.style.display = 'none';
		container.appendChild( loader );

		const body = new URLSearchParams( {
			action:      'wpte_devzone_unserialize',
			data:        raw,
			_ajax_nonce: this.nonce,
		} );

		return fetch( this.ajaxurl, { method: 'POST', body } )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				// The caller may have reset or reused this container while the
				// request was in flight — a stale response must not clobber it.
				if ( container.dataset.treeToken !== token ) return;
				loader.remove();

				if ( ! res.success || 'unknown' === res.data.format ) {
					if ( source ) source.style.display = '';
					hooks.onFail?.();
					return;
				}

				const treeEl = HierarchyView.buildEditable( res.data.tree );
				treeEl.classList.add( 'wte-dbg-tree-viewer' );
				container.appendChild( treeEl );
				hooks.onShown?.( treeEl );
			} )
			.catch( () => {
				if ( container.dataset.treeToken !== token ) return;
				loader.remove();
				if ( source ) source.style.display = '';
				hooks.onFail?.();
			} );
	}

	/** Tears down whatever load() built inside `container`, restoring `source`. */
	exit( container, source ) {
		delete container.dataset.treeToken;
		container.querySelector( '.wte-dbg-tree-loader' )?.remove();
		container.querySelector( '.wte-dbg-tree-viewer' )?.remove();
		if ( source ) source.style.display = '';
	}
}
