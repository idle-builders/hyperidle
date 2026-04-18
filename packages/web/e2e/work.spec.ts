/**
 * E2E tests for the Work section: Portfolio canvas, Team kanban board,
 * bet cards, and pitch selector.
 */
import { expect, test } from "@playwright/test";

test.describe("Work Portfolio", () => {
	test.beforeEach(async ({ page }) => {
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

test.describe("Work Team Board", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-page']");
	});

	test("Team Board page loads with heading", async ({ page }) => {
		await expect(page.getByText("Team Board")).toBeVisible();
	});

	test("kanban renders four columns", async ({ page }) => {
		await expect(page.getByText("Hold")).toBeVisible();
		await expect(page.getByText("In Progress")).toBeVisible();
		await expect(page.getByText("Review")).toBeVisible();
		await expect(page.getByText("Done")).toBeVisible();
	});

	test("WorkTeam contains both Canvas and Kanban sections (I4 P2/P5)", async ({ page }) => {
		await expect(page.getByTestId("work-team-canvas")).toBeVisible();
		await expect(page.getByTestId("work-team-kanban")).toBeVisible();
	});

	test("task cards are visible in the kanban", async ({ page }) => {
		await expect(page.getByText("Implement login endpoint")).toBeVisible();
		await expect(page.getByText("Design signup form")).toBeVisible();
	});

	test("pitch selector opens from button", async ({ page }) => {
		await page.getByText("Select Pitches").click();
		await expect(page.getByText("Select Pitch")).toBeVisible();
	});
});
