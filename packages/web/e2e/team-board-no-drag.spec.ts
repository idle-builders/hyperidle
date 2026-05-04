/**
 * L15 — Playwright E2E: drag is a no-op on Team Board task cards.
 *
 * Source: docs/work-packages/L15-plan.md §12 Playwright table.
 *
 * Verifications:
 *  - Attempting to drag a task does NOT change its column membership.
 *  - No /tasks/:id/transition network call is fired.
 *  - The cursor never appears as `not-allowed` (per approved R-5).
 */

import { expect, test } from "@playwright/test";

test.describe("Team Board — drag is a no-op", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-page']");
	});

	test("dragging a task card does not move it and fires no transition request", async ({
		page,
	}) => {
		const transitionCalls: string[] = [];
		page.on("request", (req) => {
			if (/\/tasks\/.+\/transition/.test(req.url())) {
				transitionCalls.push(req.url());
			}
		});

		const card = page.getByText("Implement login endpoint").first();
		const targetColumn = page.locator("[data-droppable-column='done']").first();

		// The droppable should NOT exist post-L15.
		await expect(targetColumn).toHaveCount(0);

		const cardBefore = await card.boundingBox();
		expect(cardBefore).not.toBeNull();

		// Attempt a drag gesture targeting the Done column area.
		const doneCol = page.getByText("Done").first();
		const doneBox = await doneCol.boundingBox();
		if (doneBox && cardBefore) {
			await page.mouse.move(
				cardBefore.x + cardBefore.width / 2,
				cardBefore.y + cardBefore.height / 2,
			);
			await page.mouse.down();
			await page.mouse.move(doneBox.x + 20, doneBox.y + 20, { steps: 10 });
			await page.mouse.up();
		}

		// Card should still be in its original column (text still visible there).
		await expect(page.getByText("Implement login endpoint").first()).toBeVisible();
		expect(transitionCalls).toEqual([]);

		// Cursor styling check: never `not-allowed` on the card.
		const cursor = await card.evaluate((el) => getComputedStyle(el).cursor);
		expect(cursor).not.toBe("not-allowed");
	});
});
