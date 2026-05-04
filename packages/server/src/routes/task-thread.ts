/**
 * L15 — Task→thread router. Two endpoints:
 *  - POST /api/tasks/:taskId/thread/messages   authorize + lazy materialize + append
 *  - GET  /api/tasks/:taskId/thread            participant-gated read (404 if no thread)
 *
 * @lore L15 plan §5.1 + CONFUSION-A: separate router from `/api/tasks` so
 * the cross-cutting concern (task→thread) is in one file, easy to delete
 * when L18 generalizes lazy-materialization across all hosts.
 *
 * @lore L15 security review (F1/F2/F3/F4):
 *  - F1: GET is non-mutating; only POST materializes. Participants come from
 *    the task's owning team (services/task-thread.ts), not from the caller.
 *  - F2: GET enforces `participants.includes(senderId)`; 403 otherwise.
 *  - F3: when a `request_state_change` ref is present, its `taskId` must
 *    match the route param AND its `requestedState` must be in
 *    `requestableStatesFor(currentTaskState)` against the live task row.
 *  - F4: refs length is bounded at the schema layer (max 32).
 */

import {
	type Message as DbMessage,
	type Task as DbTask,
	type HyperIdleDb,
	messages,
	tasks as tasksTable,
	threads,
} from "@hyperidle/db";
import type {
	EventBus,
	InlineRef,
	Message,
	MessageType,
	TaskState,
	ThreadMessageAppendedEvent,
} from "@hyperidle/shared";
import { API_ERROR_CODES, headCollapsePredicate, requestableStatesFor } from "@hyperidle/shared";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { ensureTaskThreadForSender, findTaskThread, rowToThread } from "../services/task-thread.js";
import { messageRowSchema, plainMessageInputSchema } from "./threads-schema.js";

const SENDER_HEADER = "X-Identity";
const DEFAULT_FOUNDER_ID = "u-founder";

function readSenderId(c: { req: { header: (k: string) => string | undefined } }): string {
	return c.req.header(SENDER_HEADER) ?? DEFAULT_FOUNDER_ID;
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
	switch (parsed.type) {
		case "plain":
			return { ...base, type: "plain", payload: parsed.payload };
		case "review":
			return { ...base, type: "review", payload: parsed.payload };
		case "questionnaire":
			return { ...base, type: "questionnaire", payload: parsed.payload };
		case "verdict":
			return { ...base, type: "verdict", payload: parsed.payload };
	}
}

/**
 * F3: validate every `request_state_change` ref in the payload against the
 * route param + the live task row. Returns null on success, an error
 * descriptor on failure.
 */
function validateRequestStateChangeRefs(
	refs: ReadonlyArray<InlineRef> | undefined,
	routeTaskId: string,
	taskRow: DbTask,
): { error: string; code: string } | null {
	if (!refs) return null;
	for (const ref of refs) {
		if (ref.kind !== "request_state_change") continue;
		if (ref.taskId !== routeTaskId) {
			return {
				error: "request_state_change ref taskId does not match the route taskId",
				code: "ref_task_mismatch",
			};
		}
		const allowed = requestableStatesFor(taskRow.state as TaskState);
		if (!allowed.includes(ref.requestedState)) {
			return {
				error: `requestedState '${ref.requestedState}' is not allowed from current state '${taskRow.state}'`,
				code: "invalid_state_transition",
			};
		}
	}
	return null;
}

