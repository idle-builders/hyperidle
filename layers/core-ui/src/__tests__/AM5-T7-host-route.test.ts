// AM5 T7 — H5 route-seam fixes.
//
// H5 changes:
//   - host(task) → /work/task/:id (BB1: was a no-op; the bet parent route is gone)
//
// artifacts-become-knowledge: "artifact" host kind removed.
//   - The /artifacts/:id page is deleted; artifact is no longer a valid thread host.
//   - Tests for host(artifact) → /artifacts/:id removed (the subject is gone).
//   - AC6 artifact variant removed for the same reason.

import { describe, expect, it, vi } from "vitest";
import { resolveHostRoute } from "../services/host-route.js";
import { createOpenHandler } from "../services/open-handler.js";

// ── resolveHostRoute direct ───────────────────────────────────────────────────

describe("resolveHostRoute", () => {
	// @lore BB1: task now navigates directly — no betId needed
	it("task → /work/task/:id (BB1: was a no-op when bet route needed betId)", () => {
		expect(resolveHostRoute("task", "task-99")).toBe("/work/task/task-99");
	});

	// Regression guard: unchanged cases must still pass
	it("task → /work/task/:id with correct id", () => {
		expect(resolveHostRoute("task", "task-5")).toBe("/work/task/task-5");
	});

	it("document → /knowledge/:id", () => {
		expect(resolveHostRoute("document", "ki-1")).toBe("/knowledge/ki-1");
	});

	it("agent → /agents/:id", () => {
		expect(resolveHostRoute("agent", "ag-1")).toBe("/agents/ag-1");
	});

	it("team → /work/team/:id", () => {
		expect(resolveHostRoute("team", "tm-1")).toBe("/work/team/tm-1");
	});

	it("user → null", () => {
		expect(resolveHostRoute("user", "u-1")).toBeNull();
	});

	it("factory → null", () => {
		expect(resolveHostRoute("factory", "f-1")).toBeNull();
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
