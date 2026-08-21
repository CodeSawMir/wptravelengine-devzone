<?php
/**
 * DevZone Logs tab.
 *
 * Delegates entirely to WPTravelEngine\Logger\Admin\LogsPage::view(), then strips
 * the outer <div class="wrap"> wrapper and rewrites internal URLs to stay in DevZone.
 */

defined( 'ABSPATH' ) || exit;

use WPTravelEngine\Logger\Admin\LogsPage;

if ( ! class_exists( LogsPage::class ) ) {
	echo '<p style="padding:20px;">' . esc_html__( 'The WP Travel Engine Logger module is not active.', 'wptravelengine-devzone' ) . '</p>';
	return;
}

$devzone_slug = \WPTravelEngineDevZone\Admin::PAGE_SLUG;
$logs_slug    = LogsPage::SLUG;

if ( wp_doing_ajax() ) {
	// Inject any extra GET params forwarded from JS link interception (view, orderby, paged…)
	$extra_get = isset( $_POST['extra_get'] ) ? json_decode( wp_unslash( $_POST['extra_get'] ), true ) : array();
	if ( is_array( $extra_get ) ) {
		$allowed = array( 'view', 'orderby', 'order', 'paged', 'level', 'source', 'date', 'date_from', 'date_to', 's', 'file', 'cleared', 'deleted' );
		foreach ( $allowed as $key ) {
			if ( isset( $extra_get[ $key ] ) ) {
				$val              = sanitize_text_field( $extra_get[ $key ] );
				$_GET[ $key ]     = $val;
				$_REQUEST[ $key ] = $val; // WP_List_Table reads paged/orderby/order from $_REQUEST
			}
		}
	}

	// Spoof REQUEST_URI so WP_List_Table generates correct DevZone pagination/sort URLs.
	$parsed = wp_parse_url( admin_url( 'tools.php' ) );
	$_SERVER['REQUEST_URI'] = $parsed['path'] . '?' . http_build_query( // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		array_filter( array(
			'page'    => $devzone_slug,
			'tab'     => 'wptravelengine',
			'view'    => $_GET['view'] ?? null,
			'file'    => $_GET['file'] ?? null,
			'orderby' => $_GET['orderby'] ?? null,
			'order'   => $_GET['order'] ?? null,
			'source'  => $_GET['source'] ?? null,
		) )
	);
}

// Prevent LogsFilesTable::process_bulk_action() from seeing the AJAX action name
// (wpte_devzone_load_tab) as a bulk action, which would trigger a nonce check and wp_die().
if ( wp_doing_ajax() ) {
	unset( $_REQUEST['action'] );
}

// Fix any wp_safe_redirect() (e.g. bulk-delete in LogsFilesTable) to land back in DevZone.
$fix_redirect = static function ( string $location ) use ( $devzone_slug, $logs_slug ): string {
	return str_replace(
		'page=' . $logs_slug,
		'page=' . $devzone_slug . '&tab=wptravelengine',
		$location
	);
};
add_filter( 'wp_redirect', $fix_redirect );

ob_start();
( new LogsPage() )->view();
$html = ob_get_clean();

remove_filter( 'wp_redirect', $fix_redirect );

// Rewrite all href/JS URLs: page=wptravelengine-logs → page=wptravelengine-devzone&tab=wptravelengine
$html = str_replace(
	'page=' . $logs_slug,
	'page=' . $devzone_slug . '&tab=wptravelengine',
	$html
);

// Fix the GET-form hidden input value and inject a tab=wptravelengine hidden input.
$html = str_replace(
	'name="page" value="' . $logs_slug . '"',
	'name="page" value="' . $devzone_slug . '"><input type="hidden" name="tab" value="logs"',
	$html
);

// Rewrite the Logger's DOMContentLoaded wrapper to an IIFE so all handlers
// (toggle, download, delete…) register immediately after AJAX injection.
$html = preg_replace_callback(
	'~(<script\b[^>]*>)(.*?)(</script>)~si',
	static function ( array $m ): string {
		$js    = $m[2];
		$inner = preg_replace(
			'~\bdocument\.addEventListener\s*\(\s*["\']DOMContentLoaded["\']\s*,\s*function\s*\(\s*\)\s*\{~',
			'(function(){ if(window.__wteLogsInited) return; window.__wteLogsInited=true;',
			$js,
			1,
			$replaced
		);
		if ( $replaced ) {
			// Replace the outermost closing }); with })();
			$inner = preg_replace( '~\}\s*\)\s*;\s*$~s', '})();', $inner );
		}
		return $m[1] . $inner . $m[3];
	},
	$html
);

// Strip the outer <div class="wrap"> + <h1> + <hr class="wp-header-end"> header.
$hr_marker = '<hr class="wp-header-end">';
$hr_pos    = strpos( $html, $hr_marker );
if ( false !== $hr_pos ) {
	$html = substr( $html, $hr_pos + strlen( $hr_marker ) );
}

// Remove the </div> that closed <div class="wrap"> (sits just before <script>).
$html = preg_replace( '~\s*</div>\s*(<script\b)~s', "\n$1", $html, 1 );

echo '<div style="padding: 16px 20px;">' . $html . '</div>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
