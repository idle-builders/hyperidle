/**
 * L1a — `isBlocking` unit tests.
 *
 * Concept §4.5.5: a thread is blocking iff the agent participating in
 * the thread cannot continue to work without an answer.
 * Plan §4: derived from (a) presence of an unresolved review/questionnaire
 * + agent active for the thread, OR (b) head-null + agent paused on the
 * thread (the "plain quick question" case).
 */

import { describe, expect, it } from "vitest";
import {
	type AgentSessionStateSnapshot,
	isBlocking,
	type Message,
	type Thread,
} from "../thread.js";

const NOW = Date.parse("2026-04-19T12:00:00Z");

function isoAt(offsetMin: number): string {
	return new Date(NOW + offsetMin * 60_000).toISOString();
}

const baseThread: Thread = {
	id: "t1",
	hostKind: "task",
	hostId: "task-1",
	initiatorId: "u1",
	participants: ["u1", "agent-1"],
	pinned: false,
	resolvedAt: null,
	lastActiveAt: isoAt(0),
	createdAt: isoAt(0),
};

const plainMsg: Message = {
	id: "p1",
	threadId: "t1",
	senderId: "u1",
	clientKey: "p1",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: isoAt(0),
	type: "plain",
	payload: { text: "ping" },
};

const unresolvedReview: Message = {
	id: "r1",
	threadId: "t1",
	senderId: "agent-1",
	clientKey: "r1",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: isoAt(1),
	type: "review",
	payload: {
		title: "review",
		reasoning: ["a"],
		producedItemId: "a1",
	},
};

const resolvedReview: Message = {
	...unresolvedReview,
	resolvedAt: isoAt(5),
};

const noAgentState: AgentSessionStateSnapshot = {
	pausedOnThreadId: null,
	activeForThreadId: null,
};
const pausedOnThread: AgentSessionStateSnapshot = {
	pausedOnThreadId: "t1",
	activeForThreadId: null,
};
const activeForThread: AgentSessionStateSnapshot = {
	pausedOnThreadId: null,
	activeForThreadId: "t1",
};

describe("isBlocking (concept §4.5.5)", () => {
	it("returns false when there are no agent participants and no head", () => {
		const thread: Thread = { ...baseThread, participants: ["u1"] };
		expect(isBlocking(thread, [plainMsg], noAgentState)).toBe(false);
	});

	it("returns true when an unresolved review exists and the agent is active for the thread", () => {
		expect(isBlocking(baseThread, [unresolvedReview], activeForThread)).toBe(true);
	});

	it("returns false when an unresolved review exists but the agent has walked away (no active session)", () => {
		expect(isBlocking(baseThread, [unresolvedReview], noAgentState)).toBe(false);
	});

	it("returns false when the review is resolved (verdict committed) — predicate flips", () => {
		expect(isBlocking(baseThread, [resolvedReview], activeForThread)).toBe(false);
	});

	it("returns true when head is null but the agent has paused on the thread (quick-question case)", () => {
		expect(isBlocking(baseThread, [plainMsg], pausedOnThread)).toBe(true);
	});

	it("returns false when head is null and the agent has not paused on the thread", () => {
		expect(isBlocking(baseThread, [plainMsg], noAgentState)).toBe(false);
	});

	it("returns false when head is null and the agent is active-for-thread but not paused (no source of block)", () => {
		// Plan §4: with head=null, the "plain quick question" path requires
		// pausedOnThreadId. activeForThreadId without head doesn't block.
		expect(isBlocking(baseThread, [plainMsg], activeForThread)).toBe(false);
	});
});
