<?php

namespace WPTravelEngineDevZone\Tools\Tinker;

defined( 'ABSPATH' ) || exit;

/**
 * Capped audit trail for Tinker runs — who ran what, when, isolated or not,
 * and whether it fataled. Not a compliance log: it's a fixed-size ring buffer
 * meant for "something broke, who ran what recently" forensics.
 *
 * Inspect it without any UI via:
 *   wp option get wpte_devzone_tinker_audit_log --format=json
 */
class TinkerAuditLog {

	/** Option the log is stored under. */
	private const OPTION = 'wpte_devzone_tinker_audit_log';

	/** Ring-buffer size — oldest entries fall off once this is exceeded. */
	private const MAX_ENTRIES = 100;

	/** Longest snippet body kept per entry; longer ones are truncated. */
	private const CODE_MAX_LEN = 4000;

	/**
	 * Appends a run to the log.
	 *
	 * Not safe to call from inside the isolated child process — a bare CLI
	 * process has no authenticated user context, so an entry recorded there
	 * would misattribute the run to "no user". Isolated runs are recorded by
	 * the caller in the parent process instead, once it regains control after
	 * the child exits (which it always does, crash or not).
	 *
	 * @param string $code     The as-submitted snippet body.
	 * @param array  $payload  The run's result payload (same shape sent to the browser).
	 * @param bool   $isolated Whether this run executed in an isolated child process.
	 */
	public static function record( string $code, array $payload, bool $isolated ): void {
		$log = get_option( self::OPTION, [] );
		if ( ! is_array( $log ) ) {
			$log = [];
		}

		$user = wp_get_current_user();

		$log[] = [
			'time'      => time(),
			'user_id'   => $user->ID,
			'user_name' => $user->user_login,
			'code'      => strlen( $code ) > self::CODE_MAX_LEN
				? substr( $code, 0, self::CODE_MAX_LEN ) . '…'
				: $code,
			'isolated'  => $isolated,
			'success'   => empty( $payload['fatal'] ),
			'fatal'     => $payload['fatal']['message'] ?? null,
			'time_ms'   => $payload['time_ms'] ?? null,
		];

		if ( count( $log ) > self::MAX_ENTRIES ) {
			$log = array_slice( $log, -self::MAX_ENTRIES );
		}

		update_option( self::OPTION, $log, false );
	}

	/**
	 * The audit log, newest entry first.
	 *
	 * @return array<int,array{time:int,user_id:int,user_name:string,code:string,isolated:bool,success:bool,fatal:?string,time_ms:?float}>
	 */
	public static function get_log(): array {
		$log = get_option( self::OPTION, [] );
		return is_array( $log ) ? array_reverse( $log ) : [];
	}

	/** Clears the log entirely. */
	public static function clear(): void {
		delete_option( self::OPTION );
	}
}
