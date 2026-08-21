export class Dom {
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

	static appendShimmer( container, count, msg ) {
		const wrap = document.createElement( 'div' );
		wrap.className = 'wte-dbg-shimmer-lines';
		const widths = [ '88%', '72%', '82%', '65%', '78%', '68%' ];
		for ( let i = 0; i < ( count || 4 ); i++ ) {
			const b = document.createElement( 'div' );
			b.className = 'wte-dbg-loader-block';
			b.style.cssText = `width:${ widths[ i % widths.length ] };height:18px;animation-delay:${ ( i * 0.1 ).toFixed( 1 ) }s`;
			wrap.appendChild( b );
		}
		container.appendChild( wrap );
		if ( msg ) window.wteDbgSetStatus?.( msg );
	}

	static buildPagination( paginEl, page, totalPages, onPage ) {
		Dom.setTextContent( paginEl, '' );
		if ( totalPages <= 1 ) return;

		const prev = document.createElement( 'button' );
		prev.className = 'wte-dbg-page-btn';
		prev.textContent = '\u2039';
		prev.dataset.page = page - 1;
		if ( page <= 1 ) prev.disabled = true;

		const info = document.createElement( 'span' );
		info.style.cssText = 'font-size:12px;padding:0 8px;';
		info.textContent = page + ' / ' + totalPages;

		const next = document.createElement( 'button' );
		next.className = 'wte-dbg-page-btn';
		next.textContent = '\u203a';
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
}
