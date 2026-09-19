/**
 * @mention resolution — moved from `routes/threads.ts`'s
 * `buildMentionLookup`/`resolveMentionsForMessage` (AE5). A nested Service
 * may not import `@hyperidle/users` directly, so the name lookup is built
 * from an injected read (`ThreadActionsDeps.users`) instead of `listUsers`.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { extractMentionCandidates, type InlineRef, resolveMentions } from "@hyperidle/domain-model";

export interface MentionResolverDeps {
	/** Users belonging to the given teams, for team-wide mention resolution (AE5). */
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
}

/**
 * Case-insensitive name→identity map for mention resolution. Team-scoped:
 * a message's participants can @mention any agent in the SAME team, not
 * only who is already in the thread (AE5).
 */
async function buildMentionLookup(
	db: HyperIdleDb,
	participantIds: readonly string[],
	deps: MentionResolverDeps,
): Promise<ReadonlyMap<string, { identityId: string; displayName: string }>> {
	if (participantIds.length === 0) return new Map();

	const participantRows = await deps.listByIds(db, participantIds);
	const teamIds = [
		...new Set(participantRows.map((r) => r.teamId).filter((id): id is string => id !== null)),
	];

	const pool = teamIds.length > 0 ? await deps.listByTeamIds(db, teamIds) : participantRows;

	const map = new Map<string, { identityId: string; displayName: string }>();
	const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id));
	for (const row of sorted) {
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
	deps: MentionResolverDeps,
): Promise<{ refs: InlineRef[]; newParticipantIds: string[]; mentionedIds: string[] }> {
	const candidates = extractMentionCandidates(text);
	if (candidates.length === 0) {
		return { refs: [...existingRefs], newParticipantIds: [], mentionedIds: [] };
	}

	const nameMap = await buildMentionLookup(db, participantIds, deps);
	const resolved = resolveMentions(candidates, nameMap, senderId);
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
