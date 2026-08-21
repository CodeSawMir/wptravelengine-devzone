<?php

namespace WPTravelEngineDevZone\Tools\Inspector;

use WPTravelEngineDevZone\Tools\AbstractPostTool;

defined( 'ABSPATH' ) || exit;

class ToolPayments extends AbstractPostTool {
	public function get_slug(): string      { return 'payments'; }
	public function get_label(): string     { return __( 'Payments', 'wptravelengine-devzone' ); }
	public function get_post_type(): string { return 'wte-payments'; }
	public function get_noun(): string      { return __( 'payment', 'wptravelengine-devzone' ); }

	public function get_relations( int $post_id, string $group, int $page ): array {
		// Booking relation.
		$booking_id   = intval( get_post_meta( $post_id, 'booking_id', true ) );
		$booking_post = $booking_id ? get_post( $booking_id ) : null;
		$all_bookings = $booking_post ? [ $this->format_relation_post( $booking_post ) ] : [];

		// Resolve trips and customer via the booking.
		$all_trips     = [];
		$all_customers = [];
		if ( $booking_post ) {
			foreach ( $this->trip_ids_from_cart_info( $booking_id ) as $trip_id ) {
				$trip_post = get_post( $trip_id );
				if ( $trip_post ) {
					$all_trips[] = $this->format_relation_post( $trip_post );
				}
			}

			$billing_info = get_post_meta( $booking_id, 'billing_info', true );
			if ( is_array( $billing_info ) && ! empty( $billing_info['email'] ) ) {
				$customer_query = new \WP_Query( [
					'post_type'        => 'customer',
					'post_status'      => array_keys( get_post_stati() ),
					'posts_per_page'   => -1,
					'suppress_filters' => true,
					'title'            => sanitize_email( $billing_info['email'] ),
				] );
				$all_customers = array_map( [ $this, 'format_relation_post' ], $customer_query->posts );
			}
		}

		$relations = [
			'trip'     => $this->paginate_array( $all_trips, $page ),
			'booking'  => $this->paginate_array( $all_bookings, $page ),
			'customer' => $this->paginate_array( $all_customers, $page ),
		];

		if ( $group && isset( $relations[ $group ] ) ) {
			return [ $group => $relations[ $group ] ];
		}
		return $relations;
	}
}
