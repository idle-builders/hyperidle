import {
	agentSkills,
	agents,
	type HyperIdleDb,
	items,
	messages,
	sessions,
	threads,
} from "@hyperidle/db";
import { API_ERROR_CODES, type EventBus, type ItemCreatedEvent } from "@hyperidle/shared";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";

const updateSkillSchema = z.object({
	autonomyLevel: z.number().int().min(1).max(4),
});

const sendMessageSchema = z.object({
	senderId: z.string(),
	subject: z.string().optional(),
	body: z.string().min(1),
});

/**
 * Create Hono routes for agent endpoints (E6).
 */
export function createAgentRoutes(db: HyperIdleDb, eventBus: EventBus): Hono {
	const router = new Hono();

	// GET / — List all agents with active session counts
	router.get("/", (c) => {
		const allAgents = db.select().from(agents).all();
		const activeSessions = db.select().from(sessions).where(eq(sessions.state, "active")).all();

		const result = allAgents.map((agent) => ({
			...agent,
			activeSessions: activeSessions.filter((s) => s.agentId === agent.id).length,
		}));

		return c.json(result);
	});

	// GET /:id — Agent detail with skills
	router.get("/:id", (c) => {
		const agentId = c.req.param("id");
		const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();

		if (!agent) {
			return c.json({ error: "Agent not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const skills = db.select().from(agentSkills).where(eq(agentSkills.agentId, agentId)).all();

		return c.json({ ...agent, skills });
	});

	// PATCH /:id/skills/:skillId — Update autonomy level
	router.patch("/:id/skills/:skillId", validateBody(updateSkillSchema), (c) => {
		const agentId = c.req.param("id");
		const skillId = c.req.param("skillId");
		const body = c.req.valid("json" as never) as z.infer<typeof updateSkillSchema>;

		const existing = db
			.select()
			.from(agentSkills)
			.where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillId, skillId)))
			.get();

		if (!existing) {
			return c.json({ error: "Agent skill not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const oldLevel = existing.autonomyLevel;
		const newLevel = body.autonomyLevel;

		db.update(agentSkills)
			.set({ autonomyLevel: newLevel })
			.where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillId, skillId)))
			.run();

		const updated = db
			.select()
			.from(agentSkills)
			.where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillId, skillId)))
			.get();

		// If level changed, create a review thread + item
		if (oldLevel !== newLevel) {
			const threadId = crypto.randomUUID();
			const now = new Date().toISOString();

			db.insert(threads)
				.values({
					id: threadId,
					kind: "review",
					participants: JSON.stringify([agentId]),
					createdAt: now,
				})
				.run();

			const itemId = crypto.randomUUID();
			db.insert(items)
				.values({
					id: itemId,
					sourceAgentId: agentId,
					layer: "meta",
					verb: "review",
					kind: "autonomy_change",
					title: `Autonomy level changed for skill ${skillId}`,
					body: `Autonomy level changed from ${oldLevel} to ${newLevel} for agent ${agentId}, skill ${skillId}`,
					threadId,
					createdAt: now,
				})
				.run();

			eventBus.emit<"item_created">({
				type: "item_created",
				streamId: threadId,
				itemId,
				conversationId: threadId,
				kind: "autonomy_change",
				timestamp: Date.now(),
			} satisfies ItemCreatedEvent);
		}

		return c.json(updated);
	});

	// GET /:id/inbox — Agent's inbox with pagination
	router.get("/:id/inbox", (c) => {
		const agentId = c.req.param("id");

		const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
		if (!agent) {
			return c.json({ error: "Agent not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
		const offset = Number.parseInt(c.req.query("offset") ?? "0", 10) || 0;

		// @lore I6: sort at DB level BEFORE limit/offset so pagination is
		// consistent. Previously the sort happened in JS after slicing.
		const inbox = db
			.select()
			.from(messages)
			.where(eq(messages.recipientId, agentId))
			.orderBy(desc(messages.createdAt))
			.limit(limit)
			.offset(offset)
			.all();

		return c.json(inbox);
	});

	// POST /:id/inbox — Send message to agent
	router.post("/:id/inbox", validateBody(sendMessageSchema), (c) => {
		const recipientId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof sendMessageSchema>;

		const agent = db.select().from(agents).where(eq(agents.id, recipientId)).get();
		if (!agent) {
			return c.json({ error: "Agent not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const now = new Date().toISOString();

		// @lore I6: queries WHERE kind = 'direct' instead of loading all threads.
		const directThreads = db.select().from(threads).where(eq(threads.kind, "direct")).all();
		let threadId: string | undefined;

		for (const thread of directThreads) {
			if (thread.participants) {
				const participants = JSON.parse(thread.participants) as string[];
				if (
					participants.includes(body.senderId) &&
					participants.includes(recipientId) &&
					participants.length === 2
				) {
					threadId = thread.id;
					break;
				}
			}
		}

		// Create thread if none exists
		if (!threadId) {
			threadId = crypto.randomUUID();
			db.insert(threads)
				.values({
					id: threadId,
					kind: "direct",
					participants: JSON.stringify([body.senderId, recipientId]),
					createdAt: now,
				})
				.run();
		}

		const messageId = crypto.randomUUID();
		db.insert(messages)
			.values({
				id: messageId,
				senderId: body.senderId,
				recipientId,
				threadId,
				subject: body.subject ?? null,
				body: body.body,
				createdAt: now,
			})
			.run();

		const created = db.select().from(messages).where(eq(messages.id, messageId)).get();
		return c.json(created, 201);
	});

	return router;
}
