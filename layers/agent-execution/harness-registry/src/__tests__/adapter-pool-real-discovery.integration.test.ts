/**
 * Adapter-pool assertions that depend on a REAL harness binary being on PATH.
 */
import { describe, expect, test } from "vitest";
import { createLocalAdapterPool } from "../adapter-pool.js";
import { requireHarness } from "./require-harness.js";

/**
 * Ids `createLocalAdapterPool` registers on a host with the claude CLI present.
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

	test("registers no adapter that is not a real CLI harness", async () => {
		const pool = await createLocalAdapterPool();
		expect(pool.has("local-builtin")).toBe(false);
		for (const d of pool.describe({ includeKnownMissing: false })) {
			expect(["claude-code", "codex", "opencode", "cursor-agent"]).toContain(d.type);
		}
	});
});
