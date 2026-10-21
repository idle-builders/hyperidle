/**
 * Pure invariant unit tests for the thread module's declarations —
 * `sendMessageInvariants`, `adjustThreadInvariants`, `canReadThread`/
 * `canWriteThread`, and `agentsToWake`.
 */

import { describe, expect, it } from "vitest";
import {
	adjustThreadInvariants,
	agentsToWake,
	canReadThread,
	canWriteThread,
	resolvesMessageInvariants,
	type SendMessageInput,
	sendMessageInvariants,
} from "../actions/thread.js";

describe("sendMessageInvariants", () => {
	const noCaller = { hasCallingThread: false };

	it("no_target: neither threadId nor recipients, and no calling thread", () => {
		const problems = sendMessageInvariants({ text: "hi" }, noCaller);
		expect(problems.map((p) => p.code)).toContain("no_target");
	});

	it("no_target does not fire when the caller has a calling thread to fall back to", () => {
		const problems = sendMessageInvariants({ text: "hi" }, { hasCallingThread: true });
		expect(problems.map((p) => p.code)).not.toContain("no_target");
	});

	it("two_targets: both threadId and recipients given", () => {
		const problems = sendMessageInvariants(
			{ threadId: "t1", recipients: ["u1"], text: "hi" },
			noCaller,
		);
		expect(problems.map((p) => p.code)).toContain("two_targets");
	});

	it("no_body: none of text/review/questionnaire/verdict", () => {
		const problems = sendMessageInvariants({ threadId: "t1" }, noCaller);
		expect(problems.map((p) => p.code)).toContain("no_body");
	});

	it("two_bodies: more than one of text/review/questionnaire/verdict", () => {
		const problems = sendMessageInvariants(
			{ threadId: "t1", text: "hi", review: { title: "r", reasoning: [] } },
			noCaller,
		);
		expect(problems.map((p) => p.code)).toContain("two_bodies");
	});

	it("plain_fields_on_non_plain: refs/blockId/spotLabel without text", () => {
		const problems = sendMessageInvariants(
			{ threadId: "t1", review: { title: "r", reasoning: [] }, blockId: "b1" },
			noCaller,
		);
		expect(problems.map((p) => p.code)).toContain("plain_fields_on_non_plain");
	});

	it("overwrite_needs_thread: messageId without threadId", () => {
		const problems = sendMessageInvariants({ messageId: "m1", text: "hi" }, noCaller);
		expect(problems.map((p) => p.code)).toContain("overwrite_needs_thread");
	});

	it("overwrite_with_recipients: messageId and recipients together", () => {
		const problems = sendMessageInvariants(
			{ threadId: "t1", messageId: "m1", recipients: ["u1"], text: "hi" },
			noCaller,
		);
		expect(problems.map((p) => p.code)).toContain("overwrite_with_recipients");
	});

	it("verdict_on_new_thread: a verdict with recipients", () => {
		const problems = sendMessageInvariants(
			{ recipients: ["u1"], verdict: { decision: "approve", resolvesMessageId: "m1" } },
			noCaller,
		);
		expect(problems.map((p) => p.code)).toContain("verdict_on_new_thread");
	});

	it("a well-formed plain send to an existing thread has no problems", () => {
		expect(sendMessageInvariants({ threadId: "t1", text: "hi" }, noCaller)).toEqual([]);
	});
});

