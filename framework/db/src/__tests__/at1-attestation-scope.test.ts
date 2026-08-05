/**
 * AT1 — attestation scope unit tests (TDD red phase).
 *
 * Tests the pure functions of scripts/lib/attestation-scope.ts:
 *
 *   resolveLegs(verifyScopeEnv): { legs: LegCommands; scope: VerifyScope }
 *     "full" → full commands + scope:"full"
 *     else (undefined | "affected" | "") → affected commands + scope:"affected"
 *
 *   assertScope(scope, required): string | null
 *     (x, undefined) → null (scope-agnostic)
 *     ("affected", "full") → string (violation)
 *     ("full", "full") → null
 *     (undefined, "full") → string
 *     ("full", undefined) → null
 *     (undefined, undefined) → null
 *     ("garbage", "full") → string (invalid scope)
 *
 * These tests are intentionally RED until the implementation lands.
 */

import { describe, expect, test } from "vitest";
import { assertScope, resolveLegs } from "../../../../scripts/lib/attestation-scope.js";

// ── resolveLegs ───────────────────────────────────────────────────────────────

describe("resolveLegs — full vs affected mode", () => {
	test('VERIFY_SCOPE="full" → scope:"full" + full commands', () => {
		const { scope, legs } = resolveLegs("full");
		expect(scope).toBe("full");
		// Full commands must NOT contain --changed or --only-changed
		expect(legs.unit).not.toContain("--changed");
		expect(legs.integration).not.toContain("--changed");
		expect(legs.e2e).not.toContain("--only-changed");
	});

	test("VERIFY_SCOPE=undefined → scope:affected + affected commands", () => {
		const { scope, legs } = resolveLegs(undefined);
		expect(scope).toBe("affected");
		expect(legs.unit).toContain("--changed=origin/main");
		expect(legs.integration).toContain("--changed=origin/main");
		// e2e delegates to web workspace's test:e2e script (which uses --only-changed internally)
		expect(legs.e2e).toContain("test:e2e");
	});

	test('VERIFY_SCOPE="affected" → scope:affected + affected commands', () => {
		const { scope, legs } = resolveLegs("affected");
		expect(scope).toBe("affected");
		expect(legs.unit).toContain("--changed=origin/main");
		expect(legs.integration).toContain("--changed=origin/main");
		expect(legs.e2e).toContain("test:e2e");
	});

	test('VERIFY_SCOPE="" → scope:affected + affected commands', () => {
		const { scope, legs } = resolveLegs("");
		expect(scope).toBe("affected");
		expect(legs.unit).toContain("--changed=origin/main");
	});

	test("full legs contain vitest run", () => {
		const { legs } = resolveLegs("full");
		expect(legs.unit).toContain("vitest run");
		expect(legs.integration).toContain("vitest run");
	});

	test("affected legs contain --passWithNoTests for vitest legs", () => {
		const { legs } = resolveLegs(undefined);
		expect(legs.unit).toContain("--passWithNoTests");
		expect(legs.integration).toContain("--passWithNoTests");
	});

	test("integration leg (affected) contains integration config flag", () => {
		const { legs } = resolveLegs(undefined);
		expect(legs.integration).toContain("vitest.integration.config.ts");
	});

	test("integration leg (full) contains integration config flag", () => {
		const { legs } = resolveLegs("full");
		expect(legs.integration).toContain("vitest.integration.config.ts");
	});

	// Harness lane is release-gated: the affected (per-merge) integration leg runs
	// ONLY the service project; the harness project (real binary + real LLM) runs
	// exclusively in full scope (verify:release), where the agentic floor +
	// per-harness symmetry enforce it.
	test("integration leg (affected) restricts to the service project — harness lane excluded", () => {
		const { legs } = resolveLegs(undefined);
		expect(legs.integration).toContain("--project service");
	});

	test("integration leg (full) runs ALL projects — no --project filter", () => {
		const { legs } = resolveLegs("full");
		expect(legs.integration).not.toContain("--project");
	});

	test("e2e leg (full) delegates to test:e2e:full npm script", () => {
		const { legs } = resolveLegs("full");
		// Delegates to the web workspace's test:e2e:full (plain playwright test, no filter)
		expect(legs.e2e).toContain("test:e2e:full");
		expect(legs.e2e).not.toContain("--only-changed");
	});

	test("e2e leg (affected) delegates to test:e2e npm script (which uses --only-changed)", () => {
		const { legs } = resolveLegs(undefined);
		// Delegates to web workspace's test:e2e (playwright test --only-changed=origin/main)
		expect(legs.e2e).toContain("test:e2e");
		expect(legs.e2e).not.toContain("test:e2e:full");
	});
});

// ── assertScope ───────────────────────────────────────────────────────────────

describe("assertScope — required scope gate", () => {
	test("(x, undefined) → null (scope-agnostic, any scope passes)", () => {
		expect(assertScope("affected", undefined)).toBeNull();
		expect(assertScope("full", undefined)).toBeNull();
		expect(assertScope(undefined, undefined)).toBeNull();
	});

	test('("affected", "full") → violation string', () => {
		const v = assertScope("affected", "full");
		expect(v).not.toBeNull();
		expect(typeof v).toBe("string");
	});

	test('("full", "full") → null', () => {
		expect(assertScope("full", "full")).toBeNull();
	});

	test('(undefined, "full") → violation string (absent scope fails required)', () => {
		const v = assertScope(undefined, "full");
		expect(v).not.toBeNull();
		expect(typeof v).toBe("string");
	});

	test('("full", undefined) → null', () => {
		expect(assertScope("full", undefined)).toBeNull();
	});

	test("(undefined, undefined) → null", () => {
		expect(assertScope(undefined, undefined)).toBeNull();
	});

	test("invalid scope value with required → violation string", () => {
		const v = assertScope("garbage" as string, "full");
		expect(v).not.toBeNull();
	});

	test("invalid scope value with no required → violation string (invalid is always wrong)", () => {
		const v = assertScope("garbage" as string, undefined);
		expect(v).not.toBeNull();
	});
});
