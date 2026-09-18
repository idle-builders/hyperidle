/**
 * Pure invariant unit tests for the thread module's declarations —
 * `sendMessageInvariants`, `adjustThreadInvariants`, `canReadThread`/
 * `canWriteThread`, and `agentsToWake`. architecture.md §3.4/§3.10, §9.
 */

import { describe, expect, it } from "vitest";
import {
	adjustThreadInvariants,
	agentsToWake,
	canReadThread,
	canWriteThread,
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
	it("team/knowledge_item/factory hosts are readable and writable by anyone", () => {
		for (const hostKind of ["team", "knowledge_item", "factory"] as const) {
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
