/**
 * L1a — Thread primitive REST router (plan §6.1).
 *
 * Endpoints:
 *  - GET  /api/threads                 list threads scoped to host or participant
 *  - GET  /api/threads/:id             thread + messages
 *  - POST /api/threads                 create thread + initial message atomically
 *  - POST /api/threads/:id/messages    append a message
 *
 * Per plan §6.1: verdict authorization, re-open semantics, idempotency on
 * (thread_id, sender_id, client_key), event emission to the bus.
 */

import {
	findMessage,
	findOrCreateDirectThread,
	findThread,
	insertMessage,
	insertThread,
	listMessages,
	listThreads,
	resolveMessageIfUnresolved,
	resolveThreadTurnRequest,
	updateThread,
} from "@hyperidle/thread";
import type { Message as DbMessage, Thread as DbThread, HyperIdleDb } from "@hyperidle/db";
import type {
	AgentWorkIntentRecorderFn,
	ApiErrorResponse,
	HostKind,
	Message,
	MessageType,
	PlainPayload,
	RedactedPayload,
	ReviewVerdictOutcome,
	ReviewVerdictRecorderFn,
	Thread,
} from "@hyperidle/domain-model";
import {
	API_ERROR_CODES,
	bakeAgentRunnableConfig,
	extractMentionCandidates,
	headCollapsePredicate,
	resolveMentions,
} from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type {
	EventBus,
	EventType,
	ThreadCreatedEvent,
	ThreadMessageAppendedEvent,
	ThreadReopenedEvent,
	ThreadResolvedEvent,
} from "@hyperidle/event-bus";
import {
	getAgentIdentity,
	get as getKnowledgeItem,
	list as listKnowledgeItems,
} from "@hyperidle/knowledge";
import { readServerConfig } from "@hyperidle/settings";
import * as work from "@hyperidle/task";
import { findUser, listUsers, requireRunnableAgent } from "@hyperidle/users";
import { Hono } from "hono";
import type { ZodError, z } from "zod";
import { authorizeRead, authorizeWrite } from "../auth/authorize.js";
import { createAssistantThreadRoute } from "./assistant.js";
import {
	createThreadBodySchema,
	directThreadBodySchema,
	type inlineRefSchema,
	listThreadsQuerySchema,
	messageInputSchema,
	messageRowSchema,
	threadParticipantsSchema,
	updateThreadBodySchema,
} from "./threads-schema.js";

const SENDER_HEADER = "X-Identity";

/**
 * AU21 §6 Decision L4 / §9 Increment 14d — the minimal shape this route needs
 * to push data onto the WS connection hub. Satisfied by
 * `WsConnectionHub.broadcast(topic, data)` (`../ws-connection-hub.js`) without
 * this module depending on that package's full class — same narrow-interface
 * pattern as `session-activity-gateway.ts`'s `SessionActivityBroadcastTarget`.
 */
interface WsPushTarget {
	broadcast(topic: string, data: string): void;
}

/**
 * Push the CHANGED RECORD (never an invalidate ping) onto a WS topic. The
 * founder's re-derivation: "there is no refetch … core submits the changed
 * version … zero ways back." `hub` is optional — tests that build routes
 * without a WS hub simply skip the push; the underlying EventBus emission
 * (unchanged) still fires for every other subscriber.
 */
function pushUpdate(
	hub: WsPushTarget | undefined,
	topic: string,
	kind: EventType,
	data: unknown,
): void {
	hub?.broadcast(topic, JSON.stringify({ type: "update", topic, kind, data }));
}

/**
 * Assemble the `ThreadListRow` shape `GET /api/threads` returns, for the
 * "conversations" topic push on `thread_created`. Reuses the SAME
 * `rowToThread` + `resolveThreadTitles` machinery the list route uses so the
 * pushed row and a fresh GET produce byte-identical field composition.
 *
 * @lore AU21 §6 Decision L4: `resolveThreadTitles` resolves a DM/assistant
 * title RELATIVE TO `requestingUserId` (Rung 1/2 of its ladder) — correct for
 * the creating sender, but a broadcast on the global "conversations" topic
 * reaches every participant, not just the creator. A non-creator DM
 * participant may see a momentarily wrong title (their own name reflected
 * back) until their next full `GET /api/threads` reconciles it (page
 * mount/reconnect, per the accepted "initial load reconciles via a normal
 * fetch" seam). Flagged, not silently decided: the majority case (group/
 * host-scoped threads, Rung 3/4 of the ladder) is viewer-independent and
 * unaffected.
 */
async function buildThreadListRowForPush(
	db: HyperIdleDb,
	row: DbThread,
	requestingUserId: string,
): Promise<Record<string, unknown>> {
	const thread = rowToThread(row);
	const titleMap = await resolveThreadTitles(db, [row], requestingUserId);
	// @lore BA2: this used to be hardcoded `false`. The sidebar's blocking badge
	// and the list's "behind" chip are both derived from it, so a pushed row said
	// "nothing is waiting" however many reviews were — and an agent asking a human
	// for agreement showed up nowhere at all until the app was restarted. Computed
	// the same way the list route computes it.
	const unresolved = await listMessages(db, {
		threadIds: [row.id],
		types: ["review", "questionnaire"],
		unresolved: true,
	});
	return {
		...thread,
		hasUnresolvedReview: unresolved.length > 0,
		title: titleMap.get(row.id) ?? "Untitled conversation",
	};
}

/**
 * The identities delta a `thread_message_appended` push carries alongside
 * the new `Message` — the newly-seen sender's identity entry, so a client
 * that has never seen this sender before can render their name/role without
 * a follow-up fetch.
 */
async function buildSenderIdentityForPush(
	db: HyperIdleDb,
	senderId: string,
): Promise<Record<string, unknown> | undefined> {
	const identities = await buildThreadIdentities(db, [senderId]);
	return identities[senderId];
}

/**
 * The inline-ref shape as carried by the message zod schema (the wire/persisted
 * form). Distinct from the domain model's `InlineRef` while Z8-166 drift stands (mentionRef
 * `sourceText` optional here, required in the domain type). Used for the
 * internal mention-resolution mapping below.
 */
type MessageRef = z.infer<typeof inlineRefSchema>;

// @lore AF11-IDOR: readSenderId removed. POST /api/threads/:id/messages now
// derives senderId from c.get("userId") (the authenticated Principal). The
// removed function was header-preferred and enabled authz bypass.

/**
 * Initial-message sender for `POST /api/threads`. Convention: review and
 * questionnaire messages are posted BY the agent FOR a founder to verdict;
 * if no `X-Identity` is supplied, default to the first non-founder
 * participant. Plain messages keep the standard founder default (auth context userId).
 *
 * @lore M3 A7 C3: threads.ts previously used DEFAULT_FOUNDER_ID here too.
 * Both readSenderId and readInitialSenderId now use c.get("userId") as the
 * fallback, resolved from users WHERE kind = 'human' LIMIT 1 by the auth middleware.
 *
 * @lore PGlite: readInitialSenderId is now async because it must await the
 * db.select() lookup for review/questionnaire sender selection.
 */
async function readInitialSenderId(
	c: { req: { header: (k: string) => string | undefined }; get: (k: "userId") => string },
	db: HyperIdleDb,
	participants: ReadonlyArray<string>,
	messageType: MessageType,
): Promise<string> {
	const explicit = c.req.header(SENDER_HEADER);
	if (explicit) return explicit;
	if (messageType === "review" || messageType === "questionnaire") {
		for (const p of participants) {
			const ag = await findUser(db, { id: p });
			// @lore P2: "founder" is intentionally NOT in USER_ROLES (the role column is
			// unconstrained text). This check selects the first non-founder participant as
			// the sender for review/questionnaire messages. If you rename or remove the
			// "founder" role, update this check and the verdict authorization at line ~494.
			if (ag && ag.role !== "founder") return p;
		}
	}
	return c.get("userId");
}

