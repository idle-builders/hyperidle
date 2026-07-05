/**
 * AG2 — Work arrival E2E tests.
 *
 * Current Work arrival is the Teams overview. `/work/portfolio` remains an
 * accepted entry URL but renders the same overview surface.
 */

import { expect, test } from "./fixtures";

const TEAMS_FIXTURE = {
	teams: [
		{
			id: "team-alpha",
			name: "Alpha Team",
			status: "healthy",
			activeBets: 2,
			shipRate: "80%",
			leadAgentId: "agent-1",
			shipped: 5,
			progress: { done: 2, total: 4 },
			routineCount: 0,
			agentCount: 0,
			activeAgentCount: 0,
			agentHealthWarning: false,
		},
		{
			id: "team-beta",
			name: "Beta Team",
			status: "behind",
			activeBets: 1,
			shipRate: "60%",
			leadAgentId: "agent-2",
			shipped: 3,
			progress: { done: 1, total: 3 },
			routineCount: 0,
			agentCount: 0,
			activeAgentCount: 0,
			agentHealthWarning: false,
		},
	],
};

async function registerTeamMocks(page: import("@playwright/test").Page) {
	await page.route("**/api/teams", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(TEAMS_FIXTURE),
		});
	});

	await page.route("**/api/teams/team-alpha", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				team: {
					id: "team-alpha",
					name: "Alpha Team",
					status: "healthy",
					phase: "active",
					leadAgentId: null,
				},
				teamMembers: { id: "tm-1", formedAt: new Date().toISOString(), dissolvedAt: null },
				roster: [],
				burn: {
					costActual: null,
					costCap: null,
					capacity: 1,
					activeBets: 0,
					betCostActual: null,
					routineCostThisMonth: null,
				},
				activeBets: [],
				routines: [],
			}),
		});
	});
}

test.describe("AG2 — Work arrival", () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await registerTeamMocks(page);
	});

	test("renders Teams overview from /work/portfolio", async ({ page }) => {
		await page.goto("/work/portfolio");
		await expect(page.getByTestId("work-overview-page")).toBeVisible();
		await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
		await expect(page.getByRole("button", { name: "New bet" })).toBeVisible();
		await expect(page.getByTestId("team-row").filter({ hasText: "Alpha Team" })).toBeVisible();
		await expect(page.getByTestId("team-row").filter({ hasText: "Beta Team" })).toBeVisible();
	});

	test("sidebar Work entry lands on current Work overview route", async ({ page }) => {
		await page.goto("/conversations");
		await page.waitForSelector("[data-testid='conversations-page']");

		await page.locator("[data-section-header='work']").click();

		await expect(page).toHaveURL(/\/work$/, { timeout: 10_000 });
		await expect(page.getByTestId("work-overview-page")).toBeVisible();
	});

	test("team breadcrumb returns to current Work overview route", async ({ page }) => {
		await page.goto("/work/team/team-alpha");
		await page.waitForSelector("[data-testid='team-breadcrumb-back']");

		await page.getByTestId("team-breadcrumb-back").click();

		await expect(page).toHaveURL(/\/work$/, { timeout: 10_000 });
		await expect(page.getByTestId("work-overview-page")).toBeVisible();
	});
});
