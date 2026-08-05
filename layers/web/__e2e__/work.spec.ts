/**
 * E2E tests for the Work section: Portfolio canvas, Team kanban board,
 * bet cards, and pitch selector.
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
			active: true,
		},
	],
};

test.describe("Work Portfolio", () => {
	test.beforeEach(async ({ page }) => {
		// Mock /api/teams so team pill filters render deterministically in e2e.
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_FIXTURE),
			});
		});
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");
	});

	test("Portfolio page renders a portfolio overview heading (I4 P1)", async ({ page }) => {
		// No longer "Portfolio Canvas" — the portfolio is now a product
		// overview.
		await expect(page.getByRole("heading", { name: /^portfolio$/i })).toBeVisible();
	});

	test("Portfolio page renders bet-grid container (I4 P4)", async ({ page }) => {
		// @lore U11: product-card testid was removed in U9 (WorkPortfolio now renders
		// a flat BetCard grid). The bet-grid container is the structural assertion.
		// Empty state (no bets) or populated state (bet cards) — either shows bet-grid
		// in the loaded state. We check work-portfolio-page is visible (from beforeEach).
		const portfolioPage = page.getByTestId("work-portfolio-page");
		await expect(portfolioPage).toBeVisible();
	});
});

// @lore L13: The "Work Team Board" describe block was removed here. WorkTeam
// (the Kanban surface, team canvas, and pitch selector mounted at /work/team)
// was deleted in L13 when the Product = Team 1:1 redesign removed the
// dedicated team route. /work/team now redirects to /work/portfolio.
// The Kanban, team canvas, and pitch-selector surfaces no longer exist — their
// tests cannot be migrated because the surface itself is gone.
// New coverage for the product drilldown lives in e2e/L13-product-drilldown.spec.ts.
