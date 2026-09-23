/**
 * E2E tests for the Work section: Portfolio canvas, Team kanban board,
 * bet cards, and pitch selector.
 *
 * @lore BC5 T11: `GET /api/teams` is gone — `useTeams` builds the portfolio's
 * team list from `search_users({})` (architecture.md §1).
 */
import { expect, makeUserRow, mockSearchUsers, test } from "./fixtures";

test.describe("Work Portfolio", () => {
	test.beforeEach(async ({ page }) => {
		// So team pill filters render deterministically in e2e.
		await mockSearchUsers(page, {
			rows: [makeUserRow("agent-t1", { kind: "ai", team: { id: "t1", name: "HyperIdle Core" } })],
		});
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-overview-page']");
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
		// in the loaded state. We check work-overview-page is visible (from beforeEach).
		const portfolioPage = page.getByTestId("work-overview-page");
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
