/**
 * L15 — TaskCard visual regression test (W-4).
 *
 * Source: L15-plan.md § 12 protected row `TaskCard.visual.test.tsx`.
 *
 * The base TaskCard at-rest variant is already covered by
 * `visual-regression.test.ts` in the COMPONENTS list. This file adds the
 * NEW L15 variant: TaskCard with `pendingRequest` set (cost slot replaced
 * with a `request_pending` StatusChip + `···` actions slot wired to
 * TaskActionsMenu).
 *
 * Pixel-diffs the TSX render against `packages/design-system/html/TaskCard.html`
 * within the 5% threshold (`.claude/rules/visual-parity.md`).
 *
 * ⚠️ FLAG TO DESIGNER: `TaskCard.html` must be extended by Claude Design to
 * include a `data-variant="pending"` section showing the StatusChip
 * `request_pending` (`↪ PENDING`, dashed border, surface-ghost background)
 * before this test can pass.
 *
 * NOTE: this test is a Playwright spec; see the matching note in
 * `TaskActionsMenu.visual.test.tsx`. The design-system playwright config's
 * `testMatch` must be widened to pick up `*.visual.test.tsx`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect, test } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const PORT = Number(process.env.DS_PORT) || 8098;
const BASE = `http://localhost:${PORT}`;
const REPORTS_DIR = resolve(import.meta.dirname, "../../sync-reports");
const VIEWPORT = { width: 1024, height: 900 };
const DIFF_THRESHOLD_PERCENT = 5;

test.describe("TaskCard — visual regression (HTML vs TSX) — L15 pending variant", () => {
	for (const variant of ["at-rest", "pending", "menu-open"] as const) {
		test(`TaskCard (${variant}) — pixel match within 5%`, async () => {
			const browser = await chromium.launch();
			try {
				const reportDir = resolve(REPORTS_DIR, `TaskCard/${variant}`);
				mkdirSync(reportDir, { recursive: true });

				const htmlPage = await browser.newPage({ viewport: VIEWPORT });
				await htmlPage.goto(`${BASE}/TaskCard.html`, { waitUntil: "networkidle" });
				const htmlSection = htmlPage.locator(`[data-variant="${variant}"]`).first();
				await expect(htmlSection).toBeVisible();
				const htmlBox = await htmlSection.boundingBox();
				if (!htmlBox) throw new Error(`HTML section for variant=${variant} not measurable`);
				const htmlPng = (await htmlPage.screenshot({ type: "png", clip: htmlBox })) as Buffer;
				await htmlPage.close();

				const tsxPage = await browser.newPage({ viewport: VIEWPORT });
				await tsxPage.goto(`${BASE}/#TaskCard`, { waitUntil: "networkidle" });
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
					`TaskCard/${variant}: ${diffPercent.toFixed(2)}% diff — see ${reportDir}/diff.png`,
				).toBeLessThan(DIFF_THRESHOLD_PERCENT);
			} finally {
				await browser.close();
			}
		});
	}
});
