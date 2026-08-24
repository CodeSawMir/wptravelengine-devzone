# WP Dev Zone

> **For development and debugging only. Do not use on production sites.**

A WordPress dev-tools plugin: SQL query browser, PHP code sandbox (Tinker), cron/log manager, and a GitHub-based plugin marketplace — all in one admin page. When [WP Travel Engine](https://wptravelengine.com/) is active, an Inspector suite unlocks for browsing its trip, booking, payment, and customer data.

Started as an internal WP Travel Engine tool; the core (Tinker, Query, Crontrol, Logs, Marketplace) now works standalone on any WordPress site. The Inspector suite stays WTE-only by design — it maps directly to WTE's data model. That history is why some internals (namespaces, prefixes) still carry the WTE name.

---

> ### Requirements
> - WordPress 6.9+, PHP 7.4+
> - [WP Travel Engine](https://wptravelengine.com/) — **optional**, unlocks the Inspector suite

---

> ### Install
> Download this repo as a ZIP → **Plugins → Add New → Upload Plugin** → Activate. Then go to **Tools → Dev Zone**.

---

> ### Tabs
>
> | Tab | What it does | Needs WTE? |
> |---|---|---|
> | Overview, Trips, Bookings, Payments, Customers | Inspect WTE trip/booking/payment/customer data | Yes |
> | Marketplace | Install add-ons from GitHub; self-update card for Dev Zone itself | No |
> | Query | Full DB table browser with filters, pagination, and a serialized-data Beautifier sidebar | No |
> | Crontrol | View/run/schedule WP-Cron events | No |
> | Logs | WordPress debug log (+ WTE log when active) | No |
> | Tinker | Sandboxed PHP execution with snippet management | No |

---

> ### Marketplace
> - Discovers plugins from a curated registry, GitHub name-prefix search (`wpte-devzone-addon-*`), the `wpte_devzone_marketplace_plugins` filter, and repos tagged `wpte-devzone-compatible` — merged and cached 1h
> - Connect a GitHub PAT (`repo` scope) to raise the API rate limit and see private repos
> - The first card is always Dev Zone's own status: checks the repo's `main` branch for a newer `WPTE_DEVZONE_VERSION` and updates itself in place on click. Source repo overridable via `wpte_devzone_self_update_repo`

---

> ### Publishing a plugin to the marketplace
>
> Get listed without touching this plugin, via any of:
>
> - **Name prefix** — name your public repo `wpte-devzone-addon-*` (e.g. `wpte-devzone-addon-stripe`); auto-discovered
> - **Curated registry** — PR your entry into `plugins.json` in the `wptravelengine/marketplace` repo
> - **GitHub topic** — tag your repo `wpte-devzone-compatible`; public repos show for everyone, private ones for users with a connected PAT. Push a tag starting with `wpte-devzone-compatible` to pin installs to a release, otherwise the default branch installs
> - **WordPress filter** — hook `wpte_devzone_marketplace_plugins`:
>
> ```php
> add_filter( 'wpte_devzone_marketplace_plugins', function ( array $plugins ): array {
>     $plugins[] = [
>         'slug'        => 'my-addon',
>         'name'        => 'My Add-on',
>         'description' => 'Adds extra functionality to WP Travel Engine.',
>         'author'      => 'My Company',
>         'author_url'  => 'https://example.com',
>         'github_repo' => 'myorg/my-addon',
>         'featured'    => false,
>     ];
>     return $plugins;
> } );
> ```

---

> ### Integration Guidelines
>
> Other plugins can add tabs without touching this one:
>
> - **New tab** — extend `AbstractTool` (`get_slug()`, `get_label()`, `get_template()`, `register_ajax()`, `enqueue_assets()`), register via the `wpte_devzone_tools` filter
> - **Nav groups/subtabs** — `wpte_devzone_tabs` filter (mirrors `Admin::get_tabs()`'s shape)
> - **Header buttons** — `wpte_devzone_header_buttons` action
> - **AJAX** — call `\WPTravelEngineDevZone\Admin::verify_request()` first (nonce + `manage_options`)
> - **JS** — the `wpteDbg` global carries `ajaxurl`, `nonce`, `wteActive`, `selfVersion`, `post_types`, `devFeatures`, `groupSubtabs`; use `window.wteDbgSetStatus(msg, type)` for the shared header notice; implement `destroy()` on your tab class to abort in-flight requests on tab switch
>
> | Hook | Type | Purpose |
> |---|---|---|
> | `wpte_devzone_tools` | Filter | Add `AbstractTool` instances |
> | `wpte_devzone_tabs` | Filter | Add nav groups/subtabs |
> | `wpte_devzone_header_buttons` | Action | Inject header controls |
> | `wpte_devzone_cron_schedule_registry` | Filter | Register triggerable cron hooks |
> | `wpte_devzone_marketplace_plugins` | Filter | List a plugin in the Marketplace |
> | `wpte_devzone_self_update_repo` | Filter | Point self-update at a fork |
