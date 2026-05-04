/**
 * L15 — `requestableStatesFor` and `generateRequestMessageText` unit tests.
 *
 * Source of truth: `plans/L15-plan.md` §3.2 + approved.md §3 (state-gating
 * table) + §5 (generated text table).
 *
 * Red phase: `packages/shared/src/task-request.ts` does not exist yet, so
 * the dynamic imports below will fail to resolve and every test fails with
 * the right error. Green phase makes them pass per the table contracts.
 */

import { describe, expect, it } from "vitest";
import { TASK_STATES, type TaskState } from "../types.js";

describe("L15 — requestableStatesFor (approved.md §3)", () => {
	it("returns [] for proposed (no requestable targets)", async () => {
		const { requestableStatesFor } = await import("../task-request.js");
		expect(requestableStatesFor("proposed")).toEqual([]);
	});

	it("returns [in_progress, blocked, killed] for accepted", async () => {
		const { requestableStatesFor } = await import("../task-request.js");
		expect(requestableStatesFor("accepted")).toEqual(["in_progress", "blocked", "killed"]);
	});

	it("returns [in_progress, killed] for hold", async () => {
		const { requestableStatesFor } = await import("../task-request.js");
		expect(requestableStatesFor("hold")).toEqual(["in_progress", "killed"]);
	});

	it("returns [blocked, review, done, killed] for in_progress", async () => {
		const { requestableStatesFor } = await import("../task-request.js");
		expect(requestableStatesFor("in_progress")).toEqual(["blocked", "review", "done", "killed"]);
	});

	it("returns [in_progress, killed] for blocked", async () => {
		const { requestableStatesFor } = await import("../task-request.js");
		expect(requestableStatesFor("blocked")).toEqual(["in_progress", "killed"]);
	});

	it("returns [done, blocked, killed] for review", async () => {
		const { requestableStatesFor } = await import("../task-request.js");
		expect(requestableStatesFor("review")).toEqual(["done", "blocked", "killed"]);
	});

	it("returns [killed] for done", async () => {
		const { requestableStatesFor } = await import("../task-request.js");
		expect(requestableStatesFor("done")).toEqual(["killed"]);
	});

	it("returns [] for killed (terminal)", async () => {
		const { requestableStatesFor } = await import("../task-request.js");
		expect(requestableStatesFor("killed")).toEqual([]);
	});

	it("is exhaustive over TASK_STATES (every state has a defined output)", async () => {
		const { requestableStatesFor } = await import("../task-request.js");
		for (const s of TASK_STATES) {
			const out = requestableStatesFor(s as TaskState);
			expect(Array.isArray(out)).toBe(true);
			// Every returned target must itself be a valid TaskState.
			for (const target of out) {
				expect(TASK_STATES).toContain(target);
			}
		}
	});

	it("never includes the current state in its own requestable targets", async () => {
		const { requestableStatesFor } = await import("../task-request.js");
		for (const s of TASK_STATES) {
			expect(requestableStatesFor(s as TaskState)).not.toContain(s);
		}
	});
});

describe("L15 — generateRequestMessageText (approved.md §5)", () => {
	it("state target only → 'Please move \"{title}\" to {verb}.'", async () => {
		const { generateRequestMessageText } = await import("../task-request.js");
		expect(
			generateRequestMessageText({
				taskTitle: "Implement login",
				targetState: "blocked",
				targetVerbLabel: "Block",
				note: null,
			}),
		).toBe('Please move "Implement login" to Block.');
	});

	it("state target + note → appends ' — {note}'", async () => {
		const { generateRequestMessageText } = await import("../task-request.js");
		expect(
			generateRequestMessageText({
				taskTitle: "Implement login",
				targetState: "blocked",
				targetVerbLabel: "Block",
				note: "waiting on staging deploy",
			}),
		).toBe('Please move "Implement login" to Block — waiting on staging deploy');
	});

	it("note only (no target) → 'Note: {note}'", async () => {
		const { generateRequestMessageText } = await import("../task-request.js");
		expect(
			generateRequestMessageText({
				taskTitle: "Implement login",
				targetState: null,
				targetVerbLabel: null,
				note: "FYI the design changed",
			}),
		).toBe("Note: FYI the design changed");
	});

	it("trims whitespace from the note", async () => {
		const { generateRequestMessageText } = await import("../task-request.js");
		expect(
			generateRequestMessageText({
				taskTitle: "T",
				targetState: null,
				targetVerbLabel: null,
				note: "   trailing whitespace   ",
			}),
		).toBe("Note: trailing whitespace");
	});

	it("throws when neither target nor note is provided", async () => {
		const { generateRequestMessageText } = await import("../task-request.js");
		expect(() =>
			generateRequestMessageText({
				taskTitle: "T",
				targetState: null,
				targetVerbLabel: null,
				note: null,
			}),
		).toThrow();
	});

	it("throws when note is empty/whitespace AND no target", async () => {
		const { generateRequestMessageText } = await import("../task-request.js");
		expect(() =>
			generateRequestMessageText({
				taskTitle: "T",
				targetState: null,
				targetVerbLabel: null,
				note: "    ",
			}),
		).toThrow();
	});
});
