<?php

namespace WPTravelEngineDevZone\Tools\Cron;

use WPTravelEngineDevZone\Admin;
use WPTravelEngineDevZone\Tools\AbstractTool;

defined( 'ABSPATH' ) || exit;

class ToolCron extends AbstractTool {

	public function get_slug(): string     { return 'cron'; }
	public function get_label(): string    { return __( 'Crontrol', 'wptravelengine-devzone' ); }
	public function get_template(): string { return WPTE_DEVZONE_DIR . 'templates/tab-cron.php'; }

	public function register_ajax(): void {
		add_action( 'wp_ajax_wpte_devzone_cron_list',     [ $this, 'list_crons' ] );
		add_action( 'wp_ajax_wpte_devzone_cron_run',      [ $this, 'run_cron' ] );
		add_action( 'wp_ajax_wpte_devzone_cron_schedule', [ $this, 'schedule_cron' ] );
	}

	// -------------------------------------------------------------------------
	// Schedule registry
	// -------------------------------------------------------------------------

	/**
	 * Registry of hooks that expose a "Schedule" action instead of "Run Now".
	 *
	 * Each entry:
	 *   hook_name => [ 'callable' => callable, 'label' => string ]
	 *
	 * Add new hooks via the 'wpte_devzone_cron_schedule_registry' filter.
	 */
	protected function get_schedule_registry(): array {
		return apply_filters( 'wpte_devzone_cron_schedule_registry', [
			'wptravelengine_check_events' => [
				'callable' => [ \WPTravelEngine\Filters\Events::class, 'schedule' ],
				'label'    => __( 'Schedule', 'wptravelengine-devzone' ),
			],
		] );
	}

	// -------------------------------------------------------------------------
	// Endpoints
	// -------------------------------------------------------------------------

	public function list_crons(): void {
		Admin::verify_request();

		$cron_array = _get_cron_array();
		$schedules  = wp_get_schedules();
		$registry   = $this->get_schedule_registry();
		$items      = [];

		if ( ! is_array( $cron_array ) ) {
			wp_send_json_success( [ 'crons' => [] ] );
		}

		// Track which registry hooks are already scheduled.
		$scheduled_registry_hooks = [];

		foreach ( $cron_array as $timestamp => $hooks ) {
			foreach ( $hooks as $hook => $events ) {
				if ( isset( $registry[ $hook ] ) ) {
					$scheduled_registry_hooks[ $hook ] = true;
				}
				foreach ( $events as $event ) {
					$schedule  = $event['schedule'] ?? false;
					$interval  = $event['interval'] ?? 0;
					$args      = $event['args'] ?? [];

					$schedule_label = false;
					if ( $schedule && isset( $schedules[ $schedule ] ) ) {
						$schedule_label = $schedules[ $schedule ]['display'] ?? $schedule;
					} elseif ( $schedule ) {
						$schedule_label = $schedule;
					}

					$items[] = [
						'hook'         => $hook,
						'timestamp'    => (int) $timestamp,
						'next_run'     => gmdate( 'Y-m-d H:i:s', (int) $timestamp ),
						'schedule'     => $schedule_label ?: __( 'One-time', 'wptravelengine-devzone' ),
						'interval'     => (int) $interval,
						'args'         => $args,
						'action_type'  => 'run',
						'action_label' => null,
					];
				}
			}
		}

		// Add synthetic entries for registry hooks that are not currently scheduled.
		foreach ( $registry as $hook => $entry ) {
			if ( isset( $scheduled_registry_hooks[ $hook ] ) ) {
				continue;
			}
			$items[] = [
				'hook'         => $hook,
				'timestamp'    => 0,
				'next_run'     => null,
				'schedule'     => __( 'Not scheduled', 'wptravelengine-devzone' ),
				'interval'     => 0,
				'args'         => [],
				'action_type'  => 'schedule',
				'action_label' => $entry['label'],
			];
		}

		// Sort by next run time ascending (unscheduled entries go to the end).
		usort( $items, fn( $a, $b ) => $a['timestamp'] <=> $b['timestamp'] );

		wp_send_json_success( [ 'crons' => $items ] );
	}

	public function run_cron(): void {
		Admin::verify_request();

		$hook      = sanitize_text_field( wp_unslash( $_POST['hook'] ?? '' ) );
		$timestamp = intval( $_POST['timestamp'] ?? 0 );

		if ( empty( $hook ) || $timestamp <= 0 ) {
			wp_send_json_error( [ 'message' => __( 'Missing hook or timestamp.', 'wptravelengine-devzone' ) ] );
		}

		// Validate the hook+timestamp combo exists in the actual cron array.
		$cron_array = _get_cron_array();
		if ( ! isset( $cron_array[ $timestamp ][ $hook ] ) ) {
			wp_send_json_error( [ 'message' => __( 'Cron event not found.', 'wptravelengine-devzone' ) ] );
		}

		// Retrieve args for this specific event.
		$event    = reset( $cron_array[ $timestamp ][ $hook ] );
		$args     = $event['args'] ?? [];
		$schedule = $event['schedule'] ?? false;

		// Mirror what wp-cron.php does: reschedule recurring events, then
		// unschedule the current occurrence, then fire the callback.
		if ( $schedule ) {
			wp_reschedule_event( $timestamp, $schedule, $hook, $args );
		}
		wp_unschedule_event( $timestamp, $hook, $args );

		do_action_ref_array( $hook, $args );

		wp_send_json_success( [
			'message' => sprintf(
				/* translators: %s: cron hook name */
				__( 'Ran hook: %s', 'wptravelengine-devzone' ),
				$hook
			),
		] );
	}

	public function schedule_cron(): void {
		Admin::verify_request();

		$hook     = sanitize_text_field( wp_unslash( $_POST['hook'] ?? '' ) );
		$registry = $this->get_schedule_registry();

		if ( empty( $hook ) || ! isset( $registry[ $hook ] ) ) {
			wp_send_json_error( [ 'message' => __( 'No schedule handler for this hook.', 'wptravelengine-devzone' ) ] );
		}

		$callable = $registry[ $hook ]['callable'];

		if ( ! is_callable( $callable ) ) {
			wp_send_json_error( [ 'message' => __( 'Schedule handler is not callable.', 'wptravelengine-devzone' ) ] );
		}

		call_user_func( $callable );

		wp_send_json_success( [
			'message' => sprintf(
				/* translators: %s: cron hook name */
				__( 'Scheduled: %s', 'wptravelengine-devzone' ),
				$hook
			),
		] );
	}
}
