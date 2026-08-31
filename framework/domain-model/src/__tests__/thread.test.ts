/**
 * L1a — `headCollapsePredicate` unit tests.
 *
 * Approved-design hard-rule 1:
 * "ThreadHead mounts iff there exists a message of type 'review' or
 * 'questionnaire' whose resolvedAt is null AND that message is the most
 * recent of its kind in the thread."
 *
 * @lore L1 step-1 (write-tests): these tests describe the predicate
 * contract; the green phase fills the function body.
 */

import { describe, expect, it } from "vitest";
import type { Message } from "../thread.js";
import { HOST_KINDS, headCollapsePredicate, MESSAGE_TYPES } from "../thread.js";

const NOW = Date.parse("2026-04-19T12:00:00Z");

function isoAt(offsetMin: number): string {
	return new Date(NOW + offsetMin * 60_000).toISOString();
}

function plain(id: string, offsetMin: number): Message {
	return {
		id,
		threadId: "t1",
		senderId: "u1",
		clientKey: id,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: isoAt(offsetMin),
		type: "plain",
		payload: { text: `body-${id}` },
	};
}

function review(id: string, offsetMin: number, opts: { resolvedAt?: string | null } = {}): Message {
	return {
		id,
		threadId: "t1",
		senderId: "u1",
		clientKey: id,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: opts.resolvedAt ?? null,
		createdAt: isoAt(offsetMin),
		type: "review",
		payload: {
			title: `review-${id}`,
			reasoning: ["because"],
			artifactRef: { id: "a1", kind: "text_diff" },
		},
	};
}

function questionnaire(
	id: string,
	offsetMin: number,
	opts: { resolvedAt?: string | null } = {},
): Message {
	return {
		id,
		threadId: "t1",
		senderId: "u1",
		clientKey: id,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: opts.resolvedAt ?? null,
		createdAt: isoAt(offsetMin),
		type: "questionnaire",
		payload: {
			title: `q-${id}`,
			question: "ok?",
			options: ["yes", "no"],
		},
	};
}

describe("headCollapsePredicate (L1 plan §4 + approved.md §8 hard-rule 1)", () => {
	it("returns null head when messages are empty", () => {
		expect(headCollapsePredicate([])).toEqual({ headMessageId: null });
	});

	it("returns null head when only plain messages exist", () => {
		const msgs: Message[] = [plain("p1", 0), plain("p2", 1)];
		expect(headCollapsePredicate(msgs)).toEqual({ headMessageId: null });
	});

	it("returns the unresolved review id when one exists", () => {
		const msgs: Message[] = [plain("p1", 0), review("r1", 1), plain("p2", 2)];
		expect(headCollapsePredicate(msgs)).toEqual({ headMessageId: "r1" });
	});

	it("returns null when the only review is resolved (head collapses to chat)", () => {
		const msgs: Message[] = [review("r1", 0, { resolvedAt: isoAt(2) }), plain("p2", 5)];
		expect(headCollapsePredicate(msgs)).toEqual({ headMessageId: null });
	});

	it("returns null when a resolved review is followed by a later plain (no unresolved substance)", () => {
		const msgs: Message[] = [
			plain("p0", 0),
			review("r1", 1, { resolvedAt: isoAt(2) }),
			plain("p2", 3),
		];
		expect(headCollapsePredicate(msgs)).toEqual({ headMessageId: null });
	});

	it("when multiple unresolved reviews exist, returns the most recent by ordering", () => {
		// Concept §4.5.5: messages order by (createdAt, id) ascending.
		const msgs: Message[] = [review("r-old", 0), plain("p1", 1), review("r-new", 5)];
		expect(headCollapsePredicate(msgs)).toEqual({ headMessageId: "r-new" });
	});

	it("counts an unresolved questionnaire as substance (head mounts on it)", () => {
		const msgs: Message[] = [plain("p1", 0), questionnaire("q1", 1)];
		expect(headCollapsePredicate(msgs)).toEqual({ headMessageId: "q1" });
	});

	it("when a resolved review precedes an unresolved questionnaire, the questionnaire is the head", () => {
		const msgs: Message[] = [review("r1", 0, { resolvedAt: isoAt(1) }), questionnaire("q1", 2)];
		expect(headCollapsePredicate(msgs)).toEqual({ headMessageId: "q1" });
	});

	it("ignores plain messages that come after the unresolved review (still picks the review)", () => {
		// Approved.md §8 hard-rule 1 is "most recent of its kind" — the kind
		// is review/questionnaire. Plain messages do not collapse the head.
		const msgs: Message[] = [review("r1", 0), plain("p1", 5), plain("p2", 10)];
		expect(headCollapsePredicate(msgs)).toEqual({ headMessageId: "r1" });
	});
});

// AC-4 closure assertions: tighten the closed-enum surface so additions
// require updating both the constant and the type.
describe("closed enums (AC-4)", () => {
	it("MESSAGE_TYPES has exactly 4 entries", () => {
		expect(MESSAGE_TYPES.length).toBe(4);
		expect(new Set(MESSAGE_TYPES)).toEqual(
			new Set(["plain", "review", "questionnaire", "verdict"]),
		);
	});

	it("HOST_KINDS has exactly 8 entries", () => {
		expect(HOST_KINDS.length).toBe(8);
		expect(new Set(HOST_KINDS)).toEqual(
			new Set(["bet", "task", "knowledge_item", "artifact", "agent", "user", "team", "factory"]),
		);
	});
});
