/**
 * L15 — AC-3 / V-3a: Canvas drag (Shaped → Committed) SURVIVES the L15
 * removal of Kanban drag.
 *
 * Source: TRACK-L.md § L15 AC-3 ("Drag survives ONLY between Shaped →
 * Committed columns on the Canvas") + L15-plan.md § 8 task 23 / § 12
 * protected E2E row `canvas-drag-survives.spec.ts`.
 *
 * The L15 baseline page seeds two bets in `WorkTeam.tsx`:
 *   - `tb1` (committed) — Auth migration
 *   - `tb2` (shaped)    — Onboarding revamp
 *
 * The page wires `onMoveBet` as a `NOOP_MOVE_BET` (mock-only, no state
 * mutation), so this spec verifies that the dnd-kit pipeline still RUNS:
 *   1. The shaped bet has the dnd-kit draggable attributes (`role="button"`
 *      + `aria-roledescription="draggable"`).
 *   2. The committed column is a droppable (`data-droppable="committed"`).
 *   3. After a drag, the bet card is still in the DOM (no thrown error,
 *      no DnD pipeline crash).
 */

import { expect, test } from "@playwright/test";

test.describe("L15 — Canvas drag survives (AC-3)", () => {
	test("the shaped Canvas bet exposes dnd-kit draggable attributes and the committed column is a droppable", async ({
		page,
	}) => {
		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-canvas']");

		const canvas = page.locator("[data-testid='work-team-canvas']");
		await expect(canvas).toBeVisible();

		// dnd-kit attaches role="button" and aria-roledescription="draggable"
		// to the listener target on a useDraggable-wrapped node.
		const draggable = canvas.locator('[role="button"][aria-roledescription="draggable"]');
		expect(await draggable.count()).toBeGreaterThan(0);

		// Both droppable column targets must be present.
		const committed = canvas.locator('[data-droppable="committed"]');
		const shaped = canvas.locator('[data-droppable="shaped"]');
		await expect(committed).toHaveCount(1);
		await expect(shaped).toHaveCount(1);
	});

	test("the bet card survives a drag interaction without throwing (DnD pipeline runs)", async ({
		page,
	}) => {
		const consoleErrors: string[] = [];
		page.on("pageerror", (e) => consoleErrors.push(e.message));

		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-canvas']");

		const canvas = page.locator("[data-testid='work-team-canvas']");
		const shapedBet = canvas
			.locator('[data-droppable="shaped"] [role="button"][aria-roledescription="draggable"]')
			.first();
		await expect(shapedBet).toBeVisible();

		const committedColumn = canvas.locator('[data-droppable="committed"]').first();
		await expect(committedColumn).toBeVisible();

		// Run the drag — even if the page wires `onMoveBet` to a no-op, the
		// dnd-kit pipeline must execute without throwing.
		await shapedBet.dragTo(committedColumn);

		// Bet card still in the DOM after the drag — no crash.
		await expect(shapedBet).toBeVisible();
		expect(consoleErrors).toEqual([]);
	});
});
