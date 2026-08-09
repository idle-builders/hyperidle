/**
 * AD8b Task 4 + 8 — GET /api/threads/assistant + system prompt CRUD.
 *
 * Routes:
 *   GET /api/threads/assistant         — resolve-or-create the assistant thread
 *   GET /api/users/:userId/assistant   — get assistant agent for user
 *   PATCH /api/users/:userId/assistant — update system prompt
 *
 * AC-6 (Reviewer C1 fix): Thread starts pinned=false. Query by
 * hostKind="user" + hostId=userId, NOT by pinned=true.
 *
 * @lore AD8b: The coach route (L21) queried WHERE pinned=true. This was
 * wrong for the new assistant design where threads start unpinned and are
 * pinned only after the assistant responds. We query by hostKind="user" +
 * hostId=userId + participants includes the assistant agent.
 */

import type {
	AgentOrchestrationPort,
	AgentOrchestrationRunConfigPatch,
} from "@hyperidle/api-contract";
import { findThread, insertThread, listMessages } from "@hyperidle/conversation";
import { type HyperIdleDb, resolveAgentScaffoldSpecs } from "@hyperidle/db";
import { persistScaffoldedAgents } from "@hyperidle/org";
import {
	API_ERROR_CODES,
	type EventBus,
	type HarnessCapabilityReader,
	type HostKind,
	type Message,
	type MessageType,
	type PlainPayload,
	type RedactedPayload,
	type Thread,
} from "@hyperidle/shared";
// AK6 T8: BUILTIN_ASSISTANT_SYSTEM_PROMPT removed — persona comes from app defaults.
// The Kernel no longer hard-codes any assistant persona constant. Lazy-create paths
// now call app scaffolding + persistScaffoldedAgents, identical
// to POST /api/users. DEFAULT_AGENT_MODEL_ID/PROVIDER removed (persistScaffoldedAgents owns those fields).
import { type HyperIdleEnv, requireBoundary } from "@hyperidle/shared/http";
import { findUser, insertUser } from "@hyperidle/users";
import { Hono } from "hono";
import z from "zod";
import { buildSeamBackedAgentRunConfigWriter } from "../services/agent-orchestration-port-composition.js";
import { messageRowSchema, threadParticipantsSchema } from "./threads-schema.js";
import { validateAgentConfig } from "./validate-agent-config.js";

// @lore AF11-IDOR: SENDER_HEADER and readSenderId removed. Authorization paths
// (thread scoping, participant checks) MUST derive identity from c.get("userId")
// (the authenticated Principal set by auth middleware). X-Identity is a client-
// supplied header — using it for authz allows IDOR.
const SYSTEM_PROMPT_MAX_LENGTH = 50_000;

