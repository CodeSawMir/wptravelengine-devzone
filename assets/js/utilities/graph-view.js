/**
 * WPTE Dev Zone — GraphView
 *
 * Renders any nested array/object as a force-directed node-link diagram —
 * the same data HierarchyView turns into a collapsible <details> tree, but
 * laid out as draggable circles + curved edges on a dark canvas. Built once
 * per result and toggled against the tree view by the caller (Beautifier,
 * Tinker); this class only knows how to turn data into a graph and make that
 * graph interactive, nothing about tabs or badges.
 */

import { Icons } from '../constants.js';

const NS = 'http://www.w3.org/2000/svg';

const COL_GAP     = 46; // horizontal breathing room between a column's widest label and the next column
const ROW_HEIGHT  = 30; // minimum vertical distance between two nodes in the same column
const MARGIN      = 50;
const VB_W        = 1000;
const VB_H        = 620;
const LABEL_FONT  = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const TYPE_FONT   = '9.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

// Colors themselves live in devzone.css as --dbg-graph-* custom properties so
// the graph follows the devzone light/dark toggle live — nodes/links/labels
// only ever carry CSS classes here, never a baked-in fill/stroke value.

export class GraphView {
	/**
	 * @param {*} data  Decoded data, same shape HierarchyView.build() accepts.
	 * @returns {HTMLElement} A self-contained, pannable/zoomable graph view.
	 */
	static build( data ) {
		const { nodes, links } = GraphView._toGraph( data );
		GraphView._layout( nodes, links );
		return GraphView._render( nodes, links );
	}

	// -------------------------------------------------------------------------
	// Data → nodes/links
	// -------------------------------------------------------------------------

	static _toGraph( data ) {
		const nodes = [];
		const links = [];
		let seq = 0;

		const walk = ( label, value, depth, parentId ) => {
			const id = seq++;
			const isContainer = value !== null && typeof value === 'object' && Object.keys( value ).length > 0;
			const kind = depth === 0 ? 'root' : ( isContainer ? 'branch' : 'leaf' );
			const typeTag = isContainer
				? `${ Array.isArray( value ) ? 'array' : 'object' }[${ Object.keys( value ).length }]`
				: ( value === null ? 'null'
					: typeof value === 'boolean' ? 'bool'
						: typeof value === 'number' ? ( Number.isInteger( value ) ? 'int' : 'float' )
							: 'string' );
			nodes.push( { id, label, depth, kind, typeTag } );
			if ( parentId !== null ) links.push( { sourceId: parentId, targetId: id } );

			if ( isContainer ) {
				const isArr = Array.isArray( value );
				Object.entries( value ).forEach( ( [ k, v ] ) => {
					const childIsContainer = v !== null && typeof v === 'object' && Object.keys( v ).length > 0;
					const childLabel = ( isArr && ! childIsContainer ) ? `${ label }[${ k }]` : k;
					walk( childLabel, v, depth + 1, id );
				} );
			}
		};

		walk( 'ROOT', data, 0, null );
		return { nodes, links };
	}

	// -------------------------------------------------------------------------
	// Layout — pure tidy tree. Deliberately NOT force-directed: a relax pass
	// pulls nodes off their rows and columns, which is exactly what made long
	// keys ("wptravelengine_trip_indexing_by_dates_cron") overlap each other.
	// Instead each column is only as wide as its own widest label, and nodes in
	// a column are guaranteed at least ROW_HEIGHT apart. Nodes stay draggable
	// afterwards — that part never needed physics.
	// -------------------------------------------------------------------------

