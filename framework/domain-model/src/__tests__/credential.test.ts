/**
 * P3 RED — Credential catalog in shared types (AC-7)
 *
 * AC coverage:
 *  - CREDENTIAL_NAMES has exactly 4 entries (AH1: openai_compatible_api_key promoted)
 *  - isCredentialName("anthropic_api_key") returns true
 *  - isCredentialName("arbitrary_key") returns false
 *  - CREDENTIAL_CATALOG entries have required fields
 *  - CredentialState type includes all expected states
 *  - CREDENTIAL_CATALOG has exactly 4 entries (AH1: openai_compatible_api_key added)
 *  - Each catalog entry has name, label, description, required, testable
 *
 * @lore AH1: openai_compatible_api_key promoted from server_config blob to CREDENTIAL_CATALOG.
 * Count assertions updated from 3 → 4. The fourth entry covers OpenAI-compatible providers.
 */

import { describe, expect, it } from "vitest";
import {
	CREDENTIAL_CATALOG,
	CREDENTIAL_NAMES,
	CREDENTIAL_STATES,
	isCredentialName,
} from "../credential.js";

describe("P3 AC-7 — Credential catalog", () => {
	// @lore There were four names: three model-provider keys plus the shared
	// backend key. HyperIdle stores no model credential any more — a harness
	// authenticates with its own login — so one remains, and it is the only one
	// that was ever really ours to hold.
	describe("CREDENTIAL_NAMES", () => {
		it("holds the shared-backend key and nothing else", () => {
			expect(CREDENTIAL_NAMES).toEqual(["shared_backend_key"]);
		});
	});

	describe("isCredentialName", () => {
		it("returns true for shared_backend_key", () => {
			expect(isCredentialName("shared_backend_key")).toBe(true);
		});

		it("returns false for a model-provider key that used to be in the catalog", () => {
			expect(isCredentialName("anthropic_api_key")).toBe(false);
			expect(isCredentialName("openrouter_api_key")).toBe(false);
			expect(isCredentialName("openai_compatible_api_key")).toBe(false);
		});

		it("returns false for arbitrary_key", () => {
			expect(isCredentialName("arbitrary_key")).toBe(false);
		});

		it("returns false for empty string", () => {
			expect(isCredentialName("")).toBe(false);
		});

		it("returns false for SHARED_BACKEND_KEY (case sensitive)", () => {
			expect(isCredentialName("SHARED_BACKEND_KEY")).toBe(false);
		});

		it("returns false for null coerced to string", () => {
			expect(isCredentialName("null")).toBe(false);
		});
	});

	describe("CREDENTIAL_CATALOG", () => {
		it("has exactly 1 entry", () => {
			expect(CREDENTIAL_CATALOG).toHaveLength(1);
		});

		it("each entry has a name field matching a valid CredentialName", () => {
			for (const entry of CREDENTIAL_CATALOG) {
				expect(isCredentialName(entry.name)).toBe(true);
			}
		});

		it("each entry has a label string", () => {
			for (const entry of CREDENTIAL_CATALOG) {
				expect(typeof entry.label).toBe("string");
				expect(entry.label.length).toBeGreaterThan(0);
			}
		});

		it("each entry has a description string", () => {
			for (const entry of CREDENTIAL_CATALOG) {
				expect(typeof entry.description).toBe("string");
				expect(entry.description.length).toBeGreaterThan(0);
			}
		});

		it("each entry has a required boolean", () => {
			for (const entry of CREDENTIAL_CATALOG) {
				expect(typeof entry.required).toBe("boolean");
			}
		});

		it("each entry has a testable boolean", () => {
			for (const entry of CREDENTIAL_CATALOG) {
				expect(typeof entry.testable).toBe("boolean");
			}
		});

		// @lore Two tests here asserted the anthropic and openai-compatible entries
		// existed and were testable. HyperIdle holds no model credential any more —
		// a harness authenticates with its own login — so the catalog is one entry,
		// asserted below.
		it("holds the shared-backend key and nothing else", () => {
			expect(CREDENTIAL_CATALOG.map((e) => e.name)).toEqual(["shared_backend_key"]);
		});

		it("shared_backend_key entry is testable", () => {
			const entry = CREDENTIAL_CATALOG.find((e) => e.name === "shared_backend_key");
			expect(entry).toBeDefined();
			expect(entry?.testable).toBe(true);
		});

		it("catalog names match CREDENTIAL_NAMES order", () => {
			const catalogNames = CREDENTIAL_CATALOG.map((e) => e.name);
			for (const name of CREDENTIAL_NAMES) {
				expect(catalogNames).toContain(name);
			}
		});
	});

	describe("CREDENTIAL_STATES", () => {
		it("contains absent", () => {
			expect(CREDENTIAL_STATES).toContain("absent");
		});

		it("contains present_untested", () => {
			expect(CREDENTIAL_STATES).toContain("present_untested");
		});

		it("contains valid", () => {
			expect(CREDENTIAL_STATES).toContain("valid");
		});

		it("contains invalid", () => {
			expect(CREDENTIAL_STATES).toContain("invalid");
		});

		it("has exactly 4 states", () => {
			expect(CREDENTIAL_STATES).toHaveLength(4);
		});
	});
});
