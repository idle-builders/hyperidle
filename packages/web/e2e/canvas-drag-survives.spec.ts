/**
 * L15 — Playwright E2E: Canvas Shaped → Committed drag survives.
 *
 * Source: docs/work-packages/L15-plan.md §12 Playwright table.
 *
 * The Kanban (Tasks) loses drag in L15. The Canvas (Bets) keeps it for the
 * Shape Up shaped→committed move. This spec protects against accidental
 * regression in a future "consolidation" story.
 */

import { expect, test } from "@playwright/test";

test.describe("Canvas Shaped → Committed drag survives", () => {
	test("dragging a shaped bet to the committed column moves it there", async ({
		page,
	}) => {
		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-page']");

		// Find a shaped bet on the Canvas. The Onboarding revamp seed is shaped.
		const shapedBet = page.getByText("Onboarding revamp").first();
		await expect(shapedBet).toBeVisible();

		const committedColumn = page
			.locator("[data-droppable-column='committed']")
			.first();
		// The Canvas droppable column SHOULD exist (drag is preserved).
		await expect(committedColumn).toHaveCount(1);

		const sourceBox = await shapedBet.boundingBox();
		const targetBox = await committedColumn.boundingBox();
		expect(sourceBox).not.toBeNull();
		expect(targetBox).not.toBeNull();

		if (sourceBox && targetBox) {
			await page.mouse.move(
				sourceBox.x + sourceBox.width / 2,
				sourceBox.y + sourceBox.height / 2,
			);
			await page.mouse.down();
			await page.mouse.move(
				targetBox.x + targetBox.width / 2,
				targetBox.y + targetBox.height / 2,
				{ steps: 12 },
			);
			await page.mouse.up();
		}

		// After the drag, the bet should appear inside the committed column.
		await expect(committedColumn.getByText("Onboarding revamp")).toBeVisible();
	});
});
