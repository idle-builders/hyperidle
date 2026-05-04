/**
 * L15 step17 (write-tests) — drag attempt on a TaskCard is a complete no-op.
 *
 * Approved.md §10. Plan §1 + §6 task #18.
 *
 * Goes to /work/team, attempts to drag the first TaskCard from its column
 * to the next column. Asserts the card stays in the same column wrapper.
 *
 * @lore L15: this spec fails today because Kanban still wires drag.
 */

import { expect, test } from "@playwright/test";

test.describe("L15 — Kanban drag is gone", () => {
	test("dragging a task card to a different column is a no-op", async ({ page }) => {
		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-kanban']");

		// Pick the first task card. It must have a stable text we know.
		const card = page
			.locator("[data-testid='work-team-kanban']")
			.getByText("Implement login endpoint")
			.first();
		await expect(card).toBeVisible();

		// Capture which column it lives in BEFORE the drag attempt.
		const columnBefore = await card.evaluate((el) => {
			const col = el.closest("[data-kanban-column]");
			return col?.getAttribute("data-kanban-column") ?? null;
		});

		// Try dragging it horizontally to another column. If drag was wired
		// the card would move; with drag removed it must stay put.
		const target = page.locator("[data-kanban-column='blocked']");
		await expect(target).toBeVisible();
		await card.dragTo(target).catch(() => {
			/* drag may throw if no draggable; acceptable */
		});

		const columnAfter = await page
			.locator("[data-testid='work-team-kanban']")
			.getByText("Implement login endpoint")
			.first()
			.evaluate((el) => {
				const col = el.closest("[data-kanban-column]");
				return col?.getAttribute("data-kanban-column") ?? null;
			});

		expect(columnAfter).toBe(columnBefore);
	});
});
