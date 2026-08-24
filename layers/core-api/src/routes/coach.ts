/**
 * L21 — GET /api/threads/coach
 *
 * Resolve-or-create the current user's assistant thread.
 * The assistant thread: hostKind="user", hostId=<userId>, pinned=1.
 *
 * @lore L21: The system agent id is "seed-agent-cos" (existing seed), NOT
 * "agent-coc". The architecture plan used "agent-coc" but the reviewer
 * feedback and the actual seed data both use "seed-agent-cos". This is the
 * well-known constant for the system agent.
 *
 * @lore L21: This endpoint MUST be mounted BEFORE the generic /:id route in
 * the threads router so that GET /api/threads/coach is not swallowed by the
 * /:id handler as if "coach" were a thread id. See app.ts for mount order.
 *
 * @lore AD8a: Route path /api/threads/coach and function name createCoachRoutes stay
 * as-is — AD8b renames the route to /api/threads/assistant and the file to assistant.ts.
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

/** @lore L21: The system agent uses the existing seed-agent-cos id (not "agent-coc"). */
// @lore AD8a: COC_AGENT_ID and COC_AGENT_ROLE stay as-is — AD8b renames them when restructuring this file.
const COC_AGENT_ID = "seed-agent-cos";
const COC_AGENT_DISPLAY_NAME = "System Agent";
const COC_AGENT_ROLE = "assistant";

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
	// @lore AF4/§4d + Z8-166: plain-branch persisted payload drifts from the
	// shared `PlainPayload` type (schema-only `blockId`; optional mentionRef
	// `sourceText`). Routed to the conversations WP (Batch 6). `parsed.payload`
	// is Zod-validated, server-persisted read-back data surfaced into the domain
	// type at this INTERNAL DB-row→domain mapping (NOT a request boundary). No
	// behavior change.
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
 * Build the identities map for the coach thread response.
 * Looks up the user's display name from the agents table (fall back to "You").
 * The CoC agent always displays as "System Agent". @lore AD8a: display name updated from "Chief of Staff".
 */
async function buildIdentities(
	db: HyperIdleDb,
	userId: string,
): Promise<Record<string, { name: string; role?: string }>> {
	const userRow = await findUser(db, { id: userId });
	const userName = userRow?.name ?? "You";
	const userRole = userRow?.role;

	const identities: Record<string, { name: string; role?: string }> = {
		[userId]: { name: userName, ...(userRole ? { role: userRole } : {}) },
		[COC_AGENT_ID]: { name: COC_AGENT_DISPLAY_NAME, role: COC_AGENT_ROLE },
	};
	return identities;
}

export function createCoachRoutes(db: HyperIdleDb, _eventBus: EventBus): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	/**
	 * GET /api/threads/coach
	 *
	 * Returns the current user's coach thread (pinned, hostKind="user").
	 * Creates one if it does not exist.
	 *
	 * @lore L21: The "create if absent" pattern intentionally does NOT emit a
	 * thread_created event on the event bus for the auto-creation case. The
	 * coach thread is a persistent fixture — agents are not expected to react
	 * to its creation the way they would to a new task thread. This keeps the
	 * event stream clean.
	 */
	router.get("/", async (c) => {
		// @lore AF11-IDOR: identity for data-scoping MUST come from c.get("userId")
		// (the authenticated Principal set by auth middleware), never from X-Identity
		// header which is client-supplied and enables IDOR. See AF11 fix.
		const userId = c.get("userId");

		// Find existing pinned coach thread for this user.
		const existing = await findThread(db, { host: { kind: "user", id: userId }, pinned: true });

		if (existing) {
			const messageRows = await listMessages(db, { threadId: existing.id });

			return c.json({
				thread: rowToThread(existing),
				messages: messageRows.map(rowToMessage),
				headMessageId: null,
				identities: await buildIdentities(db, userId),
			});
		}

		// Create coach thread on first use.
		const threadId = `thr-coach-${userId}`;
		const now = new Date().toISOString();
		const participantsList = [userId, COC_AGENT_ID].sort();

		await insertThread(db, {
			id: threadId,
			hostKind: "user",
			hostId: userId,
			initiatorId: userId,
			participants: JSON.stringify(participantsList),
			pinned: true,
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
				pinned: true,
				resolvedAt: null,
				lastActiveAt: now,
				createdAt: now,
			}),
			messages: [],
			headMessageId: null,
			identities: await buildIdentities(db, userId),
		});
	});

	return router;
}
