<?php

namespace WPTravelEngineDevZone\Tools\Inspector;

use WPTravelEngineDevZone\Admin;
use WPTravelEngineDevZone\Tools\AbstractTool;
use WPTravelEngineDevZone\Utils\ArrayOps;

defined( 'ABSPATH' ) || exit;

class ToolQuery extends AbstractTool {

	public function get_slug(): string     { return 'query'; }
	public function get_label(): string    { return __( 'Query', 'wptravelengine-devzone' ); }
	public function get_template(): string { return WPTE_DEVZONE_DIR . 'templates/tab-query.php'; }

	public function register_ajax(): void {
		$actions = [
			'wpte_devzone_db_tables'   => 'db_tables',
			'wpte_devzone_db_columns'  => 'db_columns',
			'wpte_devzone_db_query'    => 'db_query',
			'wpte_devzone_db_action'   => 'db_action',
			'wpte_devzone_db_truncate' => 'db_truncate',
		];
		foreach ( $actions as $action => $method ) {
			add_action( "wp_ajax_{$action}", [ $this, $method ] );
		}
	}

	public function enqueue_assets(): void {
		wp_enqueue_style(
			'wpte-devzone-search',
			WPTE_DEVZONE_URL . 'assets/css/tabs/query.css',
			[ 'wpte-devzone' ],
			WPTE_DEVZONE_VERSION
		);
		wp_enqueue_script(
			'wpte-devzone-search',
			WPTE_DEVZONE_URL . 'assets/js/tabs/query.js',
			[ 'wpte-devzone' ],
			WPTE_DEVZONE_VERSION,
			true
		);
	}

	// -------------------------------------------------------------------------
	// Endpoints
	// -------------------------------------------------------------------------

