/**
 * E2E tests for the Work section: current Teams overview.
 *
 * @lore M3: Teams now come from /api/teams. Tests that need team data
 * must mock the endpoint with fixture data.
 * @lore U11: Migrated from /api/products to /api/teams (server route renamed in U2).
 */
import { expect, test } from "./fixtures";

const TEAMS_FIXTURE = {
	teams: [
		{
			id: "t1",
			name: "HyperIdle Core",
			phase: "build",
			status: "healthy",
			leadAgentId: "agent-lead",
			activeBets: 2,
			shipped: 1,
			shipRate: "50%",
			progress: { done: 1, total: 2 },
		},
		{
			id: "t2",
			name: "HyperIdle Ops",
			phase: "build",
			status: "behind",
			leadAgentId: "agent-ops",
			activeBets: 1,
			shipped: 0,
			shipRate: "0%",
			progress: { done: 0, total: 1 },
		},
	],
};

test.describe("Work Overview", () => {
	test.beforeEach(async ({ page }) => {
		// Mock /api/teams with multiple teams so /work/portfolio renders overview
		// instead of taking the solo-team drill-in path.
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_FIXTURE),
			});
		});
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-overview-page']");
	});

	test("Work overview renders the Teams heading", async ({ page }) => {
		await expect(page.getByRole("heading", { name: /^teams$/i })).toBeVisible();
	});

	test("Work overview renders team rows", async ({ page }) => {
		await expect(page.getByTestId("work-overview-content")).toBeVisible();
		await expect(page.getByTestId("team-row")).toHaveCount(2);
		await expect(page.getByRole("button", { name: /HyperIdle Core 2 active bets HEALTHY/i })).toBeVisible();
	});
});

// @lore W3: Portfolio canvas, bet-grid, team pills, Kanban, team canvas, and
// pitch-selector assertions were retired. Current Work arrival is the Teams
// overview; product drilldown coverage lives in e2e/L13-product-drilldown.spec.ts.
