/**
 * Batched thread title resolver — moved from `routes/threads.ts`'s
 * `resolveThreadTitles` (AF14 AC1), one query per host-kind bucket, never
 * N+1. BC3 architecture.md §3.1/§3.8: gains rung 0 (the stored
 * `threads.title`), loses the host-`task` rung (a task's thread is
 * `team`-hosted now, and nothing computes a team-conversation title from a
 * task any more).
 *
 * Ladder, first match wins:
 *   0. stored `threads.title`
 *   1. assistant thread → "Assistant"
 *   2. DM (2-participant, user/agent host) → other participant's name
 *   3. host-scoped (`knowledge_item`) → entity title
 *   4. group/feed → deterministic participant-name join
 *   5. last resort → "Untitled conversation"
 *
 * Never returns a bare uuid or undefined for any row.
 */

import type { Thread as DbThread, HyperIdleDb } from "@hyperidle/db";
import { threadParticipantsSchema } from "@hyperidle/domain-model";

/**
 * A participant's identity as seen by the ladder. Ownership (`ownerUserId`,
 * the `users.ownerUserId` column) is optional so existing `listUserNames`
 * implementations that only return a bare name keep typechecking — the map
 * value type is covariant in `ReadonlyMap`, so a `Map<string, string>` still
 * satisfies this. Callers that want rung 1/2's ownership check to see real
 * ownership must return the richer shape instead of a bare string.
 */
export interface ParticipantIdentity {
	readonly name: string;
	readonly ownerUserId?: string | null;
}

export interface TitleLadderDeps {
	readonly listUserNames: (
		db: HyperIdleDb,
		ids: readonly string[],
	) => Promise<ReadonlyMap<string, string | ParticipantIdentity>>;
	readonly getKnowledgeItemTitle: (db: HyperIdleDb, id: string) => Promise<string | null>;
}

function identityName(entry: string | ParticipantIdentity | undefined): string | undefined {
	if (entry === undefined) return undefined;
	return typeof entry === "string" ? entry : entry.name;
}

function identityOwnerUserId(
	entry: string | ParticipantIdentity | undefined,
): string | null | undefined {
	if (entry === undefined || typeof entry === "string") return undefined;
	return entry.ownerUserId;
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
		if (row.hostKind === "knowledge_item") kiIds.push(row.hostId);
	}

	const [kiTitles, userNameMap] = await Promise.all([
		Promise.all(kiIds.map(async (id) => [id, await deps.getKnowledgeItemTitle(db, id)] as const)),
		allParticipantIds.size > 0
			? deps.listUserNames(db, [...allParticipantIds])
			: Promise.resolve(new Map<string, string>()),
	]);
	const kiMap = new Map(kiTitles);

	for (const row of rows) {
		// Rung 0: the stored title wins over everything computed.
		if (row.title !== null && row.title.trim().length > 0) {
			titleMap.set(row.id, row.title);
			continue;
		}

		const parts = parseParticipants(row.participants);

		// Rung 1: assistant thread — a participant owned by the requesting
		// user (`users.ownerUserId`), never inferred from the id's shape.
		if (
			row.hostKind === "user" &&
			row.hostId === requestingUserId &&
			parts.some((p) => identityOwnerUserId(userNameMap.get(p)) === requestingUserId)
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

		// Rung 3: host-scoped (knowledge_item). Task's own rung is gone — a
		// task's thread is team-hosted (architecture.md §3.7/§3.9).
		if (row.hostKind === "knowledge_item") {
			const title = kiMap.get(row.hostId);
			titleMap.set(row.id, title ?? "Deleted knowledge item");
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
