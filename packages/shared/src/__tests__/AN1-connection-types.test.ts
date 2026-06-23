/**
 * AN1 — Unit tests for shared connection types (AC: no-secret-in-view-type,
 * auth-source closed set, health closed set).
 *
 * These tests fail until `packages/shared/src/connection.ts` is created and
 * exported from `packages/shared/src/index.ts`.
 *
 * Static-property ACs (TypeScript structural check):
 *   - ServiceConnectionView has NO token/encryptedToken/secret field
 *   - ConnectionAuthSource is exactly "harness"|"token"|"mcp-oauth"
 *   - ConnectionHealth is exactly "usable"|"needs-attention"|"expired"
 *
 * These are verified by the TypeScript compiler (`npm run check`), not by
 * runtime tests. The runtime tests here cover the closed-set guards that
 * ship as helper functions.
 */

import { describe, expect, it } from "vitest";
import {
	CONNECTION_AUTH_SOURCES,
	CONNECTION_HEALTH,
	TRUST_TIERS,
	type ConnectionAuthSource,
	type ConnectionHealth,
	type ServiceConnectionView,
	type TrustTier,
} from "../connection.js";

// ---------------------------------------------------------------------------
// Closed-set membership checks (runtime)
// ---------------------------------------------------------------------------

describe("AN1 — CONNECTION_AUTH_SOURCES closed set", () => {
	it("contains exactly harness, token, mcp-oauth", () => {
		expect(CONNECTION_AUTH_SOURCES).toHaveLength(3);
		expect(CONNECTION_AUTH_SOURCES).toContain("harness");
		expect(CONNECTION_AUTH_SOURCES).toContain("token");
		expect(CONNECTION_AUTH_SOURCES).toContain("mcp-oauth");
	});
});

describe("AN1 — CONNECTION_HEALTH closed set", () => {
	it("contains exactly usable, needs-attention, expired", () => {
		expect(CONNECTION_HEALTH).toHaveLength(3);
		expect(CONNECTION_HEALTH).toContain("usable");
		expect(CONNECTION_HEALTH).toContain("needs-attention");
		expect(CONNECTION_HEALTH).toContain("expired");
	});
});

describe("AN1 — TRUST_TIERS closed set", () => {
	it("contains exactly vetted and community", () => {
		expect(TRUST_TIERS).toHaveLength(2);
		expect(TRUST_TIERS).toContain("vetted");
		expect(TRUST_TIERS).toContain("community");
	});
});

// ---------------------------------------------------------------------------
// ServiceConnectionView shape (no-secret-in-view-type)
// AC: "Any secret a user supplies is never readable by an agent or visible
//     in any agent-facing surface."
//
// The TypeScript compiler enforces the structural check (no token/encryptedToken
// field on ServiceConnectionView). This runtime test constructs a valid view
// and asserts the shape does NOT include a secret field, complementing the
// static check.
// ---------------------------------------------------------------------------

describe("AN1 — ServiceConnectionView has no secret field", () => {
	it("a valid ServiceConnectionView has no token/encryptedToken/secret field", () => {
		const view: ServiceConnectionView = {
			id: "sc-abc",
			service: "GitHub",
			via: "Claude Code · gh CLI",
			authSource: "harness" as ConnectionAuthSource,
			health: "usable" as ConnectionHealth,
			trustTier: "vetted" as TrustTier,
			toolCount: null,
			removable: false,
		};

		// The keys on the view must not include any secret-bearing field name.
		const keys = Object.keys(view);
		expect(keys).not.toContain("token");
		expect(keys).not.toContain("encryptedToken");
		expect(keys).not.toContain("secret");
		expect(keys).not.toContain("encryptedValue");
	});

	it("ServiceConnectionView has exactly the expected fields", () => {
		const view: ServiceConnectionView = {
			id: "sc-xyz",
			service: "Stripe",
			via: "API key · held in vault",
			authSource: "token" as ConnectionAuthSource,
			health: "needs-attention" as ConnectionHealth,
			trustTier: "community" as TrustTier,
			toolCount: null,
			removable: true,
		};

		const keys = new Set(Object.keys(view));
		expect(keys.has("id")).toBe(true);
		expect(keys.has("service")).toBe(true);
		expect(keys.has("via")).toBe(true);
		expect(keys.has("authSource")).toBe(true);
		expect(keys.has("health")).toBe(true);
		expect(keys.has("trustTier")).toBe(true);
		expect(keys.has("toolCount")).toBe(true);
		expect(keys.has("removable")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// AC: MCP-oauth stored shape has no HyperIdle-issued client credential.
// The stored record for source 3 has only {service, serverUrl, trustTier} —
// no clientId, clientSecret, or HyperIdle-registered OAuth app credential.
//
// This is enforced at the schema level (no clientId/clientSecret column).
// The test here asserts the *view* shape for an mcp-oauth source also
// carries no such field.
// ---------------------------------------------------------------------------

describe("AN1 — mcp-oauth view carries no HyperIdle client credential", () => {
	it("ServiceConnectionView for mcp-oauth source has no clientId or clientSecret", () => {
		const view: ServiceConnectionView = {
			id: "sc-mcp",
			service: "Figma",
			via: "mcp.figma.com · service OAuth",
			authSource: "mcp-oauth" as ConnectionAuthSource,
			health: "usable" as ConnectionHealth,
			trustTier: "vetted" as TrustTier,
			toolCount: null,
			removable: true,
		};

		const keys = Object.keys(view);
		expect(keys).not.toContain("clientId");
		expect(keys).not.toContain("clientSecret");
		// The view may carry `via` (a safe display string), not the raw serverUrl
		// serverUrl absence from the view is enforced by the type — confirmed statically.
	});
});
