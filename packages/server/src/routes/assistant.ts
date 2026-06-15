/**
 * AD8b Task 4 + 8 — GET /api/threads/assistant + soul prompt CRUD.
 *
 * Routes:
 *   GET /api/threads/assistant         — resolve-or-create the assistant thread
 *   GET /api/users/:userId/assistant   — get assistant agent for user
 *   PATCH /api/users/:userId/assistant — update soul prompt
 *
 * AC-6 (Reviewer C1 fix): Thread starts pinned=false. Query by
 * hostKind="user" + hostId=userId, NOT by pinned=true.
 *
 * @lore AD8b: The coach route (L21) queried WHERE pinned=true. This was
 * wrong for the new assistant design where threads start unpinned and are
 * pinned only after the assistant responds. We query by hostKind="user" +
 * hostId=userId + participants includes the assistant agent.
 */

import { type HyperIdleDb, messages, threads, users } from "@hyperidle/db";
import {
	API_ERROR_CODES,
	DEFAULT_AGENT_MODEL_ID,
	DEFAULT_AGENT_MODEL_PROVIDER,
	type EventBus,
	type HostKind,
	type Message,
	type MessageType,
	type PlainPayload,
	type RedactedPayload,
	type Thread,
} from "@hyperidle/shared";

/**
 * AH3: Default soul prompt for lazy-created assistant agents.
 * @lore AH3 N2: Lazy-create paths must also set harness/model/soulPrompt defaults
 * to match what registration creates. Without this, a test user seeded directly
 * into the DB (bypassing registration) would get a null-harness assistant agent.
 */
const DEFAULT_ASSISTANT_SOUL_PROMPT =
	"You are a helpful AI assistant. Be concise, direct, and thoughtful in your responses.";

import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { messageRowSchema, threadParticipantsSchema } from "./threads-schema.js";

// @lore AF11-IDOR: SENDER_HEADER and readSenderId removed. Authorization paths
// (thread scoping, participant checks) MUST derive identity from c.get("userId")
// (the authenticated Principal set by auth middleware). X-Identity is a client-
// supplied header — using it for authz allows IDOR.
const SOUL_PROMPT_MAX_LENGTH = 50_000;

const patchSoulPromptSchema = z.object({
	soulPrompt: z.string().max(SOUL_PROMPT_MAX_LENGTH),
});

function rowToThread(row: {
	id: string;
	hostKind: string;
	hostId: string;
	initiatorId: string;
	participants: string;
	pinned: boolean | number;
	resolvedAt: string | null;
	lastActiveAt: string;
	createdAt: string;
}): Thread {
	const participants = threadParticipantsSchema.parse(JSON.parse(row.participants));
	return {
		id: row.id,
		hostKind: row.hostKind as HostKind,
		hostId: row.hostId,
		initiatorId: row.initiatorId,
		participants,
		pinned: row.pinned === true,
		resolvedAt: row.resolvedAt,
		lastActiveAt: row.lastActiveAt,
		createdAt: row.createdAt,
	};
}

function rowToMessage(row: {
	id: string;
	threadId: string;
	senderId: string;
	clientKey: string;
	deletedAt: string | null;
	redactedAt: string | null;
	resolvedAt: string | null;
	createdAt: string;
	type: string;
	payload: string;
}): Message {
	const parsed = messageRowSchema.parse({
		type: row.type as MessageType,
		payload: JSON.parse(row.payload),
	});
	const base = {
		id: row.id,
		threadId: row.threadId,
		senderId: row.senderId,
		clientKey: row.clientKey,
		deletedAt: row.deletedAt,
		redactedAt: row.redactedAt,
		resolvedAt: row.resolvedAt,
		createdAt: row.createdAt,
	} as const;
	// @lore AF4/§4d + Z8-166: the `plain` branch's persisted zod payload drifts
	// from the shared `PlainPayload` type (schema carries `blockId`; mentionRef
	// `sourceText` is optional though the domain type requires it). Reconciling
	// changes the persisted/wire shape → routed to the conversations WP (Batch 6).
	// `parsed.payload` is Zod-validated, server-persisted read-back data, surfaced
	// into the domain type at this INTERNAL DB-row→domain mapping (NOT a request
	// boundary). Behaviour unchanged. Review/questionnaire/verdict arms match
	// nominally and need no bridge.
	switch (parsed.type) {
		case "plain":
			return {
				...base,
				type: "plain",
				payload: parsed.payload as PlainPayload | RedactedPayload,
			};
		case "review":
			return { ...base, type: "review", payload: parsed.payload };
		case "questionnaire":
			return { ...base, type: "questionnaire", payload: parsed.payload };
		case "verdict":
			return { ...base, type: "verdict", payload: parsed.payload };
	}
}

