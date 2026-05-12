/**
 * E2E tests for the Work section: Portfolio canvas, Team kanban board,
 * bet cards, and pitch selector.
 *
 * @lore M3: Products now come from /api/products (no mock fallback). Tests
 * that need product cards must mock the endpoint with fixture data.
 */
import { expect, test } from "@playwright/test";

const PRODUCTS_FIXTURE = {
	products: [
		{
			id: "p1",
			name: "HyperIdle Core",
			phase: "growth",
			status: "healthy",
			leadAgentId: "agent-lead",
			activeBets: 2,
			shipped: 5,
			shipRate: "71%",
			progress: { done: 3, total: 6 },
		},
	],
};

test.describe("Work Portfolio", () => {
	test.beforeEach(async ({ page }) => {
		// Mock /api/products so cards render deterministically in e2e.
		await page.route("**/api/products", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(PRODUCTS_FIXTURE),
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

	test("Portfolio shows at least one product status card (I4 P4)", async ({ page }) => {
		const cards = page.getByTestId("product-card");
		await expect(cards.first()).toBeVisible();
	});
});

// @lore L13: The "Work Team Board" describe block was removed here. WorkTeam
// (the Kanban surface, team canvas, and pitch selector mounted at /work/team)
// was deleted in L13 when the Product = Team 1:1 redesign removed the
// dedicated team route. /work/team now redirects to /work/portfolio.
// The Kanban, team canvas, and pitch-selector surfaces no longer exist — their
// tests cannot be migrated because the surface itself is gone.
// New coverage for the product drilldown lives in e2e/L13-product-drilldown.spec.ts.
