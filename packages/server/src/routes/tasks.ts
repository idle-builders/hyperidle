import {
	bets,
	type HyperIdleDb,
	messages as messagesTable,
	sessions,
	taskSnoozes,
	tasks,
} from "@hyperidle/db";
import type { EventBus, TaskSnoozedEvent } from "@hyperidle/shared";
import {
	API_ERROR_CODES,
	derivePendingRequest,
	isVerbLegalForState,
	REQUEST_VERBS,
	renderRequestText,
	TASK_STATES,
	type TaskState,
} from "@hyperidle/shared";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";
import { appendPlainMessage } from "../services/append-plain-message.js";
import {
	ensureParticipant,
	ensureTaskThread,
	rollbackCreatedThread,
} from "../services/ensure-task-thread.js";
import { handoff } from "../services/handoff-protocol.js";
import type { SessionContext } from "../services/session-lifecycle.js";
import { transitionTask } from "../services/task-state-machine.js";
import { assertTaskParticipantAuthz } from "../services/task-authz.js";
import { rowToMessage } from "./threads.js";
import { clientKeySchema } from "./threads-schema.js";

const SENDER_HEADER = "X-Identity";
const DEFAULT_FOUNDER_ID = "u-founder";

function readSenderId(c: { req: { header: (k: string) => string | undefined } }): string {
	return c.req.header(SENDER_HEADER) ?? DEFAULT_FOUNDER_ID;
}

/**
 * Zod schemas for request validation.
 */
const createTaskSchema = z.object({
	betId: z.string(),
	title: z.string().min(1),
	description: z.string().optional(),
	doneCondition: z.string().optional(),
	ownerAgentId: z.string().optional(),
	costCap: z.number().int().optional(),
});

const updateTaskSchema = z.object({
	title: z.string().optional(),
	description: z.string().optional(),
	doneCondition: z.string().optional(),
	ownerAgentId: z.string().optional(),
});

// I2 V1: enum-validate at the boundary so an unknown state surfaces as
// 400 from Zod, not 409 from the state machine.
const transitionTaskSchema = z.object({
	state: z.enum(TASK_STATES),
});

const handoffSchema = z.object({
	sessionId: z.string(),
	toAgent: z.string().optional(),
	toRole: z.string().optional(),
	toHuman: z.boolean().optional(),
	reason: z.string().min(1),
	artifacts: z.array(z.string()).optional(),
	remainingWork: z.array(z.string()).optional(),
});

/**
 * Create Hono routes for task endpoints.
 * Requires db and eventBus injected.
 */
