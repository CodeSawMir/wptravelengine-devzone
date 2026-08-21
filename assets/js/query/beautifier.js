import { DomHelper }  from '../dom-helper.js';
import { UnserTree } from './unser-tree.js';
import { Icons }     from '../constants.js';

export class Beautifier {
	// Cross-visit state — persists across tab switches, cleared only on page reload.
	static _state = { input: '', lastRes: null };
	static _unserCtrl = null;
	static _varDumpCtrl = null;
	static BADGE_LABELS = {
		json: 'JSON',
		php: 'PHP',
		'base64+json': 'Base64 → JSON',
		'base64+php': 'Base64 → PHP',
		base64: 'Base64',
		url: 'URL params',
		vardump: 'var_dump',
	};

	constructor(wrap, { ajaxurl, nonce }) {
		this.wrap = wrap;
		this.ajaxurl = ajaxurl;
		this.nonce = nonce;
		this.maximizeBtn = wrap.querySelector('.wte-dbg-unser-maximize');
	}

	init() {
		this._restoreState();
		this._initCollapse();
		this._initResize();
		this._initMaximize();
		this._initBeautify();
	}

	_restoreState() {
		const wrap = this.wrap;
		const sidebar = wrap.querySelector('.wte-dbg-unserializer');
		const input = wrap.querySelector('.wte-dbg-unser-input');
		const outputEl = wrap.querySelector('.wte-dbg-unser-output');

		if (!sidebar) return;

		// Restore input text from previous tab visit.
		if (input && Beautifier._state.input) input.value = Beautifier._state.input;
		if (input) input.addEventListener('input', () => { Beautifier._state.input = input.value; });

		// Restore previous result.
		if (Beautifier._state.lastRes) this.renderResult(Beautifier._state.lastRes);
	}

	_initCollapse() {
		const wrap = this.wrap;
		const sidebar = wrap.querySelector('.wte-dbg-unserializer');
		const toggleBtn = wrap.querySelector('.wte-dbg-unser-header .wte-dbg-sidebar-toggle');

		if (!sidebar) return;

		const UNSER_KEY = 'wte_dbg_unser_collapsed';

		try {
			if (localStorage.getItem(UNSER_KEY) === '1') {
				wrap.classList.add('unser-collapsed');
				if (toggleBtn) toggleBtn.textContent = Icons.PREV;
			}
		} catch (e) { }

		if (toggleBtn) {
			toggleBtn.addEventListener('click', () => {
				// If currently maximized, just restore — do not also collapse.
				if (wrap.classList.contains('unser-maximized')) {
					wrap.classList.add('unser-restoring');
					sidebar.addEventListener('animationend', () => {
						wrap.classList.remove('unser-maximized', 'unser-restoring');
						if (this.maximizeBtn) {
							this.maximizeBtn.textContent = Icons.MAXIMIZE;
							this.maximizeBtn.title = 'Maximize';
						}
					}, { once: true });
					return;
				}
				const collapsed = wrap.classList.toggle('unser-collapsed');
				toggleBtn.textContent = collapsed ? Icons.PREV : Icons.NEXT;
				// Save/restore inline width so CSS collapse rule can take effect.
				if (collapsed) {
					sidebar.dataset.savedWidth = sidebar.style.width;
					sidebar.style.width = '';
				} else if (sidebar.dataset.savedWidth) {
					sidebar.style.width = sidebar.dataset.savedWidth;
				}
				try { localStorage.setItem(UNSER_KEY, collapsed ? '1' : '0'); } catch (e) { }
			});
		}
	}

