import { type HyperIdleDb, sessions } from "@hyperidle/db";
import {
	API_ERROR_CODES,
	type EventBus,
	type SessionEndedEvent,
	type SessionOutcome,
	type SessionStartedEvent,
} from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import { validateBody } from "../middleware/validate.js";
import type { SessionActivityBuffer } from "../services/session-activity-buffer.js";

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
 * Create Hono routes for session endpoints (E6).
 *
 * @param activityBuffer - Optional in-memory ring buffer for session activity
 *   (Q1 §3.2). When wired, GET /:id/activity returns entries from the buffer.
 */
export function createSessionRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	activityBuffer?: SessionActivityBuffer,
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

	// POST / — Create session
	router.post("/", validateBody(createSessionSchema), async (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof createSessionSchema>;
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

		const [created] = await db
			.select()
			.from(sessions)
			.where(eq(sessions.id, sessionId))
			.limit(1);
		return c.json(created, 201);
	});

	// GET /:id/activity — Session activity stream (Q1 §3.2)
	// Returns session metadata + recent activity entries from the in-memory buffer.
	// Capped at 50 most-recent entries to bound response size.
	router.get("/:id/activity", async (c) => {
		const sessionId = c.req.param("id");
		const [session] = await db
			.select()
			.from(sessions)
			.where(eq(sessions.id, sessionId))
			.limit(1);
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

		const [existing] = await db
			.select()
			.from(sessions)
			.where(eq(sessions.id, sessionId))
			.limit(1);
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

		const [updated] = await db
			.select()
			.from(sessions)
			.where(eq(sessions.id, sessionId))
			.limit(1);
		return c.json(updated);
	});

	return router;
}
