// L3 RED — Playwright: cost chip renders the pending em-dash when cost columns are null.
// Protected: AC-7 / approved-design §3 cost-pending row.
import { expect, test } from "@playwright/test";

test("cost chip renders em-dash for an artifact with unsettled cost", async ({ page }) => {
	await page.goto("/artifacts/art-cost-pending-fixture");
	const chip = page.locator("[data-component='ArtifactCostChip']").first();
	await expect(chip).toBeVisible();
	const text = (await chip.textContent()) ?? "";
	expect(text).toContain("—");
	expect(text).not.toContain("$0.00");
	expect(text.trim()).not.toBe("");
});
