/**
 * Shared source of truth for the mock-data guard.
 * Both ESLint rules and tools/repo-gates/src/mock-inventory.ts import from here.
 * See: docs/guides/developer/mock-data-policy.md (the canonical human doc).
 *
 * Architecture ref: M1 architecture.md § Decision 1 (Single source of truth)
 */

/** Closed set of forbidden symbol-name prefixes in runtime production code. */
export const FORBIDDEN_PREFIXES: readonly string[] = [
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

/**
 * DEFAULT_* is forbidden only when the file path contains one of these
 * fragments (data-provider locations), OR when the symbol name ends with
 * one of DEFAULT_SUFFIX_TRIGGERS (regardless of path).
 *
 * Architecture ref: M1 architecture.md § Decision 2 (DEFAULT_* disambiguation)
 *
 * @lore M1: The /services/ and /routes/ fragments are intentionally broad for
 * the web package where data providers live there. For the server package,
 * the numeric-literal exemption (DEFAULT_LOCAL_MS, DEFAULT_PUSH_MS,
 * DEFAULT_LIMIT) is handled by the "value is a number literal" heuristic in
 * both the lint rule and the inventory script. See architecture-critique
 * Important Suggestion #1.
 */
export const DEFAULT_PREFIX_DATA_PATHS: readonly string[] = [
	"/fixtures/",
	"/data/",
	"/services/",
	"/routes/",
	"/layouts/",
	"/pages/",
];

/**
 * Symbol name suffixes that unconditionally trigger the DEFAULT_* guard,
 * regardless of file path. Catches DEFAULT_SETTINGS, DEFAULT_FOUNDER_ID, etc.
 * in any location.
 *
 * @lore M1: _ID is broader than needed (catches any DEFAULT_SESSION_ID etc.)
 * but is acceptable at error-level. Narrow further if a real false positive
 * surfaces. See architecture-critique Important Suggestion #3.
 */
export const DEFAULT_SUFFIX_TRIGGERS: readonly string[] = ["_DATA", "_SETTINGS", "_ID"];

/**
 * Path fragments used for runtime detection (non-glob, for string matching).
 * A file whose path contains any of these is on the permitted surface.
 */
export const PERMITTED_SURFACE_PATH_FRAGMENTS: readonly string[] = [
	"/__fixtures__/",
	"/__tests__/",
	"/__e2e__/",
];

export const PERMITTED_SURFACE_SUFFIXES: readonly string[] = [
	".test.ts",
	".test.tsx",
	".spec.ts",
	".spec.tsx",
	".stories.tsx",
];

/**
 * Seed file prefix pattern: files whose basename starts with "seed" are on
 * the permitted surface (DB bootstrap only).
 */
export const SEED_FILE_BASENAME_PREFIX = "seed";

/** Hardcoded identity strings flagged by the inventory script. */
export const LITERAL_ID_STRINGS: readonly string[] = [
	"u-founder",
	"agent-unassigned",
	"founder@hyperidle.com",
];

/** Forbidden import path fragments (importer is a runtime file). */
export const FORBIDDEN_IMPORT_FRAGMENTS: readonly string[] = ["/__fixtures__/", "/fixtures/"];

/** URL of the policy doc for actionable error messages. */
export const POLICY_DOC_URL = "docs/guides/developer/mock-data-policy.md";
