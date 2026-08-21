export class UnserTree {
	static build(data) {
		const wrap = document.createElement('div');
		wrap.className = 'wte-dbg-unser-tree';

		if (data === null || data === undefined) {
			const p = document.createElement('p');
			p.className = 'wte-dbg-empty';
			p.textContent = '(null)';
			wrap.appendChild(p);
			return wrap;
		}

		if (typeof data !== 'object') {
			const row = document.createElement('div');
			row.className = 'wte-dbg-row';
			const val = document.createElement('span');
			val.className = 'wte-dbg-value';
			val.dataset.raw = String(data);
			val.textContent = String(data);
			row.appendChild(val);
			wrap.appendChild(row);
			return wrap;
		}

		const entries = Object.entries(data);
		if (!entries.length) {
			const p = document.createElement('p');
			p.className = 'wte-dbg-empty';
			p.textContent = '(empty)';
			wrap.appendChild(p);
			return wrap;
		}

		entries.forEach(([key, value]) => {
			wrap.appendChild(UnserTree.buildNode(key, value));
		});

		UnserTree.applyStripes(wrap);
		return wrap;
	}

	static buildNode(key, value) {
		if (value !== null && typeof value === 'object') {
			const details = document.createElement('details');
			details.className = 'wte-dbg-node';

			const summary = document.createElement('summary');
			summary.className = 'wte-dbg-key';

			const entries = Object.entries(value);
			summary.appendChild(document.createTextNode(key + '\u00a0'));

			const countSpan = document.createElement('span');
			countSpan.className = 'wte-dbg-count';
			countSpan.textContent = '[' + entries.length + ' item' + (entries.length !== 1 ? 's' : '') + ']';
			summary.appendChild(countSpan);
			details.appendChild(summary);

			const children = document.createElement('div');
			children.className = 'wte-dbg-unser-children';
			entries.forEach(([k, v]) => {
				children.appendChild(UnserTree.buildNode(k, v));
			});
			details.appendChild(children);
			return details;
		}

		// Scalar leaf
		const raw = (value === null || value === undefined) ? '' : String(value);
		const row = document.createElement('div');
		row.className = 'wte-dbg-row';

		const keySpan = document.createElement('span');
		keySpan.className = 'wte-dbg-key';
		keySpan.textContent = key;

		const typeLabel = value === null ? 'null'
			: typeof value === 'boolean' ? 'bool'
				: typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'float')
					: 'string';

		const typeBadge = document.createElement('span');
		typeBadge.className = 'wte-dbg-type-badge wte-dbg-type-' + typeLabel;
		typeBadge.textContent = typeLabel;

		const valSpan = document.createElement('span');
		valSpan.className = 'wte-dbg-value';
		valSpan.dataset.raw = raw;
		valSpan.dataset.type = typeLabel === 'null' ? 'null' : (typeLabel === 'bool' ? 'boolean' : (typeLabel === 'string' ? 'string' : 'number'));
		if (raw.length > 120) {
			valSpan.textContent = raw.substring(0, 120) + '\u2026';
			valSpan.title = 'Click to expand';
			valSpan.style.cursor = 'pointer';
			valSpan.addEventListener('click', () => {
				if (window.getSelection().toString().length) return;
				const expanded = valSpan.dataset.expanded === '1';
				valSpan.dataset.expanded = expanded ? '0' : '1';
				valSpan.textContent = expanded ? raw.substring(0, 120) + '\u2026' : raw;
				valSpan.title = expanded ? 'Click to expand' : 'Click to collapse';
			});
		} else {
			valSpan.textContent = raw === '' && value !== null ? '(empty)' : raw;
		}

		row.appendChild(keySpan);
		row.appendChild(typeBadge);
		row.appendChild(valSpan);
		return row;
	}

	static applyStripes(container) {
		let idx = 0;
		for (const el of container.children) {
			if (el.classList.contains('wte-dbg-row') || el.classList.contains('wte-dbg-node')) {
				el.classList.toggle('is-stripe', (idx++) % 2 !== 0);
			}
		}
		container.querySelectorAll('.wte-dbg-unser-children').forEach(UnserTree.applyStripes);
	}
}
