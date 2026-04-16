import { type HyperIdleDb, sessions } from "@hyperidle/db";
import {
	API_ERROR_CODES,
	type EventBus,
	type SessionEndedEvent,
	type SessionStartedEvent,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";

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
 */
export function createSessionRoutes(db: HyperIdleDb, eventBus: EventBus): Hono {
	const router = new Hono();

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

		db.update(sessions).set(updates).where(eq(sessions.id, sessionId)).run();

		eventBus.emit<"session_ended">({
			type: "session_ended",
			streamId: sessionId,
			sessionId,
			agentId: existing.agentId,
			taskId: existing.taskId,
			timestamp: Date.now(),
		} satisfies SessionEndedEvent);

		const updated = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
		return c.json(updated);
	});

	return router;
}
