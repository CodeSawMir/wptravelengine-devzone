/**
 * WPTE Dev Zone — InlineEditor
 * Shared inline-editing and flash feedback logic.
 *
 * Security note: All server-supplied strings are HTML-escaped via esc() before
 * any innerHTML assignment. No raw user input is ever inserted unescaped.
 */
/* global wpteDbg */

import { DomHelper } from './dom-helper.js';
import { Icons }     from './constants.js';

const { ajaxurl, nonce } = wpteDbg;

export class InlineEditor {
	/**
	 * @param {Function} getCurrentPostId   — returns current post ID from owning tab
	 * @param {Function} getCurrentPostType — returns current post type from owning tab
	 */
	constructor( getCurrentPostId, getCurrentPostType ) {
		this._getPostId          = getCurrentPostId;
		this._getPostType        = getCurrentPostType;
		this._saveController     = null;
		this._postFieldController = null;
	}

	activateEdit( row ) {
		if ( row.querySelector( '.wte-dbg-input' ) ) return;

		const valueEl = row.querySelector( '.wte-dbg-value' );
		const editBtn = row.querySelector( '.wte-dbg-edit-btn' );
		if ( ! valueEl || ! editBtn ) return;

		const raw    = valueEl.dataset.raw || '';
		const isLong = raw.length > 80;

		const input = document.createElement( isLong ? 'textarea' : 'input' );
		input.value     = raw;
		input.className = 'wte-dbg-input';

		const saveBtn   = DomHelper.makeButton( Icons.CHECK, 'wte-dbg-save' );
		const cancelBtn = DomHelper.makeButton( Icons.CROSS, 'wte-dbg-cancel' );

		valueEl.replaceWith( input );
		editBtn.replaceWith( saveBtn, cancelBtn );

		input.focus();

		saveBtn.addEventListener( 'click', () => this.doSave( row, input.value ) );
		cancelBtn.addEventListener( 'click', () => this.restoreRow( row, raw ) );

		input.addEventListener( 'keydown', ( e ) => {
			if ( e.key === 'Enter' && ! isLong ) {
				e.preventDefault();
				this.doSave( row, input.value );
			}
			if ( e.key === 'Escape' ) {
				this.restoreRow( row, raw );
			}
		} );
	}

	restoreRow( row, raw ) {
		const input     = row.querySelector( '.wte-dbg-input' );
		const saveBtn   = row.querySelector( '.wte-dbg-save' );
		const cancelBtn = row.querySelector( '.wte-dbg-cancel' );

		if ( input ) input.replaceWith( DomHelper.makeValueSpan( raw ) );
		if ( saveBtn )   saveBtn.remove();
		if ( cancelBtn ) cancelBtn.remove();

		row.appendChild( DomHelper.makeEditBtn() );
	}