	/** Real rendered label width, so a column can size itself to its content. */
	static _measure( nodes ) {
		let ctx = null;
		try {
			ctx = document.createElement( 'canvas' ).getContext( '2d' );
		} catch ( e ) { }

		nodes.forEach( ( n ) => {
			if ( ctx ) {
				ctx.font = LABEL_FONT;
				const labelW = ctx.measureText( n.label ).width;
				ctx.font = TYPE_FONT;
				const typeW = ctx.measureText( n.typeTag ).width;
				n.width = labelW + typeW + 26; // circle radius + label offset + tspan dx
			} else {
				// Canvas unavailable — approximate from character counts.
				n.width = n.label.length * 6.8 + n.typeTag.length * 5.4 + 26;
			}
		} );
	}

	static _layout( nodes, links ) {
		const byId = new Map( nodes.map( ( n ) => [ n.id, n ] ) );
		const childrenOf = new Map();
		links.forEach( ( l ) => {
			if ( ! childrenOf.has( l.sourceId ) ) childrenOf.set( l.sourceId, [] );
			childrenOf.get( l.sourceId ).push( l.targetId );
		} );

		GraphView._measure( nodes );

		// Column x positions — each depth starts after the widest label of the
		// previous depth, so a long key pushes only its own subtree rightward
		// instead of overlapping the next column.
		const widestAtDepth = [];
		nodes.forEach( ( n ) => {
			widestAtDepth[ n.depth ] = Math.max( widestAtDepth[ n.depth ] || 0, n.width );
		} );
		const colX = [ MARGIN ];
		for ( let d = 1; d < widestAtDepth.length; d++ ) {
			colX[ d ] = colX[ d - 1 ] + widestAtDepth[ d - 1 ] + COL_GAP;
		}

		// Leaves get their own row; parents center on their children.
		let leafRow = 0;
		const assign = ( id ) => {
			const node = byId.get( id );
			node.x = colX[ node.depth ];
			const kids = childrenOf.get( id ) || [];
			if ( ! kids.length ) {
				node.y = MARGIN + ( leafRow++ ) * ROW_HEIGHT;
				return;
			}
			kids.forEach( assign );
			const ys = kids.map( ( kid ) => byId.get( kid ).y );
			node.y = ( Math.min( ...ys ) + Math.max( ...ys ) ) / 2;
		};
		assign( nodes[ 0 ].id );

		// Centering a parent on its children can still land two same-column
		// nodes within a label's height of each other — sweep each column and
		// push overlaps apart.
		const byDepth = new Map();
		nodes.forEach( ( n ) => {
			if ( ! byDepth.has( n.depth ) ) byDepth.set( n.depth, [] );
			byDepth.get( n.depth ).push( n );
		} );
		byDepth.forEach( ( column ) => {
			column.sort( ( a, b ) => a.y - b.y );
			for ( let i = 1; i < column.length; i++ ) {
				const gap = column[ i ].y - column[ i - 1 ].y;
				if ( gap < ROW_HEIGHT ) column[ i ].y = column[ i - 1 ].y + ROW_HEIGHT;
			}
		} );
	}

	// -------------------------------------------------------------------------
	// Render — SVG canvas with pan/zoom on the viewport and drag on each node.
	// -------------------------------------------------------------------------

