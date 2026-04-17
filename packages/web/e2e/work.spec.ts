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

	test("Portfolio page loads with canvas heading", async ({ page }) => {
		await expect(page.getByText("Portfolio Canvas")).toBeVisible();
	});

	test("canvas renders Shaped and Committed columns", async ({ page }) => {
		await expect(page.getByText("Shaped")).toBeVisible();
		await expect(page.getByText("Committed")).toBeVisible();
	});

	test("bet cards are visible in the canvas", async ({ page }) => {
		await expect(page.getByText("User auth flow")).toBeVisible();
		await expect(page.getByText("Dashboard redesign")).toBeVisible();
	});

	test("capacity badge shows committed count", async ({ page }) => {
		await expect(page.getByText("2 / 4")).toBeVisible();
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

	test("task cards are visible in the kanban", async ({ page }) => {
		await expect(page.getByText("Implement login endpoint")).toBeVisible();
		await expect(page.getByText("Design signup form")).toBeVisible();
	});

	test("pitch selector opens from button", async ({ page }) => {
		await page.getByText("Select Pitches").click();
		await expect(page.getByText("Select Pitch")).toBeVisible();
	});
});
