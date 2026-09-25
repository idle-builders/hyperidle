/**
 * @mention resolution — moved from `routes/threads.ts`'s
 * `buildMentionLookup`/`resolveMentionsForMessage`. A nested Service
 * may not import `@hyperidle/user` directly, so the name lookup is built
 * from an injected read (`ThreadActionsDeps.users`) instead of `listUsers`.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { type InlineRef, resolveMentionsInText } from "@hyperidle/domain-model";

export interface MentionResolverDeps {
	/** Users belonging to the given teams, for team-wide mention resolution. */
	readonly listByTeamIds: (
		db: HyperIdleDb,
		teamIds: readonly string[],
	) => Promise<
		ReadonlyArray<{ readonly id: string; readonly name: string; readonly teamId: string | null }>
	>;
	readonly listByIds: (
		db: HyperIdleDb,
		ids: readonly string[],
	) => Promise<
		ReadonlyArray<{ readonly id: string; readonly name: string; readonly teamId: string | null }>
	>;
	/**
	 * Agents owned by the given user (`users.ownerUserId`) — a human's own
	 * agent is addressable by @mention even though it belongs to no team.
	 */
	readonly listOwnedBy: (
		db: HyperIdleDb,
		ownerId: string,
	) => Promise<
		ReadonlyArray<{ readonly id: string; readonly name: string; readonly teamId: string | null }>
	>;
}

/**
 * Case-insensitive name→identity map for mention resolution. The pool is who
 * a person reasonably addresses in this thread: the current participants,
 * the teams those participants belong to, the thread's own HOST team
 * when it is team-hosted, and the sender's own agents. A name collision
 * keeps the old deterministic rule — sorted by id, first wins — except a
 * current participant always wins over a non-participant sharing the name.
 */
async function buildMentionLookup(
	db: HyperIdleDb,
	participantIds: readonly string[],
	senderId: string,
	hostTeamId: string | null,
	deps: MentionResolverDeps,
): Promise<ReadonlyMap<string, { identityId: string; displayName: string }>> {
	if (participantIds.length === 0) return new Map();

	const participantRows = await deps.listByIds(db, participantIds);
	const teamIds = [
		...new Set([
			...participantRows.map((r) => r.teamId).filter((id): id is string => id !== null),
			...(hostTeamId !== null ? [hostTeamId] : []),
		]),
	];

	const [teamRows, ownedRows] = await Promise.all([
		teamIds.length > 0 ? deps.listByTeamIds(db, teamIds) : Promise.resolve([]),
		deps.listOwnedBy(db, senderId),
	]);

	const poolById = new Map<
		string,
		{ readonly id: string; readonly name: string; readonly teamId: string | null }
	>();
	for (const row of [...teamRows, ...ownedRows, ...participantRows]) poolById.set(row.id, row);

	const participantIdSet = new Set(participantIds);
	const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
	const pool = [...poolById.values()];
	const orderedPool = [
		...pool.filter((r) => participantIdSet.has(r.id)).sort(byId),
		...pool.filter((r) => !participantIdSet.has(r.id)).sort(byId),
	];

	const map = new Map<string, { identityId: string; displayName: string }>();
	for (const row of orderedPool) {
		const key = row.name.toLowerCase();
		if (!map.has(key)) map.set(key, { identityId: row.id, displayName: row.name });
	}
	return map;
}

/**
 * Resolve @mention candidates from a plain message's text. Returns the
 * enriched refs array, the set of newly-mentioned participant ids
 * (excluding the sender and anyone already a member — used to grow
 * thread membership), and `mentionedIds` — every resolved mention id
 * excluding the sender, whether or not it was already a member.
 *
 * @lore A mention of an agent already in the thread must still wake it, so
 * the wake decision (`agentsToWake`) reads `mentionedIds`, not
 * `newParticipantIds`.
 */
export async function resolveMentionsForMessage(
	db: HyperIdleDb,
	text: string,
	existingRefs: readonly InlineRef[],
	participantIds: readonly string[],
	senderId: string,
	hostTeamId: string | null,
	deps: MentionResolverDeps,
): Promise<{ refs: InlineRef[]; newParticipantIds: string[]; mentionedIds: string[] }> {
	if (!text.includes("@")) {
		return { refs: [...existingRefs], newParticipantIds: [], mentionedIds: [] };
	}

	const nameMap = await buildMentionLookup(db, participantIds, senderId, hostTeamId, deps);
	const resolved = resolveMentionsInText(text, nameMap);
	if (resolved.length === 0) {
		return { refs: [...existingRefs], newParticipantIds: [], mentionedIds: [] };
	}

	const mentionRefs: InlineRef[] = resolved.map((r) => ({
		kind: "mention" as const,
		identityId: r.identityId,
		displayName: r.displayName,
		sourceText: r.sourceText,
	}));

	const participantSet = new Set(participantIds);
	const mentionedIds = resolved.filter((r) => r.identityId !== senderId).map((r) => r.identityId);
	const newParticipantIds = resolved
		.filter((r) => r.identityId !== senderId && !participantSet.has(r.identityId))
		.map((r) => r.identityId);

	return { refs: [...existingRefs, ...mentionRefs], newParticipantIds, mentionedIds };
}
