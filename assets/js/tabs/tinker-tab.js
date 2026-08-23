/**
 * WPTE Dev Zone — TinkerTab
 * PHP scratchpad. Sends code to admin-ajax, renders echoed output, the return
 * value, notices and fatals.
 */
/* global wpteDbg */

import { DomHelper } from '../dom-helper.js';
import { HierarchyView } from '../utilities/hierarchy-view.js';

const { ajaxurl, nonce } = wpteDbg;

const DRAFT_KEY = 'wte_dbg_tinker_draft';
const LAST_KEY  = 'wte_dbg_tinker_last_snippet';
const SPLIT_KEY = 'wte_dbg_tinker_split';

export class TinkerTab {
	constructor( contentEl ) {
		this.contentEl  = contentEl;
		this._fetchCtrl = null;
		this._snippets  = {};
		this._handlers  = [];
	}

	destroy() {
		if ( this._fetchCtrl ) {
			DomHelper.setStatus( 'Cancelled — tinker run', 'cancelled' );
			this._fetchCtrl.abort();
			this._fetchCtrl = null;
		}
		this._handlers.forEach( ( [ el, type, fn ] ) => el.removeEventListener( type, fn ) );
		this._handlers = [];
		this._cm?.toTextArea();
		this._cm = null;
	}

	init() {
		const root = this.contentEl.querySelector( '.wte-dbg-tinker-tab' );
		if ( ! root ) return this;

		this._root      = root;
		this._enabled   = root.dataset.enabled === '1';
		this._code      = root.querySelector( '.wte-dbg-tinker-code' );
		this._gutter    = root.querySelector( '.wte-dbg-tinker-gutter' );
		this._output    = root.querySelector( '.wte-dbg-tinker-output' );
		this._metrics   = root.querySelector( '.wte-dbg-tinker-metrics' );
		this._select    = root.querySelector( '.wte-dbg-tinker-snippet-select' );
		this._nameInput = root.querySelector( '.wte-dbg-tinker-name' );
		this._runBtn    = root.querySelector( '.wte-dbg-tinker-run' );
		this._saveBtn   = root.querySelector( '.wte-dbg-tinker-save' );
		this._deleteBtn = root.querySelector( '.wte-dbg-tinker-delete' );
		this._clearBtn  = root.querySelector( '.wte-dbg-tinker-clear' );
		this._split     = root.querySelector( '.wte-dbg-tinker-split' );
		this._resizer   = root.querySelector( '.wte-dbg-tinker-resizer' );
		this._editorPane = root.querySelector( '.wte-dbg-tinker-editor-pane' );

		this._cm = null;
		this._initResizer();
		this._initCodeMirror();

		this._readSnippetsFromSelect();
		this._restore();

		if ( this._cm ) {
			this._cm.on( 'change', () => this._saveDraft() );
		} else {
			this._on( this._code, 'input',  () => { this._syncGutter(); this._saveDraft(); } );
			this._on( this._code, 'scroll', () => this._syncGutter( true ) );
			this._on( this._code, 'keydown', ( e ) => this._onKeydown( e ) );
			this._syncGutter();
		}

		this._on( this._select, 'change', () => this._onSelect() );
		this._on( this._runBtn, 'click', () => this._run() );
		this._on( this._saveBtn, 'click', () => this._save() );
		this._on( this._deleteBtn, 'click', () => this._delete() );
		this._on( this._clearBtn, 'click', () => this._clear() );

		this._focusEditor();

		// Wired only *after* the focus above — CodeMirror/the textarea fire their
		// focus event synchronously from .focus(), so this never sees that first,
		// programmatic focus and wipe the just-restored snippet selection.
		// Any focus after this point is the user actually clicking/tabbing into
		// the editor, which means they're about to diverge from whatever snippet
		// is selected — detach so Save can't silently overwrite it by name.
		const detachSnippet = () => this._detachSnippet();
		if ( this._cm ) {
			this._cm.on( 'focus', detachSnippet );
		} else {
			this._on( this._code, 'focus', detachSnippet );
		}

		// Everything above is synchronous — real editor mounted, snippets and
		// draft restored, listeners wired — so it's now safe to drop the
		// server-rendered skeleton and reveal it.
		root.querySelector( '.wte-dbg-tinker-skeleton' )?.remove();

		return this;
	}

