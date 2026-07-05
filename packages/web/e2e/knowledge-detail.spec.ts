/**
 * E2E tests for the Knowledge Detail page (J7): factory-scope treatment and
 * the non-factory edit-mode round trip.
 *
 * @lore T2: textarea+preview+Save/Cancel replaced by BodyEditor + Done button.
 * - knowledge-edit-textarea → knowledge-edit-panel (contains TipTap editor)
 * - knowledge-edit-preview → no longer exists (BodyEditor IS the WYSIWYG view)
 * - Save button → auto-save (no explicit save action)
 * - Cancel button → Done button (exits edit mode)
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

		// T2: BodyEditor edit panel + Done button appear; URL unchanged.
		// There is no separate preview pane — BodyEditor IS the WYSIWYG editor.
		await expect(page.getByTestId("knowledge-edit-panel")).toBeVisible();
		await expect(page.getByRole("button", { name: /done/i })).toBeVisible();
		expect(page.url()).toBe(initialUrl);

		// Done exits edit mode and shows the read view.
		await page.getByRole("button", { name: /done/i }).click();
		await expect(page.getByTestId("knowledge-edit-panel")).not.toBeVisible();
		await expect(page.getByTestId("knowledge-body")).toContainText("JWT-based authentication");
	});

	test("factory-scope item renders no Edit button", async ({ page }) => {
		// k11 is a factory-scope item (Agent Autonomy Policy).
		await page.goto("/knowledge/k11");
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		// No edit button on a factory item.
		await expect(page.getByRole("button", { name: /edit/i })).toHaveCount(0);

		await expect(page.getByTestId("knowledge-metadata-bar")).toBeVisible();
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
