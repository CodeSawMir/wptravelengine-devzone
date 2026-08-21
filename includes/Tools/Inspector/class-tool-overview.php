<?php

namespace WPTravelEngineDevZone\Tools\Inspector;

use WPTravelEngineDevZone\Admin;
use WPTravelEngineDevZone\Renderer;
use WPTravelEngineDevZone\Tools\AbstractTool;
use WPTravelEngineDevZone\Traits\ValueHelperTrait;
use WPTravelEngine\Utilities\ArrayUtility;

defined( 'ABSPATH' ) || exit;

class ToolOverview extends AbstractTool {

	use ValueHelperTrait;

	public function get_slug(): string    { return 'overview'; }
	public function get_label(): string   { return __( 'Overview', 'wptravelengine-devzone' ); }
	public function get_template(): string { return WPTE_DEVZONE_DIR . 'templates/tab-overview.php'; }

	public function register_ajax(): void {
		$actions = [
			'wpte_devzone_get_options'   => 'get_options',
			'wpte_devzone_get_option'    => 'get_option_value',
			'wpte_devzone_save_option'   => 'save_option',
			'wpte_devzone_delete_option' => 'delete_option_entry',
		];
		foreach ( $actions as $action => $method ) {
			add_action( "wp_ajax_{$action}", [ $this, $method ] );
		}
	}

	// -------------------------------------------------------------------------
	// Endpoints
	// -------------------------------------------------------------------------

	public function get_options(): void {
		Admin::verify_request();

		global $wpdb;

		$rows = $wpdb->get_results(
			"SELECT option_name, option_value FROM {$wpdb->options}
			 WHERE option_name LIKE 'wp_travel_engine_%'
			    OR option_name LIKE 'wptravelengine_%'
			 ORDER BY option_name ASC",
			ARRAY_A
		);

		$options = [];
		foreach ( $rows as $row ) {
			$options[ $row['option_name'] ] = maybe_unserialize( $row['option_value'] );
		}

		wp_send_json_success( [ 'options' => $options ] );
	}

	public function get_option_value(): void {
		Admin::verify_request();

		$option_name = sanitize_key( $_GET['option_name'] ?? '' );

		if ( empty( $option_name ) ) {
			wp_send_json_error( [ 'message' => 'Missing option_name' ] );
		}

		if ( strpos( $option_name, 'wp_travel_engine_' ) !== 0 && strpos( $option_name, 'wptravelengine_' ) !== 0 ) {
			wp_send_json_error( [ 'message' => 'Option not allowed' ], 403 );
		}

		$value    = get_option( $option_name );
		$renderer = new Renderer();
		$count    = null;

		ob_start();
		if ( is_array( $value ) || is_object( $value ) ) {
			$arr   = (array) $value;
			$count = count( $arr );
			$renderer->render_tree( $arr, $option_name );
		} else {
			$raw     = is_null( $value ) ? '' : (string) $value;
			$display = $renderer->format_scalar( $value );
			?>
			<div class="wte-dbg-row"
				data-option-name="<?php echo esc_attr( $option_name ); ?>"
				data-path="">
				<span class="wte-dbg-key"><?php echo esc_html( $option_name ); ?></span>
				<span class="wte-dbg-value" data-raw="<?php echo esc_attr( $raw ); ?>"><?php echo esc_html( $display ); ?></span>
				<button class="wte-dbg-edit-btn" title="<?php esc_attr_e( 'Edit', 'wptravelengine-devzone' ); ?>">&#9998;</button>
			</div>
			<?php
		}
		$html = ob_get_clean();

		wp_send_json_success( [ 'html' => $html, 'count' => $count ] );
	}

	public function save_option(): void {
		Admin::verify_request();

		$option_name = sanitize_key( $_POST['option_name'] ?? '' );
		$key_path    = sanitize_text_field( wp_unslash( $_POST['key_path'] ?? '' ) );
		$new_value   = wp_unslash( $_POST['value'] ?? '' );

		if ( empty( $option_name ) ) {
			wp_send_json_error( [ 'message' => 'Missing option_name' ] );
		}

		if ( strpos( $option_name, 'wp_travel_engine_' ) !== 0 && strpos( $option_name, 'wptravelengine_' ) !== 0 ) {
			wp_send_json_error( [ 'message' => 'Option not allowed' ], 403 );
		}

		$current   = get_option( $option_name );
		$old_value = $current;

		if ( $key_path ) {
			$arr       = ArrayUtility::make( (array) $current );
			$new_value = $this->cast_value( $new_value, $arr->get( $key_path ) );
			$arr->set( $key_path, $new_value );
			$current   = $arr->value();
		} else {
			$new_value = $this->cast_value( $new_value, $current );
			$current   = $new_value;
		}

		$this->log_change( "option:{$option_name}" . ( $key_path ? ".{$key_path}" : '' ), $old_value, $new_value );

		update_option( $option_name, $current );
		wp_send_json_success( [ 'saved' => true ] );
	}

	public function delete_option_entry(): void {
		Admin::verify_request();

		$option_name = sanitize_key( $_POST['option_name'] ?? '' );

		if ( empty( $option_name ) ) {
			wp_send_json_error( [ 'message' => 'Missing option_name' ] );
		}

		if ( strpos( $option_name, 'wp_travel_engine_' ) !== 0 && strpos( $option_name, 'wptravelengine_' ) !== 0 && strpos( $option_name, 'wpte_' ) !== 0 ) {
			wp_send_json_error( [ 'message' => 'Option not allowed' ], 403 );
		}

		$this->log_change( "option:{$option_name}", get_option( $option_name ), '(deleted)' );

		delete_option( $option_name );
		wp_send_json_success( [ 'deleted' => true ] );
	}
}
