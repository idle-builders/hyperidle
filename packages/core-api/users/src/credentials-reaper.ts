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
import { inviteCodes, loginSessions } from "@hyperidle/db";
import { and, inArray, isNotNull, lt, or } from "drizzle-orm";

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
	const sessions = await db
		.delete(loginSessions)
		.where(
			or(
				lt(loginSessions.expiresAt, args.sessionCutoff),
				and(isNotNull(loginSessions.revokedAt), lt(loginSessions.revokedAt, args.sessionCutoff)),
			),
		)
		.returning({ id: loginSessions.id });
	const expired = await db
		.select({ id: inviteCodes.id, claimedBy: inviteCodes.claimedBy })
		.from(inviteCodes)
		.where(lt(inviteCodes.expiresAt, args.inviteExpiredCutoff));
	const consumed = await db
		.select({ id: inviteCodes.id })
		.from(inviteCodes)
		.where(
			and(isNotNull(inviteCodes.claimedBy), lt(inviteCodes.createdAt, args.inviteConsumedCutoff)),
		);
	const ids = [
		...new Set([
			...expired.filter(({ claimedBy }) => claimedBy === null).map(({ id }) => id),
			...consumed.map(({ id }) => id),
		]),
	];
	const invites = ids.length
		? await db
				.delete(inviteCodes)
				.where(inArray(inviteCodes.id, ids))
				.returning({ id: inviteCodes.id })
		: [];
	return {
		sessions: sessions.map(({ id }) => id),
		invites: invites.map(({ id }) => id),
	};
}
