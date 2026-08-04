import {
	escapeLikePattern,
	type HyperIdleDb,
	resolveAgentScaffoldSpecs,
	sessions,
	userSkills,
} from "@hyperidle/db";
import { persistScaffoldedAgents } from "@hyperidle/org";
import { API_ERROR_CODES, type EventBus, type ItemCreatedEvent } from "@hyperidle/shared";

// AK6: BUILTIN_ASSISTANT_SYSTEM_PROMPT REMOVED — persona comes from app defaults (T8).
// The Kernel no longer hard-codes any assistant persona constant.
// persistScaffoldedAgents now writes systemPrompt from the app AgentScaffoldSpec.

import {
	findMessage,
	findOrCreateDirectThread,
	insertMessage,
	insertThread,
	listInbox,
} from "@hyperidle/conversation";
import {
	constantTimeStringEqual,
	type HyperIdleEnv,
	requireBoundary,
} from "@hyperidle/shared/http";
import { findUser, insertUser, listUsers, updateUser } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import { validateBody } from "../middleware/validate.js";
import type { HarnessCapabilityReader } from "../services/harness-capability-read-model.js";
import { createAssistantSoulRoutes } from "./assistant.js";

// AU19 Increment 1c: `org`'s `OrgUserDirectory` port (Mechanism C), wired to
// the real `user-store.ts` function references unchanged (no behavior change).
// AU19 Increment 1c / AU20 Am11: adapter so `findUser({id})` satisfies `getUserById`.
const orgUsers = {
	getUserById: (db: HyperIdleDb, id: string) => findUser(db, { id }),
	insertUser,
};

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
 *
 * @lore R2: email is optional — setup flow no longer requires it.
 * The email column is nullable in the DB schema.
 */
