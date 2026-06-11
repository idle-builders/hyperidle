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
	bets,
	type Message as DbMessage,
	type Thread as DbThread,
	type HyperIdleDb,
	knowledgeItems,
	messages,
	sessions,
	tasks,
	threads,
	users,
} from "@hyperidle/db";
import type {
	AgentOperationalStatus,
	ApiErrorResponse,
	EventBus,
	HostKind,
	Message,
	MessageType,
	PlainPayload,
	RedactedPayload,
	Thread,
	ThreadCreatedEvent,
	ThreadMessageAppendedEvent,
	ThreadReopenedEvent,
	ThreadResolvedEvent,
} from "@hyperidle/shared";
import {
	API_ERROR_CODES,
	deriveTitle,
	extractMentionCandidates,
	headCollapsePredicate,
	resolveMentions,
} from "@hyperidle/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { ZodError, z } from "zod";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { escapeLikePattern } from "../services/like-escape.js";
import { createAssistantThreadRoute } from "./assistant.js";
import { createCoachRoutes } from "./coach.js";
import {
	createThreadBodySchema,
	type inlineRefSchema,
	listThreadsQuerySchema,
	messageInputSchema,
	messageRowSchema,
	threadParticipantsSchema,
} from "./threads-schema.js";

const SENDER_HEADER = "X-Identity";

/**
 * The inline-ref shape as carried by the message zod schema (the wire/persisted
 * form). Distinct from shared `InlineRef` while Z8-166 drift stands (mentionRef
 * `sourceText` optional here, required in the domain type). Used for the
 * internal mention-resolution mapping below.
 */
type MessageRef = z.infer<typeof inlineRefSchema>;

/**
 * Read the sender id. Prefers X-Identity header; falls back to the auth context
 * userId set by createAuthMiddleware(db).
 *
 * @lore M3 A7: DEFAULT_FOUNDER_ID constant deleted. The fallback is now the
 * auth context userId (resolved from users WHERE kind = 'human' LIMIT 1).
 */
function readSenderId(c: {
	req: { header: (k: string) => string | undefined };
	get: (k: "userId") => string;
}): string {
	// L1a: identity attribution. Tests pass `X-Identity` to disambiguate
	// the sender when an API key is shared across multiple senders. For
	// production, identity comes from the auth middleware via c.get("userId").
	return c.req.header(SENDER_HEADER) ?? c.get("userId");
}

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
			const [ag] = await db.select().from(users).where(eq(users.id, p)).limit(1);
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
 * AE5: Extended to include isAgent and operationalStatus for AI users.
 * operationalStatus is derived from the most recent session state:
 * - "active" when state === "active"
 * - "error" when the most recent session outcome === "crashed"
 * - "idle" otherwise (including no sessions)
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
): Promise<
	Record<
		string,
		{ name: string; role?: string; isAgent?: boolean; operationalStatus?: AgentOperationalStatus }
	>
