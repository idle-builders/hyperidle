/**
 * J2 AC line 54: Playwright E2E proving that the collapsed Rail renders the
 * three semantic pills (BLK/REV/PSD) with the expected counts derived from
 * MOCK_RAIL_BETS / MOCK_RAIL_BLOCKERS in `fixtures/app-shell-data.ts`.
 *
 * The fixture seeds one high-severity blocker and zero review/paused bets, so
 * BLK=1 is the deterministic signal we assert. The expanded-state toggle is
 * proved by seeing "Active Bets" reappear after clicking the expand chevron.
 */
import { expect, test } from "@playwright/test";

test.describe("Rail collapsed pills (J2)", () => {
	test("collapsed Rail renders the BLK pill with fixture count", async ({ page }) => {
		// Below 1280px the Rail starts collapsed (useViewportBreakpoint).
		await page.setViewportSize({ width: 1024, height: 800 });
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// BLK pill: aria-label "1 blockers" (MOCK_RAIL_BLOCKERS length = 1).
		await expect(page.getByLabel(/1 blockers?/i)).toBeVisible();
		// Expanded headers must NOT be visible while collapsed.
		await expect(page.getByText("Active Bets")).not.toBeVisible();
	});

	test("clicking the expand chevron restores the expanded Rail", async ({ page }) => {
		await page.setViewportSize({ width: 1024, height: 800 });
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// Precondition: BLK pill visible in collapsed state.
		await expect(page.getByLabel(/1 blockers?/i)).toBeVisible();
		// Click expand chevron (aria-label "Expand rail").
		await page.getByRole("button", { name: /expand rail/i }).click();
		// Expanded: Active Bets header reappears.
		await expect(page.getByText("Active Bets")).toBeVisible();
		// Collapsed pills are gone.
		await expect(page.getByLabel(/1 blockers?/i)).not.toBeVisible();
	});
});
