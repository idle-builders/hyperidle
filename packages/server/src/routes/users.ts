import {
	type HyperIdleDb,
	items,
	messages,
	sessions,
	threads,
	userSkills,
	users,
} from "@hyperidle/db";
import { API_ERROR_CODES, type EventBus, type ItemCreatedEvent } from "@hyperidle/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { constantTimeStringEqual } from "../middleware/timing-safe.js";
import { validateBody } from "../middleware/validate.js";
import { findOrCreateDirectThread } from "../services/direct-thread.js";
import { escapeLikePattern } from "../services/like-escape.js";

const updateSkillSchema = z.object({
	autonomyLevel: z.number().int().min(1).max(4),
});

// L1 step9 (Adv-C2): senderId is NOT accepted from the request body; it is
// derived from the authenticated identity via `X-Identity` header.
const sendMessageSchema = z
	.object({
		subject: z.string().optional(),
		body: z.string().min(1),
	})
	.strict();

/**
 * @lore P4: PATCH /api/users/:id — only name and email are writable by the
 * authenticated human user. The userId from auth context must match the :id
 * param to prevent unauthorized profile edits.
 */
const patchUserSchema = z.object({
	name: z.string().min(1).max(200).optional(),
	email: z.string().email().max(200).optional(),
});

/**
 * @lore P4: POST /api/users — create the human user during setup.
 * Auth bypass: when no human user exists (fresh install), allow creation
 * without API key. Once a human user exists, require auth.
 * This prevents unauthorized user creation after setup is complete.
 */
const createHumanUserSchema = z.object({
	name: z.string().min(1).max(200),
	email: z.string().email().max(200),
});

/**
 * Create the pre-auth public route for human user setup.
 *
 * @lore P4: POST /api/users for initial setup must bypass the global auth
 * middleware. When no human user exists (fresh install), allow unauthenticated
 * creation. When a human user already exists, require auth (prevents
 * unauthorized user creation after setup is complete).
 *
 * This router is registered in app.ts BEFORE the auth middleware so the
 * POST can succeed without an API key during first-run setup.
 */
export function createUserSetupRoute(db: HyperIdleDb): Hono {
	const router = new Hono();

	router.post("/", async (c) => {
		let rawBody: unknown;
		try {
			rawBody = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: API_ERROR_CODES.VALIDATION_ERROR }, 400);
		}

		const parsed = createHumanUserSchema.safeParse(rawBody);
		if (!parsed.success) {
			return c.json(
				{
					error: "Validation failed",
					code: API_ERROR_CODES.VALIDATION_ERROR,
					issues: parsed.error.issues,
				},
				400,
			);
		}

		// Check if a human user already exists
		const existingHuman = db.select().from(users).where(eq(users.kind, "human")).limit(1).get();

		if (existingHuman) {
			// Human user exists: require auth. Check the API key.
			// @lore P4: Even though this route is pre-auth, we enforce auth here
			// when a human already exists. This prevents unauthorized user creation
			// after setup is complete.
			const apiKey = c.req.header("X-API-Key") ?? "";
			const expectedKey = process.env.HYPERIDLE_API_KEY ?? "";
			const ok = constantTimeStringEqual(apiKey, expectedKey);
			if (!ok) {
				return c.json(
					{ error: "Missing or invalid API key", code: API_ERROR_CODES.UNAUTHORIZED },
					401,
				);
			}
			// Idempotent: return existing human user with 200
			return c.json(existingHuman, 200);
		}

		// No human user exists — allow unauthenticated creation (setup mode)
		const { name, email } = parsed.data;
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		db.insert(users)
			.values({
				id,
				kind: "human",
				name,
				email,
				role: "founder",
				status: "active",
				createdAt: now,
			})
			.run();

		const created = db.select().from(users).where(eq(users.id, id)).get();
		return c.json(created, 201);
	});

	return router;
}

/**
 * Create Hono routes for user endpoints.
 *
 * @lore P2: Renamed from createAgentRoutes / routes/agents.ts. All endpoints
 * are preserved under /api/users (was /api/agents). The function name and file
 * are the only changes — behavior is identical.
 */