	/**
	 * Loads WordPress's own bundled CodeMirror (same one behind the Plugin/Theme
	 * File Editor) for PHP syntax highlighting — no third-party package needed.
	 * Falls back to the plain textarea + manual gutter when it's unavailable
	 * (Tinker disabled, or the user turned off syntax highlighting in their profile).
	 */
	_initCodeMirror() {
		if ( ! window.wp?.codeEditor || ! window.wp?.CodeMirror ) {
			return;
		}
		const instance = window.wp.codeEditor.initialize( this._code, {
			codemirror: {
				mode: { name: 'php', startOpen: true },
				extraKeys: {
					'Cmd-Enter':  () => this._run(),
					'Ctrl-Enter': () => this._run(),
					'Cmd-S':      () => this._save(),
					'Ctrl-S':     () => this._save(),
				},
			},
		} );
		this._cm = instance.codemirror;
		this._root.classList.add( 'has-codemirror' );
	}

	_getCode() {
		return this._cm ? this._cm.getValue() : this._code.value;
	}

	_setCode( value ) {
		if ( this._cm ) {
			this._cm.setValue( value );
			this._cm.clearHistory();
		} else {
			this._code.value = value;
		}
	}

	_focusEditor() {
		if ( this._cm ) {
			this._cm.focus();
		} else {
			this._code.focus();
		}
	}

	// -----------------------------------------------------------------------
	// Resizable split
	// -----------------------------------------------------------------------

	/** Drag handle between the code and output panes. Ratio persists across tab loads. */
	_initResizer() {
		if ( ! this._resizer || ! this._split || ! this._editorPane ) return;

		const MIN_PX = 220;

		this._applySplitRatio( this._readSplitRatio() );

		let startX = 0;
		let startWidth = 0;
		let totalWidth = 0;

		const onMove = ( e ) => {
			const dx       = e.clientX - startX;
			const maxWidth = totalWidth - MIN_PX;
			const width    = Math.min( maxWidth, Math.max( MIN_PX, startWidth + dx ) );
			this._editorPane.style.width = width + 'px';
		};

		const onUp = ( e ) => {
			this._split.classList.remove( 'is-resizing' );
			this._resizer.releasePointerCapture( e.pointerId );
			window.removeEventListener( 'pointermove', onMove );
			window.removeEventListener( 'pointerup', onUp );
			this._saveSplitRatio( this._editorPane.getBoundingClientRect().width / totalWidth );
			this._cm?.refresh();
		};

		this._on( this._resizer, 'pointerdown', ( e ) => {
			if ( e.button !== undefined && e.button !== 0 ) return;
			startX     = e.clientX;
			startWidth = this._editorPane.getBoundingClientRect().width;
			totalWidth = this._split.getBoundingClientRect().width;
			this._split.classList.add( 'is-resizing' );
			this._resizer.setPointerCapture( e.pointerId );
			window.addEventListener( 'pointermove', onMove );
			window.addEventListener( 'pointerup', onUp );
		} );

		this._on( this._resizer, 'dblclick', () => {
			this._applySplitRatio( 0.5 );
			this._saveSplitRatio( 0.5 );
			this._cm?.refresh();
		} );

		this._on( this._resizer, 'keydown', ( e ) => {
			const STEP = { ArrowLeft: -0.03, ArrowRight: 0.03 }[ e.key ];
			if ( ! STEP ) return;
			e.preventDefault();
			const current = this._editorPane.getBoundingClientRect().width / this._split.getBoundingClientRect().width;
			const next    = Math.min( 0.85, Math.max( 0.15, current + STEP ) );
			this._applySplitRatio( next );
			this._saveSplitRatio( next );
			this._cm?.refresh();
		} );
	}

	_applySplitRatio( ratio ) {
		this._editorPane.style.width = ( ratio * 100 ) + '%';
	}

