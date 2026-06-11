/**
 * AF7 §8 (Z8-050) — adapter gating in createLocalAdapterPool.
 *
 * §8 closes a SILENT DEAD PATH: the docker/isolated experimental adapters were
 * instantiated only in tests and never reachable in production. The §8 contract
 * is "coherent or explicitly marked unsupported — NOT a silent dead path." The
 * factory therefore:
 *   - by default (gate unset) registers ONLY the always-available local harness
 *     adapters (claude-code + builtin) plus any CLI adapters that happen to be
 *     present — it NEVER registers an isolated/docker adapter implicitly;
 *   - when `HYPERIDLE_ENABLE_ISOLATED=1` it does NOT silently no-op: it logs an
 *     explicit warning explaining why the isolated harness is not wired into this
 *     credential-free local pool, and still does NOT register a broken adapter.
 *
 * These assertions FAIL against a hypothetical "silent" implementation: one that
 * either registers a non-functional isolated adapter into the pool, or that gates
 * with NO warning (a silent dead path — the exact thing §8 forbids).
 *
 * Unit test: drives the real `createLocalAdapterPool` factory, asserts membership
 * and the warn-on-gate behavior. CLI-adapter presence is environment-dependent, so
 * membership is asserted by EXCLUSION (no isolated/docker id) and INCLUSION of the
 * two always-present local adapters — never by exact pool size.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalAdapterPool } from "../adapter-pool.js";

// Stable ids the factory ALWAYS registers (Claude Code + built-in harness).
const ALWAYS_PRESENT_IDS = ["local-claude-code", "local-builtin"];

function poolIds(pool: Awaited<ReturnType<typeof createLocalAdapterPool>>): string[] {
	return pool.list().map((a) => a.id);
}

describe("AF7 §8: createLocalAdapterPool adapter gating (Z8-050)", () => {
	beforeEach(() => {
		// Ensure a clean gate state per test; the suite owns the env.
		vi.unstubAllEnvs();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("gate UNSET: pool includes the always-present local adapters and EXCLUDES isolated/docker", async () => {
		vi.stubEnv("HYPERIDLE_ENABLE_ISOLATED", "");
		vi.stubEnv("HYPERIDLE_ENABLE_DOCKER", "");

		const pool = await createLocalAdapterPool();
		const ids = poolIds(pool);

		for (const id of ALWAYS_PRESENT_IDS) {
			expect(ids).toContain(id);
		}
		// No experimental adapter is implicitly registered (no silent dead path).
		expect(ids.some((id) => id.includes("isolated"))).toBe(false);
		expect(ids.some((id) => id.includes("docker"))).toBe(false);
	});

	it("gate SET but prerequisite unverifiable: isolated is STILL excluded AND a warning is recorded (not a silent no-op)", async () => {
		vi.stubEnv("HYPERIDLE_ENABLE_ISOLATED", "1");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const pool = await createLocalAdapterPool();
		const ids = poolIds(pool);

		// The gate never registers a broken isolated adapter into this pool.
		expect(ids.some((id) => id.includes("isolated"))).toBe(false);
		// It is NOT a silent dead path: the gate path logged an explicit warning
		// naming the isolated harness (either "prereq missing" or "not wired here").
		expect(warnSpy).toHaveBeenCalled();
		const warned = warnSpy.mock.calls
			.map((args) => args.map(String).join(" "))
			.join("\n")
			.toLowerCase();
		expect(warned).toContain("isolated");
		expect(warned).toContain("hyperidle_enable_isolated");
	});

	it("gate UNSET: no isolated-gate warning is emitted (the gate path is not taken)", async () => {
		vi.stubEnv("HYPERIDLE_ENABLE_ISOLATED", "");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		await createLocalAdapterPool();

		const isolatedWarnings = warnSpy.mock.calls
			.map((args) => args.map(String).join(" "))
			.filter((line) => line.includes("HYPERIDLE_ENABLE_ISOLATED"));
		expect(isolatedWarnings).toHaveLength(0);
	});
});
