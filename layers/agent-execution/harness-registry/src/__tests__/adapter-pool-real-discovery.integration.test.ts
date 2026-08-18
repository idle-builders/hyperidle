/**
 * Adapter-pool assertions that depend on a REAL harness binary being on PATH.
 *
 * @lore ci-move: these seven assertions used to live in the unit lane, in
 * X5-adapter-pool-multi, X3-adapter-pool-type, aq1-adapter-pool-host-only and
 * builtin-harness-adapter. They passed there for the wrong reason: the developer
 * running them had `claude` installed, so `createLocalAdapterPool()` — which
 * probes PATH via `CliHarnessAdapter.checkAvailability` — registered a
 * claude-code adapter. On a clean machine it registers only `builtin`, and every
 * one of them fails ("expected 1 to be greater than or equal to 2"). Moving test
 * execution into CI is what surfaced that; the local attestation never could,
 * because it only ever ran where the binaries are.
 *
 * They are real behaviour worth asserting, so they are kept verbatim rather than
 * weakened to "…if a binary happens to be present" — an assertion that tolerates
 * its own precondition being absent asserts nothing. They belong in the harness
 * lane, where `requireHarness` hard-fails on a missing binary and where the lane
 * is local-only by design.
 *
 * The hermetic half of those files — AdapterPool registration and selection
 * driven by stub adapters, and the builtin-only assertions — stayed in the unit
 * lane, where it genuinely belongs.
 */
import { describe, expect, test } from "vitest";
import { createLocalAdapterPool } from "../adapter-pool.js";
import { requireHarness } from "./require-harness.js";

/** Ids `createLocalAdapterPool` registers on any host with the claude CLI present. */
const ALWAYS_PRESENT_IDS = ["local-claude-code", "local-builtin"];

describe("[harness:claude] createLocalAdapterPool — real PATH discovery", () => {
	requireHarness("claude");

	// from X5-adapter-pool-multi.test.ts > createLocalAdapterPool — registration
	test("registers a claude-code adapter", async () => {
		const pool = await createLocalAdapterPool();
		const entry = pool.select({ harnessType: "claude-code" });
		expect(entry).not.toBeNull();
		expect(entry?.meta.kind).toBe("local");
	});

	test("registers at least two adapters (claude-code and builtin)", async () => {
		const pool = await createLocalAdapterPool();
		expect(pool.size).toBeGreaterThanOrEqual(2);
	});

	test("claude-code adapter has id 'local-claude-code'", async () => {
		const pool = await createLocalAdapterPool();
		expect(pool.has("local-claude-code")).toBe(true);
	});

	// from X5-adapter-pool-multi.test.ts > AdapterPool selection by harnessType
	test("selects claude-code adapter when harnessType is 'claude-code'", async () => {
		const pool = await createLocalAdapterPool();
		const entry = pool.select({ harnessType: "claude-code" });
		expect(entry).not.toBeNull();
		expect(entry?.meta.type).toBe("claude-code");
	});

	// from X3-adapter-pool-type.test.ts > X3 AC-18
	test("createLocalAdapterPool registers with type 'claude-code'", async () => {
		const pool = await createLocalAdapterPool();
		const entry = pool.select({ harnessType: "claude-code" });
		expect(entry).not.toBeNull();
		expect(entry?.meta.type).toBe("claude-code");
	});

	// from aq1-adapter-pool-host-only.test.ts > AQ1 host-only
	test("always-present local adapters are registered", async () => {
		const pool = await createLocalAdapterPool();
		for (const id of ALWAYS_PRESENT_IDS) {
			expect(pool.has(id)).toBe(true);
		}
	});

	// from builtin-harness-adapter.test.ts > AC-8
	test("pool still has the claude-code adapter alongside builtin", async () => {
		const pool = await createLocalAdapterPool();
		const entry = pool.select({ harnessType: "claude-code" });
		expect(entry).not.toBeNull();
		expect(entry?.meta.type).toBe("claude-code");
		expect(pool.has("local-claude-code")).toBe(true);
	});
});