describe("sendMessageInvariants — what a verdict and an answer must carry", () => {
	const onThread = { threadId: "t1" } as const;
	const cases: ReadonlyArray<{
		readonly name: string;
		readonly input: SendMessageInput;
		readonly problem: string | null;
	}> = [
		{
			name: "a reject with no note says nothing about why",
			input: { ...onThread, verdict: { decision: "reject", resolvesMessageId: "m1" } },
			problem: "reject_needs_reason",
		},
		{
			name: "a reject whose note is only spaces says nothing about why",
			input: { ...onThread, verdict: { decision: "reject", resolvesMessageId: "m1", note: "  " } },
			problem: "reject_needs_reason",
		},
		{
			name: "a reject with a reason is fine",
			input: {
				...onThread,
				verdict: { decision: "reject", resolvesMessageId: "m1", note: "Wrong table." },
			},
			problem: null,
		},
		{
			name: "an approve needs no note",
			input: { ...onThread, verdict: { decision: "approve", resolvesMessageId: "m1" } },
			problem: null,
		},
		{
			name: "an answer with neither an option nor text answers nothing",
			input: { ...onThread, answer: { resolvesMessageId: "q1" } },
			problem: "answer_needs_one",
		},
		{
			name: "an answer with both an option and text is two answers",
			input: { ...onThread, answer: { resolvesMessageId: "q1", option: "Yes", text: "Maybe" } },
			problem: "answer_needs_one",
		},
		{
			name: "a written answer that is only spaces is empty",
			input: { ...onThread, answer: { resolvesMessageId: "q1", text: "   " } },
			problem: "answer_empty",
		},
		{
			name: "a written answer is fine",
			input: { ...onThread, answer: { resolvesMessageId: "q1", text: "Monthly, for now." } },
			problem: null,
		},
		{
			name: "a picked option is fine",
			input: { ...onThread, answer: { resolvesMessageId: "q1", option: "Yes" } },
			problem: null,
		},
		{
			name: "an answer cannot open a new thread",
			input: { recipients: ["u1"], answer: { resolvesMessageId: "q1", option: "Yes" } },
			problem: "answer_on_new_thread",
		},
		{
			name: "an answer and text together are two bodies",
			input: { ...onThread, text: "hi", answer: { resolvesMessageId: "q1", option: "Yes" } },
			problem: "two_bodies",
		},
	];

	it.each(cases)("$name", ({ input, problem }) => {
		const codes = sendMessageInvariants(input, { hasCallingThread: false }).map((p) => p.code);
		expect(codes).toEqual(problem === null ? [] : [problem]);
	});
});

describe("resolvesMessageInvariants — what a verdict or an answer may resolve", () => {
	const review = { type: "review", payload: { title: "Ship it?", reasoning: [] } } as const;
	const questionnaire = {
		type: "questionnaire",
		payload: { title: "Billing", question: "Monthly or yearly?", options: ["Monthly", "Yearly"] },
	} as const;
	const approve = { verdict: { decision: "approve", resolvesMessageId: "m1" } } as const;
	const cases: ReadonlyArray<{
		readonly name: string;
		readonly input: SendMessageInput;
		readonly target: { readonly type: string; readonly payload: unknown };
		readonly problem: string | null;
	}> = [
		{ name: "a verdict resolves a review", input: approve, target: review, problem: null },
		{
			name: "a verdict cannot resolve a question",
			input: approve,
			target: questionnaire,
			problem: "verdict_not_review",
		},
		{
			name: "an answer picking one of the question's options resolves it",
			input: { answer: { resolvesMessageId: "q1", option: "Yearly" } },
			target: questionnaire,
			problem: null,
		},
		{
			name: "an answer naming an option the question does not have is refused",
			input: { answer: { resolvesMessageId: "q1", option: "Weekly" } },
			target: questionnaire,
			problem: "answer_unknown_option",
		},
		{
			name: "a written answer resolves a question",
			input: { answer: { resolvesMessageId: "q1", text: "Monthly until March." } },
			target: questionnaire,
			problem: null,
		},
		{
			name: "an answer cannot resolve a review",
			input: { answer: { resolvesMessageId: "m1", text: "Sure." } },
			target: review,
			problem: "answer_not_questionnaire",
		},
		{
			name: "an answer cannot pick an option on a redacted question",
			input: { answer: { resolvesMessageId: "q1", option: "Yearly" } },
			target: {
				type: "questionnaire",
				payload: { redacted: true, redactedBy: "u1", redactedAt: "2026-01-01", reason: "x" },
			},
			problem: "answer_unknown_option",
		},
	];

	it.each(cases)("$name", ({ input, target, problem }) => {
		const codes = resolvesMessageInvariants(input, target).map((p) => p.code);
		expect(codes).toEqual(problem === null ? [] : [problem]);
	});
});

