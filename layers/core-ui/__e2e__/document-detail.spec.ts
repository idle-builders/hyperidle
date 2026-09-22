/**
 * E2E tests for the Document Detail page (J7): factory-scope treatment and
 * the non-factory edit-mode round trip.
 *
 * @lore T2: textarea+preview+Save/Cancel replaced by BodyEditor + Done button.
 * - knowledge-edit-textarea → document-edit-panel (contains TipTap editor)
 * - document-edit-preview → no longer exists (BodyEditor IS the WYSIWYG view)
 * - Save button → auto-save (no explicit save action)
 * - Cancel button → Done button (exits edit mode)
 */
import { expect, test } from "./fixtures";

test.describe("Document Detail (J7)", () => {
	test("non-factory item supports edit round-trip without URL change", async ({ page }) => {
		await page.goto("/documents/k1");
		await page.waitForSelector("[data-testid='document-detail-page']");

		// Edit button visible for non-factory scope.
		const editButton = page.getByRole("button", { name: /edit/i });
		await expect(editButton).toBeVisible();

		const initialUrl = page.url();
		await editButton.click();

		// T2: BodyEditor edit panel + Done button appear; URL unchanged.
		// There is no separate preview pane — BodyEditor IS the WYSIWYG editor.
		await expect(page.getByTestId("document-edit-panel")).toBeVisible();
		await expect(page.getByRole("button", { name: /done/i })).toBeVisible();
		expect(page.url()).toBe(initialUrl);

		// Done exits edit mode and shows the read view.
		await page.getByRole("button", { name: /done/i }).click();
		await expect(page.getByTestId("document-edit-panel")).not.toBeVisible();
		await expect(page.getByTestId("document-body")).toContainText("JWT-based authentication");
	});

	test("factory-scope item renders no Edit button", async ({ page }) => {
		// k11 is a factory-scope item (Agent Autonomy Policy).
		await page.goto("/documents/k11");
		await page.waitForSelector("[data-testid='document-detail-page']");

		// No edit button on a factory item.
		await expect(page.getByRole("button", { name: /edit/i })).toHaveCount(0);

		// Factory metadata bar still renders the layer/kind/status chips.
		const bar = page.getByTestId("document-metadata-bar");
		await expect(bar.getByText("decision")).toBeVisible();
		await expect(bar.getByText("HEALTHY")).toBeVisible();
	});

	test("factory-scope needs_human item shows the Amendable under review banner", async ({
		page,
	}) => {
		// k12 is factory-scope with status=needs_human.
		await page.goto("/documents/k12");
		await page.waitForSelector("[data-testid='document-detail-page']");

		const banner = page.getByTestId("factory-amendable-banner");
		await expect(banner).toBeVisible();
		await expect(banner).toContainText(/Amendable under review/i);
		// Still no edit button.
		await expect(page.getByRole("button", { name: /edit/i })).toHaveCount(0);
	});
});
