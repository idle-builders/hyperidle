import { describe, expect, it } from "vitest";
import { resolveHostRoute } from "../host-route.js";

describe("resolveHostRoute", () => {
	it("resolves task to /work/task/:id", () => {
		expect(resolveHostRoute("task", "task-123")).toBe("/work/task/task-123");
		expect(resolveHostRoute("task", "task-456")).toBe("/work/task/task-456");
	});

	it("resolves document to /documents/:id", () => {
		expect(resolveHostRoute("document", "ki-789")).toBe("/documents/ki-789");
	});

	it("resolves agent to /agents/:id", () => {
		expect(resolveHostRoute("agent", "agent-001")).toBe("/agents/agent-001");
	});

	it("resolves team to /work/team/:id", () => {
		expect(resolveHostRoute("team", "team-001")).toBe("/work/team/team-001");
	});

	it("returns null for self-referential host kinds (user, factory)", () => {
		expect(resolveHostRoute("user", "u-123")).toBeNull();
		expect(resolveHostRoute("factory", "factory-1")).toBeNull();
	});
});
