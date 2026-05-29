import { type HyperIdleDb, sessions, tasks } from "@hyperidle/db";
import {
	API_ERROR_CODES,
	ConcurrencyLimitError,
	CostCapExceededError,
	type EventBus,
	type HarnessAdapter,
	type SessionEndedEvent,
	type SessionOutcome,
	type SessionStartedEvent,
} from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import type { WorkspaceAdapter } from "../harness/workspace-adapter.js";
import { validateBody } from "../middleware/validate.js";
import type { CredentialResolver } from "../services/credential-resolver.js";
import type { SessionActivityBuffer } from "../services/session-activity-buffer.js";
import { provisionSession } from "../services/session-provisioning.js";

// @lore O2: harnessUrl, tokensInput, tokensOutput fields removed from session
// schemas. Those columns were stripped from the sessions kernel table as part
// of kernel/strategy separation. Cost and token tracking are strategy concerns.

const createSessionSchema = z.object({
	agentId: z.string(),
	taskId: z.string(),
	modelTier: z.enum(["reasoning", "workhorse", "fast"]),
});

const updateSessionSchema = z.object({
	state: z.enum(["done", "crashed"]),
	outcome: z.string().optional(),
	notes: z.string().optional(),
});

/**
 * Optional dependency injection for session route provisioning (R1).
 * When `harnessAdapter` and `workspaceAdapter` are both present, POST /sessions
 * routes through `provisionSession` instead of a bare DB insert.
 *
 * @lore R1: The adapters are injected via this interface rather than being
 * constructed inside the route handler so tests can supply scripted mocks
 * without touching process.env or module internals.
 */
export interface SessionRouteDeps {
	readonly harnessAdapter?: HarnessAdapter;
	readonly workspaceAdapter?: WorkspaceAdapter;
	readonly workspaceBasePath?: string;
	readonly credentialResolver?: CredentialResolver;
}

/**
 * Create Hono routes for session endpoints (E6).
 *
 * @param activityBuffer - Optional in-memory ring buffer for session activity
 *   (Q1 §3.2). When wired, GET /:id/activity returns entries from the buffer.
 * @param deps - Optional adapter deps for full provisionSession path (R1).
 */
