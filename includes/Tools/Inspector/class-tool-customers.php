<?php

namespace WPTravelEngineDevZone\Tools\Inspector;

use WPTravelEngineDevZone\Tools\AbstractPostTool;

defined( 'ABSPATH' ) || exit;

class ToolCustomers extends AbstractPostTool {
	public function get_slug(): string      { return 'customers'; }
	public function get_label(): string     { return __( 'Customers', 'wptravelengine-devzone' ); }
	public function get_post_type(): string { return 'customer'; }
	public function get_noun(): string      { return __( 'customer', 'wptravelengine-devzone' ); }

	public function get_relations( int $post_id, string $group, int $page ): array {
		$booking_ids  = get_post_meta( $post_id, 'wp_travel_engine_bookings', true );
		$all_bookings = [];
		if ( is_array( $booking_ids ) ) {
			foreach ( $booking_ids as $bid ) {
				$bid          = intval( $bid );
				$booking_post = $bid ? get_post( $bid ) : null;
				if ( $booking_post ) {
					$all_bookings[] = $this->format_relation_post( $booking_post );
				}
			}
		}

		$relations = [
			'bookings' => $this->paginate_array( $all_bookings, $page ),
		];

		if ( $group && isset( $relations[ $group ] ) ) {
			return [ $group => $relations[ $group ] ];
		}
		return $relations;
	}
}
