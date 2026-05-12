/**
 * J2 AC line 54: Playwright E2E proving that the collapsed Rail renders the
 * three semantic pills (BLK/REV/PSD) with the expected counts derived from
 * a mocked /api/rail response.
 *
 * @lore M3: rail data now comes from /api/rail (not MOCK_RAIL_* fixtures).
 * The test mocks the endpoint to seed one blocker so BLK=1 is deterministic.
 * The expanded-state toggle is proved by seeing "Active Bets" reappear after
 * clicking the expand chevron.
 */
import { expect, test } from "./fixtures";

const RAIL_FIXTURE = {
	bets: [],
	blockers: [
		{
			taskId: "task-1",
			title: "Blocker task 1",
			owner: null,
			durationBlockedMs: 90_000_000, // 25 h → high severity
		},
	],
	awaitingOrdering: [],
	costBurnRate: {
		todaySpend: null,
		todayCap: null,
		weekSpend: null,
		weekCap: null,
		weekTokens: null,
	},
};

async function setupRailMock(page: import("@playwright/test").Page): Promise<void> {
	await page.route("**/api/rail", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(RAIL_FIXTURE),
		});
	});
}

test.describe("Rail collapsed pills (J2)", () => {
	test("collapsed Rail renders the BLK pill with fixture count", async ({ page }) => {
		// Below 1280px the Rail starts collapsed (useViewportBreakpoint).
		await page.setViewportSize({ width: 1024, height: 800 });
		await setupRailMock(page);
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// BLK pill: aria-label "1 blockers" (MOCK_RAIL_BLOCKERS length = 1).
		await expect(page.getByLabel(/1 blockers?/i)).toBeVisible();
		// Expanded headers must NOT be visible while collapsed.
		await expect(page.getByText("Active Bets")).not.toBeVisible();
	});

	test("clicking the expand chevron restores the expanded Rail", async ({ page }) => {
		await page.setViewportSize({ width: 1024, height: 800 });
		await setupRailMock(page);
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// Precondition: BLK pill visible in collapsed state.
		await expect(page.getByLabel(/1 blockers?/i)).toBeVisible();
		// Click expand chevron (aria-label "Expand rail").
		await page.getByRole("button", { name: /expand rail/i }).click();
		// Expanded: Active Bets header reappears.
		await expect(page.getByText("Active Bets").first()).toBeVisible();
		// Collapsed pills are gone.
		await expect(page.getByLabel(/1 blockers?/i)).not.toBeVisible();
	});
});
