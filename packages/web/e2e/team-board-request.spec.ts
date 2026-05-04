/**
 * L15 — Playwright E2E: requesting a state change posts a thread message.
 *
 * Source: docs/work-packages/L15-plan.md §12 Playwright table.
 *
 * Verifications:
 *  - Open Team Board → click `···` on a task → menu opens.
 *  - Click "Request stop" → toast `Request sent — agent will respond.`.
 *  - Reload → open the task's thread → "Request stop" message visible.
 */

import { expect, test } from "@playwright/test";

test.describe("Team Board — request state change posts a thread message", () => {
	test("click ··· → Request stop → toast → message in thread", async ({ page }) => {
		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-page']");

		// Open the actions menu on the first task in the in-progress column.
		const trigger = page
			.getByRole("button", { name: /actions|···|⋯|task actions/i })
			.first();
		await trigger.click();

		// Click "Request stop".
		await page.getByText(/^Request stop$/).click();

		// Toast appears.
		await expect(
			page.getByText(/Request sent — agent will respond\./i),
		).toBeVisible();

		// Reload and confirm the message persists in the task's thread.
		await page.reload();
		await page.waitForSelector("[data-testid='work-team-page']");

		// Open the task's thread (via the actions menu's "Open thread" item).
		await page.getByRole("button", { name: /actions|···|⋯/i }).first().click();
		await page.getByText(/^Open thread$/).click();

		// The thread should display the previously-posted "Request stop" message.
		await expect(page.getByText(/Request stop/).first()).toBeVisible();
	});
});
