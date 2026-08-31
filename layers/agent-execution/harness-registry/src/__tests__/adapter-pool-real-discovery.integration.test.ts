/**
 * Adapter-pool assertions that depend on a REAL harness binary being on PATH.
 *
 * @lore ci-move: these assertions used to live in the unit lane, in
 * X5-adapter-pool-multi, X3-adapter-pool-type and aq1-adapter-pool-host-only.
 * They passed there for the wrong reason: the developer running them had
 * `claude` installed, so `createLocalAdapterPool()` — which probes PATH via
 * `CliHarnessAdapter.checkAvailability` — registered a claude-code adapter. On a
 * clean machine it registers nothing at all, and every one of them fails. Moving
 * test execution into CI is what surfaced that; the local attestation never
 * could, because it only ever ran where the binaries are.
 *
 * They are real behaviour worth asserting, so they are kept verbatim rather than
 * weakened to "…if a binary happens to be present" — an assertion that tolerates
 * its own precondition being absent asserts nothing. They belong in the harness
 * lane, where `requireHarness` hard-fails on a missing binary and where the lane
 * is local-only by design.
 *
 * The hermetic half of those files — AdapterPool registration and selection
 * driven by stub adapters — stayed in the unit lane, where it genuinely belongs.
 */
import { describe, expect, test } from "vitest";
import { createLocalAdapterPool } from "../adapter-pool.js";
import { requireHarness } from "./require-harness.js";

/**
 * Ids `createLocalAdapterPool` registers on a host with the claude CLI present.
 *
 * @lore `local-builtin` was in this list, and the list was called
 * "always-present" because that adapter was registered unconditionally. Nothing
 * is unconditional now — the pool holds the CLI harnesses whose binaries this
 * host has — so what is asserted is what `requireHarness("claude")` above has
 * already guaranteed.
 */
const CLAUDE_HOST_IDS = ["local-claude-code"];

describe("[harness:claude] createLocalAdapterPool — real PATH discovery", () => {
	requireHarness("claude");

	// from X5-adapter-pool-multi.test.ts > createLocalAdapterPool — registration
	test("registers a claude-code adapter", async () => {
		const pool = await createLocalAdapterPool();
		const entry = pool.select({ harnessType: "claude-code" });
		expect(entry).not.toBeNull();
		expect(entry?.meta.kind).toBe("local");
	});

	// @lore This asserted at least TWO adapters, because the built-in one was
	// always registered alongside whatever binaries the host had. One is the floor
	// now, and `requireHarness("claude")` is what guarantees even that.
	test("registers at least the claude-code adapter", async () => {
		const pool = await createLocalAdapterPool();
		expect(pool.size).toBeGreaterThanOrEqual(1);
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
	test("the claude-code adapter is registered on a host that has the binary", async () => {
		const pool = await createLocalAdapterPool();
		for (const id of CLAUDE_HOST_IDS) {
			expect(pool.has(id)).toBe(true);
		}
	});

	// @lore An AC-8 assertion from builtin-harness-adapter.test.ts sat here,
	// proving the claude-code adapter survived alongside the built-in one. There
	// is no built-in one to sit alongside, and the claude-code registration is
	// already asserted twice above, so nothing is left for it to add.
	test("registers no adapter that is not a real CLI harness", async () => {
		const pool = await createLocalAdapterPool();
		expect(pool.has("local-builtin")).toBe(false);
		for (const d of pool.describe({ includeKnownMissing: false })) {
			expect(["claude-code", "codex", "opencode", "cursor-agent"]).toContain(d.type);
		}
	});
});
