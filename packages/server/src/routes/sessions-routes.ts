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
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";

const createSessionSchema = z.object({
	agentId: z.string(),
	taskId: z.string(),
	modelTier: z.enum(["reasoning", "workhorse", "fast"]),
	// L19: harness URL and token counts (all optional)
	harnessUrl: z.string().url().optional(),
	tokensInput: z.number().int().nonnegative().optional(),
	tokensOutput: z.number().int().nonnegative().optional(),
});

const updateSessionSchema = z.object({
	state: z.enum(["done", "crashed"]),
	outcome: z.string().optional(),
	notes: z.string().optional(),
	// L19: agents report final token counts at session end
	tokensInput: z.number().int().nonnegative().optional(),
	tokensOutput: z.number().int().nonnegative().optional(),
});

/**
 * Create Hono routes for session endpoints (E6).
 */
export function createSessionRoutes(db: HyperIdleDb, eventBus: EventBus): Hono {
	const router = new Hono();

	// GET / — List sessions with optional filtering by task_id, agent_id, state.
	// @lore I6: replaces the bounded resource descriptor with actual filtering.
	// The previous handler was a placeholder from I1 to avoid unbounded SELECT *.
	// Now supports query params: ?task_id=, ?agent_id=, ?state= with pagination
	// via ?limit= and ?offset=.
	router.get("/", (c) => {
		const taskId = c.req.query("task_id");
		const agentId = c.req.query("agent_id");
		const state = c.req.query("state");
		const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
		const offset = Number.parseInt(c.req.query("offset") ?? "0", 10) || 0;

		const conditions = [];
		if (taskId) conditions.push(eq(sessions.taskId, taskId));
		if (agentId) conditions.push(eq(sessions.agentId, agentId));
		if (state) conditions.push(eq(sessions.state, state));

		const query =
			conditions.length > 0
				? db
						.select()
						.from(sessions)
						.where(and(...conditions))
				: db.select().from(sessions);

		const result = query.limit(limit).offset(offset).all();

		return c.json(result);
	});

	// POST / — Create session
	router.post("/", validateBody(createSessionSchema), (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof createSessionSchema>;
		const sessionId = crypto.randomUUID();
		const now = new Date().toISOString();

		db.insert(sessions)
			.values({
				id: sessionId,
				agentId: body.agentId,
				taskId: body.taskId,
				modelTier: body.modelTier,
				startedAt: now,
				state: "active",
				// L19: optional harness fields
				harnessUrl: body.harnessUrl ?? null,
				tokensInput: body.tokensInput ?? null,
				tokensOutput: body.tokensOutput ?? null,
			})
			.run();

		eventBus.emit<"session_started">({
			type: "session_started",
			streamId: sessionId,
			sessionId,
			agentId: body.agentId,
			taskId: body.taskId,
			timestamp: Date.now(),
		} satisfies SessionStartedEvent);

		const created = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
		return c.json(created, 201);
	});

	// PATCH /:id — Update session state
	router.patch("/:id", validateBody(updateSessionSchema), (c) => {
		const sessionId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof updateSessionSchema>;

		const existing = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
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
		// L19: token counts reported at session end
		if (body.tokensInput !== undefined) updates.tokensInput = body.tokensInput;
		if (body.tokensOutput !== undefined) updates.tokensOutput = body.tokensOutput;

		db.update(sessions).set(updates).where(eq(sessions.id, sessionId)).run();

		const outcome: SessionOutcome = body.state === "crashed" ? "crashed" : "completed";
		// This PATCH endpoint does not receive a cost update — the delta since the
		// last recorded cost is 0 by construction.
		eventBus.emit<"session_ended">({
			type: "session_ended",
			streamId: sessionId,
			sessionId,
			agentId: existing.agentId,
			taskId: existing.taskId,
			timestamp: Date.now(),
			costDelta: 0,
			outcome,
		} satisfies SessionEndedEvent);

		const updated = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
		return c.json(updated);
	});

	return router;
}
