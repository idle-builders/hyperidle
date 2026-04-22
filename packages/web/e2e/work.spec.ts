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
		await expect(page.getByRole("heading", { name: "Team Board" })).toBeVisible();
	});

	test("kanban renders four columns", async ({ page }) => {
		// I4 K1/K2: Kanban columns are Planned / Blocked / In Progress / Done
		// (see Kanban.tsx COLUMNS). These match UI_DESIGN.md §Tier-3.
		await expect(page.getByRole("heading", { name: "Planned" })).toBeVisible();
		await expect(page.getByRole("heading", { name: "Blocked" })).toBeVisible();
		await expect(page.getByRole("heading", { name: "In Progress" })).toBeVisible();
		await expect(page.getByRole("heading", { name: "Done" })).toBeVisible();
	});

	test("WorkTeam contains both Canvas and Kanban sections (I4 P2/P5)", async ({ page }) => {
		await expect(page.getByTestId("work-team-canvas")).toBeVisible();
		await expect(page.getByTestId("work-team-kanban")).toBeVisible();
	});

	test("task cards are visible in the kanban", async ({ page }) => {
		// Scroll to the kanban section to ensure task cards are in the viewport.
		await page.getByTestId("work-team-kanban").scrollIntoViewIfNeeded();
		await expect(page.getByLabel("Task: Implement login endpoint")).toBeVisible();
		await expect(page.getByLabel("Task: Design signup form")).toBeVisible();
	});

	test("pitch selector opens from button", async ({ page }) => {
		await page.getByText("Select Pitches").click();
		await expect(page.getByText("Select Pitch")).toBeVisible();
	});
});