export function createTaskThreadRoutes(db: HyperIdleDb, eventBus: EventBus): Hono {
	const router = new Hono();

	// --- GET /api/tasks/:taskId/thread --------------------------------------
	// F1: non-mutating. F2: participant-gated.
	router.get("/:taskId/thread", (c) => {
		const taskId = c.req.param("taskId");
		const senderId = readSenderId(c);
		const found = findTaskThread(db, { taskId });
		if ("error" in found) {
			return c.json(found.error, found.status);
		}
		if (!found.thread.participants.includes(senderId)) {
			return c.json({ error: "Sender is not a participant", code: "forbidden" }, 403);
		}
		const messageRows = db
			.select()
			.from(messages)
			.where(eq(messages.threadId, found.thread.id))
			.orderBy(desc(messages.createdAt), desc(messages.id))
			.all();
		const msgsDesc = messageRows.map(rowToMessage);
		const msgsAsc = [...msgsDesc].reverse();
		const head = headCollapsePredicate(msgsAsc);
		return c.json({
			thread: found.thread,
			messages: msgsDesc,
			headMessageId: head.headMessageId,
			nextMessagesCursor: null,
		});
	});

	// --- POST /api/tasks/:taskId/thread/messages ----------------------------
	router.post("/:taskId/thread/messages", async (c) => {
		const taskId = c.req.param("taskId");
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: "validation_error" }, 400);
		}
		// L15: only `plain` messages are supported on the task-thread surface.
		const parsed = plainMessageInputSchema.safeParse(body);
		if (!parsed.success) {
			return c.json({ error: "Validation error", code: "validation_error" }, 400);
		}
		const input = parsed.data;
		const senderId = readSenderId(c);

		// F3: re-fetch the live task row to validate refs against authoritative
		// server-side state (not anything client-supplied).
		const taskRow = db.select().from(tasksTable).where(eq(tasksTable.id, taskId)).get();
		if (!taskRow) {
			return c.json({ error: "Task not found", code: "not_found" }, 404);
		}
		const refError = validateRequestStateChangeRefs(input.payload.refs, taskId, taskRow);
		if (refError) {
			return c.json(refError, 400);
		}

		// F1: authorize via canonical team-derived participants AND materialize
		// the thread iff caller is a participant. The caller's id is NOT
		// auto-added — they must already qualify.
		const ensured = ensureTaskThreadForSender(db, { taskId, senderId, eventBus });
		if ("error" in ensured) {
			return c.json(ensured.error, ensured.status);
		}

		// Idempotency check on (thread_id, sender_id, client_key).
		const existing = db
			.select()
			.from(messages)
			.where(
				and(
					eq(messages.threadId, ensured.thread.id),
					eq(messages.senderId, senderId),
					eq(messages.clientKey, input.clientKey),
				),
			)
			.get();
		if (existing) {
			const samePayload = existing.payload === JSON.stringify(input.payload);
			const sameType = existing.type === input.type;
			if (!(sameType && samePayload)) {
				return c.json(
					{
						error: "clientKey already used with a different payload",
						code: "idempotency_conflict",
					},
					409,
				);
			}
			return c.json(
				{
					thread: ensured.thread,
					message: rowToMessage(existing),
				},
				200,
			);
		}

		const now = new Date().toISOString();
		const messageId = crypto.randomUUID();
		db.transaction((tx) => {
			tx.insert(messages)
				.values({
					id: messageId,
					senderId,
					threadId: ensured.thread.id,
					type: input.type,
					payload: JSON.stringify(input.payload),
					clientKey: input.clientKey,
					createdAt: now,
				})
				.run();
			tx.update(threads).set({ lastActiveAt: now }).where(eq(threads.id, ensured.thread.id)).run();
		});

		const appendedEvent: ThreadMessageAppendedEvent = {
			type: "thread_message_appended",
			streamId: ensured.thread.id,
			threadId: ensured.thread.id,
			messageId,
			messageType: input.type,
			senderId,
			timestamp: Date.now(),
		};
		eventBus.emit(appendedEvent);

		const updatedThread = db.select().from(threads).where(eq(threads.id, ensured.thread.id)).get();
		const created = db.select().from(messages).where(eq(messages.id, messageId)).get();
		if (!(updatedThread && created)) {
			return c.json({ error: "Created message missing", code: API_ERROR_CODES.NOT_FOUND }, 500);
		}
		return c.json(
			{
				thread: rowToThread(updatedThread),
				message: rowToMessage(created),
			},
			201,
		);
	});

	return router;
}