/**
 * Find the assistant agent for a given user. The assistant agent is the
 * ai-kind user with role="assistant" that was created for this user at
 * registration. It is linked via the assistant thread's participant list.
 *
 * @lore AD8b: Since the assistant agent ID is derived deterministically as
 * "ast-{userId}", we can look it up directly without a join.
 */
function assistantAgentIdForUser(userId: string): string {
	return `ast-${userId}`;
}

/**
 * Build the identities map for the assistant thread response.
 */
async function buildIdentities(
	db: HyperIdleDb,
	userId: string,
	assistantAgentId: string,
): Promise<Record<string, { name: string; role?: string }>> {
	const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	const userName = userRow?.name ?? "You";
	const userRole = userRow?.role;

	const [agentRow] = await db.select().from(users).where(eq(users.id, assistantAgentId)).limit(1);
	const agentName = agentRow?.name ?? "Assistant";
	const agentRole = agentRow?.role ?? "assistant";

	const identities: Record<string, { name: string; role?: string }> = {
		[userId]: { name: userName, ...(userRole ? { role: userRole } : {}) },
		[assistantAgentId]: { name: agentName, role: agentRole },
	};
	return identities;
}

// ---------------------------------------------------------------------------
// Thread route: GET /api/threads/assistant
// ---------------------------------------------------------------------------

export function createAssistantThreadRoute(
	db: HyperIdleDb,
	_eventBus: EventBus,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	/**
	 * GET /api/threads/assistant
	 *
	 * Resolve-or-create the current user's assistant thread.
	 * AC-6: Thread starts pinned=false. Query by hostKind="user" + hostId
	 * (not by pinned=true).
	 *
	 * @lore AD8b: The thread is found by hostKind="user" + hostId=userId.
	 * A user may have at most one assistant thread (ensured by create-at-most-once logic).
	 */
	// Row 5: GET /api/threads/assistant — S (principal-self: thread is scoped to principal)
	router.get("/", requireBoundary({ kind: "principal-self" }), async (c) => {
		// @lore AF11-IDOR: identity for data-scoping MUST come from c.get("userId")
		// (the authenticated Principal set by auth middleware), never from X-Identity
		// header which is client-supplied and enables IDOR. readSenderId is only
		// legitimate for message attribution (e.g., PATCH soul-prompt sender).
		const userId = c.get("userId");
		const assistantAgentId = assistantAgentIdForUser(userId);

		// AC-6 Reviewer C1: Query by hostKind="user" + hostId, NOT by pinned.
		const [existing] = await db
			.select()
			.from(threads)
			.where(and(eq(threads.hostKind, "user"), eq(threads.hostId, userId)))
			.limit(1);

		if (existing) {
			const messageRows = await db
				.select()
				.from(messages)
				.where(eq(messages.threadId, existing.id));

			return c.json({
				thread: rowToThread(existing),
				messages: messageRows.map(rowToMessage),
				headMessageId: null,
				identities: await buildIdentities(db, userId, assistantAgentId),
			});
		}

		// Create assistant thread on first use. Starts pinned=false (AC-6 Reviewer C1).
		const threadId = `thr-ast-${userId}`;
		const now = new Date().toISOString();
		const participantsList = [userId, assistantAgentId].sort();

		await db.insert(threads).values({
			id: threadId,
			hostKind: "user",
			hostId: userId,
			initiatorId: userId,
			participants: JSON.stringify(participantsList),
			pinned: false,
			resolvedAt: null,
			lastActiveAt: now,
			createdAt: now,
		});

		return c.json({
			thread: rowToThread({
				id: threadId,
				hostKind: "user",
				hostId: userId,
				initiatorId: userId,
				participants: JSON.stringify(participantsList),
				pinned: false,
				resolvedAt: null,
				lastActiveAt: now,
				createdAt: now,
			}),
			messages: [],
			headMessageId: null,
			identities: await buildIdentities(db, userId, assistantAgentId),
		});
	});

	return router;
}

// ---------------------------------------------------------------------------
// Soul prompt CRUD: GET + PATCH /api/users/:userId/assistant
// ---------------------------------------------------------------------------

/**
 * Create routes for assistant soul prompt management.
 * Mounted at /api/users/:userId/assistant in the users router.
 *
 * AC-2:
 *   GET  — returns { id, name, soulPrompt }
 *   PATCH — updates soulPrompt; 400 for >50_000 chars; 403 for other user
 */