export function createTaskRoutes(db: HyperIdleDb, eventBus: EventBus): Hono {
	const router = new Hono();

	// POST /tasks — create a new task (agent-driven decomposition)
	router.post("/", validateBody(createTaskSchema), (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof createTaskSchema>;
		const now = new Date().toISOString();

		// Validate bet exists
		const bet = db.select().from(bets).where(eq(bets.id, body.betId)).get();
		if (!bet) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}

		const taskId = crypto.randomUUID();
		db.insert(tasks)
			.values({
				id: taskId,
				betId: body.betId,
				productId: bet.productId,
				teamId: bet.teamId,
				title: body.title,
				description: body.description ?? null,
				doneCondition: body.doneCondition ?? null,
				ownerAgentId: body.ownerAgentId ?? null,
				state: "proposed",
				costCap: body.costCap ?? null,
				createdAt: now,
				updatedAt: now,
			})
			.run();

		const created = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
		return c.json(created, 201);
	});

	// GET /tasks — list, filterable by bet_id, state, owner.
	// L15 §5.6: each row carries `pendingRequest` and `snoozedUntil` projected
	// per (current user, task) — pending derived from message stream, snooze
	// from `task_snoozes`.
	router.get("/", (c) => {
		const betId = c.req.query("bet_id");
		const state = c.req.query("state");
		const owner = c.req.query("owner");
		const userId = readSenderId(c);

		const conditions = [];
		if (betId) conditions.push(eq(tasks.betId, betId));
		if (state) conditions.push(eq(tasks.state, state));
		if (owner) conditions.push(eq(tasks.ownerAgentId, owner));

		const result =
			conditions.length > 0
				? db
						.select()
						.from(tasks)
						.where(and(...conditions))
						.all()
				: db.select().from(tasks).all();

		const enriched = result.map((row) => {
			let pendingRequest: ReturnType<typeof derivePendingRequest> = null;
			if (row.threadId) {
				const msgRows = db
					.select()
					.from(messagesTable)
					.where(eq(messagesTable.threadId, row.threadId))
					.orderBy(asc(messagesTable.createdAt), asc(messagesTable.id))
					.all();
				// @lore L15 simplification-scan SF4: let parse errors propagate as 500;
				// the project rule is "no swallowing with try-catch" at boundaries.
				pendingRequest = derivePendingRequest(msgRows.map(rowToMessage));
				// @lore L15 security SHOULD-FIX-1: the `reason` field is a free-text
				// ≤2KiB channel a founder might use to share sensitive context. The
				// list endpoint has no team-scope authz today (tracked under
				// `auth-middleware-task-scope` in follow-ups.md). Strip `reason`
				// when the caller isn't authorized for the task so the unscoped
				// list cannot exfiltrate cross-team free text. The verb/messageId
				// fields stay so the board can still render a "↪ pending" chip.
				if (pendingRequest && pendingRequest.reason) {
					const authz = assertTaskParticipantAuthz(db, userId, row);
					if (!authz.ok) {
						const { reason: _stripped, ...withoutReason } = pendingRequest;
						pendingRequest = withoutReason;
					}
				}
			}
			const snoozeRow = db
				.select()
				.from(taskSnoozes)
				.where(and(eq(taskSnoozes.userId, userId), eq(taskSnoozes.taskId, row.id)))
				.get();
			const snoozedUntil = snoozeRow?.snoozedUntil ?? null;
			return { ...row, pendingRequest, snoozedUntil };
		});

		return c.json(enriched);
	});

	// PATCH /tasks/:id — update mutable fields
	router.patch("/:id", validateBody(updateTaskSchema), (c) => {
		const taskId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof updateTaskSchema>;

		const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
		if (!task) {
			return c.json({ error: "Task not found", code: "NOT_FOUND" }, 404);
		}

		const updates: Record<string, string> = {
			updatedAt: new Date().toISOString(),
		};
		if (body.title !== undefined) updates.title = body.title;
		if (body.description !== undefined) updates.description = body.description;
		if (body.doneCondition !== undefined) updates.doneCondition = body.doneCondition;
		if (body.ownerAgentId !== undefined) updates.ownerAgentId = body.ownerAgentId;

		db.update(tasks).set(updates).where(eq(tasks.id, taskId)).run();

		const updated = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
		return c.json(updated);
	});

	// POST /tasks/:id/transition — state transition
	router.post("/:id/transition", validateBody(transitionTaskSchema), (c) => {
		const taskId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof transitionTaskSchema>;

		transitionTask(db, eventBus, taskId, body.state);

		const updated = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
		return c.json(updated);
	});

	// POST /tasks/:id/handoff — hand off task to another agent/role/human
	router.post("/:id/handoff", validateBody(handoffSchema), async (c) => {
		const taskId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof handoffSchema>;

		const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
		if (!task) {
			return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const session = db.select().from(sessions).where(eq(sessions.id, body.sessionId)).get();
		if (!session) {
			return c.json({ error: "Session not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		// Build a minimal SessionContext for handoff.
		// @lore I6: workspacePath must be non-empty or endSession's fs.promises.rm()
		// would attempt to rm(""), which is dangerous. Use a safe sentinel that
		// points to a non-existent path so rm() fails silently (force: true).
		const resolvedWorkspacePath =
			session.workspaceSnapshot?.trim() || `/tmp/.hyperidle-noop-${session.id}`;
		const sessionContext: SessionContext = {
			sessionId: session.id,
			agentId: session.agentId,
			taskId,
			workspacePath: resolvedWorkspacePath,
			watcher: {
				stop: (): void => {
					/* no-op */
				},
			},
			traceId: session.traceId ?? "",
		};

		const result = await handoff(db, eventBus, {
			sessionContext,
			toAgent: body.toAgent,
			toRole: body.toRole,
			toHuman: body.toHuman,
			metadata: {
				context_id: session.id,
				status: "completed",
				reason: body.reason,
				artifacts: body.artifacts ?? [],
				remaining_work: body.remainingWork ?? [],
			},
		});

		return c.json(result);
	});

	// --- L15 §5.4: POST /api/tasks/:id/request -----------------------------
	//
	// @lore L15 §5.4: this endpoint is a thin convenience wrapper over
	// `appendPlainMessage`; no parallel write path. Verdict/review/
	// questionnaire branches deliberately stay at the threads route — they
	// have specialised authz, race guards, and event emission.
	const requestBodySchema = z.object({
		verb: z.enum(REQUEST_VERBS),
		reason: z.string().min(1).max(2048).optional(),
		clientKey: clientKeySchema,
	});
	router.post("/:id/request", validateBody(requestBodySchema), (c) => {
		const taskId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof requestBodySchema>;
		const senderId = readSenderId(c);

		// 1. Resolve task; 404 if missing.
		const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
		if (!task) {
			return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		// 2. Authz — founder bypass / team member match / 404 otherwise.
		const authz = assertTaskParticipantAuthz(db, senderId, task);
		if (!authz.ok) {
			return c.json({ error: authz.message, code: authz.code }, authz.status);
		}

		// 3. State-legality. cancel_request is special — legal only when pending.
		const state = task.state as TaskState;
		if (body.verb === "cancel_request") {
			if (!task.threadId) {
				return c.json(
					{ error: "No pending request to cancel", code: "already_resolved" },
					409,
				);
			}
			const msgRows = db
				.select()
				.from(messagesTable)
				.where(eq(messagesTable.threadId, task.threadId))
				.orderBy(asc(messagesTable.createdAt), asc(messagesTable.id))
				.all();
			const pending = derivePendingRequest(msgRows.map(rowToMessage));
			if (!pending) {
				return c.json(
					{ error: "No pending request to cancel", code: "already_resolved" },
					409,
				);
			}
			// @lore L15 architecture MUST-FIX-1 / plan §10 row 12: a cancel that
			// races a state transition must return 409 already_resolved. The
			// task-state machine bumps `task.updatedAt`; a pending whose
			// createdAt < updatedAt is superseded by the transition.
			if (task.updatedAt > pending.createdAt) {
				return c.json(
					{ error: "Pending request was superseded by a state transition", code: "already_resolved" },
					409,
				);
			}
		} else if (!isVerbLegalForState(body.verb, state)) {
			return c.json(
				{ error: `Verb '${body.verb}' is not legal for state '${state}'`, code: "validation_error" },
				400,
			);
		}

		// 4. Lazily ensure the task's thread (race-safe).
		const reread = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
		if (!reread) {
			return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		const ensured = ensureTaskThread(db, reread, senderId);
		if (!ensured.created) {
			ensureParticipant(db, ensured.threadRow, senderId);
		}

		// 5. Append the plain message via the shared helper.
		const text = renderRequestText(body.verb, body.reason);
		const result = appendPlainMessage(db, eventBus, {
			threadId: ensured.threadRow.id,
			senderId,
			clientKey: body.clientKey,
			payload: {
				text,
				request: { verb: body.verb, ...(body.reason ? { reason: body.reason } : {}) },
			},
		});
		if (!result.ok) {
			// @lore L15 adversary F1: if we just created the thread for this
			// request and the append failed, roll the thread back so a 5xx/409
			// from the helper does not leave a phantom thread row pinned to
			// the task. Safe because we only delete when the thread has zero
			// messages and only clear the pin when it still matches our id.
			if (ensured.created) {
				rollbackCreatedThread(db, reread.id, ensured.threadRow.id);
			}
			return c.json({ error: result.message, code: result.code }, result.status);
		}
		return c.json({ message: result.message, thread: result.thread }, result.status);
	});

	// --- L15 §5.5: POST /api/tasks/:id/snooze --------------------------------
	const snoozeBodySchema = z.object({
		hours: z.literal(24),
	});
	router.post("/:id/snooze", validateBody(snoozeBodySchema), (c) => {
		const taskId = c.req.param("id");
		const userId = readSenderId(c);
		const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
		if (!task) {
			return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		const authz = assertTaskParticipantAuthz(db, userId, task);
		if (!authz.ok) {
			return c.json({ error: authz.message, code: authz.code }, authz.status);
		}
		const now = new Date();
		const until = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
		const existing = db
			.select()
			.from(taskSnoozes)
			.where(and(eq(taskSnoozes.userId, userId), eq(taskSnoozes.taskId, taskId)))
			.get();
		if (existing) {
			db.update(taskSnoozes)
				.set({ snoozedUntil: until })
				.where(and(eq(taskSnoozes.userId, userId), eq(taskSnoozes.taskId, taskId)))
				.run();
		} else {
			db.insert(taskSnoozes)
				.values({
					userId,
					taskId,
					snoozedUntil: until,
					createdAt: now.toISOString(),
				})
				.run();
		}
		const event: TaskSnoozedEvent = {
			type: "task_snoozed",
			streamId: taskId,
			taskId,
			userId,
			snoozedUntil: until,
			timestamp: Date.now(),
		};
		eventBus.emit(event);
		return c.json({ snoozedUntil: until }, 201);
	});

	// --- L15 §5.5: DELETE /api/tasks/:id/snooze ------------------------------
	router.delete("/:id/snooze", (c) => {
		const taskId = c.req.param("id");
		const userId = readSenderId(c);
		const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
		if (!task) {
			return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		const authz = assertTaskParticipantAuthz(db, userId, task);
		if (!authz.ok) {
			return c.json({ error: authz.message, code: authz.code }, authz.status);
		}
		db.delete(taskSnoozes)
			.where(and(eq(taskSnoozes.userId, userId), eq(taskSnoozes.taskId, taskId)))
			.run();
		return c.body(null, 204);
	});

	return router;
}
