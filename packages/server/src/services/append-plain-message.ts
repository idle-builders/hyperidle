/**
 * L15 §5.4 — `appendPlainMessage` helper.
 *
 * Single chokepoint for appending a `plain`-type message to an existing
 * thread. Used by:
 *  - POST /api/threads/:id/messages (plain branch)
 *  - POST /api/tasks/:id/request   (every request is a plain msg)
 *
 * Verdict / review / questionnaire branches stay at the threads route —
 * they have specialised authz, race guards, and event emission that L15's
 * request endpoint cannot produce.
 *
 * @lore L15 §5.4 (CRITICAL-1): the helper is plain-only. A "skip verdict
 * logic" flag would be a god-function antipattern. The threads route
 * retains its own verdict block (incl. VerdictRaceConflict) verbatim.
 */

import {
	type HyperIdleDb,
	type Message as DbMessage,
	type Thread as DbThread,
	messages,
	threads,
} from "@hyperidle/db";
import type {
	EventBus,
	InlineRef,
	Message,
	MessageType,
	RequestPayload,
	Thread,
	ThreadMessageAppendedEvent,
} from "@hyperidle/shared";
import type { HostKind } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { messageRowSchema, threadParticipantsSchema } from "../routes/threads-schema.js";

export interface AppendPlainInput {
	readonly threadId: string;
	readonly senderId: string;
	readonly clientKey: string;
	readonly payload: {
		readonly text: string;
		readonly refs?: ReadonlyArray<InlineRef>;
		readonly request?: RequestPayload;
	};
}

export type AppendPlainResult =
	| { ok: true; status: 200 | 201; message: Message; thread: Thread }
	| { ok: false; status: 403 | 404 | 409 | 500; code: string; message: string };

function rowToThread(row: DbThread): Thread {
	const participants = threadParticipantsSchema.parse(JSON.parse(row.participants));
	return {
		id: row.id,
		hostKind: row.hostKind as HostKind,
		hostId: row.hostId,
		initiatorId: row.initiatorId,
		participants,
		pinned: row.pinned === 1,
		resolvedAt: row.resolvedAt,
		lastActiveAt: row.lastActiveAt,
		createdAt: row.createdAt,
	};
}

// @lore L15 simplification-scan MF2: the prior defensive throw was unreachable
// — the helper only inserts `type: 'plain'` rows ten lines below. Use an
// exhaustive switch (matching threads.ts:rowToMessage) so the type checker
// flags any new MessageType variant instead of a runtime throw.
function rowToMessage(row: DbMessage): Message {
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

export function appendPlainMessage(
	db: HyperIdleDb,
	eventBus: EventBus,
	input: AppendPlainInput,
): AppendPlainResult {
	// 1. Thread row lookup (404 if missing).
	const threadRow = db.select().from(threads).where(eq(threads.id, input.threadId)).get();
	if (!threadRow) {
		return { ok: false, status: 404, code: "not_found", message: "Thread not found" };
	}

	let participants: ReadonlyArray<string>;
	try {
		participants = threadParticipantsSchema.parse(JSON.parse(threadRow.participants));
	} catch {
		return {
			ok: false,
			status: 500,
			code: "internal_error",
			message: "Thread participants column is malformed",
		};
	}

	// 2. Participant authz.
	if (!participants.includes(input.senderId)) {
		return { ok: false, status: 403, code: "forbidden", message: "Sender is not a participant" };
	}

	// 3. Idempotency lookup.
	const existing = db
		.select()
		.from(messages)
		.where(
			and(
				eq(messages.threadId, input.threadId),
				eq(messages.senderId, input.senderId),
				eq(messages.clientKey, input.clientKey),
			),
		)
		.get();
	if (existing) {
		const sameType = existing.type === "plain";
		const samePayload = existing.payload === JSON.stringify(input.payload);
		if (!(sameType && samePayload)) {
			return {
				ok: false,
				status: 409,
				code: "idempotency_conflict",
				message: "clientKey already used with a different payload",
			};
		}
		return {
			ok: true,
			status: 200,
			message: rowToMessage(existing),
			thread: rowToThread(threadRow),
		};
	}

	const now = new Date().toISOString();
	const messageId = crypto.randomUUID();

	try {
		db.transaction((tx) => {
			tx.insert(messages)
				.values({
					id: messageId,
					senderId: input.senderId,
					threadId: input.threadId,
					type: "plain",
					payload: JSON.stringify(input.payload),
					clientKey: input.clientKey,
					createdAt: now,
				})
				.run();
			tx.update(threads)
				.set({ lastActiveAt: now })
				.where(eq(threads.id, input.threadId))
				.run();
		});
	} catch (cause) {
		return {
			ok: false,
			status: 500,
			code: "internal_error",
			message: `Failed to append message: ${String(cause)}`,
		};
	}

	const appendedEvent: ThreadMessageAppendedEvent = {
		type: "thread_message_appended",
		streamId: input.threadId,
		threadId: input.threadId,
		messageId,
		messageType: "plain",
		senderId: input.senderId,
		timestamp: Date.now(),
	};
	eventBus.emit(appendedEvent);

	const updatedThread = db.select().from(threads).where(eq(threads.id, input.threadId)).get();
	const created = db.select().from(messages).where(eq(messages.id, messageId)).get();
	if (!(updatedThread && created)) {
		return {
			ok: false,
			status: 500,
			code: "internal_error",
			message: "Created message missing",
		};
	}
	return {
		ok: true,
		status: 201,
		message: rowToMessage(created),
		thread: rowToThread(updatedThread),
	};
}
