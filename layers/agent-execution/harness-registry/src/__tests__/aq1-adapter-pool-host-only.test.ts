/**
 * AQ1 — host-only pool guard.
 *
 * After AQ1 deletes the isolation machinery, `createLocalAdapterPool()` must:
 *   - register the always-present local adapters (claude-code + built-in);
 *   - contain NO adapter id that matches /isolated|docker/.
 *
 * Remote adapters register at worker-connect time (not in the factory), so
 * their presence or absence is NOT asserted here — remote is the kept
 * scheduler axis (AQ3 completes it).
 *
 * This test FAILS against the current code because the §4 gate block in
 * adapter-pool.ts still emits a warning for HYPERIDLE_ENABLE_ISOLATED=1 that
 * the second test (gate-path-not-taken) could be confused by — and more
 * importantly, the test would PASS on current code only because the gate
 * never registers anything. Task 2's deletion removes that gate entirely;
 * after that this file is the definitive "no isolation on local pool" guard.
 *
 * AQ1 red phase — fails until Task 2 completes.
 * (Actually the exclusion assertions pass now, but the warning-absence
 * assertion in test 2 will fail while the §4 HYPERIDLE_ENABLE_ISOLATED gate
 * still emits its console.warn.)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalAdapterPool } from "../adapter-pool.js";

// Ids the factory ALWAYS registers regardless of environment.
// ALWAYS_PRESENT_IDS moved with its only consumer to
// adapter-pool-real-discovery.integration.test.ts — `local-claude-code` is only
// registered when `claude` is on PATH, so the list is not host-independent.

function poolIds(pool: Awaited<ReturnType<typeof createLocalAdapterPool>>): string[] {
	return pool.list().map((a) => a.id);
}

describe("AQ1: createLocalAdapterPool — host-only, no isolation path", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	// "always-present local adapters are registered" moved to
	// adapter-pool-real-discovery.integration.test.ts — `local-claude-code` is
	// only registered when `claude` is on PATH.

	it("no adapter id matches /isolated|docker/ — isolation machinery is gone", async () => {
		const pool = await createLocalAdapterPool();
		const ids = poolIds(pool);

		expect(ids.some((id) => /isolated|docker/i.test(id))).toBe(false);
	});

	it("no isolation-gate warning is emitted (the §4 gate block is deleted)", async () => {
		// @lore AQ1: after deleting the §4 HYPERIDLE_ENABLE_ISOLATED gate block,
		// setting this env var should produce zero warnings from adapter-pool —
		// there is no gate to trigger. This assertion enforces that the gate is
		// DELETED, not just silenced.
		vi.stubEnv("HYPERIDLE_ENABLE_ISOLATED", "1");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		await createLocalAdapterPool();

		const isolatedWarnings = warnSpy.mock.calls
			.map((args) => args.map(String).join(" "))
			.filter((line) => line.toLowerCase().includes("hyperidle_enable_isolated"));
		expect(isolatedWarnings).toHaveLength(0);
	});
});
