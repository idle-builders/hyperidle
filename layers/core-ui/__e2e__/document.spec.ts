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
			await page.goto("/documents");
			await page.waitForSelector("[data-testid='document-list-page']");
		});

		test("Document list page loads with heading", async ({ page }) => {
			await expect(page.getByText("Documents")).toBeVisible();
		});

		test("document items are visible", async ({ page }) => {
			await expect(page.getByText("Architecture Decision: Auth Strategy")).toBeVisible();
			await expect(page.getByText("API Rate Limiting Best Practices")).toBeVisible();
		});

		test("items show timestamps", async ({ page }) => {
			await expect(page.getByText("1d ago")).toBeVisible();
		});
	});