	_initResize() {
		const wrap = this.wrap;
		const sidebar = wrap.querySelector('.wte-dbg-unserializer');

		if (!sidebar) return;

		// Drag-resize handle — inserted as flex sibling just before the sidebar.
		const resizeHandle = document.createElement('div');
		resizeHandle.className = 'wte-dbg-unser-resize-handle';
		wrap.insertBefore(resizeHandle, sidebar);

		let resizing = false;
		let resizeStartX = 0;
		let resizeStartW = 0;

		resizeHandle.addEventListener('mousedown', (e) => {
			if (wrap.classList.contains('unser-collapsed')) return;
			resizing = true;
			resizeStartX = e.clientX;
			resizeStartW = sidebar.offsetWidth;
			sidebar.style.transition = 'none'; // disable slide animation while dragging
			document.body.style.cursor = 'ew-resize';
			document.body.style.userSelect = 'none';
			e.preventDefault();
		});

		document.addEventListener('mousemove', (e) => {
			if (!resizing) return;
			// Moving the cursor left → positive dx → wider sidebar
			const dx = resizeStartX - e.clientX;
			const newWidth = Math.max(200, Math.min(800, resizeStartW + dx));
			sidebar.style.width = newWidth + 'px';
		});

		document.addEventListener('mouseup', () => {
			if (!resizing) return;
			resizing = false;
			sidebar.style.transition = '';
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
		});
	}

	_initMaximize() {
		const wrap = this.wrap;
		const sidebar = wrap.querySelector('.wte-dbg-unserializer');
		const toggleBtn = wrap.querySelector('.wte-dbg-unser-header .wte-dbg-sidebar-toggle');

		if (this.maximizeBtn) {
			this.maximizeBtn.addEventListener('click', () => {
				if (wrap.classList.contains('unser-maximized')) {
					// Play restore animation then remove maximized state.
					wrap.classList.add('unser-restoring');
					sidebar.addEventListener('animationend', () => {
						wrap.classList.remove('unser-maximized', 'unser-restoring');
						this.maximizeBtn.textContent = Icons.MAXIMIZE;
						this.maximizeBtn.title = 'Maximize';
					}, { once: true });
				} else {
					// Expand — ensure not collapsed first.
					if (wrap.classList.contains('unser-collapsed')) {
						wrap.classList.remove('unser-collapsed');
						if (toggleBtn) toggleBtn.textContent = Icons.NEXT;
					}
					wrap.classList.add('unser-maximized');
					this.maximizeBtn.textContent = Icons.RESTORE;
					this.maximizeBtn.title = 'Restore';
				}
			});
		}
	}

	_initBeautify() {
		const wrap = this.wrap;
		const input = wrap.querySelector('.wte-dbg-unser-input');
		const runBtn = wrap.querySelector('.wte-dbg-unser-btn');
		const varDumpBtn = wrap.querySelector('.wte-dbg-vardump-btn');
		const outputEl = wrap.querySelector('.wte-dbg-unser-output');

		const setButtonsDisabled = (disabled) => {
			runBtn.disabled = disabled;
			if (varDumpBtn) varDumpBtn.disabled = disabled;
		};

		// Beautify button
		runBtn.addEventListener('click', () => {
			const data = input.value.trim();
			if (!data) return;

			Beautifier._unserCtrl?.abort();
			Beautifier._unserCtrl = new AbortController();

			setButtonsDisabled(true);
			window.wteDbgSetStatus?.(`Processing${ Icons.ELLIPSIS }`, 'info');
			outputEl.textContent = `Processing${ Icons.ELLIPSIS }`;

			const body = new URLSearchParams({
				action: 'wpte_devzone_unserialize',
				data,
				_ajax_nonce: this.nonce,
			});

			fetch(this.ajaxurl, { method: 'POST', body, signal: Beautifier._unserCtrl.signal })
				.then((r) => r.json())
				.then((res) => {
					this.renderResult(res);
					window.wteDbgClearStatus?.();
				})
				.catch((e) => {
					if (e.name === 'AbortError') {
						window.wteDbgSetStatus?.(`Cancelled ${ Icons.EM_DASH } unserialize`, 'cancelled');
						return;
					}
					window.wteDbgSetStatus?.('Request failed.', 'error', 3);
				})
				.finally(() => {
					setButtonsDisabled(false);
				});
		});

		// Var Dump button
		if (varDumpBtn) {
			varDumpBtn.addEventListener('click', () => {
				const data = input.value.trim();
				if (!data) return;

				Beautifier._varDumpCtrl?.abort();
				Beautifier._varDumpCtrl = new AbortController();

				setButtonsDisabled(true);
				window.wteDbgSetStatus?.(`Processing${ Icons.ELLIPSIS }`, 'info');
				outputEl.textContent = `Processing${ Icons.ELLIPSIS }`;

				const body = new URLSearchParams({
					action: 'wpte_devzone_var_dump',
					data,
					_ajax_nonce: this.nonce,
				});

				fetch(this.ajaxurl, { method: 'POST', body, signal: Beautifier._varDumpCtrl.signal })
					.then((r) => r.json())
					.then((res) => {
						this.renderResult(res);
						window.wteDbgClearStatus?.();
					})
					.catch((e) => {
						if (e.name === 'AbortError') {
							window.wteDbgSetStatus?.(`Cancelled ${ Icons.EM_DASH } var_dump`, 'cancelled');
							return;
						}
						window.wteDbgSetStatus?.('Request failed.', 'error', 3);
					})
					.finally(() => {
						setButtonsDisabled(false);
					});
			});
		}
	}

