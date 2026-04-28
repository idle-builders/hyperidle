/**
 * L1a — Visual regression specs for the six L1a-shipping DS components.
 *
 * Each component renders both as an HTML reference (under
 * `packages/design-system/html/<Component>.html`) and as a TSX implementation
 * surfaced via the design-system viewer at :8098. The visual contract is
 * pixel parity ≤ 5% per `.claude/rules/visual-parity.md`.
 *
 * Red phase: the HTML reference files do not exist yet and the TSX
 * implementations throw. Each test fails on the navigation step.
 *
 * `QuestionnaireAnswerBar` is L1b — explicitly skipped here.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const HTML_DIR = resolve(import.meta.dirname, "../../../html");

const L1_COMPONENTS = [
	"ThreadHostBanner",
	"ThreadHead",
	"ReviewVerdictBar",
	"CommentRow",
	"Composer",
	"ThreadShell",
];

test.describe("L1a — six DS components have HTML references and render", () => {
	for (const name of L1_COMPONENTS) {
		test(`${name} — HTML reference file exists at packages/design-system/html/${name}.html`, () => {
			expect(existsSync(resolve(HTML_DIR, `${name}.html`))).toBe(true);
		});

		test(`${name} — TSX viewer renders the component`, async ({ page }) => {
			await page.goto(`http://localhost:8098/#${name}`);
			await page.waitForLoadState("networkidle");
			// L1a: viewer defaults to HTML mode (iframe). Click the TSX
			// toggle to render the production TSX component, then assert
			// dsProps()-emitted attributes (data-ds-component for tier 1+2,
			// data-ds-shell for tier 3 shell regions).
			await page.getByRole("button", { name: "TSX", exact: true }).click();
			const marker = page
				.locator(`[data-ds-component="${name}"], [data-ds-shell="${name}"]`)
				.first();
			await expect(marker).toBeVisible();
		});
	}
});
