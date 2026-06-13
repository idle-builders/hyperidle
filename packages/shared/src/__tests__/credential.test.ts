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
	describe("CREDENTIAL_NAMES", () => {
		it("has exactly 4 entries", () => {
			// AH1: openai_compatible_api_key promoted from server_config blob to catalog
			expect(CREDENTIAL_NAMES).toHaveLength(4);
		});

		it("contains anthropic_api_key", () => {
			expect(CREDENTIAL_NAMES).toContain("anthropic_api_key");
		});

		it("contains openrouter_api_key", () => {
			expect(CREDENTIAL_NAMES).toContain("openrouter_api_key");
		});

		it("contains shared_backend_key", () => {
			expect(CREDENTIAL_NAMES).toContain("shared_backend_key");
		});

		it("contains openai_compatible_api_key", () => {
			// AH1: promoted from server_config blob to catalog
			expect(CREDENTIAL_NAMES).toContain("openai_compatible_api_key");
		});
	});

	describe("isCredentialName", () => {
		it("returns true for anthropic_api_key", () => {
			expect(isCredentialName("anthropic_api_key")).toBe(true);
		});

		it("returns true for openrouter_api_key", () => {
			expect(isCredentialName("openrouter_api_key")).toBe(true);
		});

		it("returns true for shared_backend_key", () => {
			expect(isCredentialName("shared_backend_key")).toBe(true);
		});

		it("returns true for openai_compatible_api_key", () => {
			// AH1: promoted from server_config blob to catalog
			expect(isCredentialName("openai_compatible_api_key")).toBe(true);
		});

		it("returns false for arbitrary_key", () => {
			expect(isCredentialName("arbitrary_key")).toBe(false);
		});

		it("returns false for empty string", () => {
			expect(isCredentialName("")).toBe(false);
		});

		it("returns false for ANTHROPIC_API_KEY (case sensitive)", () => {
			expect(isCredentialName("ANTHROPIC_API_KEY")).toBe(false);
		});

		it("returns false for null coerced to string", () => {
			expect(isCredentialName("null")).toBe(false);
		});
	});

	describe("CREDENTIAL_CATALOG", () => {
		it("has exactly 4 entries", () => {
			// AH1: openai_compatible_api_key promoted from server_config blob to catalog
			expect(CREDENTIAL_CATALOG).toHaveLength(4);
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

		it("openai_compatible_api_key entry exists in catalog", () => {
			// AH1: promoted from server_config blob
			const entry = CREDENTIAL_CATALOG.find((e) => e.name === "openai_compatible_api_key");
			expect(entry).toBeDefined();
			expect(entry?.testable).toBeDefined();
		});

		it("anthropic_api_key entry is testable", () => {
			const entry = CREDENTIAL_CATALOG.find((e) => e.name === "anthropic_api_key");
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
