/**
 * Writes conversations and their messages. Shared by the standalone
 * conversations and by the tasks, whose own conversation holds their questions
 * and reviews.
 */

import { type HyperIdleDb, messages, threads } from "@hyperidle/db";
import type { Anchor, ProposedChange } from "@hyperidle/domain-model";
import { eq } from "drizzle-orm";

export interface ThreadSpec {
	readonly id: string;
	readonly title: string;
	readonly host: { readonly kind: "team" | "document" | "agent"; readonly id: string };
	readonly initiatorId: string;
	readonly members: readonly string[];
	readonly createdAt: string;
}

export interface MessageSpec {
	readonly id: string;
	readonly threadId: string;
	readonly senderId: string;
	readonly type: "plain" | "review" | "questionnaire" | "verdict" | "answer";
	readonly payload: Record<string, unknown>;
	readonly createdAt: string;
	/** A question that was answered, or a review that got a verdict. */
	readonly resolvedAt?: string;
}

/** A plain message; `@Name` in the text names someone mentioned, with their id. */
export function plain(
	text: string,
	extra: {
		readonly mentions?: readonly { readonly id: string; readonly name: string }[];
		readonly documents?: readonly string[];
		/** A comment on a review's part, or on a stretch of the thread's document's text. */
		readonly anchor?: Anchor;
		/** A change to the text the anchor covers. */
		readonly change?: ProposedChange;
	} = {},
): Record<string, unknown> {
	const refs = [
		...(extra.mentions ?? []).map((m) => ({
			kind: "mention",
			identityId: m.id,
			displayName: m.name,
			sourceText: `@${m.name}`,
		})),
		...(extra.documents ?? []).map((id) => ({ kind: "document", id })),
	];
	return {
		text,
		...(refs.length > 0 ? { refs } : {}),
		...(extra.anchor ? { anchor: extra.anchor } : {}),
		...(extra.change ? { change: extra.change } : {}),
	};
}

export async function seedThreads(
	db: HyperIdleDb,
	threadSpecs: readonly ThreadSpec[],
	messageSpecs: readonly MessageSpec[],
): Promise<void> {
	for (const thread of threadSpecs) {
		await db
			.insert(threads)
			.values({
				id: thread.id,
				title: thread.title,
				hostKind: thread.host.kind,
				hostId: thread.host.id,
				initiatorId: thread.initiatorId,
				participants: JSON.stringify(thread.members),
				lastActiveAt: thread.createdAt,
				createdAt: thread.createdAt,
			})
			.onConflictDoNothing();
	}
	await seedMessages(db, messageSpecs);
}

/** Messages into threads that already exist; each thread's last activity follows its newest. */
async function seedMessages(db: HyperIdleDb, messageSpecs: readonly MessageSpec[]): Promise<void> {
	for (const message of messageSpecs) {
		await db
			.insert(messages)
			.values({
				id: message.id,
				senderId: message.senderId,
				threadId: message.threadId,
				type: message.type,
				payload: JSON.stringify(message.payload),
				clientKey: `demo-ck-${message.id}`,
				resolvedAt: message.resolvedAt ?? null,
				createdAt: message.createdAt,
			})
			.onConflictDoNothing();
	}
	for (const threadId of new Set(messageSpecs.map((m) => m.threadId))) {
		const latest = messageSpecs
			.filter((m) => m.threadId === threadId)
			.reduce((max, m) => (m.createdAt > max ? m.createdAt : max), "");
		await db.update(threads).set({ lastActiveAt: latest }).where(eq(threads.id, threadId));
	}
}
