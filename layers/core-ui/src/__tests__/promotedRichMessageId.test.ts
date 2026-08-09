/**
 * L11 step5 (write-tests) — `promotedRichMessageId` pure helper.
 *
 * Approved.md §3 (promotion rule). Plan §5.2 + §6.2 (revised signature):
 *   promotedRichMessageId(messages: ReadonlyArray<Message>): MessageId | null
 *
 * Contract: returns the id of the SINGLE rich message that should render as
 * a card. "Oldest unresolved review/questionnaire wins" — deterministic
 * across renders. Returns null when no candidate exists.
 *
 * @lore L11 step5: tests fail with "promotedRichMessageId is not a
 * function" / unresolved import until plan T1 lands the helper in
 * framework/domain-model/src/thread.ts and exports it from index.ts.
 */

import type { Message, Thread } from "@hyperidle/domain-model";
import { promotedRichMessageId } from "@hyperidle/domain-model";
import { describe, expect, it } from "vitest";

const THREAD_ID = "t-1";

const baseThread: Thread = {
	id: THREAD_ID,
	hostKind: "task",
	hostId: "task-1",
	initiatorId: "u-founder",
	participants: ["u-founder", "agent-1"],
	pinned: false,
	resolvedAt: null,
	lastActiveAt: "2026-04-19T12:00:00.000Z",
	createdAt: "2026-04-19T12:00:00.000Z",
};

function review(id: string, createdAt: string, resolvedAt: string | null = null): Message {
	return {
		id,
		threadId: THREAD_ID,
		senderId: "agent-1",
		clientKey: id,
		deletedAt: null,
		redactedAt: null,
		resolvedAt,
		createdAt,
		type: "review",
		payload: {
			title: `Review ${id}`,
			reasoning: ["one"],
			artifactRef: { id: `art-${id}`, kind: "text_diff" },
		},
	};
}

function questionnaire(id: string, createdAt: string, resolvedAt: string | null = null): Message {
	return {
		id,
		threadId: THREAD_ID,
		senderId: "agent-1",
		clientKey: id,
		deletedAt: null,
		redactedAt: null,
		resolvedAt,
		createdAt,
		type: "questionnaire",
		payload: {
			title: `Q ${id}`,
			question: "Pick one",
			options: ["a", "b"],
		},
	};
}

function plain(id: string, createdAt: string): Message {
	return {
		id,
		threadId: THREAD_ID,
		senderId: "u-founder",
		clientKey: id,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt,
		type: "plain",
		payload: { text: id },
	};
}

describe("promotedRichMessageId (approved.md §3, plan §5.2)", () => {
	it("returns null when the thread has zero rich messages", () => {
		expect(
			promotedRichMessageId([
				plain("p1", "2026-04-19T12:00:00.000Z"),
				plain("p2", "2026-04-19T12:01:00.000Z"),
			]),
		).toBeNull();
	});

	it("returns null when every rich message is already resolved", () => {
		expect(
			promotedRichMessageId([
				review("r1", "2026-04-19T12:00:00.000Z", "2026-04-19T12:30:00.000Z"),
				questionnaire("q1", "2026-04-19T12:01:00.000Z", "2026-04-19T12:30:00.000Z"),
			]),
		).toBeNull();
	});

	it("returns the id of the only unresolved review", () => {
		expect(
			promotedRichMessageId([
				plain("p", "2026-04-19T12:00:00.000Z"),
				review("r1", "2026-04-19T12:01:00.000Z"),
			]),
		).toBe("r1");
	});

	it("when two unresolved reviews exist, picks the OLDEST (createdAt asc)", () => {
		// r-old is older than r-new even though r-new appears earlier in the array.
		const out = promotedRichMessageId([
			review("r-new", "2026-04-19T12:30:00.000Z"),
			review("r-old", "2026-04-19T12:00:00.000Z"),
		]);
		expect(out).toBe("r-old");
	});

	it("treats review and questionnaire equivalently — picks oldest across types", () => {
		const out = promotedRichMessageId([
			review("r1", "2026-04-19T12:10:00.000Z"),
			questionnaire("q1", "2026-04-19T12:05:00.000Z"),
		]);
		expect(out).toBe("q1");
	});

	it("ignores resolved candidates even when they are oldest", () => {
		const out = promotedRichMessageId([
			review("r-resolved", "2026-04-19T12:00:00.000Z", "2026-04-19T12:30:00.000Z"),
			review("r-open", "2026-04-19T12:10:00.000Z"),
		]);
		expect(out).toBe("r-open");
	});

	it("returns null on an empty messages array", () => {
		expect(promotedRichMessageId([])).toBeNull();
	});

	// Architectural anchor: the helper MUST be a pure derivation — no thread
	// or session-state argument needed (plan §6.2 CONFUSION resolution A).
	it("is a one-arg pure function (signature anchor)", () => {
		expect(promotedRichMessageId.length).toBe(1);
		// Touch baseThread to avoid unused-import lint when this anchor is
		// the only place the type is referenced.
		expect(baseThread.id).toBe(THREAD_ID);
	});
});
