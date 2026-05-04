/**
 * L15 — `inlineRefSchema` Zod-validation tests for the new
 * `request_state_change` variant. Source of truth: `plans/L15-plan.md` §3.4.
 *
 * Red phase: `inlineRefSchema` is currently `z.object({ kind: enum([...4 kinds]), id })`
 * — a non-discriminated shape that rejects `request_state_change` and accepts
 * malformed task ids. After /write-code the schema becomes a
 * `z.discriminatedUnion('kind', […5 variants])` per the plan.
 */

import { describe, expect, it } from "vitest";
import { messageInputSchema } from "../threads-schema.js";

function plainBody(refs: unknown): unknown {
	return {
		type: "plain",
		payload: {
			text: "x",
			refs,
		},
		clientKey: "uuid-12345678",
	};
}

describe("L15 — inlineRefSchema admits request_state_change variant", () => {
	it("validates a request_state_change ref with taskId + requestedState", () => {
		const ok = messageInputSchema.safeParse(
			plainBody([
				{
					kind: "request_state_change",
					taskId: "task-1",
					requestedState: "blocked",
				},
			]),
		);
		expect(ok.success).toBe(true);
	});

	it("validates every TaskState as a legal requestedState", () => {
		// Per plan §3.4 the variant uses z.enum(TASK_STATES) so all 8 states pass.
		const states = [
			"proposed",
			"accepted",
			"hold",
			"in_progress",
			"blocked",
			"review",
			"done",
			"killed",
		] as const;
		for (const s of states) {
			const r = messageInputSchema.safeParse(
				plainBody([{ kind: "request_state_change", taskId: "t-1", requestedState: s }]),
			);
			expect(r.success).toBe(true);
		}
	});

	it("rejects request_state_change with an unknown requestedState", () => {
		const bad = messageInputSchema.safeParse(
			plainBody([
				{
					kind: "request_state_change",
					taskId: "task-1",
					requestedState: "not-a-state",
				},
			]),
		);
		expect(bad.success).toBe(false);
	});

	it("rejects request_state_change with empty taskId", () => {
		const bad = messageInputSchema.safeParse(
			plainBody([
				{
					kind: "request_state_change",
					taskId: "",
					requestedState: "blocked",
				},
			]),
		);
		expect(bad.success).toBe(false);
	});

	it("rejects request_state_change with missing taskId", () => {
		const bad = messageInputSchema.safeParse(
			plainBody([
				{
					kind: "request_state_change",
					requestedState: "blocked",
				},
			]),
		);
		expect(bad.success).toBe(false);
	});

	it("rejects request_state_change with missing requestedState", () => {
		const bad = messageInputSchema.safeParse(
			plainBody([
				{
					kind: "request_state_change",
					taskId: "task-1",
				},
			]),
		);
		expect(bad.success).toBe(false);
	});

	it("still validates legacy task/knowledge_item/artifact/bet refs (back-compat)", () => {
		const r = messageInputSchema.safeParse(
			plainBody([
				{ kind: "knowledge_item", id: "k-1" },
				{ kind: "task", id: "t-1" },
				{ kind: "artifact", id: "a-1" },
				{ kind: "bet", id: "b-1" },
			]),
		);
		expect(r.success).toBe(true);
	});

	it("rejects refs with an unknown kind (closed enum)", () => {
		const bad = messageInputSchema.safeParse(plainBody([{ kind: "fnord", id: "x" }]));
		expect(bad.success).toBe(false);
	});
});
