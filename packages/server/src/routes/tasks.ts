import { bets, type HyperIdleDb, messages, sessions, tasks } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import {
	API_ERROR_CODES,
	derivePendingRequest,
	isVerbLegalForState,
	renderRequestText,
	REQUEST_VERBS,
	sanitizeReason,
	TASK_STATES,
	type TaskState,
} from "@hyperidle/shared";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";
import { appendPlainMessage } from "../services/append-plain-message.js";
import { ensureTaskThread } from "../services/ensure-task-thread.js";
import { handoff } from "../services/handoff-protocol.js";
import type { SessionContext } from "../services/session-lifecycle.js";
import { assertTaskParticipantAuthz, readSenderId } from "../services/task-authz.js";
import { transitionTask } from "../services/task-state-machine.js";
import { rowToMessage } from "../services/thread-row.js";
import { clientKeySchema } from "./threads-schema.js";

const requestBodySchema = z.object({
	verb: z.enum(REQUEST_VERBS),
	reason: z.string().min(1).max(2048).optional(),
	clientKey: clientKeySchema,
});

/**
 * @lore L15 security HIGH-2: per-(senderId, taskId) sliding-window limiter
 * for `POST /api/tasks/:id/request`. The global API limiter buckets by
 * API-key only, which lets a single shared key flood a victim task at the
 * global rate. Bucket key is `${senderId}:${taskId}`; window is 60s; cap
 * is 10 requests — enough for legitimate human dispatch + cancel patterns,
 * tight enough to interrupt scripted spam.
 */
const TASK_REQUEST_RATE_LIMIT = 10;
const TASK_REQUEST_RATE_WINDOW_MS = 60_000;
interface TaskRequestBucket {
	count: number;
	resetAt: number;
}
const taskRequestBuckets = new Map<string, TaskRequestBucket>();

function checkTaskRequestRate(senderId: string, taskId: string): boolean {
	const key = `${senderId}:${taskId}`;
	const now = Date.now();
	const bucket = taskRequestBuckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		taskRequestBuckets.set(key, { count: 1, resetAt: now + TASK_REQUEST_RATE_WINDOW_MS });
		return true;
	}
	bucket.count += 1;
	return bucket.count <= TASK_REQUEST_RATE_LIMIT;
}

/**
 * Test-only reset hook. Vitest spawns multiple suites in a single process
 * with module-level state; clearing the bucket map between tests prevents
 * cross-suite rate-limit bleed.
 */
export function __resetTaskRequestRateLimiter(): void {
	taskRequestBuckets.clear();
}

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

	// GET /tasks — list, filterable by bet_id, state, owner
	router.get("/", (c) => {
		const betId = c.req.query("bet_id");
		const state = c.req.query("state");
		const owner = c.req.query("owner");

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

		return c.json(result);
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

	router.post("/:id/request", validateBody(requestBodySchema), (c) => {
		const taskId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof requestBodySchema>;
		const senderId = readSenderId(c);

		if (!checkTaskRequestRate(senderId, taskId)) {
			c.header("Retry-After", String(Math.ceil(TASK_REQUEST_RATE_WINDOW_MS / 1000)));
			return c.json(
				{ error: "Too many requests for this task", code: API_ERROR_CODES.RATE_LIMITED },
				429,
			);
		}

		const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
		if (!task) {
			return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const authz = assertTaskParticipantAuthz(db, senderId, task);
		if (!authz.ok) {
			return c.json({ error: authz.message, code: authz.code }, authz.status);
		}

		const taskState = task.state as TaskState;
		const isCancel = body.verb === "cancel_request";
		if (!(isCancel || isVerbLegalForState(body.verb, taskState))) {
			return c.json(
				{
					error: `Verb '${body.verb}' is not legal for state '${taskState}'`,
					code: "validation_error",
				},
				400,
			);
		}

		const { threadRow } = ensureTaskThread(db, task, senderId);

		if (isCancel) {
			const msgRows = db
				.select()
				.from(messages)
				.where(eq(messages.threadId, threadRow.id))
				.orderBy(asc(messages.createdAt), asc(messages.id))
				.all();
			const msgs = msgRows.map(rowToMessage);
			const pending = derivePendingRequest(msgs);
			if (!pending) {
				return c.json(
					{
						error: "No pending request to cancel",
						code: "already_resolved",
					},
					409,
				);
			}
		}

		// Sanitize the human-supplied reason BEFORE persistence so prompt-
		// injection padding (zero-width spaces, RTL marks) is stripped.
		const cleanReason = body.reason ? sanitizeReason(body.reason) : undefined;
		const text = renderRequestText(body.verb, cleanReason);
		const result = appendPlainMessage(db, eventBus, {
			threadId: threadRow.id,
			senderId,
			clientKey: body.clientKey,
			payload: {
				text,
				request: cleanReason ? { verb: body.verb, reason: cleanReason } : { verb: body.verb },
			},
			// L15 review CRITICAL-2: tasks-route caller already passed
			// `assertTaskParticipantAuthz`; auto-add to thread participants if
			// they are not yet on the roster (lazy-thread first-writer rule).
			autoAddParticipant: true,
		});

		if (!result.ok) {
			return c.json({ error: result.message, code: result.code }, result.status);
		}
		return c.json({ message: result.message, thread: result.thread }, result.status);
	});

	return router;
}
