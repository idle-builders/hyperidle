/**
 * AN1 — Unit tests for the harness projection.
 *
 * AC: "A user can make a service available by relying on their harness/environment's
 *     existing auth — and afterward see it listed."
 *
 * The harness projection maps the user's harness capability descriptor / MCP
 * config into derived ServiceConnectionView[] rows. These rows:
 *   - have removable: false (you cannot revoke what the harness owns)
 *   - have authSource: "harness"
 *   - have no encryptedToken (HyperIdle stores nothing for source 1)
 *   - have health derived from the descriptor state
 *
 * These tests fail until:
 *   packages/server/src/services/harness-connection-projection.ts is created.
 *
 * Expected export:
 *   projectHarnessConnections(descriptor: HarnessCapabilityDescriptor | null):
 *     ServiceConnectionView[]
 */

import { describe, expect, it } from "vitest";
import { projectHarnessConnections } from "../harness-connection-projection.js";

// A minimal fixture descriptor shape — the actual type comes from the harness
// capability descriptor in the AM series. The projection only needs the tool
// names / MCP servers and their health status.

const READY_HARNESS_DESCRIPTOR = {
	type: "claude-code",
	name: "Claude Code",
	discovery: { state: "ready" as const, version: "2.1.178" },
	mcpServers: [
		{ name: "GitHub", url: "https://mcp.github.com", health: "usable" as const },
		{ name: "Git", url: null, health: "usable" as const },
	],
};

const UNAUTHENTICATED_DESCRIPTOR = {
	type: "codex",
	name: "Codex",
	discovery: { state: "unauthenticated" as const },
	mcpServers: [],
};

describe("AN1 — projectHarnessConnections", () => {
	it("returns [] for null descriptor (no harness detected)", () => {
		const result = projectHarnessConnections(null);
		expect(result).toEqual([]);
	});

	it("returns [] when descriptor has no mcp servers", () => {
		const result = projectHarnessConnections(UNAUTHENTICATED_DESCRIPTOR);
		expect(result).toHaveLength(0);
	});

	it("projects each mcp server into a ServiceConnectionView row", () => {
		const result = projectHarnessConnections(READY_HARNESS_DESCRIPTOR);
		expect(result).toHaveLength(2);
	});

	it("all projected rows have authSource: harness", () => {
		const result = projectHarnessConnections(READY_HARNESS_DESCRIPTOR);
		for (const row of result) {
			expect(row.authSource).toBe("harness");
		}
	});

	it("all projected rows have removable: false", () => {
		const result = projectHarnessConnections(READY_HARNESS_DESCRIPTOR);
		for (const row of result) {
			expect(row.removable).toBe(false);
		}
	});

	it("projected rows carry no token/encryptedToken field (HyperIdle stores nothing)", () => {
		const result = projectHarnessConnections(READY_HARNESS_DESCRIPTOR);
		for (const row of result) {
			const keys = Object.keys(row);
			expect(keys).not.toContain("token");
			expect(keys).not.toContain("encryptedToken");
			expect(keys).not.toContain("encryptedValue");
		}
	});

	it("projected row health comes from the descriptor server health", () => {
		const result = projectHarnessConnections(READY_HARNESS_DESCRIPTOR);
		expect(result.every((r) => r.health === "usable")).toBe(true);
	});
});