	public function db_tables(): void {
		Admin::verify_request();

		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$tables         = $wpdb->get_col( 'SHOW TABLES' );
		$wp_core_tables = array_values( $wpdb->tables( 'all', true ) );
		$result         = [];

		foreach ( $tables as $table ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
			$count    = (int) $wpdb->get_var( "SELECT COUNT(*) FROM `{$table}`" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$result[] = [
				'name'  => $table,
				'rows'  => $count,
				'group' => $this->classify_table( $table, $wp_core_tables ),
			];
		}

		// Sort: WTE tables first, then WP core, then everything else; alpha within each group.
		$order = [ 'wte' => 0, 'wp' => 1, 'other' => 2 ];
		usort( $result, function ( $a, $b ) use ( $order ) {
			$diff = ( $order[ $a['group'] ] ?? 2 ) - ( $order[ $b['group'] ] ?? 2 );
			return $diff !== 0 ? $diff : strcmp( $a['name'], $b['name'] );
		} );

		wp_send_json_success( [ 'tables' => $result ] );
	}

	public function db_columns(): void {
		Admin::verify_request();

		global $wpdb;

		$table = sanitize_text_field( wp_unslash( $_GET['table'] ?? '' ) );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$tables = $wpdb->get_col( 'SHOW TABLES' );
		if ( ! in_array( $table, $tables, true ) ) {
			wp_send_json_error( [ 'message' => 'Table not found' ], 404 );
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$columns = $wpdb->get_results( "SHOW COLUMNS FROM `{$table}`", ARRAY_A );

		wp_send_json_success( [ 'columns' => $columns ] );
	}

	public function db_query(): void {
		Admin::verify_request();

		global $wpdb;

		$table      = sanitize_text_field( wp_unslash( $_GET['table'] ?? '' ) );
		$filters    = (array) ( $_GET['filters'] ?? [] );
		$or_filters = (array) ( $_GET['or_filters'] ?? [] );
		$limit      = min( 200, max( 1, intval( $_GET['limit'] ?? 50 ) ) );
		$offset     = max( 0, intval( $_GET['offset'] ?? 0 ) );

		// Validate table name against actual tables.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$tables = $wpdb->get_col( 'SHOW TABLES' );
		if ( ! in_array( $table, $tables, true ) ) {
			wp_send_json_error( [ 'message' => 'Table not found' ], 404 );
		}

		// Get valid column names.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$valid_columns = $wpdb->get_col( "SHOW COLUMNS FROM `{$table}`" );

		$and_parts = $this->_build_where_parts( $filters, $valid_columns );
		$or_parts  = $this->_build_where_parts( $or_filters, $valid_columns );

		if ( $and_parts && $or_parts ) {
			$where = 'WHERE (' . implode( ' AND ', $and_parts ) . ') OR (' . implode( ' OR ', $or_parts ) . ')';
		} elseif ( $and_parts ) {
			$where = 'WHERE ' . implode( ' AND ', $and_parts );
		} elseif ( $or_parts ) {
			$where = 'WHERE ' . implode( ' OR ', $or_parts );
		} else {
			$where = '';
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQL.NotPrepared
		$total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM `{$table}` {$where}" );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQL.NotPrepared
		$rows  = $wpdb->get_results( "SELECT * FROM `{$table}` {$where} LIMIT {$limit} OFFSET {$offset}", ARRAY_A );

		wp_send_json_success( [
			'rows'    => $rows,
			'total'   => $total,
			'limit'   => $limit,
			'offset'  => $offset,
			'columns' => $valid_columns,
		] );
	}

	public function db_action(): void {
		Admin::verify_request();

		global $wpdb;

		$type  = sanitize_text_field( wp_unslash( $_POST['type'] ?? '' ) );
		$table = sanitize_text_field( wp_unslash( $_POST['table'] ?? '' ) );

		if ( ! in_array( $type, [ 'add', 'update', 'delete' ], true ) ) {
			wp_send_json_error( [ 'message' => 'Invalid action type' ], 400 );
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$tables = $wpdb->get_col( 'SHOW TABLES' );
		if ( ! in_array( $table, $tables, true ) ) {
			wp_send_json_error( [ 'message' => 'Table not found' ], 404 );
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$valid_columns = $wpdb->get_col( "SHOW COLUMNS FROM `{$table}`" );

		if ( 'add' === $type ) {
			$this->_execute_insert( $table, $valid_columns );
		} elseif ( 'update' === $type ) {
			$this->_execute_update( $table, $valid_columns );
		} else {
			$this->_execute_delete( $table, $valid_columns );
		}
	}

	// -------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------

	private function _build_where_parts( array $raw_filters, array $valid_columns ): array {
		global $wpdb;
		$allowed_ops = [ '=', '!=', 'LIKE', 'NOT LIKE', '>', '<', '>=', '<=', 'IS NULL', 'IS NOT NULL' ];
		$parts       = [];
		foreach ( $raw_filters as $filter ) {
			$col = $filter['column'] ?? '';
			$op  = strtoupper( trim( $filter['operator'] ?? '=' ) );
			$val = wp_unslash( $filter['value'] ?? '' );
			if ( ! in_array( $col, $valid_columns, true ) ) {
				continue;
			}
			if ( ! in_array( $op, $allowed_ops, true ) ) {
				continue;
			}
			if ( 'IS NULL' === $op || 'IS NOT NULL' === $op ) {
				$parts[] = "`{$col}` {$op}";
			} elseif ( 'LIKE' === $op || 'NOT LIKE' === $op ) {
				$parts[] = $wpdb->prepare( "`{$col}` {$op} %s", '%' . $wpdb->esc_like( $val ) . '%' ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			} else {
				$parts[] = $wpdb->prepare( "`{$col}` {$op} %s", $val ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			}
		}
		return $parts;
	}

	private function _execute_insert( string $table, array $valid_columns ): void {
		global $wpdb;

		$raw  = (array) ( $_POST['columns'] ?? [] ); // phpcs:ignore WordPress.Security.NonceVerification
		$data = [];
		foreach ( $raw as $col => $val ) {
			$col = sanitize_text_field( $col );
			if ( in_array( $col, $valid_columns, true ) ) {
				$data[ $col ] = wp_unslash( (string) $val );
			}
		}

		if ( empty( $data ) ) {
			wp_send_json_error( [ 'message' => 'No valid columns provided' ], 400 );
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$result = $wpdb->insert( $table, $data );

		if ( false === $result ) {
			wp_send_json_error( [ 'message' => 'Insert failed: ' . $wpdb->last_error ], 500 );
		}

		wp_send_json_success( [ 'message' => 'Row inserted (ID: ' . $wpdb->insert_id . ')' ] );
	}

	private function _execute_update( string $table, array $valid_columns ): void {
		global $wpdb;

		$where_col = sanitize_text_field( wp_unslash( $_POST['where_column'] ?? '' ) );
		$where_val = wp_unslash( $_POST['where_value'] ?? '' );

		if ( ! in_array( $where_col, $valid_columns, true ) ) {
			wp_send_json_error( [ 'message' => 'where_column is required for UPDATE' ], 400 );
		}

		$raw  = (array) ( $_POST['columns'] ?? [] ); // phpcs:ignore WordPress.Security.NonceVerification
		$data = [];
		foreach ( $raw as $col => $val ) {
			$col = sanitize_text_field( $col );
			if ( in_array( $col, $valid_columns, true ) ) {
				$data[ $col ] = wp_unslash( (string) $val );
			}
		}

		// Tree-edited serialized columns arrive as dot-path => value patches, not
		// the whole blob — e.g. tree_patches[meta_value][20220101.rrule.r_frequency]
		// = "MONTHLY", with the leaf's original scalar type carried alongside in
		// the parallel tree_types map (tree_types[meta_value][...] = "string").
		// Every POST value is a string regardless, so without that the number 40
		// would get written back as the string "40" instead of an int. Dots
		// inside a bracketed key are just a literal string to PHP (no
		// re-nesting), so both parse straight into path => value / path => type
		// maps. Applying the patch against the row's own current value (fetched
		// fresh, not trusted from the client) keeps the request small and never
		// puts the serialized payload on the wire.
		$patches = (array) ( $_POST['tree_patches'] ?? [] ); // phpcs:ignore WordPress.Security.NonceVerification
		$types   = (array) ( $_POST['tree_types'] ?? [] ); // phpcs:ignore WordPress.Security.NonceVerification
		foreach ( $patches as $col => $leaf_patches ) {
			$col = sanitize_text_field( $col );
			if ( ! in_array( $col, $valid_columns, true ) || ! is_array( $leaf_patches ) ) {
				continue;
			}

			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$current = $wpdb->get_var( $wpdb->prepare( "SELECT `{$col}` FROM `{$table}` WHERE `{$where_col}` = %s", $where_val ) );

			// Same two formats the tree view itself understands (see ToolBeautifier::
			// unserialize_data) — try PHP serialization first, fall back to JSON.
			$decoded = maybe_unserialize( $current );
			$is_json = false;
			if ( ! is_array( $decoded ) ) {
				$json_decoded = json_decode( (string) $current, true );
				if ( is_array( $json_decoded ) && JSON_ERROR_NONE === json_last_error() ) {
					$decoded = $json_decoded;
					$is_json = true;
				}
			}

			if ( ! is_array( $decoded ) ) {
				wp_send_json_error( [ 'message' => "Column `{$col}` is not a serialized array or JSON object — cannot apply tree edits." ], 400 );
			}

			// Only for the array_key_exists() check — unknown paths are ignored
			// rather than used to invent new structure.
			$flat       = ArrayOps::flatten( $decoded );
			$ops        = ArrayOps::make( $decoded );
			$col_types  = (array) ( $types[ $col ] ?? [] );

			foreach ( $leaf_patches as $path => $value ) {
				$path = (string) wp_unslash( $path );
				if ( '' === $path || ! array_key_exists( $path, $flat ) ) {
					continue; // Unknown path — ignore rather than inventing structure.
				}
				$type = sanitize_key( wp_unslash( $col_types[ $path ] ?? '' ) );
				$ops->set( $path, self::coerce_leaf_value( $type, wp_unslash( $value ) ) );
			}

			$data[ $col ] = $is_json
				? wp_json_encode( $ops->value() )
				: serialize( $ops->value() ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.serialize_serialize
		}

		if ( empty( $data ) ) {
			wp_send_json_error( [ 'message' => 'No valid columns provided' ], 400 );
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$result = $wpdb->update( $table, $data, [ $where_col => $where_val ] );

		if ( false === $result ) {
			wp_send_json_error( [ 'message' => 'Update failed: ' . $wpdb->last_error ], 500 );
		}

		wp_send_json_success( [ 'message' => $result . ' row(s) updated' ] );
	}

	/**
	 * Coerces a tree patch's incoming (always-string) value to the scalar type
	 * the client declared for that leaf — the tree UI already knows this (it's
	 * what drove the type badge and the bool leaf rendering as a select rather
	 * than a text field), so trusting it directly is simpler and more exact
	 * than re-deriving it from whatever the column's current value happens to
	 * be. Unrecognised/missing type falls back to string, same as a value that
	 * was already a string.
	 *
	 * @since next
	 */
	private static function coerce_leaf_value( string $type, $value ) {
		switch ( $type ) {
			case 'bool':
				return in_array( strtolower( (string) $value ), [ '1', 'true', 'yes' ], true );
			case 'int':
				return (int) $value;
			case 'float':
				return (float) $value;
			case 'null':
				return '' === $value ? null : (string) $value;
			default:
				return (string) $value;
		}
	}

	private function _execute_delete( string $table, array $valid_columns ): void {
		global $wpdb;

		$where_col = sanitize_text_field( wp_unslash( $_POST['where_column'] ?? '' ) );
		$where_val = wp_unslash( $_POST['where_value'] ?? '' );

		if ( ! in_array( $where_col, $valid_columns, true ) ) {
			wp_send_json_error( [ 'message' => 'where_column is required for DELETE' ], 400 );
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$result = $wpdb->delete( $table, [ $where_col => $where_val ] );

		if ( false === $result ) {
			wp_send_json_error( [ 'message' => 'Delete failed: ' . $wpdb->last_error ], 500 );
		}

		wp_send_json_success( [ 'message' => $result . ' row(s) deleted' ] );
	}

	public function db_truncate(): void {
		Admin::verify_request();

		global $wpdb;

		$table = sanitize_text_field( wp_unslash( $_POST['table'] ?? '' ) );

		if ( empty( $table ) ) {
			wp_send_json_error( [ 'message' => __( 'Table name is required.', 'wptravelengine-devzone' ) ] );
		}

		// Only allow truncating WTE tables — never WP core or unrelated tables.
		$wp_core_tables = array_values( $wpdb->tables( 'all', true ) );
		if ( 'wte' !== $this->classify_table( $table, $wp_core_tables ) ) {
			wp_send_json_error( [ 'message' => __( 'Only WP Travel Engine tables can be truncated.', 'wptravelengine-devzone' ) ] );
		}

		// Confirm the table actually exists.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$tables = $wpdb->get_col( 'SHOW TABLES' );
		if ( ! in_array( $table, $tables, true ) ) {
			wp_send_json_error( [ 'message' => __( 'Table not found.', 'wptravelengine-devzone' ) ] );
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$result = $wpdb->query( "TRUNCATE TABLE `{$table}`" );

		if ( false === $result ) {
			wp_send_json_error( [ 'message' => 'Truncate failed: ' . $wpdb->last_error ] );
		}

		wp_send_json_success( [
			'message' => sprintf(
				/* translators: %s: table name */
				__( 'All rows deleted from %s.', 'wptravelengine-devzone' ),
				$table
			),
		] );
	}

	/**
	 * Classify a table name into 'wte', 'wp', or 'other'.
	 *
	 * @param string   $table          Full table name (includes DB prefix).
	 * @param string[] $wp_core_tables List of WP core table names from $wpdb->tables().
	 */
	private function classify_table( string $table, array $wp_core_tables ): string {
		if (
			strpos( $table, 'wptravelengine' ) !== false ||
			strpos( $table, 'travel_engine' ) !== false ||
			strpos( $table, 'wte_' ) !== false
		) {
			return 'wte';
		}
		if ( in_array( $table, $wp_core_tables, true ) ) {
			return 'wp';
		}
		return 'other';
	}
}