	doSave( row, value ) {
		const isOption  = row.dataset.optionName !== undefined && row.dataset.optionName !== '';
		const isPostFld = row.dataset.field !== undefined && row.dataset.field !== '';

		let body;

		if ( isOption ) {
			body = {
				action:      'wpte_devzone_save_option',
				option_name: row.dataset.optionName,
				key_path:    row.dataset.path || '',
				value,
			};
		} else if ( isPostFld ) {
			body = {
				action:  'wpte_devzone_save_post_field',
				post_id: row.dataset.postId || this._getPostId(),
				field:   row.dataset.field,
				value,
			};
		} else {
			const parts   = ( row.dataset.path || '' ).split( '.' );
			const metaKey = parts[ 0 ];
			const keyPath = parts.slice( 1 ).join( '.' );
			body = {
				action:   'wpte_devzone_save_meta',
				post_id:  this._getPostId(),
				meta_key: metaKey,
				key_path: keyPath,
				value,
			};
		}

		body._ajax_nonce = nonce;

		// Build a human-readable label for status/cancel messages.
		const postId    = row.dataset.postId || this._getPostId();
		const postSuffix = postId ? ' (#' + postId + ')' : '';
		const saveLabel = isOption  ? ( row.dataset.optionName || 'option' )
		                : isPostFld ? ( ( row.dataset.field || 'field' ) + postSuffix )
		                :             ( ( ( row.dataset.path || '' ).split( '.' )[ 0 ] || 'meta' ) + postSuffix );

		this._saveController?.abort();
		this._saveController = new AbortController();

		DomHelper.setStatus( `Saving${ Icons.ELLIPSIS }` );

		fetch( ajaxurl, {
			method: 'POST',
			body:   new URLSearchParams( body ),
			signal: this._saveController.signal,
		} )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				if ( res.success ) {
					DomHelper.setStatus( `Saved ${ Icons.CHECK }`, 'success' );
					setTimeout( () => DomHelper.clearStatus(), 2000 );
					this.flashSuccess( row, value );
				} else {
					const msg = ( res.data && res.data.message ) ? res.data.message : 'Save failed';
					DomHelper.setStatus( msg, 'error' );
					setTimeout( () => DomHelper.clearStatus(), 3000 );
					this.flashError( row, msg );
				}
			} )
			.catch( ( e ) => {
				if ( e.name === 'AbortError' ) {
					DomHelper.setStatus( `Cancelled ${ Icons.EM_DASH } ${ saveLabel } save`, 'cancelled' );
					return;
				}
				DomHelper.setStatus( 'Network error', 'error' );
				setTimeout( () => DomHelper.clearStatus(), 3000 );
				this.flashError( row, 'Network error' );
			} );
	}

	doDeleteOption( btn, optionName ) {
		btn.disabled = true;
		const svgIcon = btn.querySelector( 'svg' ) ? btn.querySelector( 'svg' ).cloneNode( true ) : null;
		btn.textContent = Icons.HOURGLASS;

		const restoreIcon = () => {
			btn.textContent = '';
			if ( svgIcon ) btn.appendChild( svgIcon.cloneNode( true ) );
		};

		DomHelper.setStatus( `Deleting${ Icons.ELLIPSIS }` );

		fetch( ajaxurl, {
			method: 'POST',
			body:   new URLSearchParams( {
				action:      'wpte_devzone_delete_option',
				option_name: optionName,
				_ajax_nonce: nonce,
			} ),
		} )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				if ( res.success ) {
					DomHelper.setStatus( `Deleted ${ Icons.CHECK }`, 'success' );
					setTimeout( () => DomHelper.clearStatus(), 2000 );
					const block = btn.closest( '.wte-dbg-option-block' );
					if ( block ) {
						block.style.transition = 'opacity 0.3s';
						block.style.opacity    = '0';
						setTimeout( () => block.remove(), 300 );
					}
				} else {
					const msg = res.data && res.data.message ? res.data.message : 'Delete failed';
					DomHelper.setStatus( 'Error: ' + msg, 'error' );
					setTimeout( () => DomHelper.clearStatus(), 3000 );
					btn.disabled = false;
					restoreIcon();
				}
			} )
			.catch( () => {
				DomHelper.setStatus( 'Network error', 'error' );
				setTimeout( () => DomHelper.clearStatus(), 3000 );
				btn.disabled = false;
				restoreIcon();
			} );
	}

	savePostField( postId, field, value, selectEl ) {
		this._postFieldController?.abort();
		this._postFieldController = new AbortController();

		DomHelper.setStatus( `Saving${ Icons.ELLIPSIS }` );

		fetch( ajaxurl, {
			method: 'POST',
			body:   new URLSearchParams( {
				action:      'wpte_devzone_save_post_field',
				post_id:     postId,
				field,
				value,
				_ajax_nonce: nonce,
			} ),
			signal: this._postFieldController.signal,
		} )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				if ( res.success ) {
					DomHelper.setStatus( `Saved ${ Icons.CHECK }`, 'success' );
					setTimeout( () => DomHelper.clearStatus(), 2000 );
					const row = selectEl.closest( '.wte-dbg-row' );
					if ( row ) this.flash( row, 'flash-ok' );

					// Sync the sidebar list-item badge when post_status changes
					if ( field === 'post_status' ) {
						const listItem = document.querySelector( `.wte-dbg-list-item[data-post-id="${ postId }"]` );
						if ( listItem ) {
							const badge = listItem.querySelector( '.wte-dbg-status' );
							if ( badge ) {
								badge.className   = 'wte-dbg-status wte-dbg-status-' + value;
								badge.textContent = value;
							}
						}
					}
				} else {
					const msg = ( res.data && res.data.message ) ? res.data.message : 'Save failed';
					DomHelper.setStatus( 'Error: ' + msg, 'error' );
					setTimeout( () => DomHelper.clearStatus(), 3000 );
					const row = selectEl.closest( '.wte-dbg-row' );
					if ( row ) this.flash( row, 'flash-err' );
				}
			} )
			.catch( ( e ) => {
				if ( e.name === 'AbortError' ) {
					DomHelper.setStatus( `Cancelled ${ Icons.EM_DASH } ${ field } (#${ postId }) save`, 'cancelled' );
					return;
				}
				DomHelper.setStatus( 'Network error', 'error' );
				setTimeout( () => DomHelper.clearStatus(), 3000 );
			} );
	}

	flashSuccess( row, newValue ) {
		const input     = row.querySelector( '.wte-dbg-input' );
		const saveBtn   = row.querySelector( '.wte-dbg-save' );
		const cancelBtn = row.querySelector( '.wte-dbg-cancel' );

		if ( input ) input.replaceWith( DomHelper.makeValueSpan( newValue ) );
		if ( saveBtn )   saveBtn.remove();
		if ( cancelBtn ) cancelBtn.remove();
		row.appendChild( DomHelper.makeEditBtn() );

		this.flash( row, 'flash-ok' );
	}

	flashError( row, message ) {
		this.flash( row, 'flash-err' );

		const existing = row.querySelector( '.wte-dbg-err-msg' );
		if ( existing ) existing.remove();

		const msg = document.createElement( 'span' );
		msg.className = 'wte-dbg-err-msg';
		msg.style.cssText = 'color:#8a1f1f;font-size:11px;margin-left:4px;';
		msg.textContent = message;
		row.appendChild( msg );
		setTimeout( () => msg.remove(), 3000 );
	}

	flash( el, cls ) {
		el.classList.remove( cls );
		void el.offsetWidth;
		el.classList.add( cls );
		el.addEventListener( 'animationend', () => el.classList.remove( cls ), { once: true } );
	}
}
