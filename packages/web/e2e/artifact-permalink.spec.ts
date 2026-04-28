// L3 RED — Playwright: permalink renders single full preview; unknown id 404s gracefully.
import { expect, test } from "@playwright/test";

test("permalink URL renders the single ArtifactPreview surface", async ({ page }) => {
	await page.goto("/artifacts/art-fixture-1");
	await expect(page.locator("[data-component='ArtifactPreview']")).toBeVisible();
});

test("unknown artifact id renders a 'Not found' state and not a stack trace", async ({ page }) => {
	const res = await page.goto("/artifacts/nonexistent-id-xyz");
	// Either a 404 page response or a graceful in-app not-found surface.
	if (res) {
		expect([200, 404]).toContain(res.status());
	}
	await expect(page.getByText(/not found/i)).toBeVisible();
});
