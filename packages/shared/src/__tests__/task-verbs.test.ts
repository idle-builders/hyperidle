/**
 * L15 — verb derivation + deterministic message body formatter.
 *
 * Red-phase contract:
 *  - REQUEST_VERBS is a closed enum at 5 entries.
 *  - requestableVerbsFor(state) is exhaustive over TaskState; the table
 *    matches the design's §4 verb derivation.
 *  - verbDisplayLabel maps each verb to its human-readable string.
 *  - formatRequestMessageBody emits a deterministic line-1 string and
 *    appends an optional line-2 note (omitted when empty/whitespace).
 */
import { describe, expect, it } from "vitest";
import {
	formatRequestMessageBody,
	REQUEST_VERBS,
	type RequestVerb,
	requestableVerbsFor,
	verbDisplayLabel,
} from "../task-verbs.js";
import { TASK_STATES, type TaskState } from "../types.js";

describe("REQUEST_VERBS — closed enum", () => {
	it("is exactly the five legal verbs", () => {
		expect([...REQUEST_VERBS]).toEqual([
			"pause",
			"resume",
			"mark_blocked",
			"ready_for_review",
			"kill",
		]);
	});
});

describe("requestableVerbsFor — exhaustive state→verbs derivation", () => {
	const expected: Record<TaskState, ReadonlyArray<RequestVerb>> = {
		proposed: ["mark_blocked", "kill"],
		accepted: ["pause", "mark_blocked", "kill"],
		hold: ["resume", "kill"],
		in_progress: ["pause", "mark_blocked", "ready_for_review", "kill"],
		blocked: ["resume", "kill"],
		review: ["mark_blocked", "kill"],
		done: [],
		killed: [],
	};

	for (const state of TASK_STATES) {
		it(`returns the documented verbs for state='${state}'`, () => {
			expect(requestableVerbsFor(state)).toEqual(expected[state]);
		});
	}

	it("returns the same array shape for every TASK_STATES entry (full exhaustiveness)", () => {
		for (const state of TASK_STATES) {
			expect(Array.isArray(requestableVerbsFor(state))).toBe(true);
		}
	});

	it("returns empty arrays for terminal states (done, killed)", () => {
		expect(requestableVerbsFor("done")).toEqual([]);
		expect(requestableVerbsFor("killed")).toEqual([]);
	});
});

describe("verbDisplayLabel — human-readable mapping", () => {
	const labels: Record<RequestVerb, string> = {
		pause: "Pause",
		resume: "Resume",
		mark_blocked: "Mark blocked",
		ready_for_review: "Ready for review",
		kill: "Kill",
	};

	for (const verb of REQUEST_VERBS) {
		it(`labels '${verb}' as '${labels[verb]}'`, () => {
			expect(verbDisplayLabel(verb)).toBe(labels[verb]);
		});
	}
});

describe("formatRequestMessageBody — deterministic body", () => {
	it("emits line 1 only when no note provided", () => {
		const body = formatRequestMessageBody({
			actorName: "A. Founder",
			verb: "pause",
		});
		expect(body).toBe("@A. Founder requested: Pause");
		// No trailing newline / second line.
		expect(body.split("\n")).toHaveLength(1);
	});

	it("emits line 1 only when note is empty string", () => {
		const body = formatRequestMessageBody({
			actorName: "A. Founder",
			verb: "kill",
			note: "",
		});
		expect(body).toBe("@A. Founder requested: Kill");
	});

	it("emits line 1 only when note is whitespace", () => {
		const body = formatRequestMessageBody({
			actorName: "A. Founder",
			verb: "resume",
			note: "   \n\t ",
		});
		expect(body).toBe("@A. Founder requested: Resume");
	});

	it("emits two lines when note is non-empty after trim", () => {
		const body = formatRequestMessageBody({
			actorName: "A. Founder",
			verb: "mark_blocked",
			note: "auth provider docs disagree with the schema",
		});
		expect(body).toBe(
			"@A. Founder requested: Mark blocked\nauth provider docs disagree with the schema",
		);
		expect(body.split("\n")).toHaveLength(2);
	});

	it("trims the note before emitting", () => {
		const body = formatRequestMessageBody({
			actorName: "A. Founder",
			verb: "ready_for_review",
			note: "  ready when you are  ",
		});
		expect(body).toBe("@A. Founder requested: Ready for review\nready when you are");
	});

	it("uses the canonical display label for every verb in line 1", () => {
		for (const verb of REQUEST_VERBS) {
			const body = formatRequestMessageBody({ actorName: "A. Founder", verb });
			expect(body).toBe(`@A. Founder requested: ${verbDisplayLabel(verb)}`);
		}
	});
});
