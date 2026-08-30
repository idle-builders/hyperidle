/**
 * AD8b Task 4 — GET /api/threads/assistant.
 *
 * Routes:
 *   GET /api/threads/assistant — resolve-or-create the assistant thread
 *
 * The `/api/users/:userId/assistant` GET/PATCH pair that used to live here is
 * gone. It was a second agent editor for assistants only, which existed because
 * the persona was a column with an assistant-shaped guard on it. The persona is
 * a knowledge document now, so `/api/agents/:id` edits every agent and the one
 * knowledge edit endpoint edits every identity.
 *
 * AC-6 (Reviewer C1 fix): Thread starts pinned=false. Query by
 * hostKind="user" + hostId=userId, NOT by pinned=true.
 *
 * @lore AD8b: The coach route (L21) queried WHERE pinned=true. This was
 * wrong for the new assistant design where threads start unpinned and are
 * pinned only after the assistant responds. We query by hostKind="user" +
 * hostId=userId + participants includes the assistant agent.
 */

import { findThread, insertThread, listMessages } from "@hyperidle/conversation";
import type { HyperIdleDb } from "@hyperidle/db";
import type {
	HostKind,
	Message,
	MessageType,
	PlainPayload,
	RedactedPayload,
	Thread,
} from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type { EventBus } from "@hyperidle/event-bus";
import { findUser } from "@hyperidle/users";
import { Hono } from "hono";
import { messageRowSchema, threadParticipantsSchema } from "./threads-schema.js";

// @lore AF11-IDOR: SENDER_HEADER and readSenderId removed. Authorization paths
// (thread scoping, participant checks) MUST derive identity from c.get("userId")
// (the authenticated Principal set by auth middleware). X-Identity is a client-
// supplied header — using it for authz allows IDOR.

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
	router.get("/", async (c) => {
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