	_readSplitRatio() {
		let raw = null;
		try { raw = localStorage.getItem( SPLIT_KEY ); } catch ( e ) {}
		const ratio = parseFloat( raw );
		return Number.isFinite( ratio ) && ratio > 0 && ratio < 1 ? ratio : 0.5;
	}

	_saveSplitRatio( ratio ) {
		try { localStorage.setItem( SPLIT_KEY, String( ratio ) ); } catch ( e ) {}
	}

	_on( el, type, fn ) {
		if ( ! el ) return;
		el.addEventListener( type, fn );
		this._handlers.push( [ el, type, fn ] );
	}

	// -----------------------------------------------------------------------
	// Editor
	// -----------------------------------------------------------------------

	_onKeydown( e ) {
		if ( ( e.metaKey || e.ctrlKey ) && e.key === 'Enter' ) {
			e.preventDefault();
			this._run();
			return;
		}
		if ( ( e.metaKey || e.ctrlKey ) && e.key.toLowerCase() === 's' ) {
			e.preventDefault();
			this._save();
			return;
		}
		if ( e.key === 'Tab' ) {
			e.preventDefault();
			const { selectionStart: start, selectionEnd: end, value } = this._code;
			this._code.value = value.slice( 0, start ) + '\t' + value.slice( end );
			this._code.selectionStart = this._code.selectionEnd = start + 1;
			this._syncGutter();
			this._saveDraft();
		}
	}

	_syncGutter( scrollOnly = false ) {
		if ( ! this._gutter ) return;
		if ( ! scrollOnly ) {
			const lines = this._code.value.split( '\n' ).length;
			if ( this._gutter.childElementCount !== lines ) {
				DomHelper.setTextContent( this._gutter, '' );
				const frag = document.createDocumentFragment();
				for ( let i = 1; i <= lines; i++ ) {
					const span = document.createElement( 'span' );
					span.textContent = String( i );
					frag.appendChild( span );
				}
				this._gutter.appendChild( frag );
			}
		}
		this._gutter.scrollTop = this._code.scrollTop;
	}

	// -----------------------------------------------------------------------
	// Snippets
	// -----------------------------------------------------------------------

	_readSnippetsFromSelect() {
		this._snippets = {};
		[ ...this._select.options ].forEach( ( opt ) => {
			if ( opt.value ) {
				this._snippets[ opt.value ] = { name: opt.textContent.trim(), code: opt.dataset.code || '' };
			}
		} );
	}

	_rebuildSelect( snippets, keepKey ) {
		const scratch = this._select.options[ 0 ];
		DomHelper.setTextContent( this._select, '' );
		this._select.appendChild( scratch );
		Object.entries( snippets ).forEach( ( [ key, snippet ] ) => {
			const opt = document.createElement( 'option' );
			opt.value        = key;
			opt.textContent  = snippet.name || key;
			opt.dataset.code = snippet.code || '';
			this._select.appendChild( opt );
		} );
		this._snippets = snippets;
		this._select.value = keepKey && snippets[ keepKey ] ? keepKey : '';
		this._syncDeleteState();
	}

	_syncDeleteState() {
		this._deleteBtn.disabled = ! this._select.value;
	}

	/** Clears the "editing this saved snippet" identity — the code is no longer assumed to match it. */
	_detachSnippet() {
		if ( ! this._select.value && ! this._nameInput.value ) return;
		this._select.value    = '';
		this._nameInput.value = '';
		try { localStorage.removeItem( LAST_KEY ); } catch ( e ) {}
		this._syncDeleteState();
	}

	_onSelect() {
		const key = this._select.value;
		try { localStorage.setItem( LAST_KEY, key ); } catch ( e ) {}
		this._syncDeleteState();
		if ( ! key ) {
			this._nameInput.value = '';
			return;
		}
		const snippet = this._snippets[ key ];
		if ( ! snippet ) return;
		this._setCode( snippet.code );
		this._nameInput.value = snippet.name;
		this._saveDraft();
	}