/**
 * Build an identities map for the unique senders in a thread's messages.
 * Queries the users table for all supplied senderIds in one round-trip.
 * Returns an empty object when senderIds is empty.
 *
 * AE5: Extended to include isAgent for AI users.
 *
 * @lore AU26 J1: `operationalStatus` is DELETED. It was derived from a raw
 * `sessions` read — one query per AI participant per thread open, an N+1 — and
 * had ZERO production readers (`Conversations.tsx:71-91`,
 * `HostThreadSection.tsx:112-124` and `ReviewPage.tsx:74` all read
 * `name`/`role`/`isAgent` only; `useThreadDetail.ts` merely passed it through).
 * Agent-run state is `agent-orchestration`'s; the UI reads it from that Layer
 * directly where it genuinely renders it.
 *
 * @lore R4: All senders — human and AI — live in the users table, distinguished
 * by the `kind` column. We do NOT hard-code agent identities here; a single
 * inArray query covers every sender type uniformly.
 *
 * @lore PGlite: async because PGLite queries are always async (no sync API).
 */
async function buildThreadIdentities(
	db: HyperIdleDb,
	senderIds: string[],
): Promise<Record<string, { name: string; role?: string; isAgent?: boolean }>> {
	if (senderIds.length === 0) return {};
	const rows = await listUsers(db, { ids: senderIds });
	const result: Record<string, { name: string; role?: string; isAgent?: boolean }> = {};

	for (const row of rows) {
		const entry: (typeof result)[string] = {
			name: row.name,
			...(row.role ? { role: row.role } : {}),
		};
		if (row.kind === "ai") {
			entry.isAgent = true;
		}
		result[row.id] = entry;
	}
	return result;
}

/**
 * Build a case-insensitive name→identity map for mention resolution.
 * Includes all users where teamId IN (teamIds of the given participant list).
 *
 * @lore AE5: Resolution scope is deliberately team-wide so users can @mention
 * agents not yet in the thread. Factory-wide resolution would work too but
 * team-scoped is more predictable (arch plan §2.1).
 *
 * @lore AE5 (WARNING from arch-critique): this pattern is thread-detail-only.
 * Do NOT use in list endpoints — it would become N+1 queries per thread row.
 */
async function buildMentionLookup(
	db: HyperIdleDb,
	participantIds: ReadonlyArray<string>,
): Promise<ReadonlyMap<string, { identityId: string; displayName: string }>> {
	if (participantIds.length === 0) return new Map();

	// Find the teamIds for all participants.
	const participantRows = await listUsers(db, { ids: [...participantIds] });

	const teamIds = [
		...new Set(participantRows.map((r) => r.teamId).filter((id): id is string => id !== null)),
	];

	if (teamIds.length === 0) {
		// No team-scoped users — still resolve from direct participants.
		const allRows = await listUsers(db, { ids: [...participantIds] });
		const map = new Map<string, { identityId: string; displayName: string }>();
		// Sort by id for deterministic first-match when names conflict.
		const sorted = allRows.slice().sort((a, b) => a.id.localeCompare(b.id));
		for (const row of sorted) {
			const key = row.name.toLowerCase();
			if (!map.has(key)) {
				map.set(key, { identityId: row.id, displayName: row.name });
			}
		}
		return map;
	}

	// Query all users in the same team(s).
	const teamUserRows = await listUsers(db, { teamIds });

	const map = new Map<string, { identityId: string; displayName: string }>();
	// Sort by id for deterministic first-match when names conflict.
	const sorted = teamUserRows.slice().sort((a, b) => a.id.localeCompare(b.id));
	for (const row of sorted) {
		const key = row.name.toLowerCase();
		if (!map.has(key)) {
			map.set(key, { identityId: row.id, displayName: row.name });
		}
	}
	return map;
}

/**
 * Resolve @mention candidates from a plain message's text.
 * Returns a tuple of (enriched refs array, new participant ids to add).
 *
 * @lore AE5 (concept hard rules):
 * - Rule #2: Participant addition is atomic with message write.
 * - Rule #3: Self-mention is a no-op for participant-addition (but MentionRef still renders).
 * - Rule #4: Unknown @name stays as plain text.
 */
async function resolveMentionsForMessage(
	db: HyperIdleDb,
	text: string,
	existingRefs: ReadonlyArray<MessageRef>,
	participantIds: ReadonlyArray<string>,
	senderId: string,
): Promise<{
	refs: MessageRef[];
	newParticipantIds: string[];
}> {
	const candidates = extractMentionCandidates(text);
	if (candidates.length === 0) {
		return { refs: [...existingRefs], newParticipantIds: [] };
	}

	const nameMap = await buildMentionLookup(db, participantIds);
	const resolved = resolveMentions(candidates, nameMap, senderId);

	if (resolved.length === 0) {
		return { refs: [...existingRefs], newParticipantIds: [] };
	}

	const mentionRefs = resolved.map((r) => ({
		kind: "mention" as const,
		identityId: r.identityId,
		displayName: r.displayName,
		sourceText: r.sourceText,
	}));

	// New participants = resolved mentions that are not already in the thread and not the sender.
	const participantSet = new Set(participantIds);
	const newParticipantIds = resolved
		.filter((r) => r.identityId !== senderId && !participantSet.has(r.identityId))
		.map((r) => r.identityId);

	return {
		refs: [...existingRefs, ...mentionRefs],
		newParticipantIds,
	};
}

/**
 * Resolve host title for a thread's host entity.
 * Returns the entity's human-readable title, or null when unresolvable.
 *
 * @lore AE5: This per-kind switch is thread-detail-only (one query per thread open).
 * Do NOT copy this pattern into list endpoints — it becomes N+1. See arch-critique WARNING.
 */
async function resolveHostTitle(
	db: HyperIdleDb,
	hostKind: string,
	hostId: string,
): Promise<string | null> {
	switch (hostKind) {
		case "task": {
			const row = await work.get(db, "task", hostId);
			return row?.title ?? null;
		}
		case "knowledge_item": {
			const row = await getKnowledgeItem(db, hostId);
			return row?.title ?? null;
		}
		default:
			return null;
	}
}

/**
 * AF14 AC6: Compute the direct-thread dedup key for a 2-participant thread.
 * Format: `${hostKind}:${hostId}:${sortedParticipants.join(",")}` (stable sort).
 * Only call for DM threads (2 participants, host=user|agent, not assistant thread).
 */
function directKeyFor(
	hostKind: string,
	hostId: string,
	sortedParticipants: readonly string[],
): string {
	return `${hostKind}:${hostId}:${[...sortedParticipants].sort().join(",")}`;
}

/**
 * AF14 R3: Guard that returns true when the thread is the assistant thread.
 * The assistant thread is created via /api/threads/assistant (not POST /api/threads),
 * but as a safety backstop: hostKind=user, hostId===senderId, one participant is ast-<hostId>.
 */
function isAssistantThread(
	hostKind: string,
	hostId: string,
	sortedParticipants: readonly string[],
): boolean {
	if (hostKind !== "user") return false;
	return sortedParticipants.some((p) => p === `ast-${hostId}`);
}

