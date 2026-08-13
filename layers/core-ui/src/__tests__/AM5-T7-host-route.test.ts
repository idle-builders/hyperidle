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

	it("task → null (BLOCKER-1: no betId in scope — documented no-op)", () => {
		expect(resolveHostRoute("task", "task-99")).toBeNull();
	});

	// Regression guard: unchanged cases must still pass
	it("bet → /work/bet/:id (unchanged)", () => {
		expect(resolveHostRoute("bet", "bet-5")).toBe("/work/bet/bet-5");
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

describe("createOpenHandler: H5 host(task) → null (no-op)", () => {
	it("host(task) does NOT call navigate (BLOCKER-1 no-op)", () => {
		const nav = vi.fn();
		createOpenHandler(nav, {})({ route: "host", hostKind: "task", hostId: "task-9" });
		expect(nav).not.toHaveBeenCalled();
	});
});

// ── AC6: same OpenTarget from two contexts → identical path ──────────────────

describe("AC6: same artifact OpenTarget from two contexts → identical path", () => {
	it("artifact target resolves identically regardless of context", () => {
		const nav1 = vi.fn();
		const nav2 = vi.fn();
		const target = { route: "host" as const, hostKind: "artifact" as const, hostId: "art-99" };
		createOpenHandler(nav1, {})(target);
		createOpenHandler(nav2, { betId: "some-bet" })(target);
		// Both should navigate to the same path
		expect(nav1).toHaveBeenCalledWith(nav2.mock.calls[0]![0]);
		expect(nav1).toHaveBeenCalledWith("/artifacts/art-99");
	});
});