	_save() {
		const name = this._nameInput.value.trim();
		if ( ! name ) {
			DomHelper.setStatus( 'Name the snippet first', 'error', 3 );
			this._nameInput.focus();
			return;
		}
		DomHelper.setStatus( 'Saving snippet\u2026', 'info' );
		this._ajax( 'wpte_devzone_tinker_save_snippet', { name, code: this._getCode() } )
			.then( ( data ) => {
				this._rebuildSelect( data.snippets, data.key );
				try { localStorage.setItem( LAST_KEY, data.key ); } catch ( e ) {}
				DomHelper.setStatus( 'Snippet saved', 'success', 2 );
				this._clear();
			} )
			.catch( ( msg ) => DomHelper.setStatus( msg, 'error', 4 ) );
	}

	/** Reset the editor to a blank scratch state \u2014 code, output, and metrics. */
	_clear() {
		this._setCode( '' );
		this._saveDraft();
		DomHelper.setTextContent( this._output, '' );
		DomHelper.setTextContent( this._metrics, '' );
		this._focusEditor();
	}

	_delete() {
		const key = this._select.value;
		if ( ! key ) return;
		DomHelper.setStatus( 'Deleting snippet\u2026', 'info' );
		this._ajax( 'wpte_devzone_tinker_delete_snippet', { key } )
			.then( ( data ) => {
				this._rebuildSelect( data.snippets, '' );
				this._nameInput.value = '';
				try { localStorage.removeItem( LAST_KEY ); } catch ( e ) {}
				DomHelper.setStatus( 'Snippet deleted', 'success', 2 );
			} )
			.catch( ( msg ) => DomHelper.setStatus( msg, 'error', 4 ) );
	}

	_restore() {
		let draft = null;
		let last  = null;
		try {
			draft = localStorage.getItem( DRAFT_KEY );
			last  = localStorage.getItem( LAST_KEY );
		} catch ( e ) {}

		if ( last && this._snippets[ last ] ) {
			this._select.value    = last;
			this._nameInput.value = this._snippets[ last ].name;
		}
		this._setCode( draft !== null && draft !== ''
			? draft
			: ( this._snippets[ last ]?.code || this._code.dataset.boilerplate || '' ) );
		this._syncDeleteState();
	}

	_saveDraft() {
		try { localStorage.setItem( DRAFT_KEY, this._getCode() ); } catch ( e ) {}
	}

	// -----------------------------------------------------------------------
	// Run
	// -----------------------------------------------------------------------

	_run() {
		if ( ! this._enabled ) return;
		const code = this._getCode().trim();
		if ( ! code ) {
			DomHelper.setStatus( 'Nothing to run', 'error', 2 );
			return;
		}

		this._fetchCtrl?.abort();
		this._fetchCtrl = new AbortController();

		this._runBtn.disabled = true;
		this._root.classList.add( 'is-running' );
		DomHelper.setTextContent( this._metrics, 'running…' );
		DomHelper.setTextContent( this._output, '' );
		this._output.appendChild( this._makeLoader() );

		this._ajax( 'wpte_devzone_tinker_run', { code: this._getCode() }, this._fetchCtrl.signal )
			.then( ( data ) => this._render( data ) )
			.catch( ( msg ) => {
				if ( msg === 'aborted' ) return;
				DomHelper.setTextContent( this._output, '' );
				this._output.appendChild( this._makeBlock( 'is-fatal', 'Request failed', msg ) );
				DomHelper.setTextContent( this._metrics, '' );
			} )
			.finally( () => {
				this._runBtn.disabled = false;
				this._root.classList.remove( 'is-running' );
				this._fetchCtrl = null;
			} );
	}

	/** Spinner confined to the output pane — run status never leaks to the global header notice. */
	_makeLoader() {
		const wrap = document.createElement( 'div' );
		wrap.className = 'wte-dbg-tinker-loader';
		const spinner = document.createElement( 'div' );
		spinner.className = 'wte-dbg-loader-spinner';
		wrap.appendChild( spinner );
		return wrap;
	}

