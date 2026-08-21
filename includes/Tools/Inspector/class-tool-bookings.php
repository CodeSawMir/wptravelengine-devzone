<?php

namespace WPTravelEngineDevZone\Tools\Inspector;

use WPTravelEngineDevZone\Tools\AbstractPostTool;

defined( 'ABSPATH' ) || exit;

class ToolBookings extends AbstractPostTool {
	public function get_slug(): string      { return 'bookings'; }
	public function get_label(): string     { return __( 'Bookings', 'wptravelengine-devzone' ); }
	public function get_post_type(): string { return 'booking'; }
	public function get_noun(): string      { return __( 'booking', 'wptravelengine-devzone' ); }

	public function get_relations( int $post_id, string $group, int $page ): array {
		// Trip relations — extract trip IDs from cart_info.
		$all_trips = [];
		foreach ( $this->trip_ids_from_cart_info( $post_id ) as $trip_id ) {
			$trip_post = get_post( $trip_id );
			if ( $trip_post ) {
				$all_trips[] = $this->format_relation_post( $trip_post );
			}
		}

		// Payment relations.
		$all_payments  = [];
		$payments_meta = get_post_meta( $post_id, 'payments', true );
		if ( is_array( $payments_meta ) ) {
			foreach ( $payments_meta as $payment_id ) {
				$payment_id   = intval( $payment_id );
				$payment_post = $payment_id ? get_post( $payment_id ) : null;
				if ( $payment_post ) {
					$all_payments[] = $this->format_relation_post( $payment_post );
				}
			}
		}

		// Customer relations.
		$all_customers = [];
		$billing_info  = get_post_meta( $post_id, 'billing_info', true );
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

		$relations = [
			'trip'      => $this->paginate_array( $all_trips, $page ),
			'payments'  => $this->paginate_array( $all_payments, $page ),
			'customers' => $this->paginate_array( $all_customers, $page ),
		];

		if ( $group && isset( $relations[ $group ] ) ) {
			return [ $group => $relations[ $group ] ];
		}
		return $relations;
	}
}
