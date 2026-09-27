// artifact was a valid thread host; the /artifacts/:id page is deleted and the
// host kind removed, so no route resolves for it anymore.

import { describe, expect, it, vi } from "vitest";
import { resolveHostRoute } from "../services/host-route.js";
import { createOpenHandler } from "../services/open-handler.js";

describe("resolveHostRoute", () => {
	it("task → /work/task/:id", () => {
		expect(resolveHostRoute("task", "task-5")).toBe("/work/task/task-5");
	});

	it("document → /documents/:id", () => {
		expect(resolveHostRoute("document", "ki-1")).toBe("/documents/ki-1");
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

describe("createOpenHandler: host(task) → navigates to /work/task/:id", () => {
	it("host(task) calls navigate with /work/task/:id", () => {
		const nav = vi.fn();
		createOpenHandler(nav, {})({ route: "host", hostKind: "task", hostId: "task-9" });
		expect(nav).toHaveBeenCalledWith("/work/task/task-9");
	});
});
