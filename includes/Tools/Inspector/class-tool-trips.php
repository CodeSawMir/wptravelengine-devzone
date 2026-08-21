<?php

namespace WPTravelEngineDevZone\Tools\Inspector;

use WPTravelEngineDevZone\Admin;
use WPTravelEngineDevZone\Tools\AbstractPostTool;

defined( 'ABSPATH' ) || exit;

class ToolTrips extends AbstractPostTool {
	public function get_slug(): string      { return 'trips'; }
	public function get_label(): string     { return __( 'Trips', 'wptravelengine-devzone' ); }
	public function get_post_type(): string { return 'trip'; }
	public function get_noun(): string      { return __( 'trip', 'wptravelengine-devzone' ); }

	public function get_toolbar_actions(): array {
		return array( 'export', 'import' );
	}

	public function register_ajax(): void {
		add_action( 'wp_ajax_wpte_devzone_export_trips', array( $this, 'ajax_export_trips' ) );
		add_action( 'wp_ajax_wpte_devzone_import_trips', array( $this, 'ajax_import_trips' ) );
	}

	public function ajax_export_trips(): void {
		Admin::verify_request();

		$ids_raw = sanitize_text_field( wp_unslash( $_POST['ids'] ?? '' ) );
		$ids     = array_values( array_filter( array_map( 'intval', explode( ',', $ids_raw ) ) ) );

		if ( empty( $ids ) ) {
			wp_send_json_error( array( 'message' => 'No trip IDs provided.' ) );
		}

		$trips = array();

		foreach ( $ids as $trip_id ) {
			$post = get_post( $trip_id );
			if ( ! $post || 'trip' !== $post->post_type ) {
				continue;
			}

			// Collect all meta, unserialising PHP-serialised values so JSON is clean.
			$raw_meta = get_post_meta( $trip_id );
			$meta     = array();
			foreach ( $raw_meta as $key => $values ) {
				$meta[ $key ] = maybe_unserialize( $values[0] ?? null );
			}

			// Collect taxonomy terms by name so they can be re-created on import.
			$taxonomies = get_object_taxonomies( 'trip' );
			$terms      = array();
			foreach ( $taxonomies as $tax ) {
				$t             = get_the_terms( $trip_id, $tax );
				$terms[ $tax ] = ( $t && ! is_wp_error( $t ) ) ? wp_list_pluck( $t, 'name' ) : array();
			}

			// Export all linked packages so they travel with the trip.
			$packages        = array();
			$primary_pkg_id  = (int) get_post_meta( $trip_id, 'primary_package', true );
			$packages_ids    = get_post_meta( $trip_id, 'packages_ids', true );
			$packages_ids    = is_array( $packages_ids ) ? $packages_ids : array();

			foreach ( $packages_ids as $pkg_id ) {
				$pkg = get_post( (int) $pkg_id );
				if ( ! $pkg || 'trip-packages' !== $pkg->post_type ) {
					continue;
				}

				$pkg_raw_meta = get_post_meta( $pkg->ID );
				$pkg_meta     = array();
				foreach ( $pkg_raw_meta as $key => $values ) {
					$pkg_meta[ $key ] = maybe_unserialize( $values[0] ?? null );
				}
				// Remove trip_ID — re-set to new trip ID on import.
				unset( $pkg_meta['trip_ID'] );

				// Build a term-ID → slug map for package-categories so prices
				// survive import to a site where term IDs differ.
				$pricing_term_map = array();
				$pkg_categories   = $pkg_meta['package-categories'] ?? array();
				if ( is_array( $pkg_categories ) && ! empty( $pkg_categories['c_ids'] ) ) {
					foreach ( array_keys( $pkg_categories['c_ids'] ) as $term_id ) {
						$term = get_term( (int) $term_id, 'trip-packages-categories' );
						if ( $term && ! is_wp_error( $term ) ) {
							$pricing_term_map[ (int) $term_id ] = $term->slug;
						}
					}
				}

				// Same remapping for primary_pricing_category.
				$primary_cat_id   = isset( $pkg_meta['primary_pricing_category'] ) ? (int) $pkg_meta['primary_pricing_category'] : 0;
				$primary_cat_slug = '';
				if ( $primary_cat_id ) {
					$primary_term = get_term( $primary_cat_id, 'trip-packages-categories' );
					if ( $primary_term && ! is_wp_error( $primary_term ) ) {
						$primary_cat_slug = $primary_term->slug;
					}
				}

				$packages[] = array(
					'post'               => array(
						'post_title'   => $pkg->post_title,
						'post_status'  => $pkg->post_status,
						'post_content' => $pkg->post_content,
					),
					'meta'               => $pkg_meta,
					'is_primary'         => ( $pkg->ID === $primary_pkg_id ),
					'pricing_term_map'   => $pricing_term_map,   // term_id => slug
					'primary_cat_slug'   => $primary_cat_slug,
				);
			}

			$trips[] = array(
				'post'       => array(
					'post_title'   => $post->post_title,
					'post_status'  => $post->post_status,
					'post_content' => $post->post_content,
					'post_excerpt' => $post->post_excerpt,
					'post_date'    => $post->post_date,
				),
				'meta'       => $meta,
				'taxonomies' => $terms,
				'packages'   => $packages,
			);
		}

		wp_send_json_success(
			array(
				'version'     => '1.0',
				'exported_at' => current_time( 'c' ),
				'trips'       => $trips,
			)
		);
	}

