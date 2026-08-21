/** Query tab — conditionally enqueued by ToolQuery::enqueue_assets(). */
/* global wpteDbg */

import { DbSearchTab } from '../query/db-search-tab.js';

const { ajaxurl, nonce } = wpteDbg;

function initDbSearch() {
	const wrap = document.querySelector( '.wte-dbg-db-search' );
	if ( ! wrap || wrap.dataset.initialized ) return;
	wrap.dataset.initialized = '1';
	new DbSearchTab( wrap, { ajaxurl, nonce } ).init();
}

document.addEventListener( 'DOMContentLoaded', initDbSearch );
window.wpteDbgInitSearch = initDbSearch;
