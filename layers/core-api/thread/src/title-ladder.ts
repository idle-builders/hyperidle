/**
 * Batched thread title resolver — moved from `routes/threads.ts`'s
 * `resolveThreadTitles`, one query per host-kind bucket, never
 * N+1. Rung 0 is the stored `threads.title`; there is no host-`task` rung —
 * a task's thread is `team`-hosted now, and nothing computes a
 * team-conversation title from a task.
 *
 * Ladder, first match wins:
 *   0. stored `threads.title`
 *   1. assistant thread (two-party `hostKind:"agent"`, by
 *      `users.ownerUserId`, never id shape) → "Assistant"
 *   2. DM (2-participant, user/agent host) → other participant's name
 *   3. host-scoped (`document`) → entity title
 *   4. group/feed → deterministic participant-name join
 *   5. last resort → "Untitled conversation"
 *
 * Never returns a bare uuid or undefined for any row.
 */

import type { Thread as DbThread, HyperIdleDb } from "@hyperidle/db";
import { threadParticipantsSchema } from "@hyperidle/domain-model";

/**
 * A participant's identity as seen by the ladder. Ownership (`ownerUserId`,
 * the `users.ownerUserId` column) is what rung 1/2's "is this my own
 * assistant agent" check reads — every `listUserNames` implementation must
 * carry it, not just a bare name.
 */
export interface ParticipantIdentity {
	readonly name: string;
	readonly ownerUserId?: string | null;
}

export interface TitleLadderDeps {
	readonly listUserNames: (
		db: HyperIdleDb,
		ids: readonly string[],
	) => Promise<ReadonlyMap<string, ParticipantIdentity>>;
	/**
	 * Batched — bound to ONE `search_documents({ids})` call however many
	 * document-hosted rows are in the list, never a per-id loop
	 * (architecture.md §8.3). A missing/invisible document has no entry in
	 * the returned map; rung 3 below already falls back to "Deleted document"
	 * when `.get()` misses.
	 */
	readonly getDocumentTitles: (
		db: HyperIdleDb,
		ids: readonly string[],
	) => Promise<ReadonlyMap<string, string>>;
}

function identityName(entry: ParticipantIdentity | undefined): string | undefined {
	return entry?.name;
}

function identityOwnerUserId(entry: ParticipantIdentity | undefined): string | null | undefined {
	return entry?.ownerUserId;
}

function parseParticipants(raw: string): string[] {
	try {
		return threadParticipantsSchema.parse(JSON.parse(raw));
	} catch {
		return [];
	}
}

export async function resolveThreadTitles(
	db: HyperIdleDb,
	rows: readonly DbThread[],
	requestingUserId: string,
	deps: TitleLadderDeps,
): Promise<Map<string, string>> {
	const titleMap = new Map<string, string>();
	if (rows.length === 0) return titleMap;

	const kiIds: string[] = [];
	const allParticipantIds = new Set<string>();
	for (const row of rows) {
		for (const p of parseParticipants(row.participants)) allParticipantIds.add(p);
		if (row.hostKind === "document") kiIds.push(row.hostId);
	}

	const [kiMap, userNameMap] = await Promise.all([
		kiIds.length > 0
			? deps.getDocumentTitles(db, kiIds)
			: Promise.resolve(new Map<string, string>()),
		allParticipantIds.size > 0
			? deps.listUserNames(db, [...allParticipantIds])
			: Promise.resolve(new Map<string, ParticipantIdentity>()),
	]);

	for (const row of rows) {
		// Rung 0: the stored title wins over everything computed.
		if (row.title !== null && row.title.trim().length > 0) {
			titleMap.set(row.id, row.title);
			continue;
		}

		const parts = parseParticipants(row.participants);

		// Rung 1: assistant thread — ownership (`users.ownerUserId`), never
		// id shape, decides. `hostKind:"agent"`, two-party direct thread: what
		// `send_message`'s single-agent-recipient branch creates
		// (thread-actions.ts) — the thread is hosted by the AGENT party, not
		// the human.
		// @lore Migration 0085 step 10 re-hosts every user-hosted assistant
		// thread onto its agent too, so this is the only shape a migrated
		// database ever has.
		if (
			row.hostKind === "agent" &&
			parts.length === 2 &&
			identityOwnerUserId(userNameMap.get(row.hostId)) === requestingUserId
		) {
			titleMap.set(row.id, "Assistant");
			continue;
		}

		// Rung 2: DM (2 participants, user or agent host).
		if ((row.hostKind === "user" || row.hostKind === "agent") && parts.length === 2) {
			const otherId = parts.find((p) => p !== requestingUserId);
			if (otherId !== undefined) {
				const entry = userNameMap.get(otherId);
				const name = identityName(entry);
				if (name) {
					titleMap.set(row.id, name);
					continue;
				}
				titleMap.set(
					row.id,
					identityOwnerUserId(entry) === requestingUserId ? "Assistant" : "Unknown participant",
				);
				continue;
			}
		}

		// Rung 3: host-scoped (document). Task's own rung is gone — a
		// task's thread is team-hosted.
		if (row.hostKind === "document") {
			const title = kiMap.get(row.hostId);
			titleMap.set(row.id, title ?? "Deleted document");
			continue;
		}

		// Rung 4: group/feed — deterministic participant-name join.
		const resolvedNames = parts
			.map((p) => identityName(userNameMap.get(p)))
			.filter((n): n is string => n !== undefined)
			.sort();
		if (resolvedNames.length > 0) {
			const first2 = resolvedNames.slice(0, 2).join(", ");
			const extra = resolvedNames.length > 2 ? ` +${resolvedNames.length - 2}` : "";
			titleMap.set(row.id, `${first2}${extra}`);
			continue;
		}

		// Rung 5: last resort.
		titleMap.set(row.id, "Untitled conversation");
	}

	return titleMap;
}
