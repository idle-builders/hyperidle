/**
 * AN1 RED — ServiceConnectionProjection unit tests.
 *
 * AC coverage:
 *   AC1 (inherited): GET unions held + inherited; inherited group uses projected
 *                    view with authSource:"inherited" and removable:false
 *   AC7 (concept): inherited never persisted — projection only, no DB row
 *   AC7: DELETE of inherited id → 404 (no DB row to delete)
 *   Concept hard-rule 4: inherited stores no auth material (no secret field)
 *   AC1: projection enumerates identity only (service + source harness, NO token)
 *   AN3 scope: absent harness removes the inherited entry; honest none-state
 *
 * FAILS until packages/server/src/services/service-connection-projection.ts is created.
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { describe, expect, it } from "vitest";
import { projectInheritedConnections } from "../service-connection-projection.js";

// Minimal descriptor shape for projection tests
function makeDescriptor(
	type: string,
	inheritedTools: HarnessCapabilityDescriptor["inheritedTools"],
): HarnessCapabilityDescriptor {
	return {
		type,
		name: type,
		kind: "local",
		accessMode: "provider-subscription-cli",
		authAction: { kind: "none", label: "None" },
		discovery: { state: "ready" },
		models: [],
		runtime: {
			preCompactionTrigger: false,
			subAgents: false,
			mcpSupport: false,
			modelProviders: [],
			fileEditing: false,
			toolUse: false,
		},
		modelProviders: [],
		inheritedTools,
	};
}

describe("projectInheritedConnections", () => {
	// AC1 (inherited): basic projection
	describe("projection from descriptor with inherited tools", () => {
		it("returns a ServiceConnectionView for each inherited tool", () => {
			const descriptors = [
				makeDescriptor("claude-code", [
					{ name: "github", kind: "mcp-server", harness: "claude-code", health: "working" },
					{ name: "linear", kind: "mcp-server", harness: "claude-code", health: "working" },
				]),
			];

			const views = projectInheritedConnections(descriptors);

			expect(views).toHaveLength(2);
		});

		it("all projected views have authSource:'inherited'", () => {
			const descriptors = [
				makeDescriptor("claude-code", [
					{ name: "github", kind: "mcp-server", harness: "claude-code", health: "working" },
				]),
			];

			const views = projectInheritedConnections(descriptors);
			for (const v of views) {
				expect(v.authSource).toBe("inherited");
			}
		});

		it("all projected views have removable:false (concept hard-rule 7)", () => {
			const descriptors = [
				makeDescriptor("claude-code", [
					{ name: "stripe", kind: "cli", harness: "environment", health: "working" },
				]),
			];

			const views = projectInheritedConnections(descriptors);
			for (const v of views) {
				expect(v.removable).toBe(false);
			}
		});

		it("projected view id uses inherited: prefix (sentinel, not a DB id)", () => {
			const descriptors = [
				makeDescriptor("claude-code", [
					{ name: "github", kind: "mcp-server", harness: "claude-code", health: "working" },
				]),
			];

			const views = projectInheritedConnections(descriptors);
			expect(views[0]?.id).toMatch(/^inherited:/);
		});

		it("projected view carries no secret, no token, no encryptedToken field", () => {
			const descriptors = [
				makeDescriptor("claude-code", [
					{ name: "gh", kind: "cli", harness: "environment", health: "working" },
				]),
			];

			const views = projectInheritedConnections(descriptors);
			for (const v of views) {
				// AC4 / concept hard-rule 4: no auth material in projected view
				expect(v).not.toHaveProperty("secret");
				expect(v).not.toHaveProperty("token");
				expect(v).not.toHaveProperty("encryptedToken");
				expect(v).not.toHaveProperty("encrypted_token");
			}
		});

		it("projected view 'via' string contains harness name (identity only)", () => {
			const descriptors = [
				makeDescriptor("claude-code", [
					{ name: "linear", kind: "mcp-server", harness: "claude-code", health: "working" },
				]),
			];

			const views = projectInheritedConnections(descriptors);
			expect(views[0]?.via).toContain("claude-code");
		});
	});

	// AN3 scope: honest none-state when nothing inherited
	describe("empty descriptor list → no views", () => {
		it("returns empty array when descriptors array is empty", () => {
			const views = projectInheritedConnections([]);
			expect(views).toHaveLength(0);
		});

		it("returns empty array when descriptor has no inheritedTools", () => {
			const descriptors = [makeDescriptor("claude-code", [])];
			const views = projectInheritedConnections(descriptors);
			expect(views).toHaveLength(0);
		});
	});

	// AC7: disconnected/absent harness server removes inherited entry
	describe("absent harness → removes inherited entry", () => {
		it("excludes tools from a descriptor with no inherited tools", () => {
			const descriptors = [
				makeDescriptor("claude-code", []),
				makeDescriptor("codex", [
					{ name: "github", kind: "mcp-server", harness: "codex", health: "working" },
				]),
			];

			const views = projectInheritedConnections(descriptors);
			// Only codex has a tool
			expect(views).toHaveLength(1);
		});
	});

	// Dedup: same service from multiple harnesses → one row (architecture §7)
	describe("deduplication across harnesses", () => {
		it("deduplicates by service name when the same service appears in multiple harnesses", () => {
			const descriptors = [
				makeDescriptor("claude-code", [
					{ name: "github", kind: "mcp-server", harness: "claude-code", health: "working" },
				]),
				makeDescriptor("codex", [
					{ name: "github", kind: "mcp-server", harness: "codex", health: "working" },
				]),
			];

			const views = projectInheritedConnections(descriptors);
			// First wins — dedupe by service
			expect(views.filter((v: { service: string }) => v.service === "github")).toHaveLength(1);
		});
	});

	// Type guard: projectInheritedConnections returns ServiceConnectionView[]
	describe("return type", () => {
		it("returns an array", () => {
			const views = projectInheritedConnections([]);
			expect(Array.isArray(views)).toBe(true);
		});

		it("each view has the expected ServiceConnectionView fields", () => {
			const descriptors = [
				makeDescriptor("claude-code", [
					{ name: "stripe", kind: "cli", harness: "environment", health: "working" },
				]),
			];

			const views = projectInheritedConnections(descriptors);
			expect(views).toHaveLength(1);
			const v = views[0];
			expect(v).toHaveProperty("id");
			expect(v).toHaveProperty("service");
			expect(v).toHaveProperty("via");
			expect(v).toHaveProperty("authSource");
			expect(v).toHaveProperty("health");
			expect(v).toHaveProperty("removable");
		});
	});
});
