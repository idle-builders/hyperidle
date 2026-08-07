/**
 * Policy single-source-of-truth invariant test.
 *
 * Red phase (M1 write-tests): fails until mock-data-policy.ts is created.
 *
 * Proves that:
 * 1. The policy module exists and exports all required constants.
 * 2. The POLICY_DOC_URL is the canonical value used by rules.
 * 3. FORBIDDEN_PREFIXES, LITERAL_ID_STRINGS, PERMITTED_MOCK_SURFACE_GLOBS are
 *    exported as non-empty readonly arrays.
 * 4. DEFAULT disambiguation constants are present.
 *
 * Architecture ref: architecture.md § Decision 1 (Single source of truth)
 */

import { describe, expect, it } from "vitest";

// This import will fail until tools/eslint-plugin-design/src/mock-data-policy.ts exists.
// That failure IS the red-phase signal for this test.
import {
	DEFAULT_PREFIX_DATA_PATHS,
	DEFAULT_SUFFIX_TRIGGERS,
	FORBIDDEN_IMPORT_FRAGMENTS,
	FORBIDDEN_PREFIXES,
	LITERAL_ID_STRINGS,
	PERMITTED_SURFACE_PATH_FRAGMENTS,
	PERMITTED_SURFACE_SUFFIXES,
	POLICY_DOC_URL,
} from "../mock-data-policy.js";

describe("mock-data-policy: single source of truth", () => {
	it("exports POLICY_DOC_URL as the canonical docs URL", () => {
		expect(POLICY_DOC_URL).toBe("docs/guides/developer/mock-data-policy.md");
	});

	it("exports FORBIDDEN_PREFIXES as a non-empty readonly array", () => {
		expect(Array.isArray(FORBIDDEN_PREFIXES)).toBe(true);
		expect(FORBIDDEN_PREFIXES.length).toBeGreaterThan(0);
	});

	it("FORBIDDEN_PREFIXES includes all 11 canonical prefixes from the policy doc", () => {
		const expected = [
			"MOCK_",
			"FAKE_",
			"STUB_",
			"SAMPLE_",
			"DUMMY_",
			"PLACEHOLDER_",
			"FALLBACK_",
			"DEMO_",
			"LEGACY_",
			"EXAMPLE_",
			"HARDCODED_",
		];
		for (const prefix of expected) {
			expect(FORBIDDEN_PREFIXES, `expected prefix ${prefix} in FORBIDDEN_PREFIXES`).toContain(
				prefix,
			);
		}
	});

	it("exports LITERAL_ID_STRINGS containing all three hardcoded identity strings", () => {
		expect(Array.isArray(LITERAL_ID_STRINGS)).toBe(true);
		expect(LITERAL_ID_STRINGS).toContain("u-founder");
		expect(LITERAL_ID_STRINGS).toContain("agent-unassigned");
		expect(LITERAL_ID_STRINGS).toContain("founder@hyperidle.com");
	});

	it("exports DEFAULT_PREFIX_DATA_PATHS for DEFAULT_* disambiguation", () => {
		expect(Array.isArray(DEFAULT_PREFIX_DATA_PATHS)).toBe(true);
		expect(DEFAULT_PREFIX_DATA_PATHS.length).toBeGreaterThan(0);
		// Must include the data-provider paths from architecture.md
		expect(DEFAULT_PREFIX_DATA_PATHS).toContain("/fixtures/");
		expect(DEFAULT_PREFIX_DATA_PATHS).toContain("/routes/");
		expect(DEFAULT_PREFIX_DATA_PATHS).toContain("/services/");
	});

	it("exports DEFAULT_SUFFIX_TRIGGERS for suffix-based DEFAULT_* detection", () => {
		expect(Array.isArray(DEFAULT_SUFFIX_TRIGGERS)).toBe(true);
		expect(DEFAULT_SUFFIX_TRIGGERS).toContain("_DATA");
		expect(DEFAULT_SUFFIX_TRIGGERS).toContain("_SETTINGS");
		expect(DEFAULT_SUFFIX_TRIGGERS).toContain("_ID");
	});

	it("exports FORBIDDEN_IMPORT_FRAGMENTS including both fixtures path patterns", () => {
		expect(Array.isArray(FORBIDDEN_IMPORT_FRAGMENTS)).toBe(true);
		expect(FORBIDDEN_IMPORT_FRAGMENTS).toContain("/__fixtures__/");
		expect(FORBIDDEN_IMPORT_FRAGMENTS).toContain("/fixtures/");
	});

	it("exports PERMITTED_SURFACE_PATH_FRAGMENTS for runtime path checking", () => {
		expect(Array.isArray(PERMITTED_SURFACE_PATH_FRAGMENTS)).toBe(true);
		expect(PERMITTED_SURFACE_PATH_FRAGMENTS).toContain("/__fixtures__/");
		expect(PERMITTED_SURFACE_PATH_FRAGMENTS).toContain("/__tests__/");
		// AU28: `layers/core-ui/e2e/` moved to `layers/core-ui/__e2e__/` under the
		// production/development split; the fragment moved with it.
		expect(PERMITTED_SURFACE_PATH_FRAGMENTS).toContain("/__e2e__/");
	});

	it("exports PERMITTED_SURFACE_SUFFIXES for file extension checking", () => {
		expect(Array.isArray(PERMITTED_SURFACE_SUFFIXES)).toBe(true);
		expect(PERMITTED_SURFACE_SUFFIXES).toContain(".test.ts");
		expect(PERMITTED_SURFACE_SUFFIXES).toContain(".test.tsx");
		expect(PERMITTED_SURFACE_SUFFIXES).toContain(".spec.ts");
		expect(PERMITTED_SURFACE_SUFFIXES).toContain(".spec.tsx");
		expect(PERMITTED_SURFACE_SUFFIXES).toContain(".stories.tsx");
	});
});