/**
 * AF14 AC1: Batched thread title resolver.
 *
 * Resolves a human-readable title for each thread row — exactly ONE query per
 * host-kind bucket (no N+1). Title ladder (first match wins):
 *   1. Assistant thread → "Assistant"
 *   2. DM (2-participant, user/agent host) → other participant's name
 *      (fall-through: ast-* → "Assistant", other-agent → "Agent", deleted human → "Unknown participant")
 *   3. Host-scoped (bet/task/knowledge_item) → entity title
 *      (fall-through: deleted host → "Deleted <kind>")
 *   4. Group/feed → deterministic participant-name join ("Aria, Maverick +N")
 *      (fall-through: empty join → rung 5)
 *   5. Last resort → "Untitled conversation"
 *
 * Never returns a bare uuid or undefined for any row (W1 guarantee).
 *
 * @lore AF14: resolveHostTitle (per-row N+1) must NOT be called in list endpoints.
 * This batched resolver replaces it for GET /api/threads.
 */
async function resolveThreadTitles(
	db: HyperIdleDb,
	rows: DbThread[],
	requestingUserId: string,
): Promise<Map<string, string>> {
	const titleMap = new Map<string, string>();
	if (rows.length === 0) return titleMap;

	// ── collect IDs for batched lookups ──────────────────────────────────────
	const taskIds: string[] = [];
	const kiIds: string[] = [];
	const allParticipantIds = new Set<string>();

	for (const row of rows) {
		const parts = (() => {
			try {
				return threadParticipantsSchema.parse(JSON.parse(row.participants)) as string[];
			} catch {
				return [] as string[];
			}
		})();

		// Collect all participant ids for the users lookup
		for (const p of parts) allParticipantIds.add(p);

		switch (row.hostKind) {
			case "task":
				taskIds.push(row.hostId);
				break;
			case "knowledge_item":
				kiIds.push(row.hostId);
				break;
			default:
				break;
		}
	}

	// ── batched queries ───────────────────────────────────────────────────────
	const [taskRows, kiRows, userRows] = await Promise.all([
		work.list(db, "task", { ids: taskIds }),
		kiIds.length > 0
			? listKnowledgeItems(db, { titlesByIds: kiIds })
			: Promise.resolve([] as ReadonlyArray<{ id: string; title: string }>),
		allParticipantIds.size > 0
			? listUsers(db, { ids: [...allParticipantIds] })
			: Promise.resolve([] as Array<{ id: string; name: string }>),
	]);

	const taskMap = new Map(taskRows.map((r) => [r.id, r.title]));
	const kiMap = new Map(kiRows.map((r) => [r.id, r.title]));
	const userNameMap = new Map(userRows.map((r) => [r.id, r.name]));

	// ── resolve per row ───────────────────────────────────────────────────────
	for (const row of rows) {
		const parts: string[] = (() => {
			try {
				return threadParticipantsSchema.parse(JSON.parse(row.participants)) as string[];
			} catch {
				return [];
			}
		})();

		// Rung 1: assistant thread
		if (
			row.hostKind === "user" &&
			row.hostId === requestingUserId &&
			parts.some((p) => p === `ast-${requestingUserId}`)
		) {
			titleMap.set(row.id, "Assistant");
			continue;
		}

		// Rung 2: DM (2 participants, user or agent host)
		if ((row.hostKind === "user" || row.hostKind === "agent") && parts.length === 2) {
			const otherId = parts.find((p) => p !== requestingUserId);
			if (otherId !== undefined) {
				const name = userNameMap.get(otherId);
				if (name) {
					titleMap.set(row.id, name);
					continue;
				}
				// Fall-through W1: no name row
				if (otherId.startsWith("ast-")) {
					titleMap.set(row.id, "Assistant");
				} else {
					// Heuristic: check if it looks like an agent id or has no users row
					titleMap.set(row.id, "Unknown participant");
				}
				continue;
			}
		}

		// Rung 3: host-scoped (task, knowledge_item)
		// @lore BB1: the `bet` branch is deleted. It collected host ids into a
		// second array and issued a SECOND `work.list(db, "task", …)` that could
		// only ever return nothing, because migration 0068 flipped every
		// bet-hosted thread to host_kind "task". One host kind, one query.
		if (row.hostKind === "task") {
			const title = taskMap.get(row.hostId);
			if (title !== undefined) {
				titleMap.set(row.id, title);
			} else {
				titleMap.set(row.id, "Deleted task");
			}
			continue;
		}
		if (row.hostKind === "knowledge_item") {
			const title = kiMap.get(row.hostId);
			if (title !== undefined) {
				titleMap.set(row.id, title);
			} else {
				titleMap.set(row.id, "Deleted knowledge item");
			}
			continue;
		}

		// Rung 4: group/feed — deterministic participant-name join
		const resolvedNames = parts
			.map((p) => userNameMap.get(p))
			.filter((n): n is string => n !== undefined)
			.sort(); // deterministic: alphabetical name sort (stable across reloads)
		if (resolvedNames.length > 0) {
			const first2 = resolvedNames.slice(0, 2).join(", ");
			const extra = resolvedNames.length > 2 ? ` +${resolvedNames.length - 2}` : "";
			titleMap.set(row.id, `${first2}${extra}`);
			continue;
		}

		// Rung 5: last resort
		titleMap.set(row.id, "Untitled conversation");
	}

	return titleMap;
}

/**
 * @lore L1 step5 (SL-C2): the DB→Message boundary parses the row's JSON
 * `payload` and `participants` columns through Zod. A malformed row (e.g.
 * legacy data, manual edit) fails loudly here instead of crashing somewhere
 * downstream.
 */
function rowToThread(row: DbThread): Thread {
	const participants = threadParticipantsSchema.parse(JSON.parse(row.participants));
	return {
		id: row.id,
		hostKind: row.hostKind as HostKind,
		hostId: row.hostId,
		initiatorId: row.initiatorId,
		participants,
		pinned: row.pinned === true,
		resolvedAt: row.resolvedAt,
		lastActiveAt: row.lastActiveAt,
		createdAt: row.createdAt,
	};
}

function rowToMessage(row: DbMessage): Message {
	const parsed = messageRowSchema.parse({
		type: row.type as MessageType,
		payload: JSON.parse(row.payload),
	});
	const base = {
		id: row.id,
		threadId: row.threadId,
		senderId: row.senderId,
		clientKey: row.clientKey,
		deletedAt: row.deletedAt,
		redactedAt: row.redactedAt,
		resolvedAt: row.resolvedAt,
		createdAt: row.createdAt,
	} as const;
	// @lore AF4/§4d + Z8-166: plain-branch persisted payload drifts from the
	// shared `PlainPayload` type (schema-only `blockId`; optional mentionRef
	// `sourceText`). Routed to the conversations WP (Batch 6). `parsed.payload`
	// is Zod-validated, server-persisted read-back data surfaced into the domain
	// type at this INTERNAL DB-row→domain mapping (NOT a request boundary). No
	// behavior change.
	switch (parsed.type) {
		case "plain":
			return {
				...base,
				type: "plain",
				payload: parsed.payload as PlainPayload | RedactedPayload,
			};
		case "review":
			return { ...base, type: "review", payload: parsed.payload };
		case "questionnaire":
			return { ...base, type: "questionnaire", payload: parsed.payload };
		case "verdict":
			return { ...base, type: "verdict", payload: parsed.payload };
	}
}

