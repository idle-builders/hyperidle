import type { HyperIdleDb } from "@hyperidle/db";
import { type InlineRef, resolveMentionsInText } from "@hyperidle/domain-model";

export interface MentionResolverDeps {
	/** Every user in the organisation — there is one, so anyone may be mentioned. */
	readonly listEveryone: (
		db: HyperIdleDb,
	) => Promise<
		ReadonlyArray<{ readonly id: string; readonly name: string; readonly role: string }>
	>;
}

/**
 * Case-insensitive name→identity map for mention resolution. The pool is
 * everyone in the organisation except the hidden system actor. A name
 * collision keeps the deterministic rule — sorted by id, first wins — except
 * a current participant always wins over a non-participant sharing the name.
 */
async function buildMentionLookup(
	db: HyperIdleDb,
	participantIds: readonly string[],
	deps: MentionResolverDeps,
): Promise<ReadonlyMap<string, { identityId: string; displayName: string }>> {
	const pool = (await deps.listEveryone(db)).filter((r) => r.role !== "system");
	const participantIdSet = new Set(participantIds);
	const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
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
 * (excluding the sender and anyone already a member), and `mentionedIds` —
 * every resolved mention id excluding the sender, whether or not already a member.
 * @lore: a mention of an agent already in the thread must still wake it — `agentsToWake` reads `mentionedIds`, not `newParticipantIds`
 */
export async function resolveMentionsForMessage(
	db: HyperIdleDb,
	text: string,
	existingRefs: readonly InlineRef[],
	participantIds: readonly string[],
	senderId: string,
	deps: MentionResolverDeps,
): Promise<{ refs: InlineRef[]; newParticipantIds: string[]; mentionedIds: string[] }> {
	if (!text.includes("@")) {
		return { refs: [...existingRefs], newParticipantIds: [], mentionedIds: [] };
	}

	const nameMap = await buildMentionLookup(db, participantIds, deps);
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