	public function ajax_import_trips(): void {
		Admin::verify_request();

		$json_raw = wp_unslash( $_POST['data'] ?? '' );
		$data     = json_decode( $json_raw, true );

		if ( ! is_array( $data ) || ! isset( $data['trips'] ) || ! is_array( $data['trips'] ) ) {
			wp_send_json_error( array( 'message' => 'Invalid JSON: expected a trips export file.' ) );
		}

		// Meta keys that must never be written via import (WordPress internals).
		$skip_trip_meta_keys = array(
			'_thumbnail_id',
			'_edit_lock',
			'_edit_last',
			'_wp_trash_meta_time',
			'_wp_trash_meta_status',
			'_wp_old_slug',
			// These are rebuilt from the packages array below.
			'packages_ids',
			'primary_package',
		);

		$skip_pkg_meta_keys = array(
			'_edit_lock',
			'_edit_last',
			'_wp_trash_meta_time',
			'_wp_trash_meta_status',
			'_wp_old_slug',
			// trip_ID is omitted from the export; set explicitly to new trip ID below.
			'trip_ID',
		);

		$created = array();
		$errors  = array();

		foreach ( $data['trips'] as $index => $trip_data ) {
			$post_title = $trip_data['post']['post_title'] ?? '';
			if ( '' === $post_title ) {
				$errors[] = sprintf( 'Trip #%d is missing post_title — skipped.', $index );
				continue;
			}

			$post_id = wp_insert_post(
				array(
					'post_type'    => 'trip',
					'post_title'   => sanitize_text_field( $post_title ),
					'post_status'  => sanitize_key( $trip_data['post']['post_status'] ?? 'draft' ),
					'post_content' => wp_kses_post( $trip_data['post']['post_content'] ?? '' ),
					'post_excerpt' => sanitize_textarea_field( $trip_data['post']['post_excerpt'] ?? '' ),
				),
				true
			);

			if ( is_wp_error( $post_id ) ) {
				$errors[] = sprintf( 'Trip #%d (%s): %s', $index, esc_html( $post_title ), $post_id->get_error_message() );
				continue;
			}

			// Write trip meta — skip package ID refs (rebuilt below) and WP internals.
			if ( ! empty( $trip_data['meta'] ) && is_array( $trip_data['meta'] ) ) {
				foreach ( $trip_data['meta'] as $key => $value ) {
					if ( in_array( $key, $skip_trip_meta_keys, true ) ) {
						continue;
					}
					update_post_meta( $post_id, sanitize_key( $key ), $value );
				}
			}

			// Create packages and collect new IDs.
			$new_pkg_ids     = array();
			$new_primary_id  = 0;
			$exported_pkgs   = isset( $trip_data['packages'] ) && is_array( $trip_data['packages'] )
				? $trip_data['packages']
				: array();

			foreach ( $exported_pkgs as $pkg_data ) {
				$pkg_title = $pkg_data['post']['post_title'] ?? '';

				$pkg_id = wp_insert_post(
					array(
						'post_type'    => 'trip-packages',
						'post_title'   => sanitize_text_field( $pkg_title ),
						'post_status'  => sanitize_key( $pkg_data['post']['post_status'] ?? 'publish' ),
						'post_content' => wp_kses_post( $pkg_data['post']['post_content'] ?? '' ),
					),
					true
				);

				if ( is_wp_error( $pkg_id ) ) {
					$errors[] = sprintf(
						'Trip "%s": package "%s" failed — %s',
						esc_html( $post_title ),
						esc_html( $pkg_title ),
						$pkg_id->get_error_message()
					);
					continue;
				}

				// Link this package back to the new trip.
				update_post_meta( $pkg_id, 'trip_ID', $post_id );

				// Remap package-categories and primary_pricing_category from
				// source term IDs → target term IDs using the exported slug map.
				// This ensures prices survive cross-site imports where term IDs differ.
				$pricing_term_map = $pkg_data['pricing_term_map'] ?? array();
				$pkg_meta         = is_array( $pkg_data['meta'] ) ? $pkg_data['meta'] : array();

				if ( ! empty( $pricing_term_map ) ) {
					// Build slug → target term ID lookup once per package.
					$slug_to_target_id = array();
					foreach ( $pricing_term_map as $old_id => $slug ) {
						$target_term = get_term_by( 'slug', $slug, 'trip-packages-categories' );
						if ( $target_term && ! is_wp_error( $target_term ) ) {
							$slug_to_target_id[ $slug ] = $target_term->term_id;
						}
					}

					// Remap every sub-array inside package-categories keyed by term ID.
					if ( ! empty( $slug_to_target_id ) && isset( $pkg_meta['package-categories'] ) && is_array( $pkg_meta['package-categories'] ) ) {
						$remappable = array( 'c_ids', 'prices', 'sale_prices', 'enabled_sale', 'min_paxes', 'max_paxes', 'group-pricings', 'enabled_group_discount', 'pricing_types', 'labels' );
						$remapped   = array();
						foreach ( $remappable as $sub_key ) {
							if ( ! isset( $pkg_meta['package-categories'][ $sub_key ] ) ) {
								continue;
							}
							$remapped[ $sub_key ] = array();
							foreach ( $pkg_meta['package-categories'][ $sub_key ] as $old_id => $val ) {
								$slug      = $pricing_term_map[ $old_id ] ?? null;
								$target_id = $slug ? ( $slug_to_target_id[ $slug ] ?? null ) : null;
								if ( $target_id ) {
									$remapped[ $sub_key ][ $target_id ] = $val;
								}
							}
						}
						$pkg_meta['package-categories'] = $remapped;
					}

					// Remap primary_pricing_category slug → target term ID.
					$primary_cat_slug = $pkg_data['primary_cat_slug'] ?? '';
					if ( $primary_cat_slug && isset( $slug_to_target_id[ $primary_cat_slug ] ) ) {
						$pkg_meta['primary_pricing_category'] = $slug_to_target_id[ $primary_cat_slug ];
					}
				}

				// Write all package meta (pricing_term_map / primary_cat_slug are not meta keys).
				foreach ( $pkg_meta as $key => $value ) {
					if ( in_array( $key, $skip_pkg_meta_keys, true ) ) {
						continue;
					}
					update_post_meta( $pkg_id, sanitize_key( $key ), $value );
				}

				$new_pkg_ids[] = $pkg_id;

				if ( ! empty( $pkg_data['is_primary'] ) && ! $new_primary_id ) {
					$new_primary_id = $pkg_id;
				}
			}

			// Write rebuilt package references to the trip.
			if ( ! empty( $new_pkg_ids ) ) {
				update_post_meta( $post_id, 'packages_ids', $new_pkg_ids );
				update_post_meta( $post_id, 'primary_package', $new_primary_id ?: $new_pkg_ids[0] );
			}

			// Assign taxonomy terms; unknown terms are created automatically.
			if ( ! empty( $trip_data['taxonomies'] ) && is_array( $trip_data['taxonomies'] ) ) {
				foreach ( $trip_data['taxonomies'] as $taxonomy => $term_names ) {
					if ( ! taxonomy_exists( $taxonomy ) || ! is_array( $term_names ) ) {
						continue;
					}
					wp_set_object_terms( $post_id, array_map( 'sanitize_text_field', $term_names ), $taxonomy );
				}
			}

			$created[] = array(
				'id'       => $post_id,
				'title'    => get_the_title( $post_id ),
				'packages' => count( $new_pkg_ids ),
			);
		}

		$total_pkgs = array_sum( array_column( $created, 'packages' ) );
		$message    = sprintf(
			/* translators: 1: number of trips imported */
			_n( '%d trip imported successfully.', '%d trips imported successfully.', count( $created ), 'wptravelengine-devzone' ),
			count( $created )
		);
		if ( $total_pkgs > 0 ) {
			$message .= ' ' . sprintf(
				/* translators: 1: number of packages created */
				_n( '(%d package created)', '(%d packages created)', $total_pkgs, 'wptravelengine-devzone' ),
				$total_pkgs
			);
		}
		if ( $errors ) {
			$message .= ' ' . sprintf(
				/* translators: 1: number of failures */
				_n( '%d failed.', '%d failed.', count( $errors ), 'wptravelengine-devzone' ),
				count( $errors )
			);
		}

		wp_send_json_success(
			array(
				'created' => $created,
				'errors'  => $errors,
				'message' => $message,
			)
		);
	}

	public function get_relations( int $post_id, string $group, int $page ): array {
		$booking_query = new \WP_Query( [
			'post_type'        => 'booking',
			'post_status'      => array_keys( get_post_stati() ),
			'posts_per_page'   => 20,
			'paged'            => $page,
			'suppress_filters' => true,
			'meta_query'       => [
				[
					'key'     => 'cart_info',
					'value'   => 's:7:"trip_id";i:' . $post_id . ';',
					'compare' => 'LIKE',
				],
			],
		] );

		$relations = [
			'bookings' => [
				'items'       => array_map( [ $this, 'format_relation_post' ], $booking_query->posts ),
				'total'       => (int) $booking_query->found_posts,
				'total_pages' => (int) $booking_query->max_num_pages,
				'page'        => $page,
			],
		];

		if ( $group && isset( $relations[ $group ] ) ) {
			return [ $group => $relations[ $group ] ];
		}
		return $relations;
	}
}