/**
 * @lore AU21 §9 Increment 2: `notice` is accepted structurally on the WRITE
 * side now (`plainPayloadSchema`'s own `@lore`) so `dispatch`'s assistant-turn
 * `insertMessage` writes (routed through this SAME door via the `CoreApiPort`
 * seam) can carry their failure-notice metadata through. Strips a non-
 * assistant sender's `notice` before persistence — closing the same
 * client-spoofed-notice vector the field's former WRITE-side omission closed
 * (AH3 H2) — so only a genuine `ast-*` actor (a real authenticated identity,
 * never a client-supplied field) can make one land.
 */
function sanitizeNoticeForSender<T>(senderId: string, payload: T): T {
	if (senderId.startsWith("ast-")) return payload;
	if (typeof payload !== "object" || payload === null || !("notice" in payload)) return payload;
	const { notice: _notice, ...rest } = payload as Record<string, unknown>;
	return rest as T;
}

function err(
	code: string,
	error: string,
	status: 400 | 403 | 404 | 409 | 500,
): {
	body: ApiErrorResponse;
	status: 400 | 403 | 404 | 409 | 500;
} {
	return { body: { error, code }, status };
}

/**
 * @lore AU19 §11 (AC-9): `agentWorkIntentRecorder` is the Application-injected
 * cross-Layer port (`@hyperidle/work-intent-port`, Mechanism C) — this route (core-api)
 * must not import `@hyperidle/session-requests` (agent-orchestration)
 * directly for its raw `agent_work_intents` write below. `app.ts` defaults it
 * to the seam-backed recorder built over `AgentOrchestrationPort`
 * (`buildSeamBackedWorkIntentRecorder`, AU31 §3.1 site 5 — see the record
 * call's own `@lore` below for why it now runs post-commit, not inside this
 * route's `db.transaction()`); tests may override.
 */