export function createAssistantSoulRoutes(db: HyperIdleDb): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// Row 6: GET /api/users/:userId/assistant — S (principal-self: self-only guard below)
	// GET /api/users/:userId/assistant
	router.get("/", requireBoundary({ kind: "principal-self" }), async (c) => {
		const targetUserId = c.req.param("userId");
		// AF11 Hole 2: authorization derives from the authenticated Principal
		// (c.get("userId")), never from X-Identity header. The header may only
		// be used for message attribution (readSenderId), not for access control.
		const authenticatedUserId = c.get("userId");

		// Only the user can access their own assistant
		if (authenticatedUserId !== targetUserId) {
			return c.json(
				{ error: "Forbidden: can only access your own assistant", code: API_ERROR_CODES.FORBIDDEN },
				403,
			);
		}

		// Verify the target user exists
		const [userRow] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
		if (!userRow) {
			return c.json({ error: "User not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		// Find the assistant agent for this user; create it lazily if absent.
		// @lore AD8b: The assistant agent is normally created at user registration.
		// This lazy-create path handles legacy users and direct-DB seeded test users.
		const assistantAgentId = assistantAgentIdForUser(targetUserId);
		let [agentRow] = await db.select().from(users).where(eq(users.id, assistantAgentId)).limit(1);

		if (!agentRow) {
			const now = new Date().toISOString();
			// @lore AH3 N2: Lazy-create sets harness/model/soulPrompt defaults.
			await db.insert(users).values({
				id: assistantAgentId,
				kind: "ai",
				name: `${userRow.name}'s Assistant`,
				role: "assistant",
				agentCategory: "individual",
				status: "active",
				harnessType: "builtin",
				modelId: DEFAULT_AGENT_MODEL_ID,
				modelProvider: DEFAULT_AGENT_MODEL_PROVIDER,
				soulPrompt: DEFAULT_ASSISTANT_SOUL_PROMPT,
				maxConcurrentSessions: 1,
				createdAt: now,
			});
			[agentRow] = await db.select().from(users).where(eq(users.id, assistantAgentId)).limit(1);
		}

		if (!agentRow) {
			return c.json(
				{ error: "Failed to create assistant agent", code: API_ERROR_CODES.NOT_FOUND },
				404,
			);
		}

		return c.json({
			id: agentRow.id,
			name: agentRow.name,
			harnessType: agentRow.harnessType ?? null,
			modelId: agentRow.modelId ?? null,
			modelProvider: agentRow.modelProvider ?? null,
			soulPrompt: agentRow.soulPrompt ?? null,
		});
	});

	// Row 7: PATCH /api/users/:userId/assistant — S (principal-self: self-only guard below)
	// PATCH /api/users/:userId/assistant
	router.patch("/", requireBoundary({ kind: "principal-self" }), async (c) => {
		const targetUserId = c.req.param("userId");
		// AF11 Hole 2: use authenticated Principal for authorization, not header.
		const authenticatedUserId = c.get("userId");

		// Only the user can edit their own assistant
		if (authenticatedUserId !== targetUserId) {
			return c.json(
				{ error: "Forbidden: can only edit your own assistant", code: API_ERROR_CODES.FORBIDDEN },
				403,
			);
		}

		let rawBody: unknown;
		try {
			rawBody = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: API_ERROR_CODES.VALIDATION_ERROR }, 400);
		}

		const parsed = patchSoulPromptSchema.safeParse(rawBody);
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

		// Check length limit explicitly (Zod .max() gives a nice error but we
		// also re-check to ensure 400 even if Zod fails differently)
		if (parsed.data.soulPrompt.length > SOUL_PROMPT_MAX_LENGTH) {
			return c.json(
				{
					error: `soulPrompt must be at most ${SOUL_PROMPT_MAX_LENGTH} characters`,
					code: API_ERROR_CODES.VALIDATION_ERROR,
				},
				400,
			);
		}

		// Verify the target user exists
		const [userRow] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
		if (!userRow) {
			return c.json({ error: "User not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		// Find or create assistant agent (lazy creation for legacy/test users)
		const assistantAgentId = assistantAgentIdForUser(targetUserId);
		let [agentRow] = await db.select().from(users).where(eq(users.id, assistantAgentId)).limit(1);

		if (!agentRow) {
			const now = new Date().toISOString();
			// @lore AH3 N2: Lazy-create (PATCH path) also sets defaults.
			await db.insert(users).values({
				id: assistantAgentId,
				kind: "ai",
				name: `${userRow.name}'s Assistant`,
				role: "assistant",
				agentCategory: "individual",
				status: "active",
				harnessType: "builtin",
				modelId: DEFAULT_AGENT_MODEL_ID,
				modelProvider: DEFAULT_AGENT_MODEL_PROVIDER,
				soulPrompt: DEFAULT_ASSISTANT_SOUL_PROMPT,
				maxConcurrentSessions: 1,
				createdAt: now,
			});
			[agentRow] = await db.select().from(users).where(eq(users.id, assistantAgentId)).limit(1);
		}

		if (!agentRow) {
			return c.json(
				{ error: "Failed to create assistant agent", code: API_ERROR_CODES.NOT_FOUND },
				404,
			);
		}

		await db
			.update(users)
			.set({ soulPrompt: parsed.data.soulPrompt })
			.where(eq(users.id, assistantAgentId));

		return c.json({
			id: agentRow.id,
			name: agentRow.name,
			soulPrompt: parsed.data.soulPrompt,
		});
	});

	return router;
}
