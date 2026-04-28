// L3 RED — Playwright: each Artifact layout renders against real data.
// AC-11.
import { expect, test } from "@playwright/test";

test.describe("L3 Artifact aggregation surfaces", () => {
	test("Portfolio surface shows ArtifactGalleryCard items", async ({ page }) => {
		await page.goto("/work/portfolio");
		await expect(page.locator("[data-component='ArtifactGalleryCard']").first()).toBeVisible();
	});

	test("Bet detail shows ArtifactStackItem rows", async ({ page }) => {
		await page.goto("/work/bets");
		const firstBetLink = page.locator("a[href^='/work/bets/']").first();
		await firstBetLink.click();
		await expect(page.locator("[data-component='ArtifactStackItem']").first()).toBeVisible();
	});

	test("Task detail shows a single ArtifactPreview surface", async ({ page }) => {
		await page.goto("/work/tasks");
		const firstTask = page.locator("a[href^='/work/tasks/']").first();
		await firstTask.click();
		await expect(page.locator("[data-component='ArtifactPreview']").first()).toBeVisible();
	});
});
