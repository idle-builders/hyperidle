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
	agents,
	type Message as DbMessage,
	type Thread as DbThread,
	type HyperIdleDb,
	messages,
	threads,
} from "@hyperidle/db";
import type {
	ApiErrorResponse,
	EventBus,
	HostKind,
	Message,
	MessageType,
	Thread,
	ThreadCreatedEvent,
	ThreadMessageAppendedEvent,
	ThreadReopenedEvent,
	ThreadResolvedEvent,
} from "@hyperidle/shared";
import { API_ERROR_CODES, headCollapsePredicate } from "@hyperidle/shared";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { ZodError } from "zod";
import {
	createThreadBodySchema,
	listThreadsQuerySchema,
	messageInputSchema,
} from "./threads-schema.js";

const SENDER_HEADER = "X-Identity";
const DEFAULT_FOUNDER_ID = "u-founder";

function readSenderId(c: { req: { header: (k: string) => string | undefined } }): string {
	// L1a: identity attribution. Tests pass `X-Identity` to disambiguate
	// the sender when an API key is shared across multiple senders. For
	// production, identity comes from the auth middleware (out of scope
	// for L1a — the API-key holder is the implicit sender otherwise).
	return c.req.header(SENDER_HEADER) ?? DEFAULT_FOUNDER_ID;
}

/**
 * Initial-message sender for `POST /api/threads`. Convention: review and
 * questionnaire messages are posted BY the agent FOR a founder to verdict;
 * if no `X-Identity` is supplied, default to the first non-founder
 * participant. Plain messages keep the standard founder default.
 */
function readInitialSenderId(
	c: { req: { header: (k: string) => string | undefined } },
	db: HyperIdleDb,
	participants: ReadonlyArray<string>,
	messageType: MessageType,
): string {
	const explicit = c.req.header(SENDER_HEADER);
	if (explicit) return explicit;
	if (messageType === "review" || messageType === "questionnaire") {
		for (const p of participants) {
			const ag = db.select().from(agents).where(eq(agents.id, p)).get();
			if (ag && ag.role !== "founder") return p;
		}
	}
	return DEFAULT_FOUNDER_ID;
}

function rowToThread(row: DbThread): Thread {
	return {
		id: row.id as Thread["id"],
		hostKind: row.hostKind as HostKind,
		hostId: row.hostId,
		initiatorId: row.initiatorId as Thread["initiatorId"],
		participants: JSON.parse(row.participants) as ReadonlyArray<Thread["initiatorId"]>,
		pinned: row.pinned === 1,
		resolvedAt: row.resolvedAt,
		lastActiveAt: row.lastActiveAt,
		createdAt: row.createdAt,
	};
}

