/**
 * Journey: the document list's scope pills (All/Shared/Team/Private) are
 * visible above the Triage/Curated tabs.
 *
 * @lore AE1: Pills were renamed from old category names (Practices/Products/
 * Factory) to simplified labels (Shared/Team/Private) in AD6.
 */
import { expect, makeDocumentRow, test } from "./fixtures";

const DOCUMENT_ROWS = [
	makeDocumentRow("k1", {
		title: "Auth Strategy Decision",
		body: "body content",
		updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
	}),
];

test.describe("U9 AC-6: Knowledge scope pills", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/actions/search_documents", async (route) => {
			if (route.request().method() !== "POST") {
				await route.continue();
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: DOCUMENT_ROWS }),
			});
		});

		await page.goto("/documents");
		await page.waitForSelector("[data-testid='document-list-page']");
	});

	test("scope pills bar is visible above the tabs", async ({ page }) => {
		await expect(page.getByTestId("document-scope-pills")).toBeVisible();
	});

	test('scope pills include "All", "Shared", "Team", "Private"', async ({ page }) => {
		const scopePills = page.getByTestId("document-scope-pills");
		await expect(scopePills.getByTestId("scope-pill-all")).toBeVisible();
		await expect(scopePills.getByTestId("scope-pill-shared")).toBeVisible();
		await expect(scopePills.getByTestId("scope-pill-team")).toBeVisible();
		await expect(scopePills.getByTestId("scope-pill-private")).toBeVisible();
	});
});
