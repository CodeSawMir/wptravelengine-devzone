<?php

namespace WPTravelEngineDevZone\Tools\Logs;

use WPTravelEngineDevZone\Tools\AbstractTool;

defined( 'ABSPATH' ) || exit;

class ToolWpteLogs extends AbstractTool {

	public function get_slug(): string     { return 'wptravelengine'; }
	public function get_label(): string    { return __( 'Logs', 'wptravelengine-devzone' ); }
	public function get_template(): string { return WPTE_DEVZONE_DIR . 'templates/tab-logs.php'; }
}
