/**
 * L15 — task-request-verbs unit tests.
 *
 * Source of truth: docs/work-packages/L15-plan.md §3.1 + §12 (assertion locks).
 *
 * Red phase: the module does not exist yet. These assertions encode the
 * verb→state legality matrix and the canonical text rendering. Adversary
 * review checks these against the plan's locked matrix in §2.4.
 */

import { describe, expect, it } from "vitest";
import { TASK_STATES, type TaskState } from "../types.js";
import {
	REQUEST_VERBS,
	REQUEST_VERB_TEXT,
	TASK_VERBS_BY_STATE,
	type RequestVerb,
	isVerbLegalForState,
	renderRequestText,
} from "../task-request-verbs.js";

describe("REQUEST_VERBS", () => {
	it("exposes the seven canonical verbs", () => {
		expect([...REQUEST_VERBS].sort()).toEqual(
			[
				"cancel_request",
				"hand_back",
				"request_changes",
				"request_hold",
				"request_mark_done",
				"request_stop",
				"request_unblock",
			].sort(),
		);
	});
});

describe("TASK_VERBS_BY_STATE", () => {
	it("is exhaustive over TaskState (every state present as a key)", () => {
		for (const state of TASK_STATES) {
			expect(TASK_VERBS_BY_STATE).toHaveProperty(state);
			expect(Array.isArray(TASK_VERBS_BY_STATE[state])).toBe(true);
		}
		// Reverse: no extra keys beyond TaskState
		const keys = Object.keys(TASK_VERBS_BY_STATE) as TaskState[];
		expect(keys.length).toBe(TASK_STATES.length);
	});

	it("matches the locked matrix from plan §2.4", () => {
		expect([...TASK_VERBS_BY_STATE.proposed]).toEqual([]);
		expect([...TASK_VERBS_BY_STATE.accepted]).toEqual(["hand_back"]);
		expect([...TASK_VERBS_BY_STATE.hold]).toEqual([]);
		expect([...TASK_VERBS_BY_STATE.in_progress].sort()).toEqual(
			["hand_back", "request_hold", "request_mark_done", "request_stop"].sort(),
		);
		expect([...TASK_VERBS_BY_STATE.blocked].sort()).toEqual(
			["hand_back", "request_stop", "request_unblock"].sort(),
		);
		expect([...TASK_VERBS_BY_STATE.review].sort()).toEqual(
			["request_changes", "request_mark_done"].sort(),
		);
		expect([...TASK_VERBS_BY_STATE.done]).toEqual([]);
		expect([...TASK_VERBS_BY_STATE.killed]).toEqual([]);
	});

	it("only references verbs from REQUEST_VERBS", () => {
		const verbs = new Set<RequestVerb>(REQUEST_VERBS);
		for (const state of TASK_STATES) {
			for (const verb of TASK_VERBS_BY_STATE[state]) {
				expect(verbs.has(verb)).toBe(true);
			}
		}
	});
});

describe("isVerbLegalForState", () => {
	it("returns true for legal pairings", () => {
		expect(isVerbLegalForState("request_stop", "in_progress")).toBe(true);
		expect(isVerbLegalForState("hand_back", "accepted")).toBe(true);
		expect(isVerbLegalForState("request_unblock", "blocked")).toBe(true);
		expect(isVerbLegalForState("request_changes", "review")).toBe(true);
	});

	it("returns false for illegal pairings", () => {
		expect(isVerbLegalForState("request_stop", "done")).toBe(false);
		expect(isVerbLegalForState("request_stop", "proposed")).toBe(false);
		expect(isVerbLegalForState("request_unblock", "in_progress")).toBe(false);
		expect(isVerbLegalForState("hand_back", "done")).toBe(false);
	});
});

describe("REQUEST_VERB_TEXT", () => {
	it("provides canonical text for every verb", () => {
		for (const verb of REQUEST_VERBS) {
			expect(typeof REQUEST_VERB_TEXT[verb]).toBe("string");
			expect(REQUEST_VERB_TEXT[verb].length).toBeGreaterThan(0);
		}
	});

	it("matches the locked copy register from plan §9", () => {
		expect(REQUEST_VERB_TEXT.request_stop).toBe("Request stop");
		expect(REQUEST_VERB_TEXT.hand_back).toBe("Hand back to me");
		expect(REQUEST_VERB_TEXT.cancel_request).toBe("Cancel pending request");
	});
});

describe("renderRequestText", () => {
	it("returns the canonical text without a reason", () => {
		expect(renderRequestText("request_stop")).toBe("Request stop");
	});

	it("appends ': <reason>' when provided", () => {
		expect(renderRequestText("request_stop", "no progress")).toBe("Request stop: no progress");
	});

	it("does NOT append for an empty-string reason", () => {
		// Falsy guard — empty reason behaves like absent.
		expect(renderRequestText("request_stop", "")).toBe("Request stop");
	});
});
