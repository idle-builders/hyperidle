/**
 * AR1 — isHarnessIntegrationPath unit tests (TDD red phase).
 *
 * Tests the single-sourced PATH-ONLY predicate (architecture.md Decision 2 — option B,
 * the import-seam predicate was REJECTED). Both consumers use it:
 *   1. honest-harness-guard.ts — selects which files to static-check.
 *   2. verify-attest.ts attestation floor — selects which JSON file-results count.
 *
 * Contract (Decision 2):
 *   isHarnessIntegrationPath(filePath: string): boolean
 *     true  iff  /\/harness\/__tests__\/.*\.integration\.test\.ts$/.test(p)
 *                OR EXPLICIT_HARNESS_INTEGRATION.some(s => p.endsWith(s))
 *     where EXPLICIT_HARNESS_INTEGRATION = ["__tests__/session-provisioning.integration.test.ts"]
 *
 * Path-only — works for both the guard (file selection) AND the floor (paths from the
 * vitest JSON reporter, which carries NO source). False-positive cases are the key tests:
 * a *.test.ts unit in the harness dir, and a web/service *.integration.test.ts elsewhere,
 * must NOT be selected.
 *
 * The module under test does not exist yet — these tests are intentionally RED.
 */

import { describe, expect, test } from "vitest";
import {
	EXPLICIT_HARNESS_INTEGRATION,
	isHarnessIntegrationPath,
} from "../../../../scripts/lib/honest-harness-predicate.js";

// ── POSITIVE: harness-dir *.integration.test.ts are selected ──────────────────

describe("isHarnessIntegrationPath — harness-dir integration tests (true)", () => {
	test("harness/__tests__/*.integration.test.ts → true", () => {
		expect(
			isHarnessIntegrationPath(
				"packages/server/src/harness/__tests__/AM2-builtin-gateway.integration.test.ts",
			),
		).toBe(true);
	});

	test("harness/__tests__/AZ9-reprompt-loop.integration.test.ts → true", () => {
		expect(
			isHarnessIntegrationPath(
				"packages/server/src/harness/__tests__/AZ9-reprompt-loop.integration.test.ts",
			),
		).toBe(true);
	});

	test("harness/__tests__/AN1-real-harness-inherited.integration.test.ts → true (un-excluded file)", () => {
		expect(
			isHarnessIntegrationPath(
				"packages/server/src/harness/__tests__/AN1-real-harness-inherited.integration.test.ts",
			),
		).toBe(true);
	});

	test("harness/__tests__/cli-adapter-real-binary.integration.test.ts → true (renamed target)", () => {
		// Post-rename of cli-adapter-real-binary.real-harness.test.ts (green task 4).
		expect(
			isHarnessIntegrationPath(
				"packages/server/src/harness/__tests__/cli-adapter-real-binary.integration.test.ts",
			),
		).toBe(true);
	});

	test("absolute path with harness/__tests__/*.integration.test.ts → true", () => {
		expect(
			isHarnessIntegrationPath(
				"/Users/x/repo/packages/server/src/harness/__tests__/foo.integration.test.ts",
			),
		).toBe(true);
	});
});

// ── POSITIVE: the explicit assistant-reply-live-harness exception ─────────────
// AU27 sweep: `session-provisioning.integration.test.ts` (the original
// explicit exception this block tested) was deleted in AU7, long before
// AU27 — its `EXPLICIT_HARNESS_INTEGRATION` entry was dead weight the whole
// time (the predicate could never actually select it). Repointed at the
// real current entry, `assistant-reply-live-harness.integration.test.ts`
// (`core-api/src/__tests__/`, not the harness dir — same shape the original
// exception proved: a file that genuinely drives the real CLI binary but
// needs the `{db,app}`-shaped core-api composition, not just harness-registry).

describe("isHarnessIntegrationPath — explicit assistant-reply-live-harness exception (true)", () => {
	test("assistant-reply-live-harness.integration.test.ts (core-api __tests__, not harness dir) → true", () => {
		expect(
			isHarnessIntegrationPath(
				"layers/core-api/src/__tests__/assistant-reply-live-harness.integration.test.ts",
			),
		).toBe(true);
	});

	test("absolute assistant-reply-live-harness path → true", () => {
		expect(
			isHarnessIntegrationPath(
				"/repo/layers/core-api/src/__tests__/assistant-reply-live-harness.integration.test.ts",
			),
		).toBe(true);
	});

	test("EXPLICIT_HARNESS_INTEGRATION lists exactly the assistant-reply-live-harness suffix", () => {
		expect(EXPLICIT_HARNESS_INTEGRATION).toContain(
			"__tests__/assistant-reply-live-harness.integration.test.ts",
		);
	});
});

// ── FALSE-POSITIVE GUARDS: must return false ──────────────────────────────────

describe("isHarnessIntegrationPath — false-positive guards (false)", () => {
	test("*.test.ts unit IN the harness dir → false (stubs allowed in units)", () => {
		// return-gate.test.ts legitimately stubs — wrong suffix, never selected.
		expect(
			isHarnessIntegrationPath("packages/server/src/harness/__tests__/return-gate.test.ts"),
		).toBe(false);
	});

	test("adapter-pool.test.ts unit in harness dir → false", () => {
		expect(
			isHarnessIntegrationPath("packages/server/src/harness/__tests__/adapter-pool.test.ts"),
		).toBe(false);
	});

	test("web/service *.integration.test.ts (no harness dir) → false", () => {
		expect(
			isHarnessIntegrationPath("packages/server/src/__tests__/threads.integration.test.ts"),
		).toBe(false);
	});

	test("db service *.integration.test.ts → false", () => {
		expect(isHarnessIntegrationPath("framework/db/src/__tests__/teams.integration.test.ts")).toBe(
			false,
		);
	});

	test("X3-assistant-reply-live-harness.integration.test.ts (NOT the explicit one) → false", () => {
		// Only the exact "assistant-reply-live-harness.integration.test.ts" suffix is
		// explicit; a differently-prefixed file is not harness-facing by path.
		expect(
			isHarnessIntegrationPath(
				"layers/core-api/src/__tests__/X3-assistant-reply-live-harness.integration.test.ts",
			),
		).toBe(false);
	});

	test("a non-test harness source file → false", () => {
		expect(isHarnessIntegrationPath("packages/server/src/harness/cli-harness-adapter.ts")).toBe(
			false,
		);
	});

	test("*.spec.ts (E2E) in any location → false", () => {
		expect(isHarnessIntegrationPath("layers/web/e2e/ah5-live-agent-path.spec.ts")).toBe(false);
	});

	test("a *.real-harness.test.ts file (pre-rename) → false (not yet *.integration.test.ts)", () => {
		// The path predicate keys on the .integration.test.ts suffix. The .real-harness
		// lane is collapsed by renaming in green task 4; before that rename the file is
		// not selected — which is fine, the lane-check (guard) catches its existence.
		expect(
			isHarnessIntegrationPath(
				"packages/server/src/harness/__tests__/AL7-two-session-trust-first.real-harness.test.ts",
			),
		).toBe(false);
	});

	test("empty string → false", () => {
		expect(isHarnessIntegrationPath("")).toBe(false);
	});
});

// ── Path normalization: backslashes / POSIX separators ────────────────────────

describe("isHarnessIntegrationPath — separator handling", () => {
	test("matches regardless of leading ./", () => {
		expect(
			isHarnessIntegrationPath("./packages/server/src/harness/__tests__/foo.integration.test.ts"),
		).toBe(true);
	});
});
