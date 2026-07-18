/**
 * Credential reaper — merges the two former per-table reap exports
 * (`reapLoginSessions` + `reapInviteCodes`) into a single call that
 * `@hyperidle/retention`'s `RetentionUsersReaper` port makes.
 *
 * @lore AU20 Am11: the two separate cutoff parameters (session cutoff +
 * invite expiry/consumed cutoffs) are now bundled into one arg object so
 * `retention` can compute all three cutoffs once and pass them in a single
 * call, matching the merged `RetentionUsersReaper` port shape.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { reapInviteCodes } from "./invite-code.js";
import { reapLoginSessions } from "./login-session.js";

export interface ReapExpiredCredentialsArgs {
	/** ISO-8601 cutoff for login session expiry/revocation sweep. */
	readonly sessionCutoff: string;
	/** ISO-8601 cutoff for expired (unclaimed) invite codes. */
	readonly inviteExpiredCutoff: string;
	/** ISO-8601 cutoff for old consumed invite codes (audit-window). */
	readonly inviteConsumedCutoff: string;
}

export interface ReapExpiredCredentialsResult {
	readonly sessions: readonly string[];
	readonly invites: readonly string[];
}

/**
 * Sweep both credential tables in one call.
 * Returns the deleted row ids from each table.
 */
export async function reapExpiredCredentials(
	db: HyperIdleDb,
	args: ReapExpiredCredentialsArgs,
): Promise<ReapExpiredCredentialsResult> {
	const sessions = await reapLoginSessions(db, args.sessionCutoff);
	const invites = await reapInviteCodes(db, args.inviteExpiredCutoff, args.inviteConsumedCutoff);
	return { sessions, invites };
}
