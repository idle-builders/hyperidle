/**
 * L15 § 5.4 — single chokepoint for `plain`-type message writes.
 *
 * Used by:
 *   - POST /api/threads/:id/messages (when input.type === "plain")
 *   - POST /api/tasks/:id/request    (always — every request is a plain msg)
 *
 * Verdict / review / questionnaire branches stay in `threads.ts`; pulling
 * them in would either bloat the helper's surface or force the request
 * endpoint to pass through types it cannot produce.
 *
 * @lore L15 § 5.4 / CRITICAL-1: helper is plain-only by design. The
 * VerdictRaceConflict guard and re-open semantics live at the threads route
 * because they are verdict/review-specific.
 */

import { type HyperIdleDb, messages, threads } from "@hyperidle/db";
import type {
	EventBus,
	InlineRef,
	Message,
	RequestPayload,
	Thread,
	ThreadMessageAppendedEvent,
} from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { threadParticipantsSchema } from "../routes/threads-schema.js";
import { rowToMessage, rowToThread } from "./thread-row.js";

export interface AppendPlainInput {
	readonly threadId: string;
	readonly senderId: string;
	readonly clientKey: string;
	readonly payload: {
		readonly text: string;
		readonly refs?: ReadonlyArray<InlineRef>;
		readonly request?: RequestPayload;
	};
	/**
	 * Opt-in: when true, callers that already passed a higher-level authz
	 * chokepoint (e.g. `assertTaskParticipantAuthz` on the task-request route)
	 * MAY auto-append `senderId` to the thread's `participants[]` rather than
	 * receiving a 403. The legacy `POST /api/threads/:id/messages` route does
	 * NOT set this flag — it preserves the historical "must already be on the
	 * roster" semantic.
	 *
	 * @lore L15 review CRITICAL-2: without this flag, the SECOND same-team
	 * agent posting on a task whose thread was created by the FIRST writer
	 * gets 403 even though `assertTaskParticipantAuthz` approved them. The
	 * two gates contradicted; this resolves the conflict at the helper layer
	 * by trusting the caller-passed authz on opt-in.
	 */
	readonly autoAddParticipant?: boolean;
}

export type AppendPlainResult =
	| { ok: true; status: 200 | 201; message: Message; thread: Thread }
	| { ok: false; status: 403 | 404 | 409; code: string; message: string };

export function appendPlainMessage(
	db: HyperIdleDb,
	eventBus: EventBus,
	input: AppendPlainInput,
): AppendPlainResult {
	const threadRow = db.select().from(threads).where(eq(threads.id, input.threadId)).get();
	if (!threadRow) {
		return { ok: false, status: 404, code: "not_found", message: "Thread not found" };
	}

	const participants = threadParticipantsSchema.parse(JSON.parse(threadRow.participants));

	let effectiveParticipants = participants;
	if (!participants.includes(input.senderId)) {
		if (!input.autoAddParticipant) {
			return {
				ok: false,
				status: 403,
				code: "forbidden",
				message: "Sender is not a participant",
			};
		}
		effectiveParticipants = [...participants, input.senderId];
	}

	const payloadJson = JSON.stringify(input.payload);

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
		const samePayload = existing.payload === payloadJson;
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

	const participantsChanged = effectiveParticipants !== participants;
	db.transaction((tx) => {
		tx.insert(messages)
			.values({
				id: messageId,
				senderId: input.senderId,
				threadId: input.threadId,
				type: "plain",
				payload: payloadJson,
				clientKey: input.clientKey,
				createdAt: now,
			})
			.run();
		const update = participantsChanged
			? { lastActiveAt: now, participants: JSON.stringify(effectiveParticipants) }
			: { lastActiveAt: now };
		tx.update(threads).set(update).where(eq(threads.id, input.threadId)).run();
	});

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
		throw new Error("Created message missing after insert");
	}
	return {
		ok: true,
		status: 201,
		message: rowToMessage(created),
		thread: rowToThread(updatedThread),
	};
}
