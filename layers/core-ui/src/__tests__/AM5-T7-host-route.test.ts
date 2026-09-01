// AM5 T7 — H5 route-seam fixes.
// RED phase: proves the new host-route behavior before implementation.
//
// H5 changes:
//   - host(artifact) → /artifacts/:id  (was /work/artifact/:id — dead route)
//   - host(task)     → null            (no betId in scope; documented no-op, BLOCKER-1)

import { describe, expect, it, vi } from "vitest";
import { resolveHostRoute } from "../services/host-route.js";
import { createOpenHandler } from "../services/open-handler.js";

// ── resolveHostRoute direct ───────────────────────────────────────────────────

describe("resolveHostRoute (H5 fixes)", () => {
	it("artifact → /artifacts/:id (H5 fix, was /work/artifact/:id)", () => {
		expect(resolveHostRoute("artifact", "art-42")).toBe("/artifacts/art-42");
	});

	// @lore BB1: task now navigates directly — no betId needed
	it("task → /work/task/:id (BB1: was a no-op when bet route needed betId)", () => {
		expect(resolveHostRoute("task", "task-99")).toBe("/work/task/task-99");
	});

	// Regression guard: unchanged cases must still pass
	it("task → /work/task/:id with correct id", () => {
		expect(resolveHostRoute("task", "task-5")).toBe("/work/task/task-5");
	});

	it("knowledge_item → /knowledge/:id (unchanged)", () => {
		expect(resolveHostRoute("knowledge_item", "ki-1")).toBe("/knowledge/ki-1");
	});

	it("agent → /work/agent/:id (unchanged)", () => {
		expect(resolveHostRoute("agent", "ag-1")).toBe("/agents/ag-1");
	});

	it("team → /work/team/:id (unchanged)", () => {
		expect(resolveHostRoute("team", "tm-1")).toBe("/work/team/tm-1");
	});

	it("user → null (unchanged)", () => {
		expect(resolveHostRoute("user", "u-1")).toBeNull();
	});

	it("factory → null (unchanged)", () => {
		expect(resolveHostRoute("factory", "f-1")).toBeNull();
	});
});

// ── createOpenHandler with host(artifact) ────────────────────────────────────

describe("createOpenHandler: H5 host(artifact) → /artifacts/:id", () => {
	it("host(artifact) navigates to /artifacts/:id", () => {
		const nav = vi.fn();
		createOpenHandler(nav, {})({ route: "host", hostKind: "artifact", hostId: "art-123" });
		expect(nav).toHaveBeenCalledWith("/artifacts/art-123");
	});
});

// @lore BB1: host(task) now navigates to /work/task/:id — not a no-op
describe("createOpenHandler: host(task) → navigates to /work/task/:id (BB1)", () => {
	it("host(task) calls navigate with /work/task/:id", () => {
		const nav = vi.fn();
		createOpenHandler(nav, {})({ route: "host", hostKind: "task", hostId: "task-9" });
		expect(nav).toHaveBeenCalledWith("/work/task/task-9");
	});
});

// ── AC6: same OpenTarget from two contexts → identical path ──────────────────

describe("AC6: same artifact OpenTarget from two contexts → identical path", () => {
	it("artifact target resolves identically regardless of context", () => {
		const nav1 = vi.fn();
		const nav2 = vi.fn();
		const target = { route: "host" as const, hostKind: "artifact" as const, hostId: "art-99" };
		createOpenHandler(nav1, {})(target);
		createOpenHandler(nav2, { onOpenSession: vi.fn() })(target);
		// Both should navigate to the same path
		expect(nav1).toHaveBeenCalledWith(nav2.mock.calls[0]![0]);
		expect(nav1).toHaveBeenCalledWith("/artifacts/art-99");
	});
});
