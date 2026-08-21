<?php

namespace WPTravelEngineDevZone\Tools;

defined( 'ABSPATH' ) || exit;

/**
 * Base class for all Dev Zone tool tabs.
 *
 * To add a new tool:
 *  1. Extend this class (or AbstractPostTool) and implement the three abstract methods.
 *  2. Create a template file and return its path from get_template().
 *  3. Add `new Tools\YourTool()` to the array in Plugin::boot().
 */
abstract class AbstractTool {

	/** The ?tab= URL param value (must be a valid slug). */
	abstract public function get_slug(): string;

	/** Tab navigation label shown to the user. */
	abstract public function get_label(): string;

	/** Absolute filesystem path to the PHP template for this tab. */
	abstract public function get_template(): string;

	/** Override to redirect the tab link to an external admin URL instead of this page. */
	public function get_tab_url(): ?string { return null; }

	/** Override to true to do a full-page load for this tab (needed for WP_List_Table). */
	public function use_page_navigation(): bool { return false; }

	/** Override to register wp_ajax_ hooks for this tool. */
	public function register_ajax(): void {}

	/** Override to enqueue CSS/JS specific to this tool. Called only on the Dev Zone page. */
	public function enqueue_assets(): void {}

	/** Max nesting depth captured by build_tree(). */
	protected const TREE_MAX_DEPTH = 8;

	/** Max entries captured per array/object level before truncating. */
	protected const TREE_MAX_ITEMS = 200;

	/**
	 * Recursively converts an array/object value into a plain, JSON-safe
	 * structure for the collapsible tree view (UnserTree on the JS side) — same
	 * shape var_dump would show (class names, private/protected properties)
	 * without var_dump's text format. Any tool can feed an AJAX response field
	 * through this to get the same tree UI the Query tab's beautifier and the
	 * Tinker tab's return-value panel use.
	 *
	 * @param array<int,int> $seen spl_object_id()s already visited, to break cycles.
	 */
	protected static function build_tree( $value, array &$seen = [], int $depth = 0 ) {
		if ( is_array( $value ) ) {
			if ( $depth >= static::TREE_MAX_DEPTH ) {
				return '*MAX DEPTH*';
			}
			$out = [];
			$i   = 0;
			foreach ( $value as $k => $v ) {
				if ( $i++ >= static::TREE_MAX_ITEMS ) {
					$out['…'] = ( count( $value ) - static::TREE_MAX_ITEMS ) . ' more item(s)';
					break;
				}
				$out[ $k ] = static::build_tree( $v, $seen, $depth + 1 );
			}
			return $out;
		}

		if ( is_object( $value ) ) {
			if ( $value instanceof \Closure ) {
				return 'Closure';
			}

			$id = spl_object_id( $value );
			if ( in_array( $id, $seen, true ) ) {
				return '*RECURSION* (' . get_class( $value ) . ')';
			}
			if ( $depth >= static::TREE_MAX_DEPTH ) {
				return '*MAX DEPTH* (' . get_class( $value ) . ')';
			}

			$seen[] = $id;
			$out    = [ '__class__' => get_class( $value ) ];

			try {
				$props = ( new \ReflectionObject( $value ) )->getProperties();
				$i     = 0;
				foreach ( $props as $prop ) {
					if ( $i++ >= static::TREE_MAX_ITEMS ) {
						$out['…'] = 'more properties truncated';
						break;
					}
					$prop->setAccessible( true );
					if ( ! $prop->isInitialized( $value ) ) {
						$out[ $prop->getName() ] = '*UNINITIALIZED*';
						continue;
					}
					try {
						$out[ $prop->getName() ] = static::build_tree( $prop->getValue( $value ), $seen, $depth + 1 );
					} catch ( \Throwable $e ) {
						$out[ $prop->getName() ] = '*UNREADABLE*';
					}
				}
			} catch ( \Throwable $e ) {
				// Leave just __class__.
			}

			return $out;
		}

		if ( is_resource( $value ) ) {
			return 'resource (' . get_resource_type( $value ) . ')';
		}

		// wp_send_json_success() fails outright on invalid UTF-8 anywhere in the
		// payload, so scrub it here rather than let one binary property blank the
		// whole response.
		return is_string( $value ) ? wp_check_invalid_utf8( $value, true ) : $value;
	}
}
