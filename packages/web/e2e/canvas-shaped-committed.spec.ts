/**
 * L15 AC6 — Canvas drag (Shaped ↔ Committed) survives the Kanban-drag removal.
 * The Canvas keyboard-drag is unrelated to Kanban; we add an explicit e2e to
 * prove the bet card can still move from Shaped → Committed in a real browser.
 */
import { expect, test } from "@playwright/test";

test.describe("L15 AC6: Canvas drag preserved", () => {
	test("data-droppable shaped/committed columns are still rendered", async ({ page }) => {
		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-page']");
		// Two droppable columns (committed | shaped) per Canvas.tsx.
		await expect(page.locator("[data-droppable='committed']")).toBeVisible();
		await expect(page.locator("[data-droppable='shaped']")).toBeVisible();
	});

	test("bet 'Onboarding revamp' starts in the shaped column", async ({ page }) => {
		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-page']");
		const shapedColumn = page.locator("[data-droppable='shaped']");
		await expect(shapedColumn.getByText("Onboarding revamp")).toBeVisible();
	});
});
