/**
 * L13 — Playwright e2e: Team (product) drill-down from Portfolio.
 *
 * Strategy: hermetic page.route() mocks for all /api/teams/* calls.
 * No DB seeding required — the dev server serves the SPA bundle.
 *
 * @lore U6: Route renamed from /work/product/:productId to /work/team/:teamId.
 * The API URL path stays /api/teams/:id for backward compat (server not renamed).
 * The "product" concept maps 1:1 to a team in the current model.
 *
 * Flow covered:
 * 1. Drill-down: Portfolio → click product card → URL becomes /work/team/:id
 *    → team header / roster / active-bets / burn-vs-cap all visible.
 * 2. Empty state: team with zero active bets shows product-active-bets-empty.
 * 3. Roster + bets visible: seeded team has roster rows + bet cards.
 * 4. Breadcrumb: click breadcrumb chip → URL returns to /work/portfolio.
 * 5. Legacy redirect: /work/product/:id → /work/team/:id.
 * 6. Unknown team: /work/team/does-not-exist → product-not-found empty state.
 * 7. No-Kanban: negative assertion — no Kanban region on the Team page.
 */

import { expect, test } from "./fixtures";

const NOW = new Date().toISOString();
const PRODUCT_ID = "p1";

function makeProductsListResponse() {
	return {
		teams: [
			{
				id: PRODUCT_ID,
				name: "HyperIdle Core",
				phase: "build",
				status: "healthy",
				leadAgentId: "agent-lead",
				activeBets: 2,
				shipped: 4,
				shipRate: "67%",
				progress: { done: 1, total: 3 },
			},
		],
	};
}

function makeProductDetailResponse() {
	return {
		product: {
			id: PRODUCT_ID,
			name: "HyperIdle Core",
			phase: "build",
			status: "healthy",
			leadAgentId: "agent-lead",
		},
		team: { id: "t1", formedAt: NOW, dissolvedAt: null },
		roster: [
			{ agentId: "agent-lead", name: "Lead Agent", role: "lead", isLead: true },
			{ agentId: "agent-member", name: "Alice Agent", role: "member", isLead: false },
		],
		burn: {
			capacity: 5,
			activeBets: 2,
		},
		activeBets: [
			{
				id: "b1",
				pitchTitle: "Auth migration",
				status: "committed",
				progressDone: 1,
				progressTotal: 2,
			},
		],
	};
}

function makeProductDetailEmptyBets() {
	return {
		...makeProductDetailResponse(),
		activeBets: [],
	};
}

test.describe("L13 — Product drill-down", () => {
	test.beforeEach(async ({ page }) => {
		// Mock /api/teams list
		await page.route("**/api/teams", async (route) => {
			const req = route.request();
			if (req.method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeProductsListResponse()),
				});
			} else {
				await route.continue();
			}
		});

		// Mock /api/teams/:id detail
		await page.route(`**/api/teams/${PRODUCT_ID}`, async (route) => {
			const req = route.request();
			if (req.method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeProductDetailResponse()),
				});
			} else {
				await route.continue();
			}
		});
	});

	test("(1) drill-down: Navigate to /work/team/:id → team page with all regions", async ({
		page,
	}) => {
		// @lore U11: product-card click removed in U9 (WorkPortfolio renders BetCards,
		// not team cards). Navigate directly to /work/team/:id to test team detail page.
		await page.goto(`/work/team/${PRODUCT_ID}`);

		// URL should be /work/team/:id
		await expect(page).toHaveURL(/\/work\/team\//, { timeout: 5000 });

		// Team page should be visible
		await page.waitForSelector("[data-testid='work-team-page']");

		// Product header (name) visible
		await expect(page.getByText("HyperIdle Core")).toBeVisible();

		// Roster region visible
		await expect(page.getByTestId("team-agents")).toBeVisible();

		// Active bets region visible
		await expect(page.getByTestId("team-active-bets")).toBeVisible();

		// Burn vs cap region visible
		await expect(page.getByTestId("team-burn-vs-cap")).toBeVisible();
	});

	test("(2) empty state: team with zero active bets shows team-active-bets-empty", async ({
		page,
	}) => {
		const emptyProductId = "p-empty";

		// Override the mock for this specific product
		await page.route(`**/api/teams/${emptyProductId}`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeProductDetailEmptyBets()),
			});
		});

		await page.goto(`/work/team/${emptyProductId}`);
		await page.waitForSelector("[data-testid='work-team-page']");

		await expect(page.getByTestId("team-active-bets-empty")).toBeVisible();
	});

	test("(3) roster + bets visible with seeded data", async ({ page }) => {
		await page.goto(`/work/team/${PRODUCT_ID}`);
		await page.waitForSelector("[data-testid='work-team-page']");

		// At least one roster row
		const rosterRows = page.getByTestId("agent-row");
		await expect(rosterRows.first()).toBeVisible();

		// At least one bet in the active-bets region
		const betsRegion = page.getByTestId("product-active-bets");
		await expect(betsRegion).toBeVisible();
		await expect(betsRegion.getByText("Auth migration")).toBeVisible();
	});

	test("(4) breadcrumb click returns to /work/portfolio", async ({ page }) => {
		await page.goto(`/work/team/${PRODUCT_ID}`);
		await page.waitForSelector("[data-testid='work-team-page']");

		// Click the breadcrumb chip
		await page.getByTestId("team-breadcrumb-back").click();

		await expect(page).toHaveURL(/\/work\/portfolio/, { timeout: 5000 });
		await expect(page.getByTestId("work-portfolio-page")).toBeVisible();
	});

	test("(5) legacy /work/product/:id redirects to /work/team/:id", async ({ page }) => {
		// @lore U6: /work/product/:productId now redirects to /work/team/:productId.
		await page.goto(`/work/product/${PRODUCT_ID}`);

		// Should redirect to /work/team/:id
		await expect(page).toHaveURL(/\/work\/team\//, { timeout: 5000 });
		await expect(page.getByTestId("work-team-page")).toBeVisible();
	});

	test("(6) unknown team /work/team/does-not-exist shows 404 empty state", async ({ page }) => {
		// Mock 404 for unknown team
		await page.route("**/api/teams/does-not-exist", async (route) => {
			await route.fulfill({
				status: 404,
				contentType: "application/json",
				body: JSON.stringify({ error: "Not found", code: "not_found" }),
			});
		});

		await page.goto("/work/team/does-not-exist");
		await page.waitForSelector("[data-testid='work-team-page']");

		await expect(page.getByTestId("team-not-found")).toBeVisible();
	});

	test("(7) no Kanban region on the Team page", async ({ page }) => {
		await page.goto(`/work/team/${PRODUCT_ID}`);
		await page.waitForSelector("[data-testid='work-team-page']");

		// Negative: no Kanban surface (tasks-across-bets view is gone per v3)
		await expect(page.locator("[data-testid='work-team-kanban']")).toHaveCount(0);
		await expect(page.locator("[data-droppable-column]")).toHaveCount(0);
	});
});