export function createThreadRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentWorkIntentRecorder: AgentWorkIntentRecorderFn,
	/**
	 * @lore BA2: the verdict half of the review loop. Injected for the same reason
	 * `agentWorkIntentRecorder` is — `review_sessions` belongs to the
	 * agent-orchestration layer and this route may not read it.
	 */
	reviewVerdictRecorder: ReviewVerdictRecorderFn,
	wsHub?: WsPushTarget,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// --- GET /api/threads/assistant ----------------------------------------
	// @lore AD8b: mounted BEFORE /:id so "assistant" is not swallowed as a
	// thread id by the Hono wildcard handler.
	router.route("/assistant", createAssistantThreadRoute(db, eventBus));

	// --- POST /api/threads/direct ---------------------------------------------
	// AU21 §9 Increment 2: DM find-or-create composite — the
	// `CoreApiConversationPort.findOrCreateDirectThread` seam door. The sender
	// is always the calling actor, never a body field.
	// @lore mounted BEFORE /:id so "direct" is not swallowed as a thread id.
	router.post("/direct", async (c) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			const e = err("validation_error", "Invalid JSON", 400);
			return c.json(e.body, e.status);
		}
		const parsed = directThreadBodySchema.safeParse(body);
		if (!parsed.success) {
			const e = err("validation_error", "Validation error", 400);
			return c.json(e.body, e.status);
		}
		const senderId = c.get("userId");
		const now = new Date().toISOString();
		const threadId = await findOrCreateDirectThread(db, senderId, parsed.data.recipientId, now);
		return c.json({ id: threadId }, 200);
	});

	// --- PATCH /api/threads/:id -------------------------------------------------
	// AU21 §9 Increment 2: narrow thread-patch door — the
	// `CoreApiConversationPort.updateThread` seam door. Accepts only the
	// fields real call sites set today (participants/lastActiveAt/pinned) —
	// not a general thread-patch surface.
	router.patch("/:id", async (c) => {
		const id = c.req.param("id");
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			const e = err("validation_error", "Invalid JSON", 400);
			return c.json(e.body, e.status);
		}
		const parsed = updateThreadBodySchema.safeParse(body);
		if (!parsed.success) {
			const e = err("validation_error", "Validation error", 400);
			return c.json(e.body, e.status);
		}
		const existing = await findThread(db, { id });
		if (!existing) {
			const e = err(API_ERROR_CODES.NOT_FOUND, "Thread not found", 404);
			return c.json(e.body, e.status);
		}
		const input = parsed.data;
		const patch: Partial<{ participants: string; lastActiveAt: string; pinned: boolean }> = {};
		if (input.participants !== undefined) patch.participants = JSON.stringify(input.participants);
		if (input.lastActiveAt !== undefined) patch.lastActiveAt = input.lastActiveAt;
		if (input.pinned !== undefined) patch.pinned = input.pinned;
		await updateThread(db, id, patch);
		return c.json({ id }, 200);
	});

	// --- GET /api/threads ---------------------------------------------------
	// Row 2: GET /api/threads — S (principal-self: AD1 guard scopes list by principal)
	router.get("/", async (c) => {
		const parsed = listThreadsQuerySchema.safeParse({
			host_kind: c.req.query("host_kind"),
			host_id: c.req.query("host_id"),
			participant_id: c.req.query("participant_id"),
			cursor: c.req.query("cursor"),
			limit: c.req.query("limit"),
		});
		if (!parsed.success) {
			const e = err("validation_error", "Invalid query params", 400);
			return c.json(e.body, e.status);
		}
		const q = parsed.data;
		if (!(q.host_kind || q.participant_id)) {
			const e = err("validation_error", "Missing scope (host_kind or participant_id)", 400);
			return c.json(e.body, e.status);
		}

		// @lore AD1: IDOR fix. When participant_id is provided, validate it matches
		// the authenticated user. A valid API key must not allow reading another
		// user's thread list. host_kind queries are unaffected (they scope by host,
		// not by participant identity). Only applied when participant_id is present
		// so single-founder local-mode setups (where auth userId === only human) work.
		if (q.participant_id !== undefined && q.participant_id !== c.get("userId")) {
			const e = err(API_ERROR_CODES.FORBIDDEN, "participant_id must match authenticated user", 403);
			return c.json(e.body, e.status);
		}

		let rows: DbThread[];
		if (q.host_kind && q.host_id) {
			rows = await listThreads(db, {
				host: { kind: q.host_kind, id: q.host_id },
				order: "lastActive",
				limit: q.limit,
			});
		} else if (q.host_kind) {
			rows = await listThreads(db, { hostKind: q.host_kind, order: "lastActive", limit: q.limit });
		} else {
			// L1 step5 (W6): participant_id scope — pre-filter in SQL with LIKE probe,
			// then re-verify membership in JS.
			const participantId = q.participant_id ?? "";
			const probe = `%${JSON.stringify(participantId).replace(/[\\%_]/g, "\\$&")}%`;
			const rawRows = await listThreads(db, {
				participantProbe: probe,
				order: "lastActive",
				limit: q.limit,
			});
			rows = rawRows.filter((row) => {
				try {
					const parts = threadParticipantsSchema.parse(JSON.parse(row.participants));
					return parts.includes(participantId);
				} catch {
					return false;
				}
			});
		}

		// L8 §3.1: extend list response with `hasUnresolvedReview` per row.
		const threadIds = rows.map((r) => r.id);
		const unresolvedThreadIds = new Set<string>();
		if (threadIds.length > 0) {
			const unresolvedMsgs = await listMessages(db, {
				threadIds,
				types: ["review", "questionnaire"],
				unresolved: true,
			});
			const unresolvedRows = [...new Set(unresolvedMsgs.map((m) => m.threadId))];
			for (const threadId of unresolvedRows) {
				unresolvedThreadIds.add(threadId);
			}
		}

		// AF14 AC1: batched title resolver — no N+1.
		const titleMap = await resolveThreadTitles(db, rows, c.get("userId"));

		return c.json({
			threads: rows.map((r) => ({
				...rowToThread(r),
				hasUnresolvedReview: unresolvedThreadIds.has(r.id),
				title: titleMap.get(r.id) ?? "Untitled conversation",
			})),
			nextCursor: null,
		});
	});

	// --- GET /api/threads/:id -----------------------------------------------
	// Row 1: GET /api/threads/:id — D (enforced: authorizeRead called after loading thread)
	router.get("/:id", async (c) => {
		const id = c.req.param("id");

		// T5: optional block_id filter. Reject empty strings and oversized values (AC-5 security).
		// BlockIds are Blake2s hashes (~64 chars); cap at 128 to reject clearly-bogus input.
		const rawBlockId = c.req.query("block_id");
		if (rawBlockId !== undefined && rawBlockId === "") {
			const e = err("validation_error", "block_id must not be empty", 400);
			return c.json(e.body, e.status);
		}
		if (rawBlockId !== undefined && rawBlockId.length > 128) {
			const e = err("validation_error", "block_id must not exceed 128 characters", 400);
			return c.json(e.body, e.status);
		}
		const blockIdFilter = rawBlockId ?? null;

		const row = await findThread(db, { id });
		if (!row) {
			const e = err(API_ERROR_CODES.NOT_FOUND, "Thread not found", 404);
			return c.json(e.body, e.status);
		}

		// AF11 Hole 1: read-parity authorization. participant-scope threads (user/agent host)
		// require principal ∈ participants. host-scope threads (bet/task/knowledge/etc.)
		// return true for any authenticated principal (Hard Rule 5 — no over-restriction).
		// The predicate is strictly stronger than the AD1 list guard: we verify actual
		// membership in the loaded participants array, not just a query-param match.
		{
			const participants = (() => {
				try {
					return JSON.parse(row.participants) as string[];
				} catch {
					return [];
				}
			})();
			const deny = authorizeRead(c, {
				hostKind: row.hostKind as import("@hyperidle/domain-model").HostKind,
				hostId: row.hostId,
				participants,
			});
			if (deny) return deny;
		}

		// Message query — optionally filter by block_id column (owned by the store).
		const messageRows = await listMessages(db, {
			threadId: id,
			blockId: blockIdFilter ?? undefined,
			order: "createdAt",
			dir: "desc",
			tiebreakId: true,
		});
		const msgsDesc = messageRows.map(rowToMessage);
		// headCollapsePredicate operates on ASC-sorted messages (concept §4.5.5).
		const msgsAsc = [...msgsDesc].reverse();
		const head = headCollapsePredicate(msgsAsc);
		const uniqueSenderIds = [...new Set(messageRows.map((m) => m.senderId))];
		const identities = await buildThreadIdentities(db, uniqueSenderIds);
		// AE5: resolve host title for context link
		const hostTitle = await resolveHostTitle(db, row.hostKind, row.hostId);
		return c.json({
			thread: rowToThread(row),
			messages: msgsDesc,
			headMessageId: head.headMessageId,
			nextMessagesCursor: null,
			identities,
			hostTitle,
		});
	});

	// --- POST /api/threads --------------------------------------------------
	// Row 3: POST /api/threads — S (principal-self: sender is set to principal)
	router.post("/", async (c) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			const e = err("validation_error", "Invalid JSON", 400);
			return c.json(e.body, e.status);
		}
		const parsed = createThreadBodySchema.safeParse(body);
		if (!parsed.success) {
			return c.json(zodErrorToBody(parsed.error), 400);
		}
		const input = parsed.data;

		// @lore AU44 batch 4: bare thread creation — POST /threads/scaffold folded
		// into POST /threads/. When initialMessage is absent, create the thread
		// and return { id } without inserting a message.
		if (!input.initialMessage) {
			const initiatorId = c.get("userId");
			const now = new Date().toISOString();
			const threadId = crypto.randomUUID();
			await insertThread(db, {
				id: threadId,
				hostKind: input.hostKind,
				hostId: input.hostId,
				initiatorId,
				participants: JSON.stringify([...input.participants].sort()),
				pinned: input.pinned ?? false,
				lastActiveAt: now,
				createdAt: now,
			});
			const createdEvent: ThreadCreatedEvent = {
				type: "thread_created",
				streamId: threadId,
				threadId,
				hostKind: input.hostKind,
				hostId: input.hostId,
				initiatorId,
				timestamp: Date.now(),
			};
			eventBus.emit(createdEvent);
			const scaffoldedRow = await findThread(db, { id: threadId });
			if (scaffoldedRow) {
				pushUpdate(
					wsHub,
					"conversations",
					"thread_created",
					await buildThreadListRowForPush(db, scaffoldedRow, initiatorId),
				);
			}
			return c.json({ id: threadId }, 201);
		}

		// Extract to local to preserve narrowing across async closures below.
		const initialMessage = input.initialMessage;

		const senderId = await readInitialSenderId(c, db, input.participants, initialMessage.type);

		const participants = input.participants.includes(senderId)
			? input.participants
			: [...input.participants, senderId];
		const sortedParticipants = [...participants].sort();

		// Verdict cannot be the initial message.
		if (initialMessage.type === "verdict") {
			const e = err("validation_error", "Initial message cannot be verdict", 400);
			return c.json(e.body, e.status);
		}

		// AF14 AC6: DM dedup — resolve-or-append for direct (2-participant) threads.
		// A direct thread is: hostKind ∈ {user, agent}, exactly 2 participants,
		// and NOT the assistant thread (R3 guard: hostId === senderId + ast-<hostId> participant).
		const isDirect =
			(input.hostKind === "user" || input.hostKind === "agent") &&
			sortedParticipants.length === 2 &&
			!isAssistantThread(input.hostKind, input.hostId, sortedParticipants);

		const dmDirectKey = isDirect
			? directKeyFor(input.hostKind, input.hostId, sortedParticipants)
			: null;

		if (dmDirectKey) {
			// Happy path: existing thread lookup (read-before-insert — the DB index backstops the race).
			const existing = await findThread(db, { directKey: dmDirectKey });

			if (existing) {
				// Option B: append the initial message to the existing thread + bump lastActiveAt.
				const nowReuse = new Date().toISOString();
				const reuseMessageId = crypto.randomUUID();

				// Resolve @mentions for the initial message before appending.
				let reusePayload = initialMessage.payload;
				const reuseParticipants = (() => {
					try {
						return threadParticipantsSchema.parse(JSON.parse(existing.participants)) as string[];
					} catch {
						return sortedParticipants;
					}
				})();

				if (initialMessage.type === "plain") {
					const { refs: enrichedRefs } = await resolveMentionsForMessage(
						db,
						initialMessage.payload.text,
						initialMessage.payload.refs ?? [],
						reuseParticipants,
						senderId,
					);
					if (enrichedRefs.length > 0) {
						reusePayload = {
							...initialMessage.payload,
							refs: enrichedRefs as typeof initialMessage.payload.refs,
						};
					}
					reusePayload = sanitizeNoticeForSender(senderId, reusePayload);
				}

				const reuseBlockId =
					initialMessage.type === "plain" ? (initialMessage.payload.blockId ?? null) : null;

				try {
					await db.transaction(async (tx) => {
						await insertMessage(tx as HyperIdleDb, {
							id: reuseMessageId,
							senderId,
							threadId: existing.id,
							type: initialMessage.type,
							payload: JSON.stringify(reusePayload),
							clientKey: initialMessage.clientKey,
							blockId: reuseBlockId,
							createdAt: nowReuse,
						});
						await updateThread(tx as HyperIdleDb, existing.id, { lastActiveAt: nowReuse });
					});
				} catch (cause) {
					return c.json(
						{
							error: "Failed to append to existing thread",
							code: "internal_error",
							detail: String(cause),
						},
						500,
					);
				}

				// Emit events for the reused thread
				const appendedEvent: ThreadMessageAppendedEvent = {
					type: "thread_message_appended",
					streamId: existing.id,
					threadId: existing.id,
					messageId: reuseMessageId,
					messageType: initialMessage.type,
					senderId,
					timestamp: Date.now(),
				};
				eventBus.emit(appendedEvent);

				const reusedThread = await findThread(db, { id: existing.id });
				if (!reusedThread) {
					const e = err("internal_error", "Reused thread missing", 500);
					return c.json(e.body, e.status);
				}
				const reuseMsgRow = await findMessage(db, { id: reuseMessageId });
				if (reuseMsgRow) {
					pushUpdate(wsHub, `thread:${existing.id}`, "thread_message_appended", {
						message: rowToMessage(reuseMsgRow),
						senderIdentity: await buildSenderIdentityForPush(db, senderId),
					});
				}
				return c.json({ thread: rowToThread(reusedThread) }, 200);
			}
		}

		const now = new Date().toISOString();
		const threadId = crypto.randomUUID();

		const messageId = crypto.randomUUID();

		// AE5: Resolve @mentions in the initial message before the transaction.
		let initEnrichedPayload = initialMessage.payload;
		let initParticipants = sortedParticipants;
		if (initialMessage.type === "plain") {
			const { refs: enrichedRefs, newParticipantIds } = await resolveMentionsForMessage(
				db,
				initialMessage.payload.text,
				initialMessage.payload.refs ?? [],
				participants,
				senderId,
			);
			if (enrichedRefs.length > 0 || newParticipantIds.length > 0) {
				initEnrichedPayload = {
					...initialMessage.payload,
					refs: enrichedRefs as typeof initialMessage.payload.refs,
				};
				// Add newly-mentioned participants (atomic with thread creation).
				const participantSet = new Set(sortedParticipants);
				for (const id of newParticipantIds) {
					participantSet.add(id);
				}
				initParticipants = [...participantSet].sort();
			}
			initEnrichedPayload = sanitizeNoticeForSender(senderId, initEnrichedPayload);
		}

		try {
			// @lore PGlite: db.transaction() callback is async (returns Promise<void>).
			await db.transaction(async (tx) => {
				await insertThread(tx as HyperIdleDb, {
					id: threadId,
					hostKind: input.hostKind,
					hostId: input.hostId,
					initiatorId: senderId,
					// AE5: participants may be extended by @mention resolution.
					participants: JSON.stringify(initParticipants),
					// @lore PGlite: pinned is native boolean in Postgres.
					pinned: input.pinned ?? false,
					lastActiveAt: now,
					createdAt: now,
					// AF14 AC6: write directKey for DM threads (null for others).
					directKey: dmDirectKey,
				});
				// T5: dual-write blockId to the structured column (safe narrowing — no `as` cast).
				const initBlockId =
					initialMessage.type === "plain" ? (initialMessage.payload.blockId ?? null) : null;
				await insertMessage(tx as HyperIdleDb, {
					id: messageId,
					senderId,
					threadId,
					type: initialMessage.type,
					// AE5: store enriched payload (with MentionRef entries in refs[]).
					payload: JSON.stringify(initEnrichedPayload),
					clientKey: initialMessage.clientKey,
					blockId: initBlockId,
					createdAt: now,
				});
			});
		} catch (cause) {
			// AF14 C2: Unique constraint violation on threads_direct_key_uq means a
			// concurrent writer won the race. Re-select the winner and append the initial
			// message to it (Option B — preserves user intent).
			// @lore drizzle-orm 0.45.2: wraps PGlite errors — outer message is "Failed query: …",
			// original error (with constraint name) is in cause.cause. Walk the chain.
			const constraintMsgInChain = (e: unknown): string => {
				if (!(e instanceof Error)) return "";
				if (e.message.toLowerCase().includes("threads_direct_key_uq")) return e.message;
				if (e.cause !== undefined) return constraintMsgInChain(e.cause);
				return e.message;
			};
			if (
				dmDirectKey &&
				cause instanceof Error &&
				constraintMsgInChain(cause).toLowerCase().includes("threads_direct_key_uq")
			) {
				const winner = await findThread(db, { directKey: dmDirectKey });
				if (winner) {
					const nowRace = new Date().toISOString();
					const raceMsgId = crypto.randomUUID();
					const raceBlockId =
						initialMessage.type === "plain" ? (initialMessage.payload.blockId ?? null) : null;
					try {
						await db.transaction(async (tx) => {
							await insertMessage(tx as HyperIdleDb, {
								id: raceMsgId,
								senderId,
								threadId: winner.id,
								type: initialMessage.type,
								payload: JSON.stringify(initEnrichedPayload),
								clientKey: initialMessage.clientKey,
								blockId: raceBlockId,
								createdAt: nowRace,
							});
							await updateThread(tx as HyperIdleDb, winner.id, { lastActiveAt: nowRace });
						});
					} catch {
						// Best-effort — if append fails, still return the winner thread (idempotent)
					}
					const appendedRaceEvent: ThreadMessageAppendedEvent = {
						type: "thread_message_appended",
						streamId: winner.id,
						threadId: winner.id,
						messageId: raceMsgId,
						messageType: initialMessage.type,
						senderId,
						timestamp: Date.now(),
					};
					eventBus.emit(appendedRaceEvent);
					const raceMsgRow = await findMessage(db, { id: raceMsgId });
					if (raceMsgRow) {
						pushUpdate(wsHub, `thread:${winner.id}`, "thread_message_appended", {
							message: rowToMessage(raceMsgRow),
							senderIdentity: await buildSenderIdentityForPush(db, senderId),
						});
					}
					const reloadedWinner = await findThread(db, { id: winner.id });
					if (!reloadedWinner) {
						const e = err("internal_error", "Race winner thread missing", 500);
						return c.json(e.body, e.status);
					}
					return c.json({ thread: rowToThread(reloadedWinner) }, 200);
				}
			}
			return c.json(
				{ error: "Failed to create thread", code: "internal_error", detail: String(cause) },
				500,
			);
		}

		const createdEvent: ThreadCreatedEvent = {
			type: "thread_created",
			streamId: threadId,
			threadId,
			hostKind: input.hostKind,
			hostId: input.hostId,
			initiatorId: senderId,
			timestamp: Date.now(),
		};
		eventBus.emit(createdEvent);
		const appendedEvent: ThreadMessageAppendedEvent = {
			type: "thread_message_appended",
			streamId: threadId,
			threadId,
			messageId,
			messageType: initialMessage.type,
			senderId,
			timestamp: Date.now(),
		};
		eventBus.emit(appendedEvent);

		const threadRow = await findThread(db, { id: threadId });
		const msgRow = await findMessage(db, { id: messageId });
		if (!(threadRow && msgRow)) {
			const e = err("internal_error", "Created thread missing", 500);
			return c.json(e.body, e.status);
		}
		// AU21 §6 Decision L4 / §9 Increment 14d: push the assembled
		// ThreadListRow + the new Message — the real changed records, not an
		// invalidate ping — at the same write that has them in hand.
		pushUpdate(
			wsHub,
			"conversations",
			"thread_created",
			await buildThreadListRowForPush(db, threadRow, senderId),
		);
		pushUpdate(wsHub, `thread:${threadId}`, "thread_message_appended", {
			message: rowToMessage(msgRow),
			senderIdentity: await buildSenderIdentityForPush(db, senderId),
		});
		return c.json(
			{
				thread: rowToThread(threadRow),
				messages: [rowToMessage(msgRow)],
			},
			201,
		);
	});

	// --- POST /api/threads/:id/messages -------------------------------------
	// Row 4: POST /api/threads/:id/messages — D (enforced: participant guard via authorizeWrite)
	// @lore AF11: eslint-disable removed — guard now compares against c.get("userId")
	// (the authenticated Principal), satisfying the authz/no-raw-db-in-route-bypassing-policy
	// rule. Previous code used readSenderId (header-preferred) which allowed a non-participant
	// attacker to forge the senderId and bypass the authz check.
	router.post(
		"/:id/messages",
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: canonical L1a contract — idempotency, verdict authz, re-open semantics, and event emission must live in one transactional path.
		async (c) => {
			const threadId = c.req.param("id");
			let body: unknown;
			try {
				body = await c.req.json();
			} catch {
				const e = err("validation_error", "Invalid JSON", 400);
				return c.json(e.body, e.status);
			}
			const parsed = messageInputSchema.safeParse(body);
			if (!parsed.success) {
				return c.json(zodErrorToBody(parsed.error), 400);
			}
			const input = parsed.data;
			// @lore AF11-IDOR: senderId for authorization AND attribution MUST come
			// from the authenticated Principal (c.get("userId")), never from X-Identity
			// header. Using a client-supplied id lets a non-participant forge writes
			// into any thread by spoofing the senderId header.
			const senderId = c.get("userId");

			const threadRow = await findThread(db, { id: threadId });
			if (!threadRow) {
				const e = err(API_ERROR_CODES.NOT_FOUND, "Thread not found", 404);
				return c.json(e.body, e.status);
			}
			// L1 step9 (Adv-W2): Zod-parse the participants JSON so a malformed row
			// fails loudly here instead of silently accepting an authz bypass.
			let participants: ReadonlyArray<string>;
			try {
				participants = threadParticipantsSchema.parse(JSON.parse(threadRow.participants));
			} catch {
				const e = err("internal_error", "Thread participants column is malformed", 500);
				return c.json(e.body, e.status);
			}

			// Authz: sender (authenticated principal) must be a participant.
			// authorizeWrite uses c.get("userId") internally — matches senderId above.
			const writedenial = authorizeWrite(c, {
				hostKind: threadRow.hostKind as import("@hyperidle/domain-model").HostKind,
				hostId: threadRow.hostId,
				participants,
			});
			if (writedenial) return writedenial;

			// Idempotency check before transaction.
			const existing = await findMessage(db, { threadId, senderId, clientKey: input.clientKey });
			if (existing) {
				// L1 step9 (Adv-C3): divergent payload on replay => 409.
				const sameType = existing.type === input.type;
				const samePayload = existing.payload === JSON.stringify(input.payload);
				if (!(sameType && samePayload)) {
					const e = err(
						"idempotency_conflict",
						"clientKey already used with a different payload",
						409,
					);
					return c.json(e.body, e.status);
				}
				return c.json(
					{
						message: rowToMessage(existing),
						thread: rowToThread(threadRow),
					},
					200,
				);
			}

			// Verdict authorization (plan §6.1 REVISED for adversary C4).
			let resolvesMessageRow: DbMessage | undefined;
			if (input.type === "verdict") {
				resolvesMessageRow = await findMessage(db, { id: input.payload.resolvesMessageId });
				if (!resolvesMessageRow || resolvesMessageRow.threadId !== threadId) {
					const e = err("validation_error", "resolvesMessageId not found in thread", 400);
					return c.json(e.body, e.status);
				}
				const senderAgent = await findUser(db, { id: senderId });
				// @lore P2: "founder" role is NOT in USER_ROLES (unconstrained text).
				const isFounder = senderAgent?.role === "founder";
				const selfVerdict = resolvesMessageRow.senderId === senderId;
				if (!isFounder || selfVerdict) {
					return c.json({ error: "Forbidden", code: "verdict_authorization" }, 403);
				}
			}

			const now = new Date().toISOString();
			const messageId = crypto.randomUUID();

			// AE5: Resolve @mention candidates before the transaction.
			// The enriched payload (with MentionRef entries) and the newParticipantIds
			// are computed here so they can be used inside the atomic transaction.
			let enrichedPayload = input.payload;
			let newParticipantIds: string[] = [];
			if (input.type === "plain") {
				const { refs: enrichedRefs, newParticipantIds: mentionedIds } =
					await resolveMentionsForMessage(
						db,
						input.payload.text,
						input.payload.refs ?? [],
						participants,
						senderId,
					);
				if (mentionedIds.length > 0 || enrichedRefs.length > 0) {
					enrichedPayload = { ...input.payload, refs: enrichedRefs as typeof input.payload.refs };
					newParticipantIds = mentionedIds;
				}
				enrichedPayload = sanitizeNoticeForSender(senderId, enrichedPayload);
			}

			const wasResolved = threadRow.resolvedAt !== null;
			const willReopen = wasResolved && (input.type === "review" || input.type === "questionnaire");
			const recordsAssistantIntent =
				input.type === "plain" &&
				!senderId.startsWith("ast-") &&
				isAssistantThread(threadRow.hostKind, threadRow.hostId, participants);

			// L1 step9 (Adv-W4): first-verdict-wins via WHERE resolvedAt IS NULL.
			// @lore PGlite: transaction callback is async. .changes is SQLite-only —
			// replaced by .returning() + length check.
			class VerdictRaceConflict extends Error {}

			try {
				await db.transaction(async (tx) => {
					// T5: dual-write blockId to the structured column (safe narrowing — no `as` cast).
					const appendBlockId = input.type === "plain" ? (input.payload.blockId ?? null) : null;
					await insertMessage(tx as HyperIdleDb, {
						id: messageId,
						senderId,
						threadId,
						type: input.type,
						// AE5: store enriched payload (with MentionRef entries in refs[]).
						payload: JSON.stringify(enrichedPayload),
						clientKey: input.clientKey,
						blockId: appendBlockId,
						createdAt: now,
					});

					// AE5: Atomically add new participants from @mentions.
					// Concept hard rule #2: participant addition is atomic with message write.
					if (newParticipantIds.length > 0) {
						const currentParticipants = JSON.parse(threadRow.participants) as string[];
						const participantSet = new Set(currentParticipants);
						for (const id of newParticipantIds) {
							participantSet.add(id);
						}
						const updatedParticipants = [...participantSet].sort();
						await updateThread(tx as HyperIdleDb, threadId, {
							participants: JSON.stringify(updatedParticipants),
						});
					}

					if (input.type === "verdict" && resolvesMessageRow) {
						const updated = await resolveMessageIfUnresolved(
							tx as HyperIdleDb,
							resolvesMessageRow.id,
							now,
						);
						if (updated.length === 0) {
							throw new VerdictRaceConflict();
						}
						await updateThread(tx as HyperIdleDb, threadId, { resolvedAt: now, lastActiveAt: now });
					} else if (willReopen) {
						await updateThread(tx as HyperIdleDb, threadId, {
							resolvedAt: null,
							lastActiveAt: now,
						});
					} else {
						await updateThread(tx as HyperIdleDb, threadId, { lastActiveAt: now });
					}
				});
			} catch (cause) {
				if (cause instanceof VerdictRaceConflict) {
					const e = err("verdict_race", "Review was resolved by a concurrent verdict", 409);
					return c.json(e.body, e.status);
				}
				return c.json(
					{ error: "Failed to append message", code: "internal_error", detail: String(cause) },
					500,
				);
			}

			// AU31 §3.1 site 5 — the `assistant_turn` intent submit runs AFTER the
			// message-insert transaction commits, not inside it. Cross-layer
			// atomicity with agent-orchestration is relinquished (founder ruling,
			// architecture.md §3.1/§13 item 9): a seam call from inside this route's
			// own open `db.transaction()` reproduced a real deadlock (§3.2), so the
			// two can no longer share one transaction. On a failed submit here, the
			// message is committed with no turn intent; this handler throws (no
			// try/catch — same as `knowledge.ts`'s site 4), the caller sees a 5xx,
			// the user re-sends, and the coherence trigger
			// (`assistant-turn-coherence-trigger.ts`) re-bakes on the next thread
			// append anyway. [D4] A re-send inserts a second *visible* message
			// unless the client reuses its `clientKey` — the dedupe path above
			// handles that, so the worst observable outcome is one duplicated
			// message, never a lost one.
			if (recordsAssistantIntent) {
				// AU21 §6 Decision B: resolve + validate the assistant run (this
				// Service's own domain state, plus the shared ast-<userId>
				// runnability invariant) and bake the full request onto the intent —
				// the drain dispatches it directly, with zero domain reads. The
				// message is already committed, so a plain (non-tx) read sees it.
				// BC3: `resolveAssistantTurnRequest` (`@hyperidle/conversation`) is
				// `resolveThreadTurnRequest` (`@hyperidle/thread`) now, taking the
				// target agent explicitly — this route's own `ast-<senderId>`
				// convention is passed in rather than derived inside the resolver.
				const assistantAgentId = `ast-${senderId}`;
				const bakedRequest = await resolveThreadTurnRequest(db, messageId, assistantAgentId, {
					requireRunnableAgent,
					getAgentIdentity,
					readServerConfig,
				});
				await agentWorkIntentRecorder({
					kind: "thread_turn",
					sourceKind: "thread_message",
					sourceId: `${messageId}:${assistantAgentId}`,
					requestedBy: senderId,
					idempotencyKey: `thread-turn:${messageId}:${assistantAgentId}`,
					bakedRequest,
				});
			}

			const appendedEvent: ThreadMessageAppendedEvent = {
				type: "thread_message_appended",
				streamId: threadId,
				threadId,
				messageId,
				messageType: input.type,
				senderId,
				timestamp: Date.now(),
			};
			eventBus.emit(appendedEvent);

			// @lore AU9: the assistant turn is no longer fired from this route — a
			// human plain message on the assistant thread instead records an
			// agent_work_intents row above (recordsAssistantIntent, post-commit —
			// AU31 §3.1 site 5), and the agent layer's intent drain
			// resolves/creates/executes the request. This route has no
			// assistant-execution dependency at all.

			// @lore BA2: if this verdict decided the review an agent filed, the
			// agent that asked has to be brought back to its own session with the
			// answer. Post-commit, like the intent recording above and for the same
			// reason — the message is committed, so the resume can never reference
			// a review that does not exist.
			let verdictOutcome: ReviewVerdictOutcome | undefined;
			if (input.type === "verdict" && resolvesMessageRow) {
				try {
					// The agent that asked is the review's own sender. Its runnable
					// config is core state, so it is baked here and carried across —
					// admission treats a missing bake as a deactivated agent.
					const askingAgent = await findUser(db, { id: resolvesMessageRow.senderId });
					const persona = askingAgent ? await getAgentIdentity(db, askingAgent.id) : null;
					verdictOutcome = await reviewVerdictRecorder({
						...(askingAgent ? { agentConfig: bakeAgentRunnableConfig(askingAgent, persona) } : {}),
						reviewMessageId: resolvesMessageRow.id,
						// Two of the five verdict decisions clear the action; the other
						// three send the agent back with a no. "approve-with-comments" is
						// still an approval — the comments are for the agent to read, not
						// a reason to withhold what the human said yes to.
						decision:
							input.payload.decision === "approve" ||
							input.payload.decision === "approve-with-comments"
								? "approve"
								: "decline",
						decidedBy: senderId,
						threadId,
					});
				} catch (gateErr) {
					verdictOutcome = {
						status: "not_resumable",
						reason: gateErr instanceof Error ? gateErr.message : "unknown error",
					};
				}
			}

			// The approving human is told when the agent cannot be sent back. An
			// approval that reaches nobody is exactly the silent failure this work
			// package exists to remove, so it is reported in the thread they are in.
			if (verdictOutcome?.status === "not_resumable") {
				await insertMessage(db, {
					id: crypto.randomUUID(),
					threadId,
					senderId,
					type: "plain",
					payload: JSON.stringify({
						text: `This action was approved but could not be carried out: ${verdictOutcome.reason}. The agent has not been told, and the action has not run.`,
					}),
					clientKey: crypto.randomUUID(),
					createdAt: new Date().toISOString(),
				});
			}

			if (input.type === "verdict" && resolvesMessageRow) {
				const resolvedEvent: ThreadResolvedEvent = {
					type: "thread_resolved",
					streamId: threadId,
					threadId,
					resolvedByMessageId: messageId,
					timestamp: Date.now(),
				};
				eventBus.emit(resolvedEvent);
			}
			if (willReopen) {
				const reopenedEvent: ThreadReopenedEvent = {
					type: "thread_reopened",
					streamId: threadId,
					threadId,
					reopenedByMessageId: messageId,
					timestamp: Date.now(),
				};
				eventBus.emit(reopenedEvent);
			}

			const updatedThread = await findThread(db, { id: threadId });
			const created = await findMessage(db, { id: messageId });
			if (!(updatedThread && created)) {
				const e = err("internal_error", "Created message missing", 500);
				return c.json(e.body, e.status);
			}
			// AU21 §6 Decision L4 / §9 Increment 14d: push the actual changed
			// records — the new Message, and the changed thread-status fields on
			// resolve/reopen — never an invalidate ping.
			pushUpdate(wsHub, `thread:${threadId}`, "thread_message_appended", {
				message: rowToMessage(created),
				senderIdentity: await buildSenderIdentityForPush(db, senderId),
			});
			// @lore BA2: the same append also changes the thread's row in every
			// participant's LIST — its position, its time, and whether it is now
			// waiting on someone. Only the `thread:<id>` topic was pushed, which
			// nobody is subscribed to unless they already have that thread open, so
			// a review filed while a human sat in the app appeared nowhere until the
			// app was restarted.
			pushUpdate(
				wsHub,
				"conversations",
				"thread_message_appended",
				await buildThreadListRowForPush(db, updatedThread, senderId),
			);
			if (input.type === "verdict" && resolvesMessageRow) {
				pushUpdate(wsHub, `thread:${threadId}`, "thread_resolved", {
					resolvedAt: updatedThread.resolvedAt,
				});
			}
			if (willReopen) {
				pushUpdate(wsHub, `thread:${threadId}`, "thread_reopened", {
					resolvedAt: updatedThread.resolvedAt,
				});
			}
			return c.json(
				{
					message: rowToMessage(created),
					thread: rowToThread(updatedThread),
				},
				201,
			);
		},
	);

	return router;
}

function zodErrorToBody(error: ZodError): ApiErrorResponse {
	const issue = error.issues[0];
	if (issue?.path.includes("clientKey")) {
		return { error: "Invalid client key", code: "invalid_client_key" };
	}
	return { error: "Validation error", code: "validation_error" };
}
