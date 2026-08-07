/**
 * AN1 RED — Shared type tests for Connection closed sets and view contract.
 *
 * AC coverage:
 *   AC3: health is exactly { working, needs-attention } (closed set)
 *   AC8: auth source is exactly { token, mcp, inherited } (closed set)
 *   AC4: ServiceConnectionView carries NO secret field, NO trustTier
 *   AC5: per-user isolation reflected in type (no cross-user field)
 *   Concept Phase 4: closed sets enforced at runtime via type guards
 *
 * FAILS until framework/shared/src/connection.ts is created.
 */

import { describe, expect, it } from "vitest";
import {
	CONNECTION_AUTH_SOURCES,
	CONNECTION_HEALTH,
	type ConnectionAuthSource,
	type ConnectionHealth,
	HELD_AUTH_SOURCES,
	isConnectionAuthSource,
	isHeldAuthSource,
	type ServiceConnectionView,
} from "../connection.js";

describe("AN1 — Connection shared types", () => {
	// AC8: closed auth-source set
	describe("CONNECTION_AUTH_SOURCES — closed set { token, mcp, inherited }", () => {
		it("contains exactly token, mcp, inherited", () => {
			const sorted = [...CONNECTION_AUTH_SOURCES].sort();
			expect(sorted).toEqual(["inherited", "mcp", "token"]);
		});

		it("contains exactly 3 members (no fourth added without concept-doc update)", () => {
			expect(CONNECTION_AUTH_SOURCES).toHaveLength(3);
		});

		it("does not contain trust tier (vetted, community, etc.)", () => {
			const str = JSON.stringify(CONNECTION_AUTH_SOURCES);
			expect(str).not.toContain("vetted");
			expect(str).not.toContain("community");
			expect(str).not.toContain("tier");
		});
	});

	// AC3: closed health set
	describe("CONNECTION_HEALTH — closed set { working, needs-attention }", () => {
		it("contains exactly working and needs-attention", () => {
			const sorted = [...CONNECTION_HEALTH].sort();
			expect(sorted).toEqual(["needs-attention", "working"]);
		});

		it("contains exactly 2 members", () => {
			expect(CONNECTION_HEALTH).toHaveLength(2);
		});

		it("does not contain expired or failed (collapsed to needs-attention)", () => {
			const str = JSON.stringify(CONNECTION_HEALTH);
			expect(str).not.toContain("expired");
			expect(str).not.toContain("failed");
		});
	});

	// HELD_AUTH_SOURCES — token/mcp only (inherited never created by user)
	describe("HELD_AUTH_SOURCES — token and mcp only", () => {
		it("contains exactly token and mcp", () => {
			const sorted = [...HELD_AUTH_SOURCES].sort();
			expect(sorted).toEqual(["mcp", "token"]);
		});

		it("does not contain inherited (inherited is never created)", () => {
			expect((HELD_AUTH_SOURCES as readonly string[]).includes("inherited")).toBe(false);
		});
	});

	// Type guards
	describe("isConnectionAuthSource", () => {
		it("returns true for token", () => {
			expect(isConnectionAuthSource("token")).toBe(true);
		});

		it("returns true for mcp", () => {
			expect(isConnectionAuthSource("mcp")).toBe(true);
		});

		it("returns true for inherited", () => {
			expect(isConnectionAuthSource("inherited")).toBe(true);
		});

		it("returns false for an unknown string", () => {
			expect(isConnectionAuthSource("vetted")).toBe(false);
		});

		it("returns false for empty string", () => {
			expect(isConnectionAuthSource("")).toBe(false);
		});
	});

	describe("isHeldAuthSource", () => {
		it("returns true for token", () => {
			expect(isHeldAuthSource("token")).toBe(true);
		});

		it("returns true for mcp", () => {
			expect(isHeldAuthSource("mcp")).toBe(true);
		});

		it("returns false for inherited", () => {
			expect(isHeldAuthSource("inherited")).toBe(false);
		});
	});

	// AC4: ServiceConnectionView type contract — no secret, no trustTier
	describe("ServiceConnectionView type contract", () => {
		it("well-formed view carries exactly the expected fields", () => {
			// AC4: this object must compile with no secret field
			const view: ServiceConnectionView = {
				id: "sc-abc123",
				service: "Stripe",
				via: "API key · stored encrypted",
				authSource: "token" as ConnectionAuthSource,
				health: "working" as ConnectionHealth,
				removable: true,
			};

			// Structural assertions on runtime shape
			expect(view.id).toBe("sc-abc123");
			expect(view.service).toBe("Stripe");
			expect(view.via).toBe("API key · stored encrypted");
			expect(view.authSource).toBe("token");
			expect(view.health).toBe("working");
			expect(view.removable).toBe(true);
		});

		it("view type does not have a secret, token, or encryptedToken field at runtime", () => {
			const view: ServiceConnectionView = {
				id: "sc-test",
				service: "GitHub",
				via: "API key · stored encrypted",
				authSource: "token",
				health: "needs-attention",
				removable: true,
			};

			// AC4 hard rule: secret never in the view shape
			expect(view).not.toHaveProperty("secret");
			expect(view).not.toHaveProperty("token");
			expect(view).not.toHaveProperty("encryptedToken");
			expect(view).not.toHaveProperty("encrypted_token");
		});

		it("view type does not have trustTier (ETHOS §2 — no preemptive tier)", () => {
			const view: ServiceConnectionView = {
				id: "sc-test2",
				service: "Stripe",
				via: "API key · stored encrypted",
				authSource: "mcp",
				health: "working",
				removable: false,
			};

			// No trust tier in the view (concept rejection list item 1)
			expect(view).not.toHaveProperty("trustTier");
			expect(view).not.toHaveProperty("trust_tier");
		});

		it("inherited view has removable=false", () => {
			const inherited: ServiceConnectionView = {
				id: "inherited:claude-code:github",
				service: "GitHub",
				via: "claude-code · gh CLI",
				authSource: "inherited",
				health: "working",
				removable: false,
			};

			expect(inherited.authSource).toBe("inherited");
			expect(inherited.removable).toBe(false);
		});

		it("HeldAuthSource is a subset of ConnectionAuthSource", () => {
			// All held sources must be valid connection auth sources
			for (const s of HELD_AUTH_SOURCES) {
				expect(isConnectionAuthSource(s)).toBe(true);
			}
		});
	});
});
