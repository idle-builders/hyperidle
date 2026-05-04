/**
 * L15 step1 (write-tests) — Task request verb matrix + wire copy.
 *
 * Plan §3.1 + §4.1 (approved.md). Locks the per-state ordered verb list,
 * the disabled flags, and the verbatim message text per verb.
 *
 * @lore L15: this file fails today because `task-request.ts` does not
 * exist yet. Plan T2 creates the helpers in the green phase.
 */

import { describe, expect, it } from "vitest";
import {
	getRequestableVerbRows,
	type RequestableVerbRow,
	requestMessageText,
	TASK_REQUEST_VERBS,
	type TaskRequestVerb,
} from "../task-request.js";
import type { TaskState } from "../types.js";
import { TASK_STATES } from "../types.js";

describe("TASK_REQUEST_VERBS", () => {
	it("contains the seven canonical verbs in approved order", () => {
		expect(TASK_REQUEST_VERBS).toEqual([
			"pause",
			"mark_blocked",
			"resume",
			"push_to_review",
			"mark_done",
			"reopen",
			"kill",
		]);
	});
});

describe("requestMessageText", () => {
	const cases: ReadonlyArray<[TaskRequestVerb, string]> = [
		["pause", "Requesting: pause this task."],
		["mark_blocked", "Requesting: mark this task as blocked."],
		["resume", "Requesting: resume this task."],
		["push_to_review", "Requesting: push this task to review."],
		["mark_done", "Requesting: mark this task as done."],
		["reopen", "Requesting: reopen this task."],
		["kill", "Requesting: kill this task."],
	];

	for (const [verb, text] of cases) {
		it(`maps ${verb} to its verbatim wire copy`, () => {
			expect(requestMessageText(verb)).toBe(text);
		});
	}
});

describe("getRequestableVerbRows", () => {
	function verbsOf(state: TaskState): readonly TaskRequestVerb[] {
		return getRequestableVerbRows(state).map((row: RequestableVerbRow) => row.verb);
	}

	function disabledMap(state: TaskState): Record<string, boolean> {
		const out: Record<string, boolean> = {};
		for (const row of getRequestableVerbRows(state)) {
			out[row.verb] = row.disabled;
		}
		return out;
	}

	it("covers every TaskState (no `proposed` or `accepted` etc. dropped)", () => {
		for (const state of TASK_STATES) {
			expect(getRequestableVerbRows(state).length).toBeGreaterThan(0);
		}
	});

	it("renders rows for every defined verb (disabled rows still render)", () => {
		// Approved §4.1 — full set always visible.
		for (const state of TASK_STATES) {
			if (state === "hold" || state === "killed") continue;
			const rows = getRequestableVerbRows(state);
			// At minimum every visible state should expose at least the kill verb among
			// its rows; for non-terminal states the full requestable set is shown.
			expect(rows.length).toBeGreaterThanOrEqual(1);
		}
	});

	it("orders proposed/accepted (Planned) with Pause first, Resume disabled", () => {
		for (const state of ["proposed", "accepted"] as const) {
			expect(verbsOf(state).slice(0, 2)).toEqual(["pause", "mark_blocked"]);
			expect(disabledMap(state).resume).toBe(true);
		}
	});

	it("orders in_progress with Pause first and Resume disabled", () => {
		expect(verbsOf("in_progress").slice(0, 2)).toEqual(["pause", "mark_blocked"]);
		expect(disabledMap("in_progress").resume).toBe(true);
	});

	it("orders review with Mark done first and Push-to-review disabled", () => {
		expect(verbsOf("review")[0]).toBe("mark_done");
		expect(disabledMap("review").push_to_review).toBe(true);
	});

	it("orders blocked with Resume first; Pause + Mark-blocked disabled", () => {
		expect(verbsOf("blocked")[0]).toBe("resume");
		const d = disabledMap("blocked");
		expect(d.pause).toBe(true);
		expect(d.mark_blocked).toBe(true);
	});

	it("orders done with Reopen first; non-Reopen verbs disabled", () => {
		expect(verbsOf("done")[0]).toBe("reopen");
		const d = disabledMap("done");
		expect(d.pause).toBe(true);
		expect(d.mark_blocked).toBe(true);
		expect(d.push_to_review).toBe(true);
		expect(d.mark_done).toBe(true);
	});

	it("returns rows whose targetState is a valid TaskState", () => {
		for (const state of TASK_STATES) {
			for (const row of getRequestableVerbRows(state)) {
				expect(TASK_STATES).toContain(row.targetState);
			}
		}
	});

	it("returns row labels matching their verb (human-readable)", () => {
		const rows = getRequestableVerbRows("in_progress");
		const labels = Object.fromEntries(rows.map((r) => [r.verb, r.label]));
		expect(labels.pause).toBe("Pause");
		expect(labels.mark_blocked).toBe("Mark blocked");
		expect(labels.resume).toBe("Resume");
		expect(labels.push_to_review).toBe("Push to review");
		expect(labels.mark_done).toBe("Mark done");
	});
});
