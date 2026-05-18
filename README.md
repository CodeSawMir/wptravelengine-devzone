# WP Travel Engine — Dev Zone

> **For development and debugging purposes only. Do not use on production sites.**

A visual database inspector for [WP Travel Engine](https://wptravelengine.com/) that lets you diagnose and inspect trip, booking, payment, and customer data directly from WP Admin — without touching phpMyAdmin or writing raw SQL queries.

## Intent

This plugin is being developed as an internal developer tool to support the WP Travel Engine team during active development and debugging. The goal is to provide a quick, centralized admin interface to inspect and search database records related to WP Travel Engine — covering trips, bookings, payments, customers, and raw DB queries — all without leaving the WordPress dashboard.

## Requirements

- WordPress 6.9+
- PHP 7.4+
- [WP Travel Engine](https://wptravelengine.com/) plugin (active)

## Installation

Since this plugin is not listed on the WordPress plugin directory, install it directly from this repository:

1. Click **Code → Download ZIP** on this page
2. In your WordPress admin, navigate to **Plugins → Add New → Upload Plugin**
3. Choose the downloaded `.zip` file and click **Install Now**
4. Click **Activate Plugin**

Once activated, navigate to **Tools → Dev Zone** in WP Admin.

## Tabs

| Tab | Description |
|-----|-------------|
| Overview | WP Travel Engine price categories, registered taxonomies with their terms, and all WTE-related options stored in the database |
| Trips | Browse and inspect all trip post data |
| Bookings | View booking records and their metadata |
| Payments | Inspect payment entries linked to bookings |
| Customers | View customer records |
| Marketplace | Discover and install WP Travel Engine add-on plugins from GitHub — curated registry, public search, and private org repos via a GitHub token |
| Logs — WPTE | Browse WP Travel Engine debug log entries with live-reload and line count |
| Crontrol | List all scheduled WP-Cron events grouped by WPTE vs. other; run or schedule individual hooks; paginate and search |
| Query | Full table browser — select any DB table, apply column filters, paginate results, and copy cell values with a single click |

## Marketplace Tab

The Marketplace tab lets you browse, filter, and install WP Travel Engine add-on plugins directly from GitHub without leaving WP Admin.

### Plugin discovery — four tiers

Plugins are discovered from up to four sources and merged into a single deduplicated list (highest priority wins on slug conflict):

| Tier | Source | Token required |
|------|--------|---------------|
| T1 | Curated `plugins.json` registry hosted on GitHub | No |
| T2 | GitHub repository name-prefix search (`wpte-devzone-addon-*`) | No |
| T3 | WordPress filter `wpte_devzone_marketplace_plugins` | No |
| T4 | GitHub repositories with the `wpte-devzone-compatible` topic | No (private repos need token) |

Results are cached for one hour. Click the **↻ Refresh** button to bust all caches and re-fetch.

### Installation priority

When you click **Install** on a marketplace plugin, the installer:

1. Looks for the latest git tag whose name starts with `wpte-devzone-compatible` — if found, downloads that tag's zip (pinned release)
2. Falls back to the default branch zip if no such tag exists

### Connecting a GitHub account (Connect Github)

A **Connect Github** button appears in the marketplace toolbar. Click it to open the token panel.

**Without a token** — Tier 1, Tier 2, Tier 3, and any *public* Tier 4 repos are shown.

**With a token** — the button label changes to **Connected Github** and private repositories with the `wpte-devzone-compatible` topic become visible (requires `repo` scope on the PAT).

#### Setting up a GitHub Personal Access Token (PAT)

1. Go to [GitHub → New Personal Access Token](https://github.com/settings/tokens/new?scopes=repo,read:org) (pre-selects `repo` and `read:org` scopes)
2. Generate a **classic** token (or a fine-grained token scoped to the relevant organisations)
3. Grant the `repo` scope — required to read private repository contents and tags
4. Copy the token (starts with `ghp_`)
5. In the **Connect Github** panel, paste the token into the input field and click **Save**
6. Click **Test** to verify the token — a success message shows your GitHub username
7. The grid refreshes automatically and any compatible private org repos appear

To revoke access, click **Clear** in the token panel. The token is removed and the grid reloads without private repos.

### Filters

| Filter | Shows |
|--------|-------|
| All | Every discovered plugin |
| Official | Tier 1 curated registry only (`source: registry`) |
| Installed | Plugins already present on this WordPress install |

The search field filters by name, description, author, and tags in real time.

### Publishing a plugin to the marketplace

Third-party developers can get their plugin listed without any changes to this plugin:

**Option A — Automatic (name prefix)**
Name your public GitHub repository with the prefix `wpte-devzone-addon-` (e.g. `wpte-devzone-addon-stripe`). It will appear automatically via Tier 2 search.

**Option B — Curated registry**
Submit a pull request to the central `wptravelengine/marketplace` repository adding your plugin entry to `plugins.json`.

**Option C — WordPress filter**
Hook `wpte_devzone_marketplace_plugins` in your plugin and append your entry:

```php
add_filter( 'wpte_devzone_marketplace_plugins', function ( array $plugins ): array {
    $plugins[] = [
        'slug'        => 'my-addon',
        'name'        => 'My Add-on',
        'description' => 'Adds extra functionality to WP Travel Engine.',
        'author'      => 'My Company',
        'author_url'  => 'https://example.com',
        'github_repo' => 'myorg/my-addon',
        'featured'    => false,
    ];
    return $plugins;
} );
```

**Option D — GitHub topic (Tier 4)**
Add the topic `wpte-devzone-compatible` to any repository (repo homepage → About ⚙ → Topics). Public repos appear for all users immediately; private repos appear for users who have connected a PAT with `repo` scope. Optionally push a git tag starting with `wpte-devzone-compatible` to pin installs to a specific release — otherwise the default branch is installed.

---

## Query Tab

The Query tab is a full interactive database browser:

- **Table list** — left sidebar lists all DB tables grouped by WP Travel Engine, WordPress core, and Other; filterable by name; collapsible
- **Query builder** — select a table to load its columns, add one or more column filters (`=`, `!=`, `LIKE`, `IS NULL`, etc.), set a row limit, and run the query
- **Results table** — click any cell to copy its value to the clipboard
- **Pagination** — navigate large result sets in pages

### Beautifier sidebar

A collapsible, resizable panel on the right edge of the Query tab for parsing raw serialized data:

- Paste PHP-serialized strings, JSON, Base64-encoded data, `var_dump()` output, or URL query strings
- Click **Beautify** to decode and render as an interactive tree with type badges (`string`, `int`, `float`, `bool`, `null`)
- The input and result persist across tab switches and are cleared only on page reload
- The sidebar can be collapsed, drag-resized, or maximized to full screen

## UI

- **Dark mode** — toggle via the ☀ button in the header; preference is saved across sessions
- **Status notice** — a single shared pill in the header shows loading progress, success, error, and cancellation messages across all tabs; auto-dismisses after a few seconds for success/error states
- **Refresh button** — the Crontrol tab has a circular refresh button (↻) in the toolbar that spins during in-flight requests and re-enables on completion or error
- **AJAX cancellation** — switching tabs cancels any in-flight requests from the previous tab and shows a "Cancelled" notice; within-tab refreshes abort any previous in-flight request before starting a new one
- **Inline editing** — metadata values can be edited directly in the Trips, Bookings, Payments, and Customers tabs
- **Collapsible meta** — the PHP/WP/WPTE version pills in the header can be hidden via the chevron toggle; preference is saved across sessions

---

## Extending Dev Zone

Other plugins can add their own tabs, groups, and features to the Dev Zone without modifying this plugin.

---

### 1. Register a Tool Tab

The primary integration point. Create a class that extends `AbstractTool` and hook it in via `wpte_devzone_tools`.

```php
use WPTravelEngineDevZone\Tools\AbstractTool;

class MyPluginDevTool extends AbstractTool {

    public function get_slug(): string     { return 'my-plugin'; }
    public function get_label(): string    { return 'My Plugin'; }
    public function get_template(): string { return MY_PLUGIN_DIR . 'devzone/tab-my-plugin.php'; }

    public function register_ajax(): void {
        add_action( 'wp_ajax_my_plugin_devzone_data', [ $this, 'ajax_data' ] );
    }

    public function enqueue_assets(): void {
        wp_enqueue_script( 'my-plugin-devzone', MY_PLUGIN_URL . 'devzone/tab.js', [ 'wpte-devzone' ], '1.0', true );
    }

    public function ajax_data(): void {
        \WPTravelEngineDevZone\Admin::verify_request(); // nonce + manage_options check
        wp_send_json_success( [ 'items' => [] ] );
    }
}

add_filter( 'wpte_devzone_tools', function ( array $tools ): array {
    $tools[] = new MyPluginDevTool();
    return $tools;
} );
```

The template file (`tab-my-plugin.php`) receives no variables by default — fetch data via AJAX inside the template's JS, or query directly in PHP using `$wpdb`.

---

### 2. Add Navigation Groups and Subtabs

Use `wpte_devzone_tabs` to register new group buttons and their subtab structure. The shape mirrors the built-in `get_tabs()` output.

```php
add_filter( 'wpte_devzone_tabs', function ( array $tabs ): array {

    // Simple group — single tab, no subtabs.
    $tabs['my-plugin'] = __( 'My Plugin', 'my-plugin' );

    // Group with subtabs.
    $tabs['my-plugin'] = [
        'title'   => __( 'My Plugin', 'my-plugin' ),
        'subtabs' => [
            'overview' => __( 'Overview', 'my-plugin' ),
            'settings' => __( 'Settings', 'my-plugin' ),
            'advanced' => __( 'Advanced', 'my-plugin' ),
        ],
    ];

    return $tabs;
} );
```

Each key in `$tabs` maps to a group button slug in the header. Subtabs appear in the tab navigation bar when that group is active.

**Supported entry shapes:**

| Shape | Meaning |
|---|---|
| `'slug' => 'Label'` | Simple group, single tab |
| `'slug' => [ 'title' => '...' ]` | Group with no subtabs |
| `'slug' => [ 'title' => '...', 'subtabs' => [...] ]` | Group with subtab nav |
| `'__inject_markup' => callable` in `subtabs` | Invoke a callable to render markup in the nav bar when this group is active |
| `'priority' => int` on group | Sort order for the group button (default `5`, lower = earlier) |

---

### 3. Inject Controls into the Nav Bar

Use `__inject_markup` inside `subtabs` to render extra markup (buttons, labels, dropdowns) directly inside the tab navigation bar whenever your group is active. The callable is invoked server-side inside a `<div>` that is shown/hidden automatically when the group switches.

```php
add_filter( 'wpte_devzone_tabs', function ( array $tabs ): array {
    $tabs['my-plugin'] = [
        'title'   => __( 'My Plugin', 'my-plugin' ),
        'subtabs' => [
            'my-plugin-overview' => __( 'Overview', 'my-plugin' ),
            'my-plugin-settings' => __( 'Settings', 'my-plugin' ),
            '__inject_markup'    => function ( string $group_slug ): void {
                ?>
                <button type="button" class="button button-small">
                    <?php esc_html_e( 'Refresh', 'my-plugin' ); ?>
                </button>
                <?php
            },
        ],
    ];
    return $tabs;
} );
```

The inject container is a `<div class="wte-dbg-nav-inject" data-group="...">` that lives in the DOM on every page load. Its visibility is toggled by JS alongside the subtab links — no JS wiring needed. Any PHP callable works: a closure, a named function, or a `[$object, 'method']` array.

---

### 4. Register a Tab for Each Subtab

When a group has subtabs, register one `AbstractTool` per subtab slug:

```php
add_filter( 'wpte_devzone_tools', function ( array $tools ): array {
    $tools[] = new MyPluginOverviewTool(); // get_slug() === 'my-plugin-overview' must match subtab key
    $tools[] = new MyPluginSettingsTool(); // get_slug() === 'my-plugin-settings'
    return $tools;
} );
```

The slug returned by `get_slug()` must exactly match the subtab key in `wpte_devzone_tabs`.

---

### 5. Inject Header Buttons

Add extra controls to the right side of the header bar:

```php
add_action( 'wpte_devzone_header_buttons', function ( string $active_slug ): void {
    ?>
    <button type="button" class="wte-dbg-group-btn" data-group="my-plugin">
        <?php esc_html_e( 'My Plugin', 'my-plugin' ); ?>
    </button>
    <?php
} );
```

`$active_slug` is the currently active tab slug — use it to conditionally add `is-active` or render context-sensitive controls.

---

### 6. JavaScript Integration

The `wpteDbg` global is available to all scripts that depend on `wpte-devzone`:

```js
const { ajaxurl, nonce } = wpteDbg;

// Make an authenticated AJAX request.
fetch( ajaxurl, {
    method: 'POST',
    body: new URLSearchParams( {
        action:      'my_plugin_devzone_data',
        _ajax_nonce: nonce,
    } ),
} ).then( r => r.json() ).then( res => {
    if ( res.success ) { /* render res.data */ }
} );

// Show a status message in the shared header notice.
window.wteDbgSetStatus( 'Loaded successfully', 'success' );   // green dot, auto-clears after 4 s
window.wteDbgSetStatus( 'Something failed', 'error' );        // red dot, auto-clears after 4 s
window.wteDbgSetStatus( 'Fetching data…', 'info' );           // blue dot, persists until cleared
window.wteDbgSetStatus( 'Request cancelled', 'cancelled' );   // orange dot, auto-clears after 4 s
window.wteDbgClearStatus();                                    // hide immediately
```

**`wpteDbg` keys:**

| Key | Type | Description |
|---|---|---|
| `ajaxurl` | `string` | WordPress AJAX endpoint |
| `nonce` | `string` | Security nonce (action: `wpte_devzone_nonce`) |
| `post_types` | `object` | `{ post_type: label }` for registered post tools |
| `devFeatures` | `object` | Hot-features map |
| `groupSubtabs` | `object` | `{ groupSlug: { subSlug: label } }` |

#### Shared status notice

A single `<div id="wte-dbg-wp-debug-notice" class="wte-dbg-wp-notice">` lives in the header and is always present in the DOM. Its inner `<span class="wte-dbg-loader-note">` holds the visible message text. The JS API adds one of the following classes to the wrapper to show a coloured dot:

| Class | Dot colour | Auto-clears? | Typical use |
|---|---|---|---|
| `is-status-info` | Blue, pulsing | No | In-flight loading |
| `is-status-success` | Green, solid | Yes (4 s default) | Completed action |
| `is-status-error` | Red, solid | Yes (4 s default) | Failed request |
| `is-status-cancelled` | Amber, solid | Yes (4 s default) | Aborted request |

Call `wteDbgSetStatus( msg, type )` to set the message and class, or `wteDbgClearStatus()` to hide it immediately. An optional third argument `secs` overrides the auto-clear delay (e.g. `wteDbgSetStatus( 'Done.', 'success', 8 )` clears after 8 s). Passing no `type` shows the notice with the message but without a coloured dot.

ES-module tabs that import `DomHelper` can call `DomHelper.updateLoaderNote( msg )` to update the visible text with a brief fade transition — used internally by the tab-loader for cycling "Loading…" messages.

#### AJAX lifecycle and `destroy()`

When a tab is switched, Dev Zone calls `destroy()` on the outgoing tab instance (if it exists). If your tab class makes in-flight AJAX requests, implement `destroy()` to abort them and show a cancelled notice — otherwise stale responses may manipulate detached DOM nodes or clear the status notice of the newly-loaded tab.

```js
export class MyTab {
    constructor( contentEl ) {
        this.contentEl  = contentEl;
        this._fetchCtrl = null;
    }

    init() {
        this._load();
        return this;
    }

    destroy() {
        if ( this._fetchCtrl ) {
            window.wteDbgSetStatus( 'Cancelled — my tab', 'cancelled' );
            this._fetchCtrl.abort();
            this._fetchCtrl = null;
        }
    }

    _load() {
        this._fetchCtrl?.abort();
        this._fetchCtrl = new AbortController();
        const { signal } = this._fetchCtrl;

        fetch( ajaxurl, {
            method: 'POST',
            signal,
            body: new URLSearchParams( { action: 'my_action', _ajax_nonce: wpteDbg.nonce } ),
        } )
            .then( r => r.json() )
            .then( res => {
                this._fetchCtrl = null;
                /* render */
            } )
            .catch( err => {
                if ( err.name === 'AbortError' ) return;
                this._fetchCtrl = null;
                window.wteDbgSetStatus( 'Load failed.', 'error', 4 );
            } );
    }
}
```

The tab registry in `devzone.js` stores whatever `init()` returns as the current instance, so `init()` must return `this`.

---

### 7. AJAX Tab Loading

When a user navigates to a tab, the JS fires a POST to `wpte_devzone_load_tab`. Dev Zone finds the matching tool by slug, renders its template via output buffering, and returns the HTML.

Your tool's `get_template()` path is all that is needed — no extra registration. Within the template you have full access to WordPress globals (`$wpdb`, etc.).

To verify the request inside any custom AJAX handler:

```php
\WPTravelEngineDevZone\Admin::verify_request();
// Checks: valid nonce (wpte_devzone_nonce) + current_user_can( 'manage_options' )
// On failure: sends wp_send_json_error( 'Forbidden', 403 ) and exits.
```

---

### Filter / Action Reference

| Hook | Type | Purpose |
|---|---|---|
| `wpte_devzone_tools` | Filter | Add `AbstractTool` instances |
| `wpte_devzone_tabs` | Filter | Add groups and subtabs to nav |
| `wpte_devzone_header_buttons` | Action | Inject header controls |
| `{your_inject_hook}` | Action | Render markup inside the nav-bar inject container for a group (declared via `inject` key in `wpte_devzone_tabs`) |
| `wpte_devzone_group_slugs` | Filter | Legacy — group slug array |
| `wpte_devzone_group_buttons` | Filter | Legacy — slug-to-title map |
| `wpte_devzone_cron_schedule_registry` | Filter | Register triggerable cron hooks in the Crontrol tab |

---

## Warning

This plugin is **solely intended for development and debugging use**. It exposes raw database content in the WP Admin and is not hardened for use on public or production environments. Keep it deactivated or uninstalled on any live site.