const createHumanUserSchema = z.object({
	name: z.string().min(1).max(200),
	email: z.string().email().max(200).optional(),
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
 *
 * AK6 T8: eventBus added so user_created event can be emitted after persist.
 */
export function createUserSetupRoute(db: HyperIdleDb, eventBus: EventBus): Hono {
	const router = new Hono();

	router.post("/", requireBoundary({ kind: "public-data" }), async (c) => {
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
		const existingHuman = await findUser(db, { kind: "human" });

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
			// Idempotent: return existing human user with 200.
			// AK6 P4 CRITICAL-1: wrap in { user } to match the 201 shape so
			// callers (SetupFlow, tests) can read .user.id uniformly.
			return c.json({ user: existingHuman }, 200);
		}

		// No human user exists — allow unauthenticated creation (setup mode)
		const { name, email } = parsed.data;
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		await insertUser(db, {
			id,
			kind: "human",
			name,
			email,
			role: "founder",
			status: "active",
			createdAt: now,
		});

		// AC-1 AD8b: Create a per-user assistant agent at registration via app defaults.
		// AK6 T8: Route through scaffoldAgents — app defaults decide the persona.
		// The Kernel persists via persistScaffoldedAgents (single writer, idHint=ast-${id}).
		// BUILTIN_ASSISTANT_SYSTEM_PROMPT removed — persona is now app-owned.
		const specs = resolveAgentScaffoldSpecs({
			trigger: "user_assistant",
			teamName: null,
			functions: null,
			role: null,
			name: null,
			ownerUserId: id,
			ownerUserName: name,
		});

		const { agentIds } = await persistScaffoldedAgents(db, orgUsers, null, specs);
		const assistantAgentId = agentIds[0] ?? `ast-${id}`;

		// AK6 T8: emit user_created event AFTER human user + assistant are both persisted.
		eventBus.emit({
			type: "user_created",
			streamId: id,
			userId: id,
			assistantAgentId,
			at: now,
		});

		const created = await findUser(db, { id });
		return c.json({ user: created }, 201);
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
export function createUserRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	adapterPool?: HarnessCapabilityReader | null,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// GET / — List all users with active session counts. Optional `teamMembersId`
	// query param scopes the roster to one team (AU21 §9 Increment 2:
	// `CoreApiPort.users.listUsersByTeam`'s backing filter — `users.teamId`
	// actually stores `teamMembers.id`, per the AK4 two-hop lore). Optional
	// `kind` query param scopes to `users.kind` (AU27 Increment 1b —
	// `CoreApiPort.users.findSoleHumanUser`'s backing filter: `reply`'s
	// no-calling-thread fallback resolves the sole human this way).
	router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
		const teamMembersId = c.req.query("teamMembersId");
		const kind = c.req.query("kind");
		const filter = {
			...(teamMembersId ? { teamIds: [teamMembersId] } : {}),
			...(kind ? { kind } : {}),
		};
		const allUsers = await listUsers(db, filter);
		const activeSessions = await db.select().from(sessions).where(eq(sessions.state, "active"));

		const result = allUsers.map((user) => ({
			...user,
			activeSessions: activeSessions.filter((s) => s.agentId === user.id).length,
		}));

		return c.json(result);
	});

	// GET /:id — User detail with skills
	router.get("/:id", requireBoundary({ kind: "public-data" }), async (c) => {
		const userId = c.req.param("id");
		const user = await findUser(db, { id: userId });

		if (!user) {
			return c.json({ error: "User not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const skills = await db.select().from(userSkills).where(eq(userSkills.userId, userId));

		return c.json({ ...user, skills });
	});

	// PATCH /:id — Update human user profile (name + email)
	// @lore P4: Only the authenticated user can patch their own profile.
	// The userId from auth context must match the :id param — 403 otherwise.
	router.patch("/:id", requireBoundary({ kind: "principal-self" }), async (c) => {
		const targetId = c.req.param("id");
		const authenticatedUserId = c.get("userId");

		// Enforce self-only edit
		if (authenticatedUserId !== targetId) {
			return c.json(
				{ error: "Forbidden: can only update your own profile", code: API_ERROR_CODES.FORBIDDEN },
				403,
			);
		}

		const target = await findUser(db, { id: targetId });
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
			await updateUser(db, targetId, updates);
		}

		const updated = await findUser(db, { id: targetId });
		return c.json(updated, 200);
	});

	// PATCH /:id/skills/:skillId — Update autonomy level
	router.patch(
		"/:id/skills/:skillId",
		requireBoundary({ kind: "principal-self" }),
		validateBody(updateSkillSchema),
		async (c) => {
			const userId = c.req.param("id");
			const skillId = c.req.param("skillId");
			const body = c.req.valid("json" as never) as z.infer<typeof updateSkillSchema>;

			const [existing] = await db
				.select()
				.from(userSkills)
				.where(and(eq(userSkills.userId, userId), eq(userSkills.skillId, skillId)))
				.limit(1);

			if (!existing) {
				return c.json({ error: "User skill not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
			}

			const oldLevel = existing.autonomyLevel;
			const newLevel = body.autonomyLevel;

			await db
				.update(userSkills)
				.set({ autonomyLevel: newLevel })
				.where(and(eq(userSkills.userId, userId), eq(userSkills.skillId, skillId)));

			const [updated] = await db
				.select()
				.from(userSkills)
				.where(and(eq(userSkills.userId, userId), eq(userSkills.skillId, skillId)))
				.limit(1);

			if (oldLevel !== newLevel) {
				const threadId = crypto.randomUUID();
				const now = new Date().toISOString();

				await insertThread(db, {
					id: threadId,
					hostKind: "agent",
					hostId: userId,
					initiatorId: userId,
					participants: JSON.stringify([userId]),
					lastActiveAt: now,
					createdAt: now,
				});

				const itemId = crypto.randomUUID();
				await work.create(db, "item", {
					id: itemId,
					sourceAgentId: userId,
					layer: "meta",
					verb: "review",
					kind: "autonomy_change",
					title: `Autonomy level changed for skill ${skillId}`,
					body: `Autonomy level changed from ${oldLevel} to ${newLevel} for user ${userId}, skill ${skillId}`,
					threadId,
					createdAt: now,
				});

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
		},
	);

	// GET /:id/inbox — User's inbox with pagination
	// AC5 AF11: inbox is participant-scope (principal-self). Only the authenticated
	// user can read their own inbox — 403 for any other principal.
	router.get("/:id/inbox", requireBoundary({ kind: "principal-self" }), async (c) => {
		const userId = c.req.param("id");
		const principalId = c.get("userId");

		if (principalId !== userId) {
			return c.json(
				{ error: "Forbidden: can only access your own inbox", code: API_ERROR_CODES.FORBIDDEN },
				403,
			);
		}

		const user = await findUser(db, { id: userId });
		if (!user) {
			return c.json({ error: "User not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
		const offset = Number.parseInt(c.req.query("offset") ?? "0", 10) || 0;

		const probe = `%${escapeLikePattern(JSON.stringify(userId))}%`;
		const inboxRows = await listInbox(db, { participantProbe: probe, limit, offset });

		const matched = inboxRows.filter((row) => {
			try {
				const parts = JSON.parse(row.participants);
				return Array.isArray(parts) && parts.includes(userId);
			} catch {
				return false;
			}
		});

		return c.json({ messages: matched.map((row) => row.message), total: matched.length });
	});

	// POST /:id/inbox — Send message to user
	router.post(
		"/:id/inbox",
		requireBoundary({ kind: "principal-self" }),
		validateBody(sendMessageSchema),
		async (c) => {
			const recipientId = c.req.param("id");
			const body = c.req.valid("json" as never) as z.infer<typeof sendMessageSchema>;

			// @lore AF11-IDOR: senderId MUST come from c.get("userId") (auth middleware),
			// never from the X-Identity request header which is client-supplied.
			// Previous code accepted the header, enabling impersonation (WARNING-1).
			const senderId = c.get("userId");

			const user = await findUser(db, { id: recipientId });
			if (!user) {
				return c.json({ error: "User not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
			}

			const senderUser = await findUser(db, { id: senderId });
			if (!senderUser) {
				return c.json({ error: "Sender identity not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
			}

			const now = new Date().toISOString();

			const threadId = await findOrCreateDirectThread(db, senderId, recipientId, now);

			const messageId = crypto.randomUUID();
			const text = body.subject ? `${body.subject}\n\n${body.body}` : body.body;
			await insertMessage(db, {
				id: messageId,
				senderId,
				threadId,
				type: "plain",
				payload: JSON.stringify({ text }),
				clientKey: messageId,
				createdAt: now,
			});

			const created = await findMessage(db, { id: messageId });
			return c.json(created, 201);
		},
	);

	// AD8b Task 8 — system prompt CRUD: GET + PATCH /api/users/:userId/assistant
	// @lore AD8b: Mounted BEFORE the generic /:id handler if there is one.
	// In this router the /:id handler is a GET, so we mount /:userId/assistant
	// explicitly. Hono routes by registration order — the more specific path
	// /:id/assistant is registered before /:id to avoid swallowing.
	router.route("/:userId/assistant", createAssistantSoulRoutes(db, adapterPool ?? null));

	return router;
}
