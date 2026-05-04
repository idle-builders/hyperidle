/**
 * L15 — TaskActionsMenu visual regression test (W-4).
 *
 * Source: L15-plan.md § 12 protected row `TaskActionsMenu.visual.test.tsx`.
 *
 * Pixel-diffs the TSX render against the HTML reference at
 * `packages/design-system/html/TaskActionsMenu.html`. 5% threshold per
 * `.claude/rules/visual-parity.md` (non-negotiable).
 *
 * ⚠️ FLAG TO DESIGNER: `TaskActionsMenu.html` does NOT yet exist in
 * `packages/design-system/html/`. Per the visual-parity rule, the HTML is
 * the design source of truth and must be authored by Claude Design BEFORE
 * the TSX implementation. The mockup at
 * `docs/design-explorations/L15/quiet-menu/mockup.html` is the reference;
 * Claude Design will translate it into the canonical
 * `packages/design-system/html/TaskActionsMenu.html` shape (including the
 * data-component / data-tier / data-uses / data-daisyui / data-used-by
 * attributes per `.claude/rules/design-system.md`).
 *
 * Until that HTML lands, this test fails because the reference asset is
 * missing.
 *
 * NOTE: this test file is a Playwright spec (uses
 * `@playwright/test`). The `packages/design-system/playwright.config.ts`
 * `testMatch` currently filters to `visual-regression.test.ts` ONLY; the
 * green phase must widen the testMatch to include `*.visual.test.tsx`.
 * Until then this file does not run, which is an acceptable red-phase
 * failure mode (the protected-tests audit confirms the file exists; the
 * green-phase work-code task wires it into the test runner).
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect, test } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const PORT = Number(process.env.DS_PORT) || 8098;
const BASE = `http://localhost:${PORT}`;
const REPORTS_DIR = resolve(import.meta.dirname, "../../sync-reports");
const VIEWPORT = { width: 1024, height: 900 };
const DIFF_THRESHOLD_PERCENT = 5;

const HTML_REFERENCE_PATH = resolve(import.meta.dirname, "../../html/TaskActionsMenu.html");

test.describe("TaskActionsMenu — visual regression (HTML vs TSX)", () => {
	test.beforeAll(() => {
		// Pre-flight: the HTML reference must exist. If not, fail loudly with
		// the FLAG note so the designer task is surfaced.
		if (!existsSync(HTML_REFERENCE_PATH)) {
			throw new Error(
				`Missing HTML reference at ${HTML_REFERENCE_PATH}. ` +
					"Claude Design must translate docs/design-explorations/L15/quiet-menu/mockup.html " +
					"into packages/design-system/html/TaskActionsMenu.html before this test can run.",
			);
		}
	});

	for (const variant of ["accepted", "in_progress", "blocked", "review", "pending"] as const) {
		test(`TaskActionsMenu (${variant}) — pixel match within 5%`, async () => {
			const browser = await chromium.launch();
			try {
				const reportDir = resolve(REPORTS_DIR, `TaskActionsMenu/${variant}`);
				mkdirSync(reportDir, { recursive: true });

				// HTML page — the design source of truth. The HTML page exposes
				// each variant via a data attribute or section the test scrolls
				// to (see Claude Design HTML conventions).
				const htmlPage = await browser.newPage({ viewport: VIEWPORT });
				await htmlPage.goto(`${BASE}/TaskActionsMenu.html`, { waitUntil: "networkidle" });
				const htmlSection = htmlPage.locator(`[data-variant="${variant}"]`).first();
				await expect(htmlSection).toBeVisible();
				const htmlBox = await htmlSection.boundingBox();
				if (!htmlBox) throw new Error(`HTML section for variant=${variant} not measurable`);
				const htmlPng = (await htmlPage.screenshot({ type: "png", clip: htmlBox })) as Buffer;
				await htmlPage.close();

				// TSX viewer — the implementation under test.
				const tsxPage = await browser.newPage({ viewport: VIEWPORT });
				await tsxPage.goto(`${BASE}/#TaskActionsMenu`, { waitUntil: "networkidle" });
				await tsxPage.click('button:has-text("TSX")');
				const tsxSection = tsxPage.locator(`[data-variant="${variant}"]`).first();
				await expect(tsxSection).toBeVisible();
				const tsxBox = await tsxSection.boundingBox();
				if (!tsxBox) throw new Error(`TSX section for variant=${variant} not measurable`);
				const tsxPng = (await tsxPage.screenshot({ type: "png", clip: tsxBox })) as Buffer;
				await tsxPage.close();

				writeFileSync(resolve(reportDir, "html.png"), htmlPng);
				writeFileSync(resolve(reportDir, "tsx.png"), tsxPng);

				const imgA = PNG.sync.read(htmlPng);
				const imgB = PNG.sync.read(tsxPng);
				const width = Math.min(imgA.width, imgB.width);
				const height = Math.min(imgA.height, imgB.height);
				const diff = new PNG({ width, height });
				const diffPixels = pixelmatch(imgA.data, imgB.data, diff.data, width, height, {
					threshold: 0.1,
				});
				const diffPercent = (diffPixels / (width * height)) * 100;
				writeFileSync(resolve(reportDir, "diff.png"), PNG.sync.write(diff));

				expect(
					diffPercent,
					`TaskActionsMenu/${variant}: ${diffPercent.toFixed(2)}% diff — see ${reportDir}/diff.png`,
				).toBeLessThan(DIFF_THRESHOLD_PERCENT);
			} finally {
				await browser.close();
			}
		});
	}
});
