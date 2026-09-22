/**
 * L1a — message-type discriminant exhaustiveness + closed-enum closures.
 *
 * AC-11 (plan §3): adding a new message type that isn't in MessageType
 * triggers a TS error in the renderer. We assert this at the
 * `exhaustiveAssert` boundary — the switch covers all four discriminants
 * and the default branch never executes.
 *
 * @lore BC3 §3.1: `Message.payload` moved to `z.unknown()` on the action's
 * output schema (a four-arm discriminated union in an output buys nothing
 * and makes `z.toJSONSchema` noisy). `Message` is therefore a flat object
 * now, not a discriminated union of four variants, so the exhaustiveness
 * check below narrows on `m.type` (the discriminant) rather than on `m`
 * itself — property narrowing still makes an added, unhandled type a
 * compile error, which is the property this test protects.
 *
 * AC-4: MESSAGE_TYPES.length === 4, HOST_KINDS.length === 5 (bet and task
 * are no longer host kinds — a task's thread is `team`-hosted now).
 */

import { describe, expect, it } from "vitest";
import type { Message } from "../actions/thread.js";
import { HOST_KINDS, MESSAGE_TYPES, type MessageType, VERDICT_DECISIONS } from "../thread.js";

function exhaustiveAssert(value: never): never {
	throw new Error(`Unhandled message type: ${String(value)}`);
}

function describeMessage(m: Message): string {
	switch (m.type) {
		case "plain":
			return "plain";
		case "review":
			return "review";
		case "questionnaire":
			return "questionnaire";
		case "verdict":
			return "verdict";
		default:
			return exhaustiveAssert(m.type);
	}
}

describe("AC-4 / AC-11 — message-type discriminant exhaustiveness", () => {
	it("MESSAGE_TYPES is exactly the closed set { plain, review, questionnaire, verdict }", () => {
		expect(MESSAGE_TYPES.length).toBe(4);
		expect([...MESSAGE_TYPES].sort()).toEqual(
			["plain", "questionnaire", "review", "verdict"].sort(),
		);
	});

	it("HOST_KINDS is exactly the closed 5-set (bet, artifact, and task are no longer host kinds — a task's thread is team-hosted)", () => {
		expect(HOST_KINDS.length).toBe(5);
		expect([...HOST_KINDS].sort()).toEqual(["agent", "document", "factory", "team", "user"].sort());
	});

	it("VERDICT_DECISIONS is the 5 binding verdicts (concept §4.5.7)", () => {
		expect(VERDICT_DECISIONS.length).toBe(5);
		expect([...VERDICT_DECISIONS].sort()).toEqual(
			["approve", "approve-with-comments", "edit", "reject", "request-changes"].sort(),
		);
	});

	it("MessageType union is structurally identical to MESSAGE_TYPES", () => {
		// Compile-time: each string-literal in MESSAGE_TYPES must be assignable
		// to MessageType. If a new type were added to one but not the other,
		// this assignment errors at `bun run check`.
		const Types: ReadonlyArray<MessageType> = MESSAGE_TYPES;
		expect(Types.length).toBe(4);
	});

	it("describeMessage covers every discriminant via the switch (exhaustiveAssert never fires)", () => {
		const base = {
			id: "m1",
			threadId: "t1",
			senderId: "u1",
			clientKey: "k",
			blockId: null,
			deletedAt: null,
			redactedAt: null,
			resolvedAt: null,
			createdAt: "2026-04-19T12:00:00.000Z",
		} as const;

		const plainMsg: Message = { ...base, type: "plain", payload: { text: "x" } };
		const reviewMsg: Message = {
			...base,
			id: "r",
			type: "review",
			payload: {
				title: "t",
				reasoning: ["r"],
				producedItemId: "a",
			},
		};
		const qMsg: Message = {
			...base,
			id: "q",
			type: "questionnaire",
			payload: { title: "t", question: "?", options: ["a", "b"] },
		};
		const verdictMsg: Message = {
			...base,
			id: "v",
			type: "verdict",
			payload: { decision: "approve", resolvesMessageId: "r" },
		};

		expect(describeMessage(plainMsg)).toBe("plain");
		expect(describeMessage(reviewMsg)).toBe("review");
		expect(describeMessage(qMsg)).toBe("questionnaire");
		expect(describeMessage(verdictMsg)).toBe("verdict");
	});

	it("exhaustiveAssert throws when forced (defensive runtime guard)", () => {
		// Cast through unknown so the test compiles; the runtime branch is
		// what we want to assert.
		expect(() => exhaustiveAssert("bogus" as unknown as never)).toThrow(/Unhandled message type/);
	});
});
