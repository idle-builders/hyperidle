/**
 * L1a — TSX viewer smoke tests for the five L1a-shipping DS components.
 *
 * AJ1: HTML reference files are deleted — HTML mode is gone. This spec now
 * asserts only that each component renders in the TSX viewer (`:8098`) and
 * exposes the correct dsProps() data-attribute marker. The existsSync + TSX
 * toggle-click assertions are removed (no HTML files, no toggle).
 *
 * Dual selector: Tier 1/2 emit `data-ds-component`; Tier 3 shells emit
 * `data-ds-shell` (verified: `ThreadShell` is a Tier 3 shell). Using either-or
 * prevents false failures on shell components.
 */

import { expect, test } from "@playwright/test";

// L11 plan §6.3: ThreadHead and ReviewVerdictBar deleted; their visual
// targets are covered by the new RichMessageCard component.
const L1_COMPONENTS = [
	"ThreadHostBanner",
	"CommentRow",
	"Composer",
	"ThreadShell",
	"RichMessageCard",
];

test.describe("L1a — five DS components render in the TSX viewer", () => {
	for (const name of L1_COMPONENTS) {
		test(`${name} — TSX viewer renders the component and exposes dsProps() marker`, async ({
			page,
		}) => {
			await page.goto(`http://localhost:8098/#${name}`);
			await page.waitForLoadState("networkidle");

			// AJ1: viewer is TSX-only — no HTML toggle to click; the demo grid
			// renders immediately. Assert dsProps()-emitted attributes.
			// Dual selector: Tier 1/2 emit data-ds-component; Tier 3 shells emit data-ds-shell.
			const marker = page
				.locator(`[data-ds-component="${name}"], [data-ds-shell="${name}"]`)
				.first();
			await expect(marker).toBeVisible();
		});

		test(`${name} — at least one .demo-section is rendered`, async ({ page }) => {
			await page.goto(`http://localhost:8098/#${name}`);
			await page.waitForLoadState("networkidle");
			await expect(page.locator(".demo-section").first()).toBeVisible();
		});
	}
});
