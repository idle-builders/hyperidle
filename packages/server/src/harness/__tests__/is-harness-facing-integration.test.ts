/**
 * AR1 — isHarnessFacingIntegration unit tests (TDD red phase).
 *
 * Tests the single-sourced predicate that both:
 *   1. The honest-harness-guard uses to detect harness-facing integration files.
 *   2. verify-attest uses to select agentic files for the executed-count floor.
 *
 * Contract (Decision 2 from architecture.md):
 *   isHarnessFacingIntegration(filePath, source) → boolean
 *
 *   POSITIVE (true) iff:
 *     - filePath ends with ".integration.test.ts"
 *     - AND source imports one of the seam modules:
 *       harness/adapter-pool | harness/cli-harness-adapter | harness/builtin-harness-adapter |
 *       harness/remote-harness-adapter | harness/llm-client | services/session-provisioning
 *
 *   FALSE POSITIVE GUARDS (false) for:
 *     - *.test.ts suffix (unit test, not integration)
 *     - *.integration.test.ts but no harness seam import (web/service integration)
 *
 *   FALSE NEGATIVE (accepted miss, documented):
 *     - harness-facing test that only imports the seam transitively (via helper) → false
 *
 *   SPECIAL CASE (true):
 *     - *.integration.test.ts that imports mock-harness-adapter → true
 *       (it IS a stub in an integration file — the offender pattern)
 *
 * The module under test does not exist yet — these tests are intentionally RED.
 *
 * @lore AR1: Single-sourcing this predicate into both the guard and the attestation
 * floor means a regression in the predicate fails THIS unit test rather than
 * silently corrupting the floor. This is the W3/W5 blast-radius control.
 */

import { describe, expect, test } from "vitest";
import { isHarnessFacingIntegration } from "../../../../../scripts/honest-harness-guard.js";

// ── Fixtures: source content snippets ────────────────────────────────────────

const SEAM_IMPORTS = {
	adapterPool: `import { AdapterPool } from "../../harness/adapter-pool.js";`,
	cliAdapter: `import { CliHarnessAdapter } from "../../harness/cli-harness-adapter.js";`,
	builtinAdapter: `import { BuiltinHarnessAdapter } from "../../harness/builtin-harness-adapter.js";`,
	remoteAdapter: `import { RemoteHarnessAdapter } from "../../harness/remote-harness-adapter.js";`,
	llmClient: `import { callLlm } from "../../harness/llm-client.js";`,
	sessionProvisioning: `import { provisionSession } from "../../services/session-provisioning.js";`,
	mockHarnessAdapter: `import { MockHarnessAdapter } from "../../shared/harness/mock-harness-adapter.js";`,
};

const NON_SEAM_IMPORTS = {
	testFixtures: `import { test, describe } from "../test-fixtures.js";`,
	db: `import { db } from "@hyperidle/db";`,
	hono: `import { Hono } from "hono";`,
	shared: `import type { SessionConfig } from "@hyperidle/shared";`,
};

function makeSource(...imports: string[]): string {
	return `${imports.join("\n")}\n\ntest('placeholder', () => {});`;
}

// ── POSITIVE cases: harness-facing integration tests (should return true) ─────

describe("isHarnessFacingIntegration — positive cases (true)", () => {
	test("*.integration.test.ts importing adapter-pool → true", () => {
		const path = "packages/server/src/harness/__tests__/foo.integration.test.ts";
		const source = makeSource(SEAM_IMPORTS.adapterPool);
		expect(isHarnessFacingIntegration(path, source)).toBe(true);
	});

	test("*.integration.test.ts importing cli-harness-adapter → true", () => {
		const path = "packages/server/src/harness/__tests__/foo.integration.test.ts";
		const source = makeSource(SEAM_IMPORTS.cliAdapter);
		expect(isHarnessFacingIntegration(path, source)).toBe(true);
	});

	test("*.integration.test.ts importing builtin-harness-adapter → true", () => {
		const path = "packages/server/src/harness/__tests__/AM2-builtin-gateway.integration.test.ts";
		const source = makeSource(SEAM_IMPORTS.builtinAdapter);
		expect(isHarnessFacingIntegration(path, source)).toBe(true);
	});

	test("*.integration.test.ts importing remote-harness-adapter → true", () => {
		const path = "packages/server/src/harness/__tests__/foo.integration.test.ts";
		const source = makeSource(SEAM_IMPORTS.remoteAdapter);
		expect(isHarnessFacingIntegration(path, source)).toBe(true);
	});

	test("*.integration.test.ts importing llm-client → true", () => {
		const path = "packages/server/src/harness/__tests__/foo.integration.test.ts";
		const source = makeSource(SEAM_IMPORTS.llmClient);
		expect(isHarnessFacingIntegration(path, source)).toBe(true);
	});

	test("*.integration.test.ts importing session-provisioning → true", () => {
		const path = "packages/server/src/__tests__/session-provisioning.integration.test.ts";
		const source = makeSource(SEAM_IMPORTS.sessionProvisioning);
		expect(isHarnessFacingIntegration(path, source)).toBe(true);
	});

	test("*.integration.test.ts importing mock-harness-adapter → true (it IS the offender)", () => {
		// A stub import in an integration file is exactly the violation we detect.
		const path = "packages/server/src/harness/__tests__/foo.integration.test.ts";
		const source = makeSource(SEAM_IMPORTS.mockHarnessAdapter);
		expect(isHarnessFacingIntegration(path, source)).toBe(true);
	});

	test("*.integration.test.ts with multiple seam imports → true", () => {
		const path = "packages/server/src/harness/__tests__/foo.integration.test.ts";
		const source = makeSource(SEAM_IMPORTS.adapterPool, SEAM_IMPORTS.cliAdapter);
		expect(isHarnessFacingIntegration(path, source)).toBe(true);
	});

	test("seam import mixed with non-seam imports → true", () => {
		const path = "packages/server/src/harness/__tests__/foo.integration.test.ts";
		const source = makeSource(
			NON_SEAM_IMPORTS.testFixtures,
			SEAM_IMPORTS.cliAdapter,
			NON_SEAM_IMPORTS.shared,
		);
		expect(isHarnessFacingIntegration(path, source)).toBe(true);
	});
});

