/**
 * L13 — Playwright e2e: Product drill-down from Portfolio.
 *
 * Strategy: hermetic page.route() mocks for all /api/products/* calls.
 * No DB seeding required — the dev server serves the SPA bundle.
 *
 * Flow covered:
 * 1. Drill-down: Portfolio → click product card → URL becomes /work/product/:id
 *    → product header / roster / active-bets / burn-vs-cap all visible.
 * 2. Empty state: product with zero active bets shows product-active-bets-empty.
 * 3. Roster + bets visible: seeded product has roster rows + bet cards.
 * 4. Breadcrumb: click breadcrumb chip → URL returns to /work/portfolio.
 * 5. Legacy redirect: /work/team → /work/portfolio.
 * 6. Unknown product: /work/product/does-not-exist → product-not-found empty state.
 * 7. No-Kanban: negative assertion — no Kanban region on the Product page.
 */

import { expect, test } from "@playwright/test";

const NOW = new Date().toISOString();
const PRODUCT_ID = "p1";

function makeProductsListResponse() {
	return {
		products: [
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
			costActual: { minor: 420000, currency: "USD" },
			costCap: { minor: 1000000, currency: "USD" },
			capacity: 5,
			activeBets: 2,
		},
		activeBets: [
			{
				id: "b1",
				pitchTitle: "Auth migration",
				costAppetite: { minor: 100000, currency: "USD" },
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
		// Mock /api/products list
		await page.route("**/api/products", async (route) => {
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

		// Mock /api/products/:id detail
		await page.route(`**/api/products/${PRODUCT_ID}`, async (route) => {
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

	test("(1) drill-down: Portfolio → click product card → product page with all regions", async ({
		page,
	}) => {
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");

		// Click the first product card
		const cards = page.getByTestId("product-card");
		await expect(cards.first()).toBeVisible();
		await cards.first().click();

		// URL should become /work/product/:id
		await expect(page).toHaveURL(/\/work\/product\//, { timeout: 5000 });

		// Product page should be visible
		await page.waitForSelector("[data-testid='work-product-page']");

		// Product header (name) visible
		await expect(page.getByText("HyperIdle Core")).toBeVisible();

		// Roster region visible
		await expect(page.getByTestId("product-roster")).toBeVisible();

		// Active bets region visible
		await expect(page.getByTestId("product-active-bets")).toBeVisible();

		// Burn vs cap region visible
		await expect(page.getByTestId("product-burn-vs-cap")).toBeVisible();
	});

	test("(2) empty state: product with zero active bets shows product-active-bets-empty", async ({
		page,
	}) => {
		const emptyProductId = "p-empty";

		// Override the mock for this specific product
		await page.route(`**/api/products/${emptyProductId}`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeProductDetailEmptyBets()),
			});
		});

		await page.goto(`/work/product/${emptyProductId}`);
		await page.waitForSelector("[data-testid='work-product-page']");

		await expect(page.getByTestId("product-active-bets-empty")).toBeVisible();
	});

	test("(3) roster + bets visible with seeded data", async ({ page }) => {
		await page.goto(`/work/product/${PRODUCT_ID}`);
		await page.waitForSelector("[data-testid='work-product-page']");

		// At least one roster row
		const rosterRows = page.getByTestId("product-roster-row");
		await expect(rosterRows.first()).toBeVisible();

		// At least one bet in the active-bets region
		const betsRegion = page.getByTestId("product-active-bets");
		await expect(betsRegion).toBeVisible();
		await expect(betsRegion.getByText("Auth migration")).toBeVisible();
	});

	test("(4) breadcrumb click returns to /work/portfolio", async ({ page }) => {
		await page.goto(`/work/product/${PRODUCT_ID}`);
		await page.waitForSelector("[data-testid='work-product-page']");

		// Click the breadcrumb chip
		await page.getByTestId("product-breadcrumb-back").click();

		await expect(page).toHaveURL(/\/work\/portfolio/, { timeout: 5000 });
		await expect(page.getByTestId("work-portfolio-page")).toBeVisible();
	});

	test("(5) legacy /work/team redirects to /work/portfolio", async ({ page }) => {
		await page.goto("/work/team");

		// Should redirect to portfolio
		await expect(page).toHaveURL(/\/work\/portfolio/, { timeout: 5000 });
		await expect(page.getByTestId("work-portfolio-page")).toBeVisible();
	});

	test("(6) unknown product /work/product/does-not-exist shows 404 empty state", async ({
		page,
	}) => {
		// Mock 404 for unknown product
		await page.route("**/api/products/does-not-exist", async (route) => {
			await route.fulfill({
				status: 404,
				contentType: "application/json",
				body: JSON.stringify({ error: "Not found", code: "not_found" }),
			});
		});

		await page.goto("/work/product/does-not-exist");
		await page.waitForSelector("[data-testid='work-product-page']");

		await expect(page.getByTestId("product-not-found")).toBeVisible();
	});

	test("(7) no Kanban region on the Product page", async ({ page }) => {
		await page.goto(`/work/product/${PRODUCT_ID}`);
		await page.waitForSelector("[data-testid='work-product-page']");

		// Negative: no Kanban surface (tasks-across-bets view is gone per v3)
		await expect(page.locator("[data-testid='work-team-kanban']")).toHaveCount(0);
		await expect(page.locator("[data-droppable-column]")).toHaveCount(0);
	});
});