	static _render( nodes, links ) {
		const byId = new Map( nodes.map( ( n ) => [ n.id, n ] ) );

		const minX = Math.min( ...nodes.map( ( n ) => n.x ) ) - MARGIN;
		// Labels extend to the right of their node, so the content box has to
		// include them or the rightmost column gets clipped.
		const maxX = Math.max( ...nodes.map( ( n ) => n.x + ( n.width || 0 ) ) ) + MARGIN;
		const minY = Math.min( ...nodes.map( ( n ) => n.y ) ) - MARGIN;
		const maxY = Math.max( ...nodes.map( ( n ) => n.y ) ) + MARGIN;
		const contentW = Math.max( 1, maxX - minX );
		const contentH = Math.max( 1, maxY - minY );

		const wrap = document.createElement( 'div' );
		wrap.className = 'wte-dbg-graph-view';

		// Top-right toolbar — search sits to the left of the maximize button.
		// The search input is built further down (it needs the node list), so it
		// gets inserted into this container then.
		const toolbar = document.createElement( 'div' );
		toolbar.className = 'wte-dbg-graph-toolbar';
		wrap.appendChild( toolbar );

		const maximizeBtn = document.createElement( 'button' );
		maximizeBtn.type = 'button';
		maximizeBtn.className = 'wte-dbg-graph-maximize';
		maximizeBtn.textContent = Icons.MAXIMIZE;
		maximizeBtn.title = 'Maximize';
		toolbar.appendChild( maximizeBtn );

		const onEscape = ( e ) => {
			if ( e.key === 'Escape' ) setMaximized( false );
		};

		// Moved to <body> while maximized so it always spans the full viewport,
		// regardless of any ancestor that would otherwise redefine position:fixed's
		// containing block (transform/filter/contain/will-change).
		let restoreParent = null;
		let restoreNext   = null;

		// No color snapshot needed on the way out — the --dbg-graph-* palette is
		// declared on .wte-dbg-graph-view itself, so it survives the move to <body>.
		const setMaximized = ( on ) => {
			wrap.classList.toggle( 'is-maximized', on );
			maximizeBtn.textContent = on ? Icons.RESTORE : Icons.MAXIMIZE;
			maximizeBtn.title      = on ? 'Restore' : 'Maximize';
			if ( on ) {
				restoreParent = wrap.parentNode;
				restoreNext   = wrap.nextSibling;
				document.body.appendChild( wrap );
				document.addEventListener( 'keydown', onEscape );
			} else {
				if ( restoreParent ) restoreParent.insertBefore( wrap, restoreNext );
				document.removeEventListener( 'keydown', onEscape );
			}
		};

		maximizeBtn.addEventListener( 'click', () => {
			setMaximized( ! wrap.classList.contains( 'is-maximized' ) );
		} );

		const svg = document.createElementNS( NS, 'svg' );
		svg.setAttribute( 'viewBox', `0 0 ${ VB_W } ${ VB_H }` );
		svg.setAttribute( 'width', '100%' );
		svg.setAttribute( 'height', '100%' );
		svg.classList.add( 'wte-dbg-graph-svg' );
		wrap.appendChild( svg );

		const viewport = document.createElementNS( NS, 'g' );
		svg.appendChild( viewport );

		const state = { x: 0, y: 0, k: 1 };
		// Fit-to-view, but floored — on a big tree a true fit would shrink labels
		// to unreadable specks, so past that point start readable and let the
		// user pan/zoom instead.
		const fitK = Math.max( 0.5, Math.min( ( VB_W - 2 * MARGIN ) / contentW, ( VB_H - 2 * MARGIN ) / contentH, 1.4 ) );
		state.k = fitK;
		state.x = ( VB_W - contentW * fitK ) / 2 - minX * fitK;
		state.y = ( VB_H - contentH * fitK ) / 2 - minY * fitK;

		const applyTransform = () => {
			viewport.setAttribute( 'transform', `translate(${ state.x },${ state.y }) scale(${ state.k })` );
		};
		applyTransform();

		// Links first so nodes draw on top.
		const linkEls = links.map( ( l ) => {
			const path = document.createElementNS( NS, 'path' );
			path.setAttribute( 'class', 'wte-dbg-graph-link' );
			viewport.appendChild( path );
			return { source: byId.get( l.sourceId ), target: byId.get( l.targetId ), path };
		} );

		const linksByNode = new Map();
		linkEls.forEach( ( l ) => {
			[ l.source.id, l.target.id ].forEach( ( id ) => {
				if ( ! linksByNode.has( id ) ) linksByNode.set( id, [] );
				linksByNode.get( id ).push( l );
			} );
		} );

		const redrawLink = ( l ) => {
			const { source: s, target: t } = l;
			const midX = ( s.x + t.x ) / 2;
			l.path.setAttribute( 'd', `M${ s.x },${ s.y } C${ midX },${ s.y } ${ midX },${ t.y } ${ t.x },${ t.y }` );
		};
		linkEls.forEach( redrawLink );

		// Collapse/expand — click a branch/root node to hide/show its subtree.
		const childrenOf = new Map();
		const parentOf = new Map();
		links.forEach( ( l ) => {
			if ( ! childrenOf.has( l.sourceId ) ) childrenOf.set( l.sourceId, [] );
			childrenOf.get( l.sourceId ).push( l.targetId );
			parentOf.set( l.targetId, l.sourceId );
		} );
		const collapsed = new Set();
		const nodeEls = new Map();
		const expanderEls = new Map();
		// null = no active search. Otherwise the ids that stay at full strength:
		// the matches plus every ancestor connecting them to ROOT. Everything
		// else is dimmed rather than hidden, so the surrounding shape is still
		// readable while a search is active.
		let searchKeep = null;

		const setCollapsed = ( id, on ) => {
			if ( on ) collapsed.add( id ); else collapsed.delete( id );
			const expander = expanderEls.get( id );
			if ( expander ) expander.textContent = on ? '+' : '−';
		};

		const updateVisibility = () => {
			const visible = new Set( [ nodes[ 0 ].id ] );
			const queue = [ nodes[ 0 ].id ];
			while ( queue.length ) {
				const id = queue.shift();
				if ( collapsed.has( id ) ) continue;
				( childrenOf.get( id ) || [] ).forEach( ( childId ) => {
					visible.add( childId );
					queue.push( childId );
				} );
			}

			// Search never hides anything — only collapse does. Non-matches get
			// dimmed instead (see runSearch).
			nodes.forEach( ( n ) => {
				nodeEls.get( n.id ).style.display = visible.has( n.id ) ? '' : 'none';
			} );
			linkEls.forEach( ( l ) => {
				l.path.style.display = ( visible.has( l.source.id ) && visible.has( l.target.id ) ) ? '' : 'none';
			} );
		};

		nodes.forEach( ( n ) => {
			const g = document.createElementNS( NS, 'g' );
			g.setAttribute( 'class', 'wte-dbg-graph-node' );
			g.setAttribute( 'transform', `translate(${ n.x },${ n.y })` );

			const r = n.kind === 'root' ? 9 : ( n.kind === 'branch' ? 7 : 6 );
			const circle = document.createElementNS( NS, 'circle' );
			circle.setAttribute( 'r', String( r ) );
			circle.setAttribute( 'class', 'wte-dbg-graph-circle wte-dbg-graph-circle-' + ( n.kind === 'leaf' ? 'leaf' : 'branch' ) );
			g.appendChild( circle );

			const text = document.createElementNS( NS, 'text' );
			text.setAttribute( 'x', String( r + 6 ) );
			text.setAttribute( 'dy', '0.32em' );
			text.setAttribute( 'font-size', '12' );
			g.appendChild( text );

			const labelSpan = document.createElementNS( NS, 'tspan' );
			labelSpan.setAttribute( 'class', 'wte-dbg-graph-label' );
			labelSpan.textContent = n.label;
			text.appendChild( labelSpan );

			const typeSpan = document.createElementNS( NS, 'tspan' );
			typeSpan.setAttribute( 'class', 'wte-dbg-graph-type' );
			typeSpan.setAttribute( 'font-size', '9.5' );
			typeSpan.setAttribute( 'dx', '5' );
			typeSpan.textContent = n.typeTag;
			text.appendChild( typeSpan );

			const hasChildren = ( childrenOf.get( n.id ) || [] ).length > 0;
			let expander = null;
			if ( hasChildren ) {
				expander = document.createElementNS( NS, 'text' );
				expander.setAttribute( 'class', 'wte-dbg-graph-expander' );
				expander.setAttribute( 'x', '0' );
				expander.setAttribute( 'dy', '0.32em' );
				expander.setAttribute( 'text-anchor', 'middle' );
				expander.setAttribute( 'font-size', String( r * 1.3 ) );
				expander.textContent = '−'; // − , flips to + while collapsed
				g.appendChild( expander );
				expanderEls.set( n.id, expander );
			}

			viewport.appendChild( g );
			nodeEls.set( n.id, g );

			g.addEventListener( 'pointerdown', ( e ) => {
				e.stopPropagation();
				g.setPointerCapture( e.pointerId );
				const startX = e.clientX, startY = e.clientY;
				const origX = n.x, origY = n.y;
				const rect = svg.getBoundingClientRect();
				const scale = ( VB_W / rect.width ) / state.k;
				let dragged = false;

				const onMove = ( ev ) => {
					const dx = ev.clientX - startX, dy = ev.clientY - startY;
					if ( Math.hypot( dx, dy ) > 4 ) dragged = true;
					n.x = origX + dx * scale;
					n.y = origY + dy * scale;
					g.setAttribute( 'transform', `translate(${ n.x },${ n.y })` );
					( linksByNode.get( n.id ) || [] ).forEach( redrawLink );
				};
				const onUp = () => {
					g.releasePointerCapture( e.pointerId );
					g.removeEventListener( 'pointermove', onMove );
					g.removeEventListener( 'pointerup', onUp );
					if ( ! dragged && hasChildren ) {
						setCollapsed( n.id, ! collapsed.has( n.id ) );
						updateVisibility();
					}
				};
				g.addEventListener( 'pointermove', onMove );
				g.addEventListener( 'pointerup', onUp );
			} );
		} );

		// Search — filters by label/type, auto-expands collapsed ancestors of
		// any match, and centers the viewport on the first hit.
		const searchWrap = document.createElement( 'div' );
		searchWrap.className = 'wte-dbg-graph-search';

		const countEl = document.createElement( 'span' );
		countEl.className = 'wte-dbg-graph-search-count';
		searchWrap.appendChild( countEl );

		const searchInput = document.createElement( 'input' );
		searchInput.type        = 'text';
		searchInput.className   = 'wte-dbg-graph-search-input';
		searchInput.placeholder = 'Search…';
		searchWrap.appendChild( searchInput );

		const clearBtn = document.createElement( 'button' );
		clearBtn.type      = 'button';
		clearBtn.className = 'wte-dbg-graph-search-clear';
		clearBtn.textContent = '×';
		clearBtn.title     = 'Clear search';
		searchWrap.appendChild( clearBtn );

		toolbar.insertBefore( searchWrap, maximizeBtn );

		const noMatchEl = document.createElement( 'div' );
		noMatchEl.className   = 'wte-dbg-graph-no-match';
		noMatchEl.textContent = 'No matches';
		noMatchEl.style.display = 'none';
		wrap.appendChild( noMatchEl );

		// Current result set, and which one Enter last stepped to — kept out here
		// so the keydown handler can cycle without re-running the filter.
		let matchList = [];
		let matchIdx  = 0;

		const centerOnMatch = () => {
			const n = matchList[ matchIdx ];
			if ( ! n ) return;
			state.x = VB_W / 2 - n.x * state.k;
			state.y = VB_H / 2 - n.y * state.k;
			applyTransform();
			// Only the node Enter is parked on gets the "current" emphasis.
			matchList.forEach( ( m, i ) => {
				nodeEls.get( m.id ).classList.toggle( 'is-current-match', i === matchIdx );
			} );
			countEl.textContent = `${ matchIdx + 1 }/${ matchList.length }`;
		};

		const runSearch = () => {
			const q = searchInput.value.trim().toLowerCase();
			searchWrap.classList.toggle( 'has-value', q.length > 0 );

			const matches = q.length === 0 ? [] : nodes.filter(
				( n ) => n.label.toLowerCase().includes( q ) || n.typeTag.toLowerCase().includes( q )
			);
			const matchIds = new Set( matches.map( ( n ) => n.id ) );
			matchList = matches;
			matchIdx  = 0;

			if ( q.length === 0 ) {
				searchKeep = null;
			} else {
				// Each match plus its ancestor chain stays at full strength, and
				// those ancestors get un-collapsed so a hit inside a folded
				// subtree is actually visible.
				searchKeep = new Set();
				matches.forEach( ( n ) => {
					searchKeep.add( n.id );
					let pid = parentOf.get( n.id );
					while ( pid !== undefined ) {
						searchKeep.add( pid );
						setCollapsed( pid, false );
						pid = parentOf.get( pid );
					}
				} );
			}

			updateVisibility();

			nodes.forEach( ( n ) => {
				const g = nodeEls.get( n.id );
				g.classList.toggle( 'is-match', matchIds.has( n.id ) );
				g.classList.toggle( 'is-dimmed', !! searchKeep && ! searchKeep.has( n.id ) );
				g.classList.remove( 'is-current-match' );
			} );

			// An edge is only "on the path" when both of its ends are.
			linkEls.forEach( ( l ) => {
				l.path.classList.toggle(
					'is-dimmed',
					!! searchKeep && ! ( searchKeep.has( l.source.id ) && searchKeep.has( l.target.id ) )
				);
			} );

			noMatchEl.style.display = ( q.length > 0 && ! matches.length ) ? '' : 'none';

			if ( matches.length ) {
				centerOnMatch(); // also fills in the "1/n" counter
			} else {
				countEl.textContent = q.length > 0 ? '0' : '';
			}
		};

		const clearSearch = () => {
			searchInput.value = '';
			runSearch();
			searchInput.blur();
		};

		searchInput.addEventListener( 'input', runSearch );

		searchInput.addEventListener( 'keydown', ( e ) => {
			if ( e.key === 'Escape' ) {
				e.stopPropagation();
				clearSearch();
				return;
			}
			// Enter steps to the next hit, Shift+Enter to the previous — both wrap
			// around. preventDefault stops the surrounding admin form submitting.
			if ( e.key === 'Enter' ) {
				e.preventDefault();
				if ( ! matchList.length ) return;
				const step = e.shiftKey ? -1 : 1;
				matchIdx = ( matchIdx + step + matchList.length ) % matchList.length;
				centerOnMatch();
			}
		} );

		clearBtn.addEventListener( 'click', clearSearch );

		// Pan on empty canvas.
		let panning = false, panStartX = 0, panStartY = 0, origState = null;
		svg.addEventListener( 'pointerdown', ( e ) => {
			if ( e.target !== svg ) return;
			panning = true;
			panStartX = e.clientX; panStartY = e.clientY;
			origState = { ...state };
			svg.setPointerCapture( e.pointerId );
		} );
		svg.addEventListener( 'pointermove', ( e ) => {
			if ( ! panning ) return;
			const rect = svg.getBoundingClientRect();
			const scale = VB_W / rect.width;
			state.x = origState.x + ( e.clientX - panStartX ) * scale;
			state.y = origState.y + ( e.clientY - panStartY ) * scale;
			applyTransform();
		} );
		svg.addEventListener( 'pointerup', () => { panning = false; } );

		// Zoom, centered on the viewport.
		svg.addEventListener( 'wheel', ( e ) => {
			e.preventDefault();
			const newK = Math.max( 0.25, Math.min( 3, state.k * ( e.deltaY < 0 ? 1.1 : 0.9 ) ) );
			const cx = VB_W / 2, cy = VB_H / 2;
			state.x = cx - ( ( cx - state.x ) / state.k ) * newK;
			state.y = cy - ( ( cy - state.y ) / state.k ) * newK;
			state.k = newK;
			applyTransform();
		}, { passive: false } );

		return wrap;
	}
}