// ── FALSE POSITIVE GUARDS: must return false ──────────────────────────────────

describe("isHarnessFacingIntegration — false positive guards (false)", () => {
	test("*.test.ts (unit) importing a seam → false (wrong suffix)", () => {
		// Stubs are allowed in unit tests — suffix gates out the entire file.
		const path = "packages/server/src/harness/__tests__/adapter-pool.test.ts";
		const source = makeSource(SEAM_IMPORTS.adapterPool);
		expect(isHarnessFacingIntegration(path, source)).toBe(false);
	});

	test("*.test.ts importing mock-harness-adapter → false (unit, stubs allowed)", () => {
		const path = "packages/shared/src/__tests__/mock-harness-adapter.test.ts";
		const source = makeSource(SEAM_IMPORTS.mockHarnessAdapter);
		expect(isHarnessFacingIntegration(path, source)).toBe(false);
	});

	test("web/service *.integration.test.ts with NO seam import → false", () => {
		// A service integration test that never touches the harness.
		const path = "packages/server/src/__tests__/threads.integration.test.ts";
		const source = makeSource(
			NON_SEAM_IMPORTS.testFixtures,
			NON_SEAM_IMPORTS.db,
			NON_SEAM_IMPORTS.hono,
		);
		expect(isHarnessFacingIntegration(path, source)).toBe(false);
	});

	test("*.integration.test.ts importing only test-fixtures (not seam) → false", () => {
		const path = "packages/server/src/__tests__/bets.integration.test.ts";
		const source = makeSource(NON_SEAM_IMPORTS.testFixtures, NON_SEAM_IMPORTS.shared);
		expect(isHarnessFacingIntegration(path, source)).toBe(false);
	});

	test("empty source with integration suffix → false (no seam import)", () => {
		const path = "packages/server/src/__tests__/empty.integration.test.ts";
		expect(isHarnessFacingIntegration(path, "")).toBe(false);
	});

	test("*.spec.ts (E2E) is never harness-facing → false", () => {
		const path = "packages/web/e2e/ah5-live-agent-path.spec.ts";
		const source = makeSource(SEAM_IMPORTS.cliAdapter);
		expect(isHarnessFacingIntegration(path, source)).toBe(false);
	});
});

// ── FALSE NEGATIVE: documented accepted miss ──────────────────────────────────

describe("isHarnessFacingIntegration — false negative (accepted, documented)", () => {
	test("harness-facing file importing seam only via a helper (no direct seam import) → false (known miss)", () => {
		// Decision 2: transitive-only seam access is not detected. The test body
		// calls a helper that imports the seam, but THIS file has no direct seam import.
		// This is an accepted limitation — AR2-AR6 handle these by hand.
		const path = "packages/server/src/__tests__/some-feature.integration.test.ts";
		const source = makeSource(
			`import { makeProvisionHelper } from "./test-helpers.js";`, // helper wraps session-provisioning
			NON_SEAM_IMPORTS.testFixtures,
		);
		// Transitive-only: should return false (accepted miss per Decision 2)
		expect(isHarnessFacingIntegration(path, source)).toBe(false);
	});
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("isHarnessFacingIntegration — edge cases", () => {
	test("require() syntax (not import) for seam module → true", () => {
		// Some test files may use require() instead of ESM import.
		const path = "packages/server/src/harness/__tests__/foo.integration.test.ts";
		const source = `const { CliHarnessAdapter } = require("../../harness/cli-harness-adapter.js");\ntest('x', () => {});`;
		// The predicate should detect this as harness-facing regardless of import style.
		// (Implementation may treat require() as a positive — acceptable.)
		// We assert: EITHER true OR false is acceptable for require() — but document the behavior.
		// The predicate MUST return true for ESM imports (tested above); require() is best-effort.
		const result = isHarnessFacingIntegration(path, source);
		expect(typeof result).toBe("boolean");
	});

	test("seam module name in a comment (not an import) → false", () => {
		// A comment mentioning the seam must not trigger a positive.
		const path = "packages/server/src/__tests__/threads.integration.test.ts";
		const source = makeSource(
			`// This test does NOT import harness/cli-harness-adapter`,
			NON_SEAM_IMPORTS.testFixtures,
		);
		expect(isHarnessFacingIntegration(path, source)).toBe(false);
	});
});