function rowToMessage(row: DbMessage): Message {
	return {
		id: row.id as Message["id"],
		threadId: row.threadId as Message["threadId"],
		senderId: row.senderId as Message["senderId"],
		clientKey: row.clientKey,
		deletedAt: row.deletedAt,
		redactedAt: row.redactedAt,
		resolvedAt: row.resolvedAt,
		createdAt: row.createdAt,
		type: row.type as MessageType,
		payload: JSON.parse(row.payload) as Message["payload"],
	} as Message;
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

export function createThreadRoutes(db: HyperIdleDb, eventBus: EventBus): Hono {
	const router = new Hono();

	// --- GET /api/threads ---------------------------------------------------
	router.get("/", (c) => {
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

		let rows: DbThread[];
		if (q.host_kind && q.host_id) {
			rows = db
				.select()
				.from(threads)
				.where(and(eq(threads.hostKind, q.host_kind), eq(threads.hostId, q.host_id)))
				.orderBy(desc(threads.lastActiveAt), desc(threads.id))
				.limit(q.limit)
				.all();
		} else if (q.host_kind) {
			rows = db
				.select()
				.from(threads)
				.where(eq(threads.hostKind, q.host_kind))
				.orderBy(desc(threads.lastActiveAt), desc(threads.id))
				.limit(q.limit)
				.all();
		} else {
			// participant_id scope: linear scan over participants JSON.
			rows = db
				.select()
				.from(threads)
				.orderBy(desc(threads.lastActiveAt), desc(threads.id))
				.all()
				.filter((row) => {
					try {
						const parts = JSON.parse(row.participants) as string[];
						return q.participant_id ? parts.includes(q.participant_id) : false;
					} catch {
						return false;
					}
				})
				.slice(0, q.limit);
		}

		return c.json({
			threads: rows.map(rowToThread),
			nextCursor: null,
		});
	});

	// --- GET /api/threads/:id -----------------------------------------------
	router.get("/:id", (c) => {
		const id = c.req.param("id");
		const row = db.select().from(threads).where(eq(threads.id, id)).get();
		if (!row) {
			const e = err(API_ERROR_CODES.NOT_FOUND, "Thread not found", 404);
			return c.json(e.body, e.status);
		}
		// Plan §6.1: "the first page is the most-recent N; subsequent pages
		// walk backward". Most-recent first.
		const messageRows = db
			.select()
			.from(messages)
			.where(eq(messages.threadId, id))
			.orderBy(desc(messages.createdAt), desc(messages.id))
			.all();
		const msgsDesc = messageRows.map(rowToMessage);
		// headCollapsePredicate operates on ASC-sorted messages (concept §4.5.5).
		const msgsAsc = [...msgsDesc].reverse();
		const head = headCollapsePredicate(msgsAsc);
		return c.json({
			thread: rowToThread(row),
			messages: msgsDesc,
			headMessageId: head.headMessageId,
			nextMessagesCursor: null,
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
		const senderId = readInitialSenderId(c, db, input.participants, input.initialMessage.type);

		// Ensure sender is one of the participants (server-authoritative).
		const participants = input.participants.includes(senderId)
			? input.participants
			: [...input.participants, senderId];
		const sortedParticipants = [...participants].sort();

		const now = new Date().toISOString();
		const threadId = crypto.randomUUID();

		// Verdict cannot be the initial message — there's no review to resolve.
		if (input.initialMessage.type === "verdict") {
			const e = err("validation_error", "Initial message cannot be verdict", 400);
			return c.json(e.body, e.status);
		}

		const messageId = crypto.randomUUID();

		try {
			db.transaction((tx) => {
				tx.insert(threads)
					.values({
						id: threadId,
						hostKind: input.hostKind,
						hostId: input.hostId,
						initiatorId: senderId,
						participants: JSON.stringify(sortedParticipants),
						pinned: input.pinned ? 1 : 0,
						lastActiveAt: now,
						createdAt: now,
					})
					.run();
				tx.insert(messages)
					.values({
						id: messageId,
						senderId,
						threadId,
						type: input.initialMessage.type,
						payload: JSON.stringify(input.initialMessage.payload),
						clientKey: input.initialMessage.clientKey,
						createdAt: now,
					})
					.run();
			});
		} catch (cause) {
			return c.json(
				{ error: "Failed to create thread", code: "internal_error", detail: String(cause) },
				500,
			);
		}

		// Emit events.
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

		const threadRow = db.select().from(threads).where(eq(threads.id, threadId)).get();
		const msgRow = db.select().from(messages).where(eq(messages.id, messageId)).get();
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

			const threadRow = db.select().from(threads).where(eq(threads.id, threadId)).get();
			if (!threadRow) {
				const e = err(API_ERROR_CODES.NOT_FOUND, "Thread not found", 404);
				return c.json(e.body, e.status);
			}
			const participants = JSON.parse(threadRow.participants) as string[];

			// Authz: sender must be a participant.
			if (!participants.includes(senderId)) {
				const e = err("forbidden", "Sender is not a participant", 403);
				return c.json(e.body, e.status);
			}

			// Idempotency check before transaction.
			const existing = db
				.select()
				.from(messages)
				.where(
					and(
						eq(messages.threadId, threadId),
						eq(messages.senderId, senderId),
						eq(messages.clientKey, input.clientKey),
					),
				)
				.get();
			if (existing) {
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
				resolvesMessageRow = db
					.select()
					.from(messages)
					.where(eq(messages.id, input.payload.resolvesMessageId))
					.get();
				if (!resolvesMessageRow || resolvesMessageRow.threadId !== threadId) {
					const e = err("validation_error", "resolvesMessageId not found in thread", 400);
					return c.json(e.body, e.status);
				}
				const senderAgent = db.select().from(agents).where(eq(agents.id, senderId)).get();
				const isFounder = senderAgent?.role === "founder";
				const selfVerdict = resolvesMessageRow.senderId === senderId;
				if (!isFounder || selfVerdict) {
					return c.json({ error: "Forbidden", code: "verdict_authorization" }, 403);
				}
			}

			const now = new Date().toISOString();
			const messageId = crypto.randomUUID();

			// Re-open semantics (plan §6.1 REVISED for adversary C5).
			const wasResolved = threadRow.resolvedAt !== null;
			const willReopen = wasResolved && (input.type === "review" || input.type === "questionnaire");

			try {
				db.transaction((tx) => {
					tx.insert(messages)
						.values({
							id: messageId,
							senderId,
							threadId,
							type: input.type,
							payload: JSON.stringify(input.payload),
							clientKey: input.clientKey,
							createdAt: now,
						})
						.run();

					if (input.type === "verdict" && resolvesMessageRow) {
						tx.update(messages)
							.set({ resolvedAt: now })
							.where(eq(messages.id, resolvesMessageRow.id))
							.run();
						tx.update(threads)
							.set({ resolvedAt: now, lastActiveAt: now })
							.where(eq(threads.id, threadId))
							.run();
					} else if (willReopen) {
						tx.update(threads)
							.set({ resolvedAt: null, lastActiveAt: now })
							.where(eq(threads.id, threadId))
							.run();
					} else {
						tx.update(threads).set({ lastActiveAt: now }).where(eq(threads.id, threadId)).run();
					}
				});
			} catch (cause) {
				return c.json(
					{ error: "Failed to append message", code: "internal_error", detail: String(cause) },
					500,
				);
			}

			// Emit events.
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

			const updatedThread = db.select().from(threads).where(eq(threads.id, threadId)).get();
			const created = db.select().from(messages).where(eq(messages.id, messageId)).get();
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
