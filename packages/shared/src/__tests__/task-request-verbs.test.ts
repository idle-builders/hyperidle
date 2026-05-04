/**
 * L15 § 12 protected — `task-request-verbs.ts` shared primitive.
 *
 * Covers:
 *   - isVerbLegalForState(): exhaustive matrix over every state×verb pair.
 *   - renderRequestText(): empty / whitespace / multiline / unicode reasons.
 */

import { describe, expect, it } from "vitest";
import {
	isVerbLegalForState,
	REQUEST_VERBS,
	renderRequestText,
	TASK_VERBS_BY_STATE,
} from "../task-request-verbs.js";
import { TASK_STATES, type TaskState } from "../types.js";

describe("isVerbLegalForState — exhaustive matrix", () => {
	for (const state of TASK_STATES) {
		for (const verb of REQUEST_VERBS) {
			const expected = TASK_VERBS_BY_STATE[state as TaskState].includes(verb);
			it(`${state} × ${verb} → ${expected ? "legal" : "illegal"}`, () => {
				expect(isVerbLegalForState(verb, state as TaskState)).toBe(expected);
			});
		}
	}

	it("blocked allows request_unblock", () => {
		expect(isVerbLegalForState("request_unblock", "blocked")).toBe(true);
	});

	it("done has no legal verbs", () => {
		for (const verb of REQUEST_VERBS) {
			expect(isVerbLegalForState(verb, "done")).toBe(false);
		}
	});

	it("review allows request_mark_done and request_changes", () => {
		expect(isVerbLegalForState("request_mark_done", "review")).toBe(true);
		expect(isVerbLegalForState("request_changes", "review")).toBe(true);
	});
});

describe("renderRequestText", () => {
	it("returns the head-only text when reason is undefined", () => {
		expect(renderRequestText("request_stop")).toBe("Request stop");
	});

	it("returns the head-only text when reason is empty string (truthy check)", () => {
		expect(renderRequestText("request_stop", "")).toBe("Request stop");
	});

	it("appends a single-line reason after `: `", () => {
		expect(renderRequestText("request_hold", "agent stuck")).toBe(
			"Request hold: agent stuck",
		);
	});

	it("preserves multiline reason verbatim", () => {
		const reason = "line one\nline two\nline three";
		expect(renderRequestText("request_changes", reason)).toBe(
			`Request changes: ${reason}`,
		);
	});

	it("preserves unicode (NFC-friendly) characters in reason", () => {
		const reason = "café — 日本語 — emoji ✨";
		expect(renderRequestText("request_mark_done", reason)).toBe(
			`Request mark done: ${reason}`,
		);
	});

	it("renders cancel_request canonical text", () => {
		expect(renderRequestText("cancel_request")).toBe("Cancel pending request");
	});
});
