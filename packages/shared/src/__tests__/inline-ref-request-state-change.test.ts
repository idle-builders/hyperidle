/**
 * L15 — `InlineRef` discriminated-union extension for `request_state_change`.
 *
 * Source of truth: `plans/L15-plan.md` §3.1 + CONFUSION-B.
 */

import { describe, expect, it } from "vitest";
import * as shared from "../index.js";
import type { InlineRef } from "../thread.js";

describe("L15 — INLINE_REF_KINDS closed enum (plan §3.1)", () => {
	it("exports INLINE_REF_KINDS containing the 5 variants in stable order", () => {
		const kinds = (shared as unknown as { INLINE_REF_KINDS?: readonly string[] }).INLINE_REF_KINDS;
		expect(kinds).toBeDefined();
		expect(kinds).toEqual(["knowledge_item", "task", "artifact", "bet", "request_state_change"]);
	});

	it("exports the InlineRefKind type re-export from shared/index", () => {
		// Type-only re-export check — we exercise it at runtime by tag matching.
		const kinds = (shared as unknown as { INLINE_REF_KINDS?: readonly string[] }).INLINE_REF_KINDS;
		expect(kinds).toContain("request_state_change");
	});
});

describe("L15 — InlineRef.request_state_change variant shape", () => {
	it("admits a request_state_change variant with taskId + requestedState", () => {
		// Type-level proof via assignability — if InlineRef does not carry the
		// new variant the assignment fails to compile, which is the red signal.
		const ref: InlineRef = {
			kind: "request_state_change",
			taskId: "task-abc",
			requestedState: "blocked",
		};
		expect(ref.kind).toBe("request_state_change");
		// Discriminant narrowing: TS narrows ref to the variant after the kind check.
		if (ref.kind === "request_state_change") {
			expect(ref.taskId).toBe("task-abc");
			expect(ref.requestedState).toBe("blocked");
		}
	});

	it("still admits the legacy task variant unchanged (back-compat)", () => {
		const ref: InlineRef = { kind: "task", id: "task-xyz" };
		expect(ref.kind).toBe("task");
	});
});