describe("adjustThreadInvariants", () => {
	it("adjust_empty: an id with nothing else to change", () => {
		const problems = adjustThreadInvariants({ id: "t1" });
		expect(problems.map((p) => p.code)).toContain("adjust_empty");
	});

	it("adjust_host_on_existing: host given alongside an id", () => {
		const problems = adjustThreadInvariants({ id: "t1", host: { kind: "team", id: "team-1" } });
		expect(problems.map((p) => p.code)).toContain("adjust_host_on_existing");
	});

	it("members_empty: an explicit empty member list", () => {
		const problems = adjustThreadInvariants({ members: [] });
		expect(problems.map((p) => p.code)).toContain("members_empty");
	});

	it("a create with a host and members has no problems", () => {
		expect(
			adjustThreadInvariants({ host: { kind: "team", id: "team-1" }, members: ["u1"] }),
		).toEqual([]);
	});

	it("an existing-id title change has no problems", () => {
		expect(adjustThreadInvariants({ id: "t1", title: "New title" })).toEqual([]);
	});
});

describe("canReadThread / canWriteThread — the read/write/join predicate", () => {
	it("team/document/factory hosts are readable and writable by anyone", () => {
		for (const hostKind of ["team", "document", "factory"] as const) {
			expect(canReadThread("a-stranger", { hostKind, members: [] })).toBe(true);
			expect(canWriteThread("a-stranger", { hostKind, members: [] })).toBe(true);
		}
	});

	it("user/agent hosts are members-only for read and write", () => {
		for (const hostKind of ["user", "agent"] as const) {
			expect(canReadThread("a-stranger", { hostKind, members: ["u1", "u2"] })).toBe(false);
			expect(canReadThread("u1", { hostKind, members: ["u1", "u2"] })).toBe(true);
			expect(canWriteThread("a-stranger", { hostKind, members: ["u1", "u2"] })).toBe(false);
		}
	});

	it("canWriteThread delegates to canReadThread exactly (same function)", () => {
		expect(canWriteThread).toBe(canReadThread);
	});
});

describe("agentsToWake", () => {
	const isAgentIn = (agentIds: readonly string[]) => (id: string) => agentIds.includes(id);

	it("wakes a mentioned agent", () => {
		const woken = agentsToWake({
			members: ["human-1", "agent-1", "agent-2"],
			senderId: "human-1",
			mentionedIds: ["agent-1"],
			isAgent: isAgentIn(["agent-1", "agent-2"]),
		});
		expect(woken).toEqual(["agent-1"]);
	});

	it("wakes the other member of a two-member thread with no mention", () => {
		const woken = agentsToWake({
			members: ["human-1", "agent-1"],
			senderId: "human-1",
			mentionedIds: [],
			isAgent: isAgentIn(["agent-1"]),
		});
		expect(woken).toEqual(["agent-1"]);
	});

	it("wakes nobody in a three-member thread with no mention", () => {
		const woken = agentsToWake({
			members: ["human-1", "agent-1", "human-2"],
			senderId: "human-1",
			mentionedIds: [],
			isAgent: isAgentIn(["agent-1"]),
		});
		expect(woken).toEqual([]);
	});

	it("wakes two distinct mentioned agents", () => {
		const woken = agentsToWake({
			members: ["human-1", "agent-1", "agent-2"],
			senderId: "human-1",
			mentionedIds: ["agent-1", "agent-2"],
			isAgent: isAgentIn(["agent-1", "agent-2"]),
		});
		expect(new Set(woken)).toEqual(new Set(["agent-1", "agent-2"]));
	});

	it("never wakes the sender, even if self-mentioned or the lone other member", () => {
		const woken = agentsToWake({
			members: ["agent-1", "human-1"],
			senderId: "agent-1",
			mentionedIds: ["agent-1"],
			isAgent: isAgentIn(["agent-1"]),
		});
		expect(woken).toEqual([]);
	});

	it("ignores a mentioned human — only agents wake", () => {
		const woken = agentsToWake({
			members: ["human-1", "human-2"],
			senderId: "human-1",
			mentionedIds: ["human-2"],
			isAgent: isAgentIn([]),
		});
		expect(woken).toEqual([]);
	});
});
