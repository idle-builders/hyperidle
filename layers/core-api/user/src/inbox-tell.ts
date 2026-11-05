import { randomUUID } from "node:crypto";
import type { HyperIdleDb } from "@hyperidle/db";
import type { InboxReason } from "@hyperidle/domain-model";
import { insertInboxRow } from "./subscriptions-store.js";

/** One reason for a user to look at something. `key` makes the same wake one row. */
export interface InboxTell {
	readonly userId: string;
	readonly reason: InboxReason;
	readonly key: string;
	readonly changeId?: string;
	readonly subscriptionId?: string;
	readonly objectId?: string;
}

/** The WS nudge on `user:<id>`. Absent → no push (no WS wired). */
export type InboxNudge = (topic: string, envelope: unknown) => void;

/** Write the row and, when it is new, nudge the user's window or runner. */
export async function tellUser(
	db: HyperIdleDb,
	tell: InboxTell,
	now: string,
	nudge?: InboxNudge,
): Promise<void> {
	const inserted = await insertInboxRow(db, {
		id: randomUUID(),
		userId: tell.userId,
		reason: tell.reason,
		key: tell.key,
		changeId: tell.changeId ?? null,
		subscriptionId: tell.subscriptionId ?? null,
		objectId: tell.objectId ?? null,
		createdAt: now,
		seenAt: null,
		readAt: null,
	});
	if (inserted && nudge) {
		const topic = `user:${tell.userId}`;
		nudge(topic, { type: "update", topic, kind: "inbox", data: { id: inserted.id } });
	}
}
