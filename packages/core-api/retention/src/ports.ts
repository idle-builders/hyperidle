/**
 * `retention` Service (core-api) — outbound composition-boundary (Mechanism C)
 * DI ports for `reapRetentionOnce`'s real outbound edges.
 *
 * `retention → notifications` was already census-listed (architecture §10.2
 * line 390: `retention-reaper → notification-queue`, 1 call site) — ordinary
 * downward core-api→core-api edge.
 *
 * @lore AU19 Increment 2g — census correction (§14 sanctions updating the
 * census as "a floor, refinable during migration", same idiom as
 * `git-export → knowledge` in Increment 2c, `policy → org` in Increment 2a,
 * `realtime → org` in Increment 2f): TWO more real edges were missing from
 * the original census — `retention → users` (`loginSessions`/`inviteCodes`,
 * 2 call sites) and `retention → knowledge` (`knowledgeAccessLog`, 1 call
 * site). Both were raw `@hyperidle/db` table access at original census time
 * (before `users`/`knowledge` existed as real owner packages), so they never
 * showed up as a `packages/server`-internal relative-import edge — the
 * census method (§10, "map every file to its Service, resolve relative
 * imports") only ever counted import-based edges, not raw-table-ownership
 * edges. Migrating `retention` for real, under Table ACL, is what surfaces
 * them now: `retention` can no longer touch `loginSessions`/`inviteCodes`
 * (owned by `users`) or `knowledgeAccessLog` (owned by `knowledge`) directly,
 * so both became injected ports wired to the real delete functions moved
 * onto their owning Services (`@hyperidle/users`'
 * `reapLoginSessions`/`reapInviteCodes`, `@hyperidle/knowledge`'s
 * `reapKnowledgeAccessLog`). See this Service's `index.ts` top comment for
 * the §10.1/§10.2 aggregate-row update this correction requires.
 *
 * `propagation_log` (the fifth table `reapRetentionOnce` prunes) stays a
 * direct `@hyperidle/db` read+delete — it is already in
 * `scripts/table-ownership-guard.ts`'s `UNOWNED_SHARED_TABLES` (genuinely
 * multi-owner-touched, same idiom as `policy`'s/`realtime`'s `sessions`
 * reads), so no port is needed for it.
 *
 * Structural ports, same idiom as `@hyperidle/policy`'s / `@hyperidle/realtime`'s
 * `ports.ts`: each mirrors the real target function's signature so the
 * concrete caller (still `packages/server`, the not-yet-split composition
 * root) can pass its existing function reference unchanged — zero behavior
 * change.
 */

import type { WriteExecutor } from "@hyperidle/db";

// ---------------------------------------------------------------------------
// users — RetentionUsersReaper (ordinary downward core-api edge, census
// correction — see this file's top @lore)
// ---------------------------------------------------------------------------

/**
 * Port for `users`' merged credential TTL sweep.
 *
 * @lore AU20 Am11: `reapLoginSessions` + `reapInviteCodes` merged into
 * `reapExpiredCredentials` — the two callers inside `retention-reaper.ts`
 * became one call that computes all three cutoffs and receives the split
 * result.
 */
export interface RetentionUsersReaper {
	/** Wires to `@hyperidle/users`' `reapExpiredCredentials`. */
	reapExpiredCredentials(
		db: WriteExecutor,
		args: {
			sessionCutoff: string;
			inviteExpiredCutoff: string;
			inviteConsumedCutoff: string;
		},
	): Promise<{ sessions: readonly string[]; invites: readonly string[] }>;
}

// ---------------------------------------------------------------------------
// knowledge — RetentionKnowledgeAccessLogReaper (ordinary downward core-api
// edge, census correction — see this file's top @lore)
// ---------------------------------------------------------------------------

/** Port for `knowledge`'s `knowledge_access_log` TTL sweep function. */
export interface RetentionKnowledgeAccessLogReaper {
	/** Wires to `@hyperidle/knowledge`'s `reapKnowledgeAccessLog`. Returns deleted ids. */
	reapKnowledgeAccessLog(db: WriteExecutor, cutoff: string): Promise<readonly string[]>;
}

// ---------------------------------------------------------------------------
// notifications — RetentionNotificationQueueReaper (ordinary downward
// core-api edge, already census-listed §10.2 line 390)
// ---------------------------------------------------------------------------

/** Port for `notifications`' `notification_queue` TTL sweep function. */
export interface RetentionNotificationQueueReaper {
	/** Wires to `@hyperidle/notifications`' `deleteReaped`. Returns deleted ids. */
	deleteReaped(
		db: WriteExecutor,
		cutoff: string,
		statuses: readonly string[],
	): Promise<readonly string[]>;
}

// ---------------------------------------------------------------------------
// Aggregate deps bundle
// ---------------------------------------------------------------------------

/** Deps `reapRetentionOnce`/`startRetentionReaper` need — every real outbound edge. */
export interface RetentionReaperDeps {
	readonly users: RetentionUsersReaper;
	readonly knowledge: RetentionKnowledgeAccessLogReaper;
	readonly notifications: RetentionNotificationQueueReaper;
}
