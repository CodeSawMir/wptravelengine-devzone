/** WPTE Dev Zone — entry point. Wires NavManager + TabLoader + header controls. */
/* global wpteDbg */

import { DomHelper } from './dom-helper.js';
import { initDevModeToggle, initMetaCollapse, initThemeToggle } from './header-controls.js';
import { NavManager } from './nav-manager.js';
import { TabLoader } from './tab-loader.js';
import { CronTab } from './tabs/cron-tab.js';
import { LogsTab } from './tabs/logs-tab.js';
import { MarketplaceTab } from './tabs/marketplace-tab.js';
import { MasterDetailTab } from './tabs/master-detail-tab.js';
import { OverviewTab } from './tabs/overview-tab.js';
import { PerfTab } from './tabs/perf-tab.js';
import { TinkerTab } from './tabs/tinker-tab.js';

let loader;

const TAB_REGISTRY = {
	overview: (el) => new OverviewTab(el).init(),
	trips: (el, id, restored) => new MasterDetailTab('trip', el, restored ? null : id, (s, pid) => loader.navigateTo(s, pid)).init(restored),
	bookings: (el, id, restored) => new MasterDetailTab('booking', el, restored ? null : id, (s, pid) => loader.navigateTo(s, pid)).init(restored),
	payments: (el, id, restored) => new MasterDetailTab('wte-payments', el, restored ? null : id, (s, pid) => loader.navigateTo(s, pid)).init(restored),
	customers: (el, id, restored) => new MasterDetailTab('customer', el, restored ? null : id, (s, pid) => loader.navigateTo(s, pid)).init(restored),
	wptravelengine: (el) => new LogsTab(el, (slug, extra) => loader.loadTab(slug, extra)).init(),
	wordpress: (el) => LogsTab.initWordpress(el),
	cron: (el) => new CronTab(el).init(),
	perf: (el) => new PerfTab(el).init(),
	marketplace: (el) => new MarketplaceTab(el).init(),
	tinker: (el) => new TinkerTab(el).init(),
	// query: handled by window.wpteDbgInitSearch() in tabs/query.js
};

document.addEventListener('DOMContentLoaded', () => {
	const nav = new NavManager();
	loader = new TabLoader(nav, TAB_REGISTRY);

	nav.init((slug, extra) => loader.loadTab(slug, extra));
	document.querySelector('.wte-dbg-back-btn')?.addEventListener('click', () => loader.goBack());
	document.querySelector('.wte-dbg-header-tinker-btn')?.addEventListener('click', (e) => {
		e.currentTarget.classList.toggle('is-active');
		loader.loadTab('tinker');
	});

	initThemeToggle();
	initDevModeToggle((slug) => loader.loadTab(slug), () => loader.currentSlug);
	initMetaCollapse();

	// Restore last active tab or init the PHP-rendered one.
	let savedTab = null;
	try { savedTab = localStorage.getItem('wte_dbg_tab'); } catch (e) { }
	const contentEl = document.querySelector('.wte-dbg-content');
	const renderedTab = contentEl?.dataset.renderedTab || 'overview';
	let urlPostId = null;
	try {
		const raw = new URL(window.location.href).searchParams.get('post_id');
		if (raw) urlPostId = parseInt(raw, 10) || null;
	} catch (e) { }

	if (savedTab && savedTab !== renderedTab && !urlPostId) {
		loader.loadTab(savedTab);
	} else {
		loader.initRendered(renderedTab, urlPostId);
	}

	// Expose status helpers for non-module scripts (e.g. db-search.js).
	window.wteDbgSetStatus = (msg, type, secs) => DomHelper.setStatus(msg, type, secs);
	window.wteDbgClearStatus = () => DomHelper.clearStatus();
});
