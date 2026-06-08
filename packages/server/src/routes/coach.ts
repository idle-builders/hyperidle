/**
 * L21 — GET /api/threads/coach
 *
 * Resolve-or-create the current user's assistant thread.
 * The assistant thread: hostKind="user", hostId=<userId>, pinned=1.
 *
 * @lore L21: The system agent id is "seed-agent-cos" (existing seed), NOT
 * "agent-coc". The architecture plan used "agent-coc" but the reviewer
 * feedback and the actual seed data both use "seed-agent-cos". This is the
 * well-known constant for the system agent (formerly Chief of Staff).
 *
 * @lore L21: This endpoint MUST be mounted BEFORE the generic /:id route in
 * the threads router so that GET /api/threads/coach is not swallowed by the
 * /:id handler as if "coach" were a thread id. See app.ts for mount order.
 *
 * @lore AD8a: Route path /api/threads/coach and function name createCoachRoutes stay
 * as-is — AD8b renames the route to /api/threads/assistant and the file to assistant.ts.
 */

import { type HyperIdleDb, messages, threads, users } from "@hyperidle/db";
import type { EventBus, HostKind, Message, MessageType, Thread } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { messageRowSchema, threadParticipantsSchema } from "./threads-schema.js";

const SENDER_HEADER = "X-Identity";

/** @lore L21: The system agent uses the existing seed-agent-cos id (not "agent-coc"). */
// @lore AD8a: COC_AGENT_ID and COC_AGENT_ROLE stay as-is — AD8b renames them when restructuring this file.
const COC_AGENT_ID = "seed-agent-cos";
const COC_AGENT_DISPLAY_NAME = "System Agent";
const COC_AGENT_ROLE = "chief_of_staff";

/**
 * Read the sender id. Prefers X-Identity header; falls back to the auth context
 * userId set by createAuthMiddleware(db).
 *
 * @lore M3 A6: DEFAULT_FOUNDER_ID constant deleted. The fallback is now the
 * auth context userId (resolved from users WHERE kind = 'human' LIMIT 1). This
 * ensures the coach thread is created for the configured founder, not a hardcoded literal.
 */
function readSenderId(c: {
	req: { header: (k: string) => string | undefined };
	get: (k: "userId") => string;
}): string {
	return c.req.header(SENDER_HEADER) ?? c.get("userId");
}

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
	switch (parsed.type) {
		case "plain":
			return { ...base, type: "plain", payload: parsed.payload };
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
 * The CoC agent always displays as "Chief of Staff".
 */
async function buildIdentities(
	db: HyperIdleDb,
	userId: string,
): Promise<Record<string, { name: string; role?: string }>> {
	const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
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
		const userId = readSenderId(c);

		// Find existing pinned coach thread for this user.
		const [existing] = await db
			.select()
			.from(threads)
			.where(
				and(eq(threads.hostKind, "user"), eq(threads.hostId, userId), eq(threads.pinned, true)),
			)
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
				identities: await buildIdentities(db, userId),
			});
		}

		// Create coach thread on first use.
		const threadId = `thr-coach-${userId}`;
		const now = new Date().toISOString();
		const participantsList = [userId, COC_AGENT_ID].sort();

		await db.insert(threads).values({
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
