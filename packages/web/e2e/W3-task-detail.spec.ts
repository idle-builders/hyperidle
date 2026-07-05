/**
 * W3 — Task Detail E2E tests: AC-26 through AC-32.
 *
 * AC-26: Route /work/bet/:betId/task/:taskId renders task detail page.
 * AC-27: Breadcrumb: Work / [Team] / [Bet] / [Task title].
 * AC-28: Metadata strip: Owner, Status, Started, Cost, Session.
 * AC-29: Sessions section listing agent sessions.
 * AC-30: Discussion section.
 * AC-31: Artifacts section.
 * AC-32: Content max-width 800px, centered.
 */

import { expect, test } from "./fixtures";

const BET_FIXTURE = {
	id: "bet-e2e-1",
	title: "User Auth Flow",
	team: "Alpha Core",
	teamId: "t1",
	status: "active",
	atRisk: false,
	costAppetite: { minor: 200000, currency: "USD" },
	tokenAppetite: null,
	costActual: { minor: 12500, currency: "USD" },
	tokensActual: null,
	progress: { done: 3, total: 8 },
	description: "# Auth Feature\nMigrate to JWT.",
	tasks: [
		{
			id: "task-e2e-1",
			title: "Implement login endpoint",
			owner: "Dev Agent 1",
			state: "in_progress",
			costActual: { minor: 4200, currency: "USD" },
			startedAt: "2026-01-01T10:00:00.000Z",
		},
	],
};

const SESSIONS_FIXTURE = {
	sessions: [
		{
			id: "sess-1",
			title: "Login endpoint implementation",
			agent: "Dev Agent 1",
			cost: { minor: 4200, currency: "USD" },
			tokens: 15000,
			status: "completed",
			harnessUrl: null,
		},
	],
};

const TEAMS_FIXTURE = {
	teams: [{ id: "t1", name: "Alpha Core", phase: "build", active: true }],
};

test.describe("W3 AC-26 — Task detail route", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/bets/bet-e2e-1", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(BET_FIXTURE),
			});
		});
		await page.route("**/api/tasks/*/sessions", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(SESSIONS_FIXTURE),
			});
		});
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_FIXTURE),
			});
		});
	});

	test("navigating to /work/bet/:betId/task/:taskId renders task detail page", async ({ page }) => {
		await page.goto("/work/bet/bet-e2e-1/task/task-e2e-1");
		await expect(page.getByTestId("task-detail-page")).toBeVisible();
	});
});

test.describe("W3 AC-27 — Breadcrumb", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/bets/bet-e2e-1", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(BET_FIXTURE),
			});
		});
		await page.route("**/api/tasks/*/sessions", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(SESSIONS_FIXTURE),
			});
		});
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_FIXTURE),
			});
		});
		await page.goto("/work/bet/bet-e2e-1/task/task-e2e-1");
		await page.waitForSelector("[data-testid='task-detail-page']");
	});

	test("breadcrumb shows 'Work'", async ({ page }) => {
		const breadcrumb = page.getByTestId("task-breadcrumb");
		await expect(breadcrumb).toContainText("Work");
	});

	test("breadcrumb shows team name (Alpha Core)", async ({ page }) => {
		const breadcrumb = page.getByTestId("task-breadcrumb");
		await expect(breadcrumb).toContainText("Alpha Core");
	});

	test("breadcrumb shows bet title", async ({ page }) => {
		const breadcrumb = page.getByTestId("task-breadcrumb");
		await expect(breadcrumb).toContainText("User Auth Flow");
	});

	test("breadcrumb shows task title", async ({ page }) => {
		const breadcrumb = page.getByTestId("task-breadcrumb");
		await expect(breadcrumb).toContainText("Implement login endpoint");
	});
});

test.describe("W3 AC-28 — Metadata strip", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/bets/bet-e2e-1", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(BET_FIXTURE),
			});
		});
		await page.route("**/api/tasks/*/sessions", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(SESSIONS_FIXTURE),
			});
		});
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_FIXTURE),
			});
		});
		await page.goto("/work/bet/bet-e2e-1/task/task-e2e-1");
		await page.waitForSelector("[data-testid='task-meta-strip']");
	});

	test("metadata strip is visible", async ({ page }) => {
		await expect(page.getByTestId("task-meta-strip")).toBeVisible();
	});

	test("metadata strip shows owner name", async ({ page }) => {
		const strip = page.getByTestId("task-meta-strip");
		await expect(strip).toContainText("Dev Agent 1");
	});

	test("metadata strip shows status", async ({ page }) => {
		const strip = page.getByTestId("task-meta-strip");
		await expect(strip).toContainText(/in progress|in_progress/i);
	});
});

test.describe("W3 AC-29 — Sessions section", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/bets/bet-e2e-1", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(BET_FIXTURE),
			});
		});
		await page.route("**/api/tasks/*/sessions", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(SESSIONS_FIXTURE),
			});
		});
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_FIXTURE),
			});
		});
		await page.goto("/work/bet/bet-e2e-1/task/task-e2e-1");
		await page.waitForSelector("[data-testid='task-sessions-section']");
	});

	test("sessions section is visible", async ({ page }) => {
		await expect(page.getByTestId("task-sessions-section")).toBeVisible();
	});

	test("sessions section lists session titles", async ({ page }) => {
		const section = page.getByTestId("task-sessions-section");
		await expect(section).toContainText("Login endpoint implementation");
	});

	test("sessions section shows agent name", async ({ page }) => {
		const section = page.getByTestId("task-sessions-section");
		await expect(section).toContainText("Dev Agent 1");
	});
});

test.describe("W3 AC-32 — Task detail max-width 800px", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/bets/bet-e2e-1", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(BET_FIXTURE),
			});
		});
		await page.route("**/api/tasks/*/sessions", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(SESSIONS_FIXTURE),
			});
		});
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_FIXTURE),
			});
		});
		await page.goto("/work/bet/bet-e2e-1/task/task-e2e-1");
		await page.waitForSelector("[data-testid='task-detail-body']");
	});

	test("detail body has max-width ≤ 800px", async ({ page }) => {
		const body = page.getByTestId("task-detail-body");
		const box = await body.boundingBox();
		expect(box).not.toBeNull();
		if (box) {
			expect(box.width).toBeLessThanOrEqual(800);
		}
	});
});

test.describe("W3 — Task detail from bet detail click-through", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/bets/bet-e2e-1", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(BET_FIXTURE),
			});
		});
		await page.route("**/api/tasks/*/sessions", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(SESSIONS_FIXTURE),
			});
		});
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_FIXTURE),
			});
		});
	});

	test("clicking a task row on bet detail navigates to task detail page", async ({ page }) => {
		await page.goto("/work/bet/bet-e2e-1");
		await page.waitForSelector("[data-testid='task-row']");

		const firstTaskRow = page.locator("[data-testid='task-row']").first();
		await firstTaskRow.click();

		await expect(page).toHaveURL(/\/work\/bet\/bet-e2e-1\/task\/task-e2e-1/);
		await expect(page.getByTestId("task-detail-page")).toBeVisible();
	});
});
