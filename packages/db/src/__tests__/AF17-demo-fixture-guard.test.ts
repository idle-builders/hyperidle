/**
 * AF17-R2 — AC4: Demo-fixture import-allowlist guard.
 *
 * Tests the `runDemoFixtureGuard` logic for correctness after the R2 regex fix.
 * The original regex missed `"./demo-fixture.js"` (the sibling form used by every
 * production file in packages/db/src/) — this test suite proves the fix works.
 *
 * Strategy: build a minimal temp-dir tree, call runDemoFixtureGuard(tmpRoot), assert.
 * Tests must cover:
 *   RED  — forbidden production paths containing the sibling import exit with violations
 *   GREEN — permitted importers (setup-cli.ts, seed.ts, test files) stay clean
 *   GREEN — workspace subpath form (@hyperidle/db/demo-fixture) also detected in forbidden files
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runDemoFixtureGuard } from "../../../../scripts/demo-fixture-guard.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpRoot: string;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "af17-guard-test-"));
});

afterEach(() => {
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeFile(relPath: string, content: string): void {
	const full = path.join(tmpRoot, relPath);
	fs.mkdirSync(path.dirname(full), { recursive: true });
	fs.writeFileSync(full, content, "utf8");
}

// ---------------------------------------------------------------------------
// RED cases — forbidden production paths must produce violations
// ---------------------------------------------------------------------------

describe("AF17-R2 AC4: demo-fixture-guard — RED on forbidden importers", () => {
	test("factory-bootstrap.ts importing ./demo-fixture.js → violation (sibling form)", () => {
		writeFile(
			"packages/db/src/factory-bootstrap.ts",
			`import { seedDemoWorld } from "./demo-fixture.js";\nexport function applyFactoryBootstrap() {}\n`,
		);

		const result = runDemoFixtureGuard(tmpRoot);
		expect(result.ok).toBe(false);
		expect(result.violations).toHaveLength(1);
		expect(result.violations[0]?.file).toContain("factory-bootstrap.ts");
		expect(result.violations[0]?.reason).toBe("forbidden");
	});

	test("bootstrap-pg.ts importing ./demo-fixture.js → violation (sibling form)", () => {
		writeFile(
			"packages/db/src/bootstrap-pg.ts",
			`import { seedDemoWorld } from "./demo-fixture.js";\nexport function bootstrap() {}\n`,
		);

		const result = runDemoFixtureGuard(tmpRoot);
		expect(result.ok).toBe(false);
		expect(result.violations[0]?.file).toContain("bootstrap-pg.ts");
		expect(result.violations[0]?.reason).toBe("forbidden");
	});

	test("seed-pg-cli.ts importing ./demo-fixture (no extension) → violation", () => {
		writeFile(
			"packages/db/src/seed-pg-cli.ts",
			`import { seedDemoWorld } from "./demo-fixture";\n`,
		);

		const result = runDemoFixtureGuard(tmpRoot);
		expect(result.ok).toBe(false);
		expect(result.violations[0]?.file).toContain("seed-pg-cli.ts");
		expect(result.violations[0]?.reason).toBe("forbidden");
	});

	test("migrate-pg.ts importing ../demo-fixture.js (parent path) → violation", () => {
		// Simulate a file one level deeper importing via parent path
		writeFile(
			"packages/db/src/migrate-pg.ts",
			`import { seedDemoWorld } from "../demo-fixture.js";\n`,
		);

		const result = runDemoFixtureGuard(tmpRoot);
		expect(result.ok).toBe(false);
		expect(result.violations[0]?.file).toContain("migrate-pg.ts");
		expect(result.violations[0]?.reason).toBe("forbidden");
	});

	test("forbidden file importing @hyperidle/db/demo-fixture (workspace subpath) → violation", () => {
		writeFile(
			"packages/db/src/factory-bootstrap.ts",
			`import { seedDemoWorld } from "@hyperidle/db/demo-fixture";\n`,
		);

		const result = runDemoFixtureGuard(tmpRoot);
		expect(result.ok).toBe(false);
		expect(result.violations[0]?.reason).toBe("forbidden");
	});

	test("non-listed production file importing ./demo-fixture.js → unlisted-non-test violation", () => {
		// A production file that is NOT in the forbidden list and NOT a permitted importer
		writeFile(
			"packages/server/src/some-service.ts",
			`import { seedDemoWorld } from "./demo-fixture.js";\n`,
		);

		const result = runDemoFixtureGuard(tmpRoot);
		expect(result.ok).toBe(false);
		expect(result.violations[0]?.reason).toBe("unlisted-non-test");
	});
});

// ---------------------------------------------------------------------------
// GREEN cases — permitted importers must stay clean
// ---------------------------------------------------------------------------

describe("AF17-R2 AC4: demo-fixture-guard — GREEN for permitted importers", () => {
	test("setup-cli.ts importing ./demo-fixture.js → no violation", () => {
		writeFile(
			"packages/db/src/setup-cli.ts",
			`import { seedDemoWorld } from "./demo-fixture.js";\nexport function runSetup() {}\n`,
		);

		const result = runDemoFixtureGuard(tmpRoot);
		expect(result.ok).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	test("seed.ts importing ./demo-fixture.js → no violation", () => {
		writeFile(
			"packages/db/src/seed.ts",
			`import { seedDemoWorld } from "./demo-fixture.js";\nexport function seed() {}\n`,
		);

		const result = runDemoFixtureGuard(tmpRoot);
		expect(result.ok).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	test("integration test importing ../demo-fixture.js → no violation", () => {
		writeFile(
			"packages/db/src/__tests__/seed.integration.test.ts",
			`import { seedDemoWorld } from "../demo-fixture.js";\n`,
		);

		const result = runDemoFixtureGuard(tmpRoot);
		expect(result.ok).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	test("unit test importing ./demo-fixture.js → no violation", () => {
		writeFile(
			"packages/db/src/__tests__/AF17-demo-fixture.test.ts",
			`import { seedDemoWorld } from "./demo-fixture.js";\n`,
		);

		const result = runDemoFixtureGuard(tmpRoot);
		expect(result.ok).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	test("clean production file with no demo-fixture import → no violation", () => {
		writeFile(
			"packages/db/src/factory-bootstrap.ts",
			`import { applyMigrations } from "./migrations.js";\nexport function applyFactoryBootstrap() {}\n`,
		);

		const result = runDemoFixtureGuard(tmpRoot);
		expect(result.ok).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	test("empty repo root → no violation", () => {
		const result = runDemoFixtureGuard(tmpRoot);
		expect(result.ok).toBe(true);
		expect(result.violations).toHaveLength(0);
	});
});
