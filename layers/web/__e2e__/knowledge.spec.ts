/**
 * E2E tests for the Knowledge section: list view, item details, navigation.
 *
 * Skipped: depends on seeded knowledge data that no longer ships as fixtures.
 * Re-enable once a proper E2E seed layer exists.
 */
import { expect, test } from "./fixtures";

test.describe
	.skip("Knowledge", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto("/knowledge");
			await page.waitForSelector("[data-testid='knowledge-list-page']");
		});

		test("Knowledge list page loads with heading", async ({ page }) => {
			await expect(page.getByText("Knowledge Base")).toBeVisible();
		});

		test("knowledge items are visible", async ({ page }) => {
			await expect(page.getByText("Architecture Decision: Auth Strategy")).toBeVisible();
			await expect(page.getByText("API Rate Limiting Best Practices")).toBeVisible();
		});

		test("items show timestamps", async ({ page }) => {
			await expect(page.getByText("1d ago")).toBeVisible();
		});
	});
