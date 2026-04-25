/**
 * K4 acceptance gate: `bun run ds:inspect <page>` produces a deterministic provenance report
 * with bucket arrays, design-system reuse %, and reuse-candidate hints for inline-styled blocks.
 *
 * Tests exercise the inspector against a known fixture page and a synthetic chip-shaped span
 * to lock the report shape (NOT exact counts — those drift as the page evolves).
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { type InspectReport, inspectPage } from "../../scripts/inspect-page";

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const SCRIPT = resolve(REPO_ROOT, "packages/design-system/scripts/inspect-page.ts");
const FIXTURE_PAGE = resolve(REPO_ROOT, "packages/web/src/pages/WorkPortfolio.tsx");

describe("inspectPage (programmatic API)", () => {
	it("returns a report with all five bucket arrays", () => {
		const report = inspectPage(FIXTURE_PAGE);
		expect(report).toMatchObject({
			designSystem: expect.any(Array),
			webShell: expect.any(Array),
			daisyuiPrimitive: expect.any(Array),
			customComponent: expect.any(Array),
			inlineStyled: expect.any(Array),
		});
		expect(report.summary).toMatchObject({
			total: expect.any(Number),
			designSystemPercent: expect.any(Number),
		});
	});

	it("lists known design-system components used by WorkPortfolio", () => {
		const report = inspectPage(FIXTURE_PAGE);
		const dsNames = new Set(report.designSystem.map((e) => e.component));
		// WorkPortfolio.tsx imports these from @hyperidle/design-system
		expect(dsNames.has("EmptyState")).toBe(true);
		expect(dsNames.has("KeyValue")).toBe(true);
		expect(dsNames.has("SkeletonCard")).toBe(true);
		expect(dsNames.has("StatusChip")).toBe(true);
	});

	it("design-system entries carry tier + source provenance", () => {
		const report = inspectPage(FIXTURE_PAGE);
		expect(report.designSystem.length).toBeGreaterThan(0);
		for (const entry of report.designSystem) {
			expect(entry.bucket).toBe("design-system");
			expect(entry.file).toBeTruthy();
			expect(entry.line).toBeGreaterThan(0);
		}
	});

	it("suggests StatusChip for inline-styled chip-shaped spans", () => {
		// Synthesize a tiny page that ONLY contains a chip-shaped inline span so we get
		// a deterministic positive case for the reuse-candidate fingerprint table.
		const tmp = mkdtempSync(resolve(tmpdir(), "k4-inspect-"));
		const file = resolve(tmp, "ChipPage.tsx");
		writeFileSync(
			file,
			[
				"import type { JSX } from 'react';",
				"export function ChipPage(): JSX.Element {",
				"  return (",
				"    <div className='flex flex-col gap-3 p-4'>",
				"      <span className='inline-flex items-center gap-[6px] px-[8px] py-[2px] rounded-full uppercase text-xs'>NEW</span>",
				"    </div>",
				"  );",
				"}",
				"",
			].join("\n"),
		);
		try {
			const report = inspectPage(file);
			const chipMatches = report.inlineStyled.filter((e) => e.reuseCandidate === "StatusChip");
			expect(chipMatches.length).toBeGreaterThan(0);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	it("treats raw HTML elements with ≥3 layout/spacing tailwind classes as inline-styled", () => {
		const report = inspectPage(FIXTURE_PAGE);
		// WorkPortfolio renders <div className="bg-base-200 rounded-lg p-3 flex flex-col gap-2">
		// for product cards and a similar cycle stripe — both should land in inlineStyled.
		expect(report.inlineStyled.length).toBeGreaterThan(0);
	});
});

describe("inspect-page CLI", () => {
	it("emits valid JSON with --format=json containing all bucket arrays", () => {
		const result = spawnSync("bun", [SCRIPT, FIXTURE_PAGE, "--format=json"], {
			encoding: "utf8",
			cwd: REPO_ROOT,
		});
		expect(result.status).toBe(0);
		const parsed = JSON.parse(result.stdout) as InspectReport;
		expect(parsed.designSystem).toBeInstanceOf(Array);
		expect(parsed.webShell).toBeInstanceOf(Array);
		expect(parsed.daisyuiPrimitive).toBeInstanceOf(Array);
		expect(parsed.customComponent).toBeInstanceOf(Array);
		expect(parsed.inlineStyled).toBeInstanceOf(Array);
		expect(parsed.summary).toMatchObject({
			total: expect.any(Number),
			designSystemPercent: expect.any(Number),
		});
	});

	it("emits a human-readable report by default", () => {
		const result = spawnSync("bun", [SCRIPT, FIXTURE_PAGE], {
			encoding: "utf8",
			cwd: REPO_ROOT,
		});
		expect(result.status).toBe(0);
		expect(result.stdout).toMatch(/design-system/i);
		expect(result.stdout).toMatch(/inline-styled/i);
	});

	it("exits non-zero with a clear error for a non-existent file", () => {
		const result = spawnSync("bun", [SCRIPT, "/no/such/page.tsx"], {
			encoding: "utf8",
			cwd: REPO_ROOT,
		});
		expect(result.status).not.toBe(0);
		expect(result.stderr).toMatch(/not found|does not exist|cannot/i);
	});
});