	_render( data ) {
		DomHelper.setTextContent( this._output, '' );

		const metrics = [ data.time_ms + ' ms', data.memory, 'peak ' + data.peak_memory ];
		if ( data.exited ) metrics.push( 'exited' );
		DomHelper.setTextContent( this._metrics, metrics.join( ' · ' ) );

		if ( data.fatal ) {
			const where = data.fatal.file ? `${ data.fatal.file }:${ data.fatal.line }` : '';
			const body  = data.fatal.message + ( where ? '\n\n' + where : '' )
				+ ( data.fatal.trace?.length ? '\n\n' + data.fatal.trace.join( '\n' ) : '' );
			this._output.appendChild( this._makeBlock( 'is-fatal', data.fatal.type, body ) );
		}

		( data.diagnostics || [] ).forEach( ( d ) => {
			const where = d.file ? `  (${ d.file }:${ d.line })` : '';
			this._output.appendChild( this._makeBlock( 'is-notice', d.type, d.message + where ) );
		} );

		if ( data.output ) {
			const block = document.createElement( 'div' );
			block.className = 'wte-dbg-tinker-block is-output';
			block.appendChild( this._makeLabel( 'Printed output' ) );
			const body = document.createElement( 'div' );
			body.className = 'wte-dbg-tinker-block-body is-html';
			block.appendChild( body );
			this._output.appendChild( block );
			DomHelper.setServerHtml( body, data.output );
		}

		if ( data.has_result ) {
			this._output.appendChild( this._makeResultBlock( data ) );
		}

		if ( ! data.fatal && ! data.output && ! data.has_result && ! ( data.diagnostics || [] ).length ) {
			this._output.appendChild( DomHelper.makePara( 'wte-dbg-empty', 'Ran clean — no output, no return value.' ) );
		}
	}

	_makeLabel( text ) {
		const label = document.createElement( 'div' );
		label.className = 'wte-dbg-tinker-block-label';
		label.textContent = text;
		return label;
	}

	_makeBlock( variant, label, body ) {
		const block = document.createElement( 'div' );
		block.className = 'wte-dbg-tinker-block ' + variant;
		block.appendChild( this._makeLabel( label ) );
		const pre = document.createElement( 'pre' );
		pre.className = 'wte-dbg-tinker-block-body';
		pre.textContent = body;
		block.appendChild( pre );
		return block;
	}

	/**
	 * Return-value block. Arrays/objects render as the same collapsible tree
	 * (HierarchyView) the Query tab's beautifier uses instead of a flat print_r
	 * dump; everything else stays a plain text block.
	 */
	_makeResultBlock( data ) {
		const block = document.createElement( 'div' );
		block.className = 'wte-dbg-tinker-block is-result';

		const labelRow = document.createElement( 'div' );
		labelRow.className = 'wte-dbg-tinker-block-label';
		labelRow.appendChild( document.createTextNode( 'Return value — ' + data.result_type ) );
		block.appendChild( labelRow );

		if ( data.result_tree === null || data.result_tree === undefined ) {
			const pre = document.createElement( 'pre' );
			pre.className = 'wte-dbg-tinker-block-body';
			pre.textContent = data.result;
			block.appendChild( pre );
			return block;
		}

		// Only the tree structure expands here — truncated leaf values stay
		// collapsed until the user clicks that specific value.
		const { expandAllBtn, treeEl, graphToggleBtn, graphEl } = HierarchyView.renderTreeSection( data.result_tree, { toggleValues: false, maxLen: 120 } );
		labelRow.insertBefore( expandAllBtn, labelRow.firstChild );
		labelRow.appendChild( graphToggleBtn );

		const body = document.createElement( 'div' );
		body.className = 'wte-dbg-tinker-block-body is-tree';
		body.appendChild( treeEl );
		body.appendChild( graphEl );
		block.appendChild( body );

		return block;
	}

	_ajax( action, params, signal ) {
		return fetch( ajaxurl, {
			method: 'POST',
			signal,
			body: new URLSearchParams( Object.assign( { action, _ajax_nonce: nonce }, params ) ),
		} )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				if ( ! res.success ) {
					return Promise.reject( res.data?.message || 'Request failed.' );
				}
				return res.data;
			} )
			.catch( ( err ) => Promise.reject( err?.name === 'AbortError' ? 'aborted' : ( err.message || err ) ) );
	}
}