const patchSoulPromptSchema = z.object({
	systemPrompt: z.string().max(SYSTEM_PROMPT_MAX_LENGTH).optional(),
	// AR4c: optional harness+model triple — validated by validateAgentConfig on save
	harnessType: z.string().nullable().optional(),
	modelId: z.string().nullable().optional(),
	modelProvider: z.string().nullable().optional(),
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
): Promise<Record<string, { name: string; role?: string; isAgent?: boolean }>> {
	const userRow = await findUser(db, { id: userId });
	const userName = userRow?.name ?? "You";
	const userRole = userRow?.role;

	const agentRow = await findUser(db, { id: assistantAgentId });
	const agentName = agentRow?.name ?? "Assistant";
	const agentRole = agentRow?.role ?? "assistant";

	// @lore AH6: isAgent=true must be included in the identity so CommentRow renders
	// data-sender-kind="ai" on the message bubble — the Playwright selector used in e2e tests.
	const identities: Record<string, { name: string; role?: string; isAgent?: boolean }> = {
		[userId]: { name: userName, ...(userRole ? { role: userRole } : {}) },
		[assistantAgentId]: { name: agentName, role: agentRole, isAgent: true },
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
		// legitimate for message attribution (e.g., PATCH system-prompt sender).
		const userId = c.get("userId");
		const assistantAgentId = assistantAgentIdForUser(userId);

		// AC-6 Reviewer C1: Query by hostKind="user" + hostId, NOT by pinned.
		const existing = await findThread(db, { host: { kind: "user", id: userId } });

		if (existing) {
			const messageRows = await listMessages(db, { threadId: existing.id });

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

		await insertThread(db, {
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
// System prompt CRUD: GET + PATCH /api/users/:userId/assistant
// ---------------------------------------------------------------------------

/**
 * Create routes for assistant system prompt management.
 * Mounted at /api/users/:userId/assistant in the users router.
 *
 * AC-2:
 *   GET  — returns { id, name, systemPrompt }
 *   PATCH — updates systemPrompt; 400 for >50_000 chars; 403 for other user
 */
export function createAssistantSoulRoutes(
	db: HyperIdleDb,
	adapterPool: HarnessCapabilityReader | null,
	agentOrchestration: AgentOrchestrationPort,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// AU19 Increment 1c / AU20 Am11: `org`'s `OrgUserDirectory` port (Mechanism C),
	// wired via adapter so `findUser({id})` satisfies `getUserById`.
	// AU26 G1 (§D-L) / AU31 §2.2: `persistScaffoldedAgents` also stamps the run
	// config, which left `users` for `agent_run_config` — now reached through
	// the seam (`buildSeamBackedAgentRunConfigWriter`) instead of a direct
	// `@hyperidle/agent-run-config` import.
	const orgUsers = {
		getUserById: (db2: HyperIdleDb, id: string) => findUser(db2, { id }),
		insertUser,
		...buildSeamBackedAgentRunConfigWriter(agentOrchestration),
	};

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
		const userRow = await findUser(db, { id: targetUserId });
		if (!userRow) {
			return c.json({ error: "User not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		// Find the assistant agent for this user; create it lazily if absent.
		// @lore AD8b: The assistant agent is normally created at user registration.
		// This lazy-create path handles legacy users and direct-DB seeded test users.
		const assistantAgentId = assistantAgentIdForUser(targetUserId);
		let agentRow = await findUser(db, { id: assistantAgentId });

		if (!agentRow) {
			// @lore AU3: Lazy-create routes through app defaults (identical to POST /api/users).
			// @lore AH3 N2: Lazy-create handles legacy/test users seeded directly into DB.
			// @lore AK1: systemPrompt is the post-rename persona field (harness-vocab rename).
			// persistScaffoldedAgents is the single writer of agent user rows (AK6 hard-rule).
			const specs = resolveAgentScaffoldSpecs({
				trigger: "user_assistant",
				teamName: null,
				functions: null,
				role: null,
				name: null,
				ownerUserId: targetUserId,
				ownerUserName: userRow.name,
			});
			await persistScaffoldedAgents(db, orgUsers, null, specs);
			agentRow = await findUser(db, { id: assistantAgentId });
		}

		if (!agentRow) {
			return c.json(
				{ error: "Failed to create assistant agent", code: API_ERROR_CODES.NOT_FOUND },
				404,
			);
		}

		// @lore AU26 G1 (§D-L): the assistant row is an AI user with agent
		// semantics, so its run config moved with every other agent's.
		const runConfig = await agentOrchestration.runConfig.read(assistantAgentId);

		return c.json({
			id: agentRow.id,
			name: agentRow.name,
			harnessType: runConfig.harnessType,
			modelId: runConfig.modelId,
			modelProvider: runConfig.modelProvider,
			systemPrompt: runConfig.systemPrompt,
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
		if (
			parsed.data.systemPrompt !== undefined &&
			parsed.data.systemPrompt.length > SYSTEM_PROMPT_MAX_LENGTH
		) {
			return c.json(
				{
					error: `systemPrompt must be at most ${SYSTEM_PROMPT_MAX_LENGTH} characters`,
					code: API_ERROR_CODES.VALIDATION_ERROR,
				},
				400,
			);
		}

		// AR4c: validate harness+model triple BEFORE touching the DB — fail fast.
		// @lore AR4c: We validate BEFORE creating/loading the agent row to ensure a
		// bad triple never contaminates the row (422 = validation error, no side effect).
		const harnessType = parsed.data.harnessType !== undefined ? parsed.data.harnessType : undefined;
		const modelProvider =
			parsed.data.modelProvider !== undefined ? parsed.data.modelProvider : undefined;
		const modelId = parsed.data.modelId !== undefined ? parsed.data.modelId : undefined;

		if (harnessType !== undefined || modelProvider !== undefined || modelId !== undefined) {
			const validationError = validateAgentConfig(
				harnessType ?? null,
				modelProvider ?? null,
				modelId,
				adapterPool,
			);
			if (validationError) {
				return c.json({ error: validationError.error, code: validationError.code }, 422);
			}
		}

		// Verify the target user exists
		const userRow = await findUser(db, { id: targetUserId });
		if (!userRow) {
			return c.json({ error: "User not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		// Find or create assistant agent (lazy creation for legacy/test users)
		const assistantAgentId = assistantAgentIdForUser(targetUserId);
		let agentRow = await findUser(db, { id: assistantAgentId });

		if (!agentRow) {
			// @lore AU3: Lazy-create (PATCH path) routes through app defaults (same as GET path).
			// @lore AH3 N2: Lazy-create (PATCH path) handles legacy/test users seeded directly into DB.
			// @lore AK1: systemPrompt is the post-rename persona field (harness-vocab rename).
			const specs = resolveAgentScaffoldSpecs({
				trigger: "user_assistant",
				teamName: null,
				functions: null,
				role: null,
				name: null,
				ownerUserId: targetUserId,
				ownerUserName: userRow.name,
			});
			await persistScaffoldedAgents(db, orgUsers, null, specs);
			agentRow = await findUser(db, { id: assistantAgentId });
		}

		if (!agentRow) {
			return c.json(
				{ error: "Failed to create assistant agent", code: API_ERROR_CODES.NOT_FOUND },
				404,
			);
		}

		// Build the patch — only include fields explicitly provided in the request.
		// systemPrompt: if omitted, preserve existing value.
		// harness/model: if provided, update; if omitted, preserve existing.
		//
		// @lore AU26 G1 (§D-L): all four writable fields left `users` for
		// `agent_run_config`, so this handler no longer writes the `users` row at
		// all — it delegates the whole persist down to the owning Service. The
		// route stays core-hosted (§D-A rule 3) and the wire shape is unchanged.
		const patch: AgentOrchestrationRunConfigPatch = {};

		if (parsed.data.systemPrompt !== undefined) {
			patch.systemPrompt = parsed.data.systemPrompt;
		}
		if (harnessType !== undefined) {
			patch.harnessType = harnessType;
		}
		if (modelId !== undefined) {
			patch.modelId = modelId;
		}
		if (modelProvider !== undefined) {
			patch.modelProvider = modelProvider;
		}

		if (Object.keys(patch).length > 0) {
			await agentOrchestration.runConfig.write(assistantAgentId, patch);
		}

		// Re-read the updated config to return accurate values
		const updatedRunConfig = await agentOrchestration.runConfig.read(assistantAgentId);

		return c.json({
			id: agentRow.id,
			name: agentRow.name,
			systemPrompt: updatedRunConfig.systemPrompt,
			harnessType: updatedRunConfig.harnessType,
			modelId: updatedRunConfig.modelId,
			modelProvider: updatedRunConfig.modelProvider,
		});
	});

	return router;
}
