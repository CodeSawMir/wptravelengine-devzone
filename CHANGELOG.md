# Changelog

## [Upcoming]

> `on_dev` hot-features gating 

---

## [v1.2.0] - 2026-04-02

### Added

- Relations sidebar with cross-tab navigation and drag-resize support
- Cron Management (Crontrol) tab — view, run, and manage WP-Cron events
- Subtab persistence — returning to a group restores the last active subtab instead of always defaulting to the first
- Back button repositioned to the right side of the nav bar

### Changed

- Back button (`← Back`) no longer triggers an AJAX re-fetch; restores the previous list view from a cached HTML snapshot
- Returning to a list after cross-tab navigation re-attaches click listeners and relation item navigation handlers without reloading the list
- `loadTab` now always clears the navigation stack unless it is part of a drill-down (`navigateTo`), preventing the back button from appearing during normal tab switching
- localStorage tab entry is written only after a successful AJAX response, so a stale or removed slug is never re-persisted

### Fixed

- Back button incorrectly shown when clicking between Inspector subtabs (Trips / Bookings / Payments / Customers)
- Duplicate list items when a pinned record also appeared in search results
- Tab switching stuck on live sites: a slug stored in localStorage that no longer exists now auto-clears and redirects to Overview instead of showing a permanent error
- `_lastSubtab['devzone']` could be set to an invalid slug after a failed tab load, causing the Inspect button to keep requesting the removed tab
- After going back from a cross-tab drill-down, relation item links (e.g. Bookings inside a Trip) opened in a new browser tab instead of staying in the SPA

---

## [v1.1.0] - 2026-03-15

- Refactored tools into a class hierarchy with shared AJAX routing
- Added inline cell editor for result tables
- Refactored JS into focused ES modules
- Improved DB Search sidebar with resize handle, maximize button, and collapsible filters
- Shared template for post-type tabs (Trips, Bookings, Payments, Customers)
- Fixed: Beautifier maximize + toggle — clicking the collapse toggle while maximized now restores to normal view instead of also collapsing the sidebar
- Improved: AJAX notice consistency — all AJAX actions now show a global status bar notice before the request fires and clear it on completion
  - Beautifier (Beautify / Var Dump): both buttons disabled during request, status shows "Processing…", clears on success, timed error on failure
  - DB Search execute action: error and network-failure notices now auto-hide after 3 seconds
  - Overview option toggle: status bar shows "Loading…" while fetching and clears on completion or error

---

## [v1.0.0] - initial release

- Overview, Trips, Bookings, Payments, Customers, and DB Search tabs
- PHP serialized / JSON / Base64 / var_dump beautifier sidebar
- DB table browser with column filters and pagination
- Dark mode support
