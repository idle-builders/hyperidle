/** Invariants for the huddle message type: send and adjust. */
import { describe, expect, it } from "vitest";
import {
	adjustThreadInvariants,
	sendMessageInvariants,
} from "../actions/thread.js";

const noCaller = { hasCallingThread: false };

describe("sendMessageInvariants — huddle body", () => {
	it.each<[string, Parameters<typeof sendMessageInvariants>[0], string | null]>([
		[
			"huddle counts as a body",
			{ threadId: "t1", huddle: {} },
			null,
		],
		[
			"huddle + text is two bodies",
			{ threadId: "t1", huddle: {}, text: "hi" },
			"two_bodies",
		],
		[
			"no body still fails with huddle absent",
			{ threadId: "t1" },
			"no_body",
		],
	])("%s", (_, input, code) => {
		const codes = sendMessageInvariants(input, noCaller).map((p) => p.code);
		expect(codes).toEqual(code ? expect.arrayContaining([code]) : []);
	});
});

describe("adjustThreadInvariants — huddle message", () => {
	it("huddle alone in message is not empty", () => {
		const problems = adjustThreadInvariants({ id: "t1", message: { id: "m1", huddle: "join" } });
		expect(problems.map((p) => p.code)).not.toContain("adjust_message_empty");
	});

	it("message with no fields at all is still empty", () => {
		const problems = adjustThreadInvariants({ id: "t1", message: { id: "m1" } });
		expect(problems.map((p) => p.code)).toContain("adjust_message_empty");
	});
});