> {
	if (senderIds.length === 0) return {};
	const rows = await db.select().from(users).where(inArray(users.id, senderIds));
	const result: Record<
		string,
		{ name: string; role?: string; isAgent?: boolean; operationalStatus?: AgentOperationalStatus }
	> = {};

	for (const row of rows) {
		const isAgent = row.kind === "ai";
		const entry: (typeof result)[string] = {
			name: row.name,
			...(row.role ? { role: row.role } : {}),
		};
		if (isAgent) {
			entry.isAgent = true;
			// Derive operationalStatus from most recent session
			const [latestSession] = await db
				.select({ state: sessions.state, outcome: sessions.outcome })
				.from(sessions)
				.where(eq(sessions.agentId, row.id))
				.orderBy(desc(sessions.startedAt))
				.limit(1);
			if (latestSession?.state === "active") {
				entry.operationalStatus = "active";
			} else if (latestSession?.outcome === "crashed") {
				entry.operationalStatus = "error";
			} else {
				entry.operationalStatus = "idle";
			}
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
	const participantRows = await db
		.select({ id: users.id, teamId: users.teamId })
		.from(users)
		.where(inArray(users.id, [...participantIds]));

	const teamIds = [
		...new Set(participantRows.map((r) => r.teamId).filter((id): id is string => id !== null)),
	];

	if (teamIds.length === 0) {
		// No team-scoped users — still resolve from direct participants.
		const allRows = await db
			.select({ id: users.id, name: users.name })
			.from(users)
			.where(inArray(users.id, [...participantIds]));
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
	const teamUserRows = await db
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(inArray(users.teamId, teamIds));

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
		case "bet": {
			const [row] = await db
				.select({ description: bets.description })
				.from(bets)
				.where(eq(bets.id, hostId))
				.limit(1);
			return row ? deriveTitle(row.description, hostId) : null;
		}
		case "task": {
			const [row] = await db
				.select({ title: tasks.title })
				.from(tasks)
				.where(eq(tasks.id, hostId))
				.limit(1);
			return row?.title ?? null;
		}
		case "knowledge_item": {
			const [row] = await db
				.select({ title: knowledgeItems.title })
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, hostId))
				.limit(1);
			return row?.title ?? null;
		}
		default:
			return null;
	}
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

export function createThreadRoutes(db: HyperIdleDb, eventBus: EventBus): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// --- GET /api/threads/assistant ----------------------------------------
	// @lore AD8b: mounted BEFORE /:id so "assistant" is not swallowed as a
	// thread id by the Hono wildcard handler.
	router.route("/assistant", createAssistantThreadRoute(db, eventBus));

	// --- GET /api/threads/coach --------------------------------------------
	// @lore L21: mounted BEFORE /:id so "coach" is not swallowed as a thread
	// id by the Hono wildcard handler. Hono matches routes in registration
	// order — the first match wins.
	router.route("/coach", createCoachRoutes(db, eventBus));

	// --- GET /api/threads ---------------------------------------------------
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
			rows = await db
				.select()
				.from(threads)
				.where(and(eq(threads.hostKind, q.host_kind), eq(threads.hostId, q.host_id)))
				.orderBy(desc(threads.lastActiveAt), desc(threads.id))
				.limit(q.limit);
		} else if (q.host_kind) {
			rows = await db
				.select()
				.from(threads)
				.where(eq(threads.hostKind, q.host_kind))
				.orderBy(desc(threads.lastActiveAt), desc(threads.id))
				.limit(q.limit);
		} else {
			// L1 step5 (W6): participant_id scope — pre-filter in SQL with LIKE probe,
			// then re-verify membership in JS.
			const participantId = q.participant_id ?? "";
			const probe = `%${escapeLikePattern(JSON.stringify(participantId))}%`;
			const rawRows = await db
				.select()
				.from(threads)
				.where(sql`${threads.participants} LIKE ${probe} ESCAPE '\\'`)
				.orderBy(desc(threads.lastActiveAt), desc(threads.id))
				.limit(q.limit);
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
			const unresolvedRows = await db
				.select({ threadId: messages.threadId })
				.from(messages)
				.where(
					and(
						inArray(messages.threadId, threadIds),
						inArray(messages.type, ["review", "questionnaire"]),
						sql`${messages.resolvedAt} IS NULL`,
					),
				);
			for (const r of unresolvedRows) {
				unresolvedThreadIds.add(r.threadId);
			}
		}

		return c.json({
			threads: rows.map((r) => ({
				...rowToThread(r),
				hasUnresolvedReview: unresolvedThreadIds.has(r.id),
			})),
			nextCursor: null,
		});
	});

	// --- GET /api/threads/:id -----------------------------------------------
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

		const [row] = await db.select().from(threads).where(eq(threads.id, id)).limit(1);
		if (!row) {
			const e = err(API_ERROR_CODES.NOT_FOUND, "Thread not found", 404);
			return c.json(e.body, e.status);
		}

		// Build message query — optionally filter by block_id column.
		const msgConditions = blockIdFilter
			? and(eq(messages.threadId, id), eq(messages.blockId, blockIdFilter))
			: eq(messages.threadId, id);

		const messageRows = await db
			.select()
			.from(messages)
			.where(msgConditions)
			.orderBy(desc(messages.createdAt), desc(messages.id));
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
		const senderId = await readInitialSenderId(
			c,
			db,
			input.participants,
			input.initialMessage.type,
		);

		const participants = input.participants.includes(senderId)
			? input.participants
			: [...input.participants, senderId];
		const sortedParticipants = [...participants].sort();

		const now = new Date().toISOString();
		const threadId = crypto.randomUUID();

		// Verdict cannot be the initial message.
		if (input.initialMessage.type === "verdict") {
			const e = err("validation_error", "Initial message cannot be verdict", 400);
			return c.json(e.body, e.status);
		}

		const messageId = crypto.randomUUID();

		// AE5: Resolve @mentions in the initial message before the transaction.
		let initEnrichedPayload = input.initialMessage.payload;
		let initParticipants = sortedParticipants;
		if (input.initialMessage.type === "plain") {
			const { refs: enrichedRefs, newParticipantIds } = await resolveMentionsForMessage(
				db,
				input.initialMessage.payload.text,
				input.initialMessage.payload.refs ?? [],
				participants,
				senderId,
			);
			if (enrichedRefs.length > 0 || newParticipantIds.length > 0) {
				initEnrichedPayload = {
					...input.initialMessage.payload,
					refs: enrichedRefs as typeof input.initialMessage.payload.refs,
				};
				// Add newly-mentioned participants (atomic with thread creation).
				const participantSet = new Set(sortedParticipants);
				for (const id of newParticipantIds) {
					participantSet.add(id);
				}
				initParticipants = [...participantSet].sort();
			}
		}

		try {
			// @lore PGlite: db.transaction() callback is async (returns Promise<void>).
			await db.transaction(async (tx) => {
				await tx.insert(threads).values({
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
				});
				// T5: dual-write blockId to the structured column (safe narrowing — no `as` cast).
				const initBlockId =
					input.initialMessage.type === "plain"
						? (input.initialMessage.payload.blockId ?? null)
						: null;
				await tx.insert(messages).values({
					id: messageId,
					senderId,
					threadId,
					type: input.initialMessage.type,
					// AE5: store enriched payload (with MentionRef entries in refs[]).
					payload: JSON.stringify(initEnrichedPayload),
					clientKey: input.initialMessage.clientKey,
					blockId: initBlockId,
					createdAt: now,
				});
			});
		} catch (cause) {
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
			messageType: input.initialMessage.type,
			senderId,
			timestamp: Date.now(),
		};
		eventBus.emit(appendedEvent);

		const [threadRow] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
		const [msgRow] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
		if (!(threadRow && msgRow)) {
			const e = err("internal_error", "Created thread missing", 500);
			return c.json(e.body, e.status);
		}
		return c.json(
			{
				thread: rowToThread(threadRow),
				messages: [rowToMessage(msgRow)],
			},
			201,
		);
	});

	// --- POST /api/threads/:id/messages -------------------------------------
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
			const senderId = readSenderId(c);

			const [threadRow] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
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

			// Authz: sender must be a participant.
			if (!participants.includes(senderId)) {
				const e = err("forbidden", "Sender is not a participant", 403);
				return c.json(e.body, e.status);
			}

			// Idempotency check before transaction.
			const [existing] = await db
				.select()
				.from(messages)
				.where(
					and(
						eq(messages.threadId, threadId),
						eq(messages.senderId, senderId),
						eq(messages.clientKey, input.clientKey),
					),
				)
				.limit(1);
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
				const [found] = await db
					.select()
					.from(messages)
					.where(eq(messages.id, input.payload.resolvesMessageId))
					.limit(1);
				resolvesMessageRow = found;
				if (!resolvesMessageRow || resolvesMessageRow.threadId !== threadId) {
					const e = err("validation_error", "resolvesMessageId not found in thread", 400);
					return c.json(e.body, e.status);
				}
				const [senderAgent] = await db.select().from(users).where(eq(users.id, senderId)).limit(1);
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
			}

			const wasResolved = threadRow.resolvedAt !== null;
			const willReopen = wasResolved && (input.type === "review" || input.type === "questionnaire");

			// L1 step9 (Adv-W4): first-verdict-wins via WHERE resolvedAt IS NULL.
			// @lore PGlite: transaction callback is async. .changes is SQLite-only —
			// replaced by .returning() + length check.
			class VerdictRaceConflict extends Error {}

			try {
				await db.transaction(async (tx) => {
					// T5: dual-write blockId to the structured column (safe narrowing — no `as` cast).
					const appendBlockId = input.type === "plain" ? (input.payload.blockId ?? null) : null;
					await tx.insert(messages).values({
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
						await tx
							.update(threads)
							.set({ participants: JSON.stringify(updatedParticipants) })
							.where(eq(threads.id, threadId));
					}

					if (input.type === "verdict" && resolvesMessageRow) {
						const updated = await tx
							.update(messages)
							.set({ resolvedAt: now })
							.where(
								and(eq(messages.id, resolvesMessageRow.id), sql`${messages.resolvedAt} IS NULL`),
							)
							.returning({ id: messages.id });
						if (updated.length === 0) {
							throw new VerdictRaceConflict();
						}
						await tx
							.update(threads)
							.set({ resolvedAt: now, lastActiveAt: now })
							.where(eq(threads.id, threadId));
					} else if (willReopen) {
						await tx
							.update(threads)
							.set({ resolvedAt: null, lastActiveAt: now })
							.where(eq(threads.id, threadId));
					} else {
						await tx.update(threads).set({ lastActiveAt: now }).where(eq(threads.id, threadId));
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

			const [updatedThread] = await db
				.select()
				.from(threads)
				.where(eq(threads.id, threadId))
				.limit(1);
			const [created] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
			if (!(updatedThread && created)) {
				const e = err("internal_error", "Created message missing", 500);
				return c.json(e.body, e.status);
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
