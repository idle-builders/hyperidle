/**
 * E2E tests for the Knowledge Detail page (J7): factory-scope treatment and
 * the non-factory edit-mode round trip.
 */
import { expect, test } from "./fixtures";

test.describe("Knowledge Detail (J7)", () => {
	test("non-factory item supports edit round-trip without URL change", async ({ page }) => {
		await page.goto("/knowledge/k1");
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		// Edit button visible for non-factory scope.
		const editButton = page.getByRole("button", { name: /edit/i });
		await expect(editButton).toBeVisible();

		const initialUrl = page.url();
		await editButton.click();

		// Textarea + preview + save/cancel appear; URL unchanged.
		await expect(page.getByTestId("knowledge-edit-textarea")).toBeVisible();
		await expect(page.getByTestId("knowledge-edit-preview")).toBeVisible();
		await expect(page.getByRole("button", { name: /save/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
		expect(page.url()).toBe(initialUrl);

		// Cancel reverts without persisting.
		await page.getByRole("button", { name: /cancel/i }).click();
		await expect(page.getByTestId("knowledge-edit-textarea")).toHaveCount(0);
		await expect(page.getByTestId("knowledge-body")).toContainText("JWT-based authentication");
	});

	test("factory-scope item renders no Edit button", async ({ page }) => {
		// k11 is a factory-scope item (Agent Autonomy Policy).
		await page.goto("/knowledge/k11");
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		// No edit button on a factory item.
		await expect(page.getByRole("button", { name: /edit/i })).toHaveCount(0);

		// Factory metadata bar still renders the layer/kind/status chips.
		const bar = page.getByTestId("knowledge-metadata-bar");
		await expect(bar.getByText("decision")).toBeVisible();
		await expect(bar.getByText("HEALTHY")).toBeVisible();
	});

	test("factory-scope needs_human item shows the Amendable under review banner", async ({
		page,
	}) => {
		// k12 is factory-scope with status=needs_human.
		await page.goto("/knowledge/k12");
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		const banner = page.getByTestId("factory-amendable-banner");
		await expect(banner).toBeVisible();
		await expect(banner).toContainText(/Amendable under review/i);
		// Still no edit button.
		await expect(page.getByRole("button", { name: /edit/i })).toHaveCount(0);
	});
});