export function createUserRoutes(db: HyperIdleDb, eventBus: EventBus): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// GET / — List all users with active session counts
	router.get("/", (c) => {
		const allUsers = db.select().from(users).all();
		const activeSessions = db.select().from(sessions).where(eq(sessions.state, "active")).all();

		const result = allUsers.map((user) => ({
			...user,
			activeSessions: activeSessions.filter((s) => s.agentId === user.id).length,
		}));

		return c.json(result);
	});

	// GET /:id — User detail with skills
	router.get("/:id", (c) => {
		const userId = c.req.param("id");
		const user = db.select().from(users).where(eq(users.id, userId)).get();

		if (!user) {
			return c.json({ error: "User not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const skills = db.select().from(userSkills).where(eq(userSkills.userId, userId)).all();

		return c.json({ ...user, skills });
	});

	// PATCH /:id — Update human user profile (name + email)
	// @lore P4: Only the authenticated user can patch their own profile.
	// The userId from auth context must match the :id param — 403 otherwise.
	router.patch("/:id", async (c) => {
		const targetId = c.req.param("id");
		const authenticatedUserId = c.get("userId");

		// Enforce self-only edit
		if (authenticatedUserId !== targetId) {
			return c.json(
				{ error: "Forbidden: can only update your own profile", code: API_ERROR_CODES.FORBIDDEN },
				403,
			);
		}

		const target = db.select().from(users).where(eq(users.id, targetId)).get();
		if (!target) {
			return c.json({ error: "User not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		let rawBody: unknown;
		try {
			rawBody = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: API_ERROR_CODES.VALIDATION_ERROR }, 400);
		}

		const parsed = patchUserSchema.safeParse(rawBody);
		if (!parsed.success) {
			return c.json(
				{
					error: "Validation failed",
					code: API_ERROR_CODES.VALIDATION_ERROR,
					issues: parsed.error.issues,
				},
				400,
			);
		}

		const updates: { name?: string; email?: string } = {};
		if (parsed.data.name !== undefined) updates.name = parsed.data.name;
		if (parsed.data.email !== undefined) updates.email = parsed.data.email;

		if (Object.keys(updates).length > 0) {
			db.update(users).set(updates).where(eq(users.id, targetId)).run();
		}

		const updated = db.select().from(users).where(eq(users.id, targetId)).get();
		return c.json(updated, 200);
	});

	// PATCH /:id/skills/:skillId — Update autonomy level
	router.patch("/:id/skills/:skillId", validateBody(updateSkillSchema), (c) => {
		const userId = c.req.param("id");
		const skillId = c.req.param("skillId");
		const body = c.req.valid("json" as never) as z.infer<typeof updateSkillSchema>;

		const existing = db
			.select()
			.from(userSkills)
			.where(and(eq(userSkills.userId, userId), eq(userSkills.skillId, skillId)))
			.get();

		if (!existing) {
			return c.json({ error: "User skill not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const oldLevel = existing.autonomyLevel;
		const newLevel = body.autonomyLevel;

		db.update(userSkills)
			.set({ autonomyLevel: newLevel })
			.where(and(eq(userSkills.userId, userId), eq(userSkills.skillId, skillId)))
			.run();

		const updated = db
			.select()
			.from(userSkills)
			.where(and(eq(userSkills.userId, userId), eq(userSkills.skillId, skillId)))
			.get();

		// If level changed, create a review thread + item
		if (oldLevel !== newLevel) {
			const threadId = crypto.randomUUID();
			const now = new Date().toISOString();

			// L1a: legacy `kind='review'` threads project to host_kind='agent'
			// for an agent-scoped autonomy review.
			db.insert(threads)
				.values({
					id: threadId,
					hostKind: "agent",
					hostId: userId,
					initiatorId: userId,
					participants: JSON.stringify([userId]),
					lastActiveAt: now,
					createdAt: now,
				})
				.run();

			const itemId = crypto.randomUUID();
			db.insert(items)
				.values({
					id: itemId,
					sourceAgentId: userId,
					layer: "meta",
					verb: "review",
					kind: "autonomy_change",
					title: `Autonomy level changed for skill ${skillId}`,
					body: `Autonomy level changed from ${oldLevel} to ${newLevel} for user ${userId}, skill ${skillId}`,
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

	// GET /:id/inbox — User's inbox with pagination
	router.get("/:id/inbox", (c) => {
		const userId = c.req.param("id");

		const user = db.select().from(users).where(eq(users.id, userId)).get();
		if (!user) {
			return c.json({ error: "User not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
		const offset = Number.parseInt(c.req.query("offset") ?? "0", 10) || 0;

		// L1a: messages no longer carry recipient_id; user inbox derives
		// from threads where the user is a participant.
		const probe = `%${escapeLikePattern(JSON.stringify(userId))}%`;
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
				return Array.isArray(parts) && parts.includes(userId);
			} catch {
				return false;
			}
		});

		return c.json({ messages: matched.map((row) => row.messages), total: matched.length });
	});

	// POST /:id/inbox — Send message to user
	router.post("/:id/inbox", validateBody(sendMessageSchema), (c) => {
		const recipientId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof sendMessageSchema>;

		// L1 step9 (Adv-C2): derive senderId from the authenticated identity,
		// never from the request body.
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

		const user = db.select().from(users).where(eq(users.id, recipientId)).get();
		if (!user) {
			return c.json({ error: "User not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const senderUser = db.select().from(users).where(eq(users.id, senderId)).get();
		if (!senderUser) {
			return c.json({ error: "Sender identity not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const now = new Date().toISOString();

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