export function createSessionRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	activityBuffer?: SessionActivityBuffer,
	deps?: SessionRouteDeps,
): Hono {
	const router = new Hono();

	// GET / — List sessions with optional filtering by task_id, agent_id, state.
	// @lore I6: replaces the bounded resource descriptor with actual filtering.
	router.get("/", async (c) => {
		const taskId = c.req.query("task_id");
		const agentId = c.req.query("agent_id");
		const state = c.req.query("state");
		const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
		const offset = Number.parseInt(c.req.query("offset") ?? "0", 10) || 0;

		const conditions = [];
		if (taskId) conditions.push(eq(sessions.taskId, taskId));
		if (agentId) conditions.push(eq(sessions.agentId, agentId));
		if (state) conditions.push(eq(sessions.state, state));

		const result =
			conditions.length > 0
				? await db
						.select()
						.from(sessions)
						.where(and(...conditions))
						.limit(limit)
						.offset(offset)
				: await db.select().from(sessions).limit(limit).offset(offset);

		return c.json(result);
	});

	// @lore R1: When `deps.harnessAdapter` and `deps.workspaceAdapter` are both
	// present, the route runs the full 11-phase `provisionSession` orchestrator
	// (credential pre-flight → workspace → materialize → harness → teardown) and
	// returns 200 with the completed session row. When adapters are absent it
	// falls back to the legacy bare DB insert returning 201 — this preserves
	// backward compat for tests and deployments that haven't wired the harness.
	router.post("/", validateBody(createSessionSchema), async (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof createSessionSchema>;

		// ── Full provisionSession path (adapters present) ─────────────────────
		if (deps?.harnessAdapter && deps.workspaceAdapter) {
			// AC6/AC7: credential pre-flight — must fail BEFORE any DB write.
			const apiKey = await deps.credentialResolver?.resolve("anthropic_api_key");
			if (apiKey == null) {
				return c.json(
					{
						error: "Missing ANTHROPIC_API_KEY credential",
						code: "MISSING_CREDENTIAL",
					},
					500,
				);
			}

			// Look up task to get productId.
			const [task] = await db.select().from(tasks).where(eq(tasks.id, body.taskId)).limit(1);
			if (!task) {
				return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
			}

			const workspaceBasePath = deps.workspaceBasePath ?? "/tmp/hyperidle-workspaces";

			try {
				const result = await provisionSession(
					{
						db,
						eventBus,
						harness: deps.harnessAdapter,
						workspace: deps.workspaceAdapter,
					},
					{
						agentId: body.agentId,
						taskId: body.taskId,
						productId: task.productId,
						modelTier: body.modelTier,
						workspaceBasePath,
					},
				);

				const [sessionRow] = await db
					.select()
					.from(sessions)
					.where(eq(sessions.id, result.sessionId))
					.limit(1);
				return c.json(sessionRow, 200);
			} catch (err) {
				if (err instanceof CostCapExceededError) {
					return c.json({ error: err.message, code: "COST_CAP_EXCEEDED" }, 422);
				}
				if (err instanceof ConcurrencyLimitError) {
					return c.json({ error: err.message, code: "CONCURRENCY_LIMIT" }, 429);
				}
				return c.json({ error: "Session provisioning failed", code: "INTERNAL_ERROR" }, 500);
			}
		}

		// ── Legacy bare-insert path (no adapters) ─────────────────────────────
		const sessionId = crypto.randomUUID();
		const now = new Date().toISOString();

		await db.insert(sessions).values({
			id: sessionId,
			agentId: body.agentId,
			taskId: body.taskId,
			modelTier: body.modelTier,
			startedAt: now,
			state: "active",
		});

		eventBus.emit<"session_started">({
			type: "session_started",
			streamId: sessionId,
			sessionId,
			agentId: body.agentId,
			taskId: body.taskId,
			timestamp: Date.now(),
		} satisfies SessionStartedEvent);

		const [created] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
		return c.json(created, 201);
	});

	// GET /:id/activity — Session activity stream (Q1 §3.2)
	// Returns session metadata + recent activity entries from the in-memory buffer.
	// Capped at 50 most-recent entries to bound response size.
	router.get("/:id/activity", async (c) => {
		const sessionId = c.req.param("id");
		const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
		if (!session) {
			return c.json({ error: "Session not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const allEntries = activityBuffer ? activityBuffer.getActivity(sessionId) : [];
		// Return 50 most-recent entries (tail of the insertion-ordered array)
		const activity = allEntries.slice(-50);

		return c.json({
			session: {
				id: session.id,
				agentId: session.agentId,
				taskId: session.taskId,
				state: session.state,
				startedAt: session.startedAt,
				modelTier: session.modelTier,
			},
			activity,
		});
	});

	// PATCH /:id — Update session state
	router.patch("/:id", validateBody(updateSessionSchema), async (c) => {
		const sessionId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof updateSessionSchema>;

		const [existing] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
		if (!existing) {
			return c.json({ error: "Session not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const now = new Date().toISOString();
		const updates: Record<string, unknown> = {
			state: body.state,
			endedAt: now,
		};
		if (body.outcome !== undefined) updates.outcome = body.outcome;
		if (body.notes !== undefined) updates.notes = body.notes;

		await db.update(sessions).set(updates).where(eq(sessions.id, sessionId));

		const outcome: SessionOutcome = body.state === "crashed" ? "crashed" : "completed";
		eventBus.emit<"session_ended">({
			type: "session_ended",
			streamId: sessionId,
			sessionId,
			agentId: existing.agentId,
			taskId: existing.taskId,
			timestamp: Date.now(),
			outcome,
		} satisfies SessionEndedEvent);

		const [updated] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
		return c.json(updated);
	});

	return router;
}
