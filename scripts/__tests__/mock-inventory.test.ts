/**
 * Tests for scripts/mock-inventory.ts
 *
 * Red phase (M1 write-tests): all tests fail until the script is implemented.
 * The script exports detection functions (not just a CLI entry) so they can be
 * unit-tested without spawning a subprocess.
 *
 * Coverage:
 * - Triage heuristic: FOUNDER_ID → straight-swap
 * - Triage heuristic: DEFAULT_SETTINGS → needs-contract
 * - Triage heuristic: FALLBACK_AVATAR → borderline
 * - Literal-id detection: finds "u-founder" in a sample string
 * - Literal-id detection: finds "agent-unassigned" in a sample string
 * - Literal-id detection: finds "founder@hyperidle.com" in a sample string
 * - Literal-id detection: does NOT find literal ids inside /__fixtures__/ paths
 * - Permitted-surface filter: skips __tests__ paths
 * - Full integration: fixture directory → deterministic JSON rows
 * - Script detects bare FOUNDER_ID literal "u-founder" as kind: "literal-id" (critique Important #2)
 * - --check mode: exits 1 when inventory diverges, 0 when they match
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// These imports will fail until scripts/mock-inventory.ts is implemented
// with exported functions. That failure IS the red-phase signal.
import {
	computeTriageHint,
	detectLiteralIds,
	detectSymbols,
	isPermittedSurface,
	runInventory,
	runInventoryCheck,
} from "../mock-inventory.js";

import type { InventoryRow } from "../lib/mock-inventory-types.js";

// ---------------------------------------------------------------------------
// Triage hint heuristic tests (architecture.md § Decision 4)
// ---------------------------------------------------------------------------

describe("computeTriageHint", () => {
	it('FOUNDER_ID symbol → "straight-swap" (auth context, obvious replacement)', () => {
		const hint = computeTriageHint({ symbol: "FOUNDER_ID", kind: "symbol" });
		expect(hint).toBe("straight-swap");
	});

	it('DEFAULT_FOUNDER_ID symbol → "straight-swap" (same auth context)', () => {
		const hint = computeTriageHint({ symbol: "DEFAULT_FOUNDER_ID", kind: "symbol" });
		expect(hint).toBe("straight-swap");
	});

	it('"u-founder" literal-id → "straight-swap" (auth context)', () => {
		const hint = computeTriageHint({ symbol: "u-founder", kind: "literal-id" });
		expect(hint).toBe("straight-swap");
	});

	it('"founder@hyperidle.com" literal-id → "straight-swap" (auth context)', () => {
		const hint = computeTriageHint({ symbol: "founder@hyperidle.com", kind: "literal-id" });
		expect(hint).toBe("straight-swap");
	});

	it('DEFAULT_SETTINGS symbol → "needs-contract" (no existing endpoint)', () => {
		const hint = computeTriageHint({ symbol: "DEFAULT_SETTINGS", kind: "symbol" });
		expect(hint).toBe("needs-contract");
	});

	it('symbol containing "RAIL" → "needs-contract"', () => {
		const hint = computeTriageHint({ symbol: "MOCK_RAIL_BETS", kind: "symbol" });
		expect(hint).toBe("needs-contract");
	});

	it('symbol containing "COST" → "needs-contract"', () => {
		const hint = computeTriageHint({ symbol: "MOCK_COST_DATA", kind: "symbol" });
		expect(hint).toBe("needs-contract");
	});

	it('"agent-unassigned" literal-id → "needs-contract" (agent assignment service does not exist)', () => {
		const hint = computeTriageHint({ symbol: "agent-unassigned", kind: "literal-id" });
		expect(hint).toBe("needs-contract");
	});

	it('FALLBACK_AVATAR_URL → "borderline"', () => {
		const hint = computeTriageHint({ symbol: "FALLBACK_AVATAR_URL", kind: "symbol" });
		expect(hint).toBe("borderline");
	});

	it('symbol containing "FALLBACK" → "borderline"', () => {
		const hint = computeTriageHint({ symbol: "FALLBACK_USER", kind: "symbol" });
		expect(hint).toBe("borderline");
	});

	it('symbol containing "AVATAR" → "borderline"', () => {
		const hint = computeTriageHint({ symbol: "MOCK_AVATAR", kind: "symbol" });
		expect(hint).toBe("borderline");
	});

	it('unrecognized symbol defaults to "borderline"', () => {
		const hint = computeTriageHint({ symbol: "DEMO_WIDGET", kind: "symbol" });
		expect(hint).toBe("borderline");
	});
});

// ---------------------------------------------------------------------------
// Permitted-surface filter tests
// ---------------------------------------------------------------------------

describe("isPermittedSurface", () => {
	it("skips files in __tests__ directories", () => {
		expect(isPermittedSurface("/repo/packages/web/src/__tests__/foo.test.ts")).toBe(true);
	});

	it("skips *.test.ts files", () => {
		expect(isPermittedSurface("/repo/packages/web/src/pages/Users.test.ts")).toBe(true);
	});

	it("skips *.spec.ts files", () => {
		expect(isPermittedSurface("/repo/packages/web/src/pages/Users.spec.ts")).toBe(true);
	});

	it("skips *.stories.tsx files", () => {
		expect(isPermittedSurface("/repo/packages/web/src/pages/AppShell.stories.tsx")).toBe(true);
	});

	it("skips files in __fixtures__ directories", () => {
		expect(isPermittedSurface("/repo/packages/web/src/pages/__fixtures__/work-bet-fixtures.ts")).toBe(
			true,
		);
	});

	it("skips files in e2e directories", () => {
		expect(isPermittedSurface("/repo/packages/web/src/e2e/app-shell.spec.ts")).toBe(true);
	});

	it("skips seed*.ts files", () => {
		expect(isPermittedSurface("/repo/packages/db/src/seed.ts")).toBe(true);
		expect(isPermittedSurface("/repo/packages/db/src/seed-fixtures.ts")).toBe(true);
	});

	it("does NOT skip runtime production .ts files", () => {
		expect(isPermittedSurface("/repo/packages/web/src/pages/AppShell.tsx")).toBe(false);
	});

	it("does NOT skip runtime production .tsx files", () => {
		expect(isPermittedSurface("/repo/packages/server/src/routes/threads.ts")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Literal-id detection tests (architecture.md § Decision 3)
// ---------------------------------------------------------------------------

describe("detectLiteralIds", () => {
	it('finds "u-founder" in a string (double-quoted)', () => {
		const code = 'const actorId = "u-founder";';
		const hits = detectLiteralIds(code);
		expect(hits).toContainEqual(
			expect.objectContaining({ string: "u-founder", kind: "literal-id" }),
		);
	});

	it('finds "u-founder" in a string (single-quoted)', () => {
		const code = "const actorId = 'u-founder';";
		const hits = detectLiteralIds(code);
		expect(hits).toContainEqual(
			expect.objectContaining({ string: "u-founder", kind: "literal-id" }),
		);
	});

	it('finds "agent-unassigned" in a string', () => {
		const code = 'const assignedAgent = "agent-unassigned";';
		const hits = detectLiteralIds(code);
		expect(hits).toContainEqual(
			expect.objectContaining({ string: "agent-unassigned", kind: "literal-id" }),
		);
	});

	it('finds "founder@hyperidle.com" in a string', () => {
		const code = 'const email = "founder@hyperidle.com";';
		const hits = detectLiteralIds(code);
		expect(hits).toContainEqual(
			expect.objectContaining({ string: "founder@hyperidle.com", kind: "literal-id" }),
		);
	});

	it("does NOT produce hits when no literal ids are present", () => {
		const code = 'const userId = user.id;';
		const hits = detectLiteralIds(code);
		expect(hits).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Symbol detection tests
// ---------------------------------------------------------------------------

describe("detectSymbols", () => {
	it("detects top-level const with forbidden prefix", () => {
		const code = "const MOCK_USERS = [];";
		const hits = detectSymbols(code, "/repo/packages/web/src/pages/Users.tsx");
		expect(hits).toContainEqual(
			expect.objectContaining({ symbol: "MOCK_USERS", kind: "symbol" }),
		);
	});

	it("detects export const with forbidden prefix", () => {
		const code = "export const FAKE_DATA = {};";
		const hits = detectSymbols(code, "/repo/packages/web/src/pages/Users.tsx");
		expect(hits).toContainEqual(
			expect.objectContaining({ symbol: "FAKE_DATA", kind: "symbol" }),
		);
	});

	it("detects DEFAULT_SETTINGS in a services path (DEFAULT_* with data-path)", () => {
		const code = "const DEFAULT_SETTINGS = {};";
		const hits = detectSymbols(code, "/repo/packages/web/src/services/settings.ts");
		expect(hits).toContainEqual(
			expect.objectContaining({ symbol: "DEFAULT_SETTINGS", kind: "symbol" }),
		);
	});

	it("does NOT detect DEFAULT_LOCAL_MS (numeric) in a services path", () => {
		const code = "const DEFAULT_LOCAL_MS = 5_000;";
		const hits = detectSymbols(code, "/repo/packages/server/src/services/git-export-runner.ts");
		const names = hits.map((h) => h.symbol);
		expect(names).not.toContain("DEFAULT_LOCAL_MS");
	});

	it("does NOT detect DEFAULT_PUSH_MS (numeric) in a services path", () => {
		const code = "const DEFAULT_PUSH_MS = 30_000;";
		const hits = detectSymbols(code, "/repo/packages/server/src/services/git-export-runner.ts");
		const names = hits.map((h) => h.symbol);
		expect(names).not.toContain("DEFAULT_PUSH_MS");
	});

	it("does NOT detect DEFAULT_LIMIT (numeric) in a routes path", () => {
		const code = "const DEFAULT_LIMIT = 50;";
		const hits = detectSymbols(code, "/repo/packages/server/src/routes/artifacts.ts");
		const names = hits.map((h) => h.symbol);
		expect(names).not.toContain("DEFAULT_LIMIT");
	});

	it("does NOT flag symbols in permitted-surface files", () => {
		const code = "const MOCK_USERS = [];";
		const hits = detectSymbols(code, "/repo/packages/web/src/__tests__/users.test.ts");
		expect(hits).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Integration test: run against a fixture directory
// ---------------------------------------------------------------------------

describe("runInventory integration", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = join(tmpdir(), `m1-test-${Date.now()}`);
		mkdirSync(tmpDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("produces deterministic JSON rows from a known fixture directory", async () => {
		// Create a fake web/src structure with one runtime offender and one permitted file
		const webSrc = join(tmpDir, "packages/web/src");
		mkdirSync(join(webSrc, "pages"), { recursive: true });
		mkdirSync(join(webSrc, "pages/__fixtures__"), { recursive: true });

		// Runtime file with a forbidden symbol (SHOULD appear in inventory)
		writeFileSync(
			join(webSrc, "pages/Users.tsx"),
			'export const MOCK_USERS = [];\nconst actorId = "u-founder";\n',
		);

		// Permitted surface file (should NOT appear in inventory)
		writeFileSync(
			join(webSrc, "pages/__fixtures__/users-fixture.ts"),
			"export const MOCK_FIXTURE_USERS = [];\n",
		);

		const rows = await runInventory({ webSrc, serverSrc: null });

		// Should detect MOCK_USERS as a symbol
		const symbolRow = rows.find((r: InventoryRow) => r.symbol === "MOCK_USERS");
		expect(symbolRow).toBeDefined();
		expect(symbolRow?.kind).toBe("symbol");
		expect(symbolRow?.triageHint).toBeDefined();

		// Should detect "u-founder" as a literal-id
		const literalRow = rows.find((r: InventoryRow) => r.kind === "literal-id" && r.symbol === "u-founder");
		expect(literalRow).toBeDefined();
		expect(literalRow?.kind).toBe("literal-id");

		// Should NOT include anything from __fixtures__
		const fixtureRows = rows.filter((r: InventoryRow) => r.path.includes("__fixtures__"));
		expect(fixtureRows).toHaveLength(0);
	});

	/**
	 * Critical from critique Important #2: bare "u-founder" literal in a runtime
	 * file (no forbidden symbol prefix) emits a kind: "literal-id" row.
	 *
	 * Covers all three literal-id strings: "u-founder", "agent-unassigned",
	 * "founder@hyperidle.com".
	 */
	it('bare "u-founder" in a runtime file produces kind: "literal-id" row even without a forbidden prefix', async () => {
		const webSrc = join(tmpDir, "packages/web/src");
		mkdirSync(join(webSrc, "pages"), { recursive: true });

		// No forbidden symbol prefix — just bare hardcoded IDs
		writeFileSync(
			join(webSrc, "pages/WorkBet.tsx"),
			[
				'const FOUNDER_ID = "u-founder";',
				'const unassigned = "agent-unassigned";',
				'const ownerEmail = "founder@hyperidle.com";',
			].join("\n"),
		);

		const rows = await runInventory({ webSrc, serverSrc: null });

		const founderRow = rows.find(
			(r: InventoryRow) => r.kind === "literal-id" && r.symbol === "u-founder",
		);
		expect(founderRow, "Expected kind:literal-id row for u-founder").toBeDefined();
		expect(founderRow?.triageHint).toBe("straight-swap");

		const unassignedRow = rows.find(
			(r: InventoryRow) => r.kind === "literal-id" && r.symbol === "agent-unassigned",
		);
		expect(unassignedRow, "Expected kind:literal-id row for agent-unassigned").toBeDefined();
		expect(unassignedRow?.triageHint).toBe("needs-contract");

		const emailRow = rows.find(
			(r: InventoryRow) => r.kind === "literal-id" && r.symbol === "founder@hyperidle.com",
		);
		expect(emailRow, "Expected kind:literal-id row for founder@hyperidle.com").toBeDefined();
		expect(emailRow?.triageHint).toBe("straight-swap");
	});

	it("rows are sorted by path for stable diffs", async () => {
		const webSrc = join(tmpDir, "packages/web/src");
		mkdirSync(join(webSrc, "pages"), { recursive: true });
		mkdirSync(join(webSrc, "layouts"), { recursive: true });

		writeFileSync(join(webSrc, "pages/Z.tsx"), "const MOCK_ZEBRA = [];");
		writeFileSync(join(webSrc, "layouts/A.tsx"), "const DEMO_ALPHA = [];");

		const rows = await runInventory({ webSrc, serverSrc: null });

		// Rows must be sorted by path ascending
		const paths = rows.map((r: InventoryRow) => r.path);
		const sorted = [...paths].sort();
		expect(paths).toEqual(sorted);
	});

	it("inventory rows have required InventoryRow shape", async () => {
		const webSrc = join(tmpDir, "packages/web/src");
		mkdirSync(join(webSrc, "pages"), { recursive: true });

		writeFileSync(join(webSrc, "pages/Users.tsx"), "const MOCK_USERS = [];");

		const rows = await runInventory({ webSrc, serverSrc: null });
		expect(rows.length).toBeGreaterThan(0);

		const row = rows[0] as InventoryRow;
		// Assert required fields per InventoryRow type
		expect(typeof row.path).toBe("string");
		expect(typeof row.line).toBe("number");
		expect(typeof row.symbol).toBe("string");
		expect(["import", "symbol", "literal-id"]).toContain(row.kind);
		expect(typeof row.shape).toBe("string");
		expect(typeof row.importerCount).toBe("number");
		expect(["straight-swap", "needs-contract", "borderline"]).toContain(row.triageHint);
	});
});