	renderResult(res) {
		const outputEl = this.wrap.querySelector('.wte-dbg-unser-output');
		Beautifier._state.lastRes = res;
		while (outputEl.firstChild) outputEl.removeChild(outputEl.firstChild);
		if (res.success) {
			const { tree, format } = res.data;
			if (format === 'unknown') {
				this._renderFallback(outputEl, tree);
			} else {
				const treeEl = UnserTree.build(tree);
				const badgeRow = document.createElement('div');
				badgeRow.className = 'wte-dbg-unser-badge-row';

				if (Beautifier.BADGE_LABELS[format]) {
					const lbl = document.createElement('span');
					lbl.className = 'wte-dbg-count wte-dbg-unser-format-badge';
					lbl.textContent = Beautifier.BADGE_LABELS[format];
					badgeRow.appendChild(lbl);
				}

				const expandAll = document.createElement('span');
				expandAll.className = 'wte-dbg-count wte-dbg-unser-format-badge wte-dbg-expand-all';
				expandAll.textContent = Icons.EXPAND_ALL;
				expandAll.title = 'Expand all';
				expandAll.addEventListener('click', () => {
					const expanding = expandAll.dataset.state !== 'expanded';
					expandAll.dataset.state = expanding ? 'expanded' : '';
					expandAll.textContent = expanding ? Icons.COLLAPSE_ALL : Icons.EXPAND_ALL;
					expandAll.title = expanding ? 'Collapse all' : 'Expand all';
					treeEl.querySelectorAll('.wte-dbg-node').forEach(el => {
						el.open = expanding;
					});
					treeEl.querySelectorAll('.wte-dbg-value').forEach(el => {
						DomHelper.toggleValueExpand( el, expanding, 120 );
					});
				});
				badgeRow.insertBefore(expandAll, badgeRow.firstChild);

				DomHelper.setupValueClicks( treeEl, 120 );
				outputEl.appendChild(badgeRow);
				outputEl.appendChild(treeEl);
			}
		} else {
			outputEl.textContent = 'Error.';
		}
	}

	_renderFallback(container, raw) {
		const notice = document.createElement('div');
		notice.className = 'wte-dbg-unser-unknown-notice';
		notice.textContent = `Unknown format ${ Icons.EM_DASH } showing raw input.`;

		const pre = document.createElement('pre');
		pre.className = 'wte-dbg-unser-pre';
		pre.textContent = raw;

		container.appendChild(notice);
		container.appendChild(pre);
	}
}
