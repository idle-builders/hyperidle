/** How the review page reads its rounds, pins and open questions out of the thread. */
import type { Message } from "@hyperidle/domain-model";
import { describe, expect, it } from "vitest";
import { nextRoundOf, pinsOf, roundsOf } from "./review-page";

const at = (n: number) => `2026-09-0${n}T10:00:00.000Z`;

function message(
	id: string,
	senderId: string,
	type: Message["type"],
	payload: unknown,
	n: number,
): Message {
	return {
		id,
		threadId: "t",
		senderId,
		type,
		payload,
		clientKey: id,
		resolvedAt: null,
		deletedAt: null,
		redactedAt: null,
		createdAt: at(n),
	};
}

const flag = (id: string) => ({ id, part: "page", label: id, says: `About ${id}.` });
const review = (id: string, n: number, extra: Record<string, unknown> = {}) =>
	message(id, "builder", "review", { title: "R", reasoning: [], ...extra }, n);
const comment = (id: string, by: string, pin: string, on: string, n: number) =>
	message(
		id,
		by,
		"plain",
		{ text: id, anchor: { id: pin, part: "page", label: pin, review: on } },
		n,
	);

const r1 = review("r1", 1, { flags: [flag("a"), flag("b")] });
const r2 = review("r2", 5, { flags: [flag("c"), flag("d")], previousReviewId: "r1" });
const thread: Message[] = [
	r1,
	comment("q1", "finn", "heading", "r1", 2),
	comment("q1-reply", "builder", "heading", "r1", 3),
	comment("q2", "finn", "refunds", "r1", 3),
	comment("a-reply", "finn", "a", "r1", 4),
	comment("elsewhere", "finn", "x", "r9", 4),
	r2,
];

describe("rounds", () => {
	it("a round walks back to the first, and knows the one after it", () => {
		expect(roundsOf("r2", thread).map((r) => r.message.id)).toEqual(["r1", "r2"]);
		expect(nextRoundOf("r1", thread)?.id).toBe("r2");
		expect(nextRoundOf("r2", thread)).toBeUndefined();
	});
});

describe("pins on a round", () => {
	it("comments are numbered in the order they were made, and come before the flags", () => {
		const [round] = roundsOf("r1", thread);
		const pins = round ? pinsOf(round, thread, 0, false) : [];
		expect(pins.map((p) => [p.mark, p.key, p.state])).toEqual([
			["1", "heading", "answered"],
			["2", "refunds", "open"],
			["A", "a", "settled"],
			["B", "b", "open"],
		]);
	});

	it("flags carry on lettering from the rounds before, and approving settles them", () => {
		const round = roundsOf("r2", thread)[1];
		const open = round ? pinsOf(round, thread, 2, false) : [];
		const approved = round ? pinsOf(round, thread, 2, true) : [];
		expect(open.map((p) => [p.mark, p.state])).toEqual([
			["C", "open"],
			["D", "open"],
		]);
		expect(approved.map((p) => p.state)).toEqual(["settled", "settled"]);
	});

	it("a comment is still open when only its asker has spoken", () => {
		const own = [...thread, comment("q2-more", "finn", "refunds", "r1", 4)];
		const [round] = roundsOf("r1", own);
		const pins = round ? pinsOf(round, own, 0, true) : [];
		expect(pins.find((p) => p.key === "refunds")?.state).toBe("open");
	});
});