// ---------------------------------------------------------------------------
// --check mode tests (CI drift detection)
// ---------------------------------------------------------------------------

describe("runInventoryCheck (--check mode)", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = join(tmpdir(), `m1-check-${Date.now()}`);
		mkdirSync(tmpDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("exits 0 (returns true) when current inventory matches checked-in inventory.json", async () => {
		const webSrc = join(tmpDir, "packages/web/src");
		mkdirSync(join(webSrc, "pages"), { recursive: true });
		writeFileSync(join(webSrc, "pages/Users.tsx"), "const MOCK_USERS = [];");

		// Generate the current inventory
		const currentRows = await runInventory({ webSrc, serverSrc: null });

		// Write it as the "checked-in" file
		const inventoryPath = join(tmpDir, "inventory.json");
		writeFileSync(inventoryPath, JSON.stringify(currentRows, null, 2));

		// --check should pass: inventory matches
		const result = await runInventoryCheck({ webSrc, serverSrc: null, inventoryPath });
		expect(result.ok).toBe(true);
		expect(result.exitCode).toBe(0);
	});

	it("exits 1 (returns false) when current inventory diverges from checked-in inventory.json", async () => {
		const webSrc = join(tmpDir, "packages/web/src");
		mkdirSync(join(webSrc, "pages"), { recursive: true });
		writeFileSync(join(webSrc, "pages/Users.tsx"), "const MOCK_USERS = [];");

		// Write a stale/empty inventory as the "checked-in" file
		const inventoryPath = join(tmpDir, "inventory.json");
		writeFileSync(inventoryPath, JSON.stringify([], null, 2));

		// --check should fail: current inventory has rows, checked-in is empty
		const result = await runInventoryCheck({ webSrc, serverSrc: null, inventoryPath });
		expect(result.ok).toBe(false);
		expect(result.exitCode).toBe(1);
	});

	it("provides diff info (added rows) when inventory diverges", async () => {
		const webSrc = join(tmpDir, "packages/web/src");
		mkdirSync(join(webSrc, "pages"), { recursive: true });
		writeFileSync(join(webSrc, "pages/Users.tsx"), "const MOCK_USERS = [];");

		const inventoryPath = join(tmpDir, "inventory.json");
		writeFileSync(inventoryPath, JSON.stringify([], null, 2));

		const result = await runInventoryCheck({ webSrc, serverSrc: null, inventoryPath });
		expect(result.ok).toBe(false);
		// The result should contain info about what changed
		expect(result.added).toBeDefined();
		expect((result.added ?? []).length).toBeGreaterThan(0);
	});
});
