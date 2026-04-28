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
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";
import { findOrCreateDirectThread } from "../services/direct-thread.js";
import { escapeLikePattern } from "../services/like-escape.js";

const updateSkillSchema = z.object({
	autonomyLevel: z.number().int().min(1).max(4),
});

// L1 step9 (Adv-C2): senderId is NOT accepted from the request body; it is
// derived from the authenticated identity via `X-Identity` header. The
// previous body-supplied senderId allowed any caller to forge messages
// "from" any agent and burn idempotency clientKeys in another sender's
// namespace. Defense-in-depth even though identity is non-binding for L1a
// (single shared X-API-Key) — closes the contract surface so a future
// per-identity key model is not retroactively broken.
const sendMessageSchema = z
	.object({
		subject: z.string().optional(),
		body: z.string().min(1),
	})
	.strict();

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

			// L1a: legacy `kind='review'` threads project to host_kind='agent'
			// for an agent-scoped autonomy review (plan §5.3 SHARED.md rules:
			// review/chat threads infer host from the referencing item's
			// scope; here the item is layer='meta', kind='autonomy_change'
			// targeting the agent whose skill autonomy changed).
			db.insert(threads)
				.values({
					id: threadId,
					hostKind: "agent",
					hostId: agentId,
					initiatorId: agentId,
					participants: JSON.stringify([agentId]),
					lastActiveAt: now,
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

		// L1a: messages no longer carry recipient_id; agent inbox derives
		// from threads where the agent is a participant. L1 step5 (W6): the
		// participants JSON column is pre-filtered in SQL with a
		// `LIKE %"<agentId>"%` probe; we re-parse in JS to verify the match.
		const probe = `%${escapeLikePattern(JSON.stringify(agentId))}%`;
		const inboxRows = db
			.select()
			.from(messages)
			.innerJoin(threads, eq(messages.threadId, threads.id))
			.where(sql`${threads.participants} LIKE ${probe} ESCAPE '\\'`)
			.orderBy(desc(messages.createdAt))
			.limit(limit)
			.offset(offset)
			.all();

		const matched = inboxRows.filter((row) => {
			try {
				const parts = JSON.parse(row.threads.participants);
				return Array.isArray(parts) && parts.includes(agentId);
			} catch {
				return false;
			}
		});

		return c.json(matched.map((row) => row.messages));
	});

	// POST /:id/inbox — Send message to agent
	router.post("/:id/inbox", validateBody(sendMessageSchema), (c) => {
		const recipientId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof sendMessageSchema>;

		// L1 step9 (Adv-C2): derive senderId from the authenticated identity,
		// never from the request body. `X-Identity` is the L1a convention for
		// sender attribution under a shared X-API-Key (see threads.ts:50-56).
		const senderId = c.req.header("X-Identity");
		if (!senderId) {
			return c.json(
				{
					error: "Missing X-Identity header",
					code: API_ERROR_CODES.UNAUTHORIZED,
				},
				400,
			);
		}

		const agent = db.select().from(agents).where(eq(agents.id, recipientId)).get();
		if (!agent) {
			return c.json({ error: "Agent not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const senderAgent = db.select().from(agents).where(eq(agents.id, senderId)).get();
		if (!senderAgent) {
			return c.json({ error: "Sender identity not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const now = new Date().toISOString();

		// L1 step5 (W14): direct-thread reuse + create lives in
		// `services/direct-thread.ts` to avoid drift with `skill-tools/send-message.ts`.
		const threadId = findOrCreateDirectThread(db, senderId, recipientId, now);

		const messageId = crypto.randomUUID();
		const text = body.subject ? `${body.subject}\n\n${body.body}` : body.body;
		db.insert(messages)
			.values({
				id: messageId,
				senderId,
				threadId,
				type: "plain",
				payload: JSON.stringify({ text }),
				clientKey: messageId,
				createdAt: now,
			})
			.run();

		const created = db.select().from(messages).where(eq(messages.id, messageId)).get();
		return c.json(created, 201);
	});

	return router;
}
