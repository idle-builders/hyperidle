/**
 * W3 — Task Detail E2E tests: AC-26 through AC-32.
 *
 * AC-26: /work/task/:taskId renders the task detail page.
 * AC-27: Breadcrumb: Work / [ancestors…] / [Task title].
 * AC-28: Metadata strip: Owner, Status, Depth, Sessions.
 * AC-29: Sessions section listing agent sessions.
 * AC-32: Content max-width 800px.
 *
 * @lore BB1: the route was `/work/task/:betId/task/:taskId` — a task sat
 * exactly one level under a bet, so the path carried both ids. A task can now
 * nest at any depth, so there is ONE route, `/work/task/:taskId`, and the
 * ancestor chain comes back from `open_task` instead of the URL.
 *
 * @lore BB1: AC-27 used to assert a team-name segment. The breadcrumb is the
 * task TREE path now — "Work", then each ancestor's title, then this task — so
 * there is no team segment to assert. The team is reachable from /work.
 */

import { expect, makeTask, mockTaskTree, test } from "./fixtures";

const ROOT_TASK_ID = "root-e2e-1";
const TASK_ID = "task-e2e-1";
const ROOT_TITLE = "User Auth Flow";
const TASK_TITLE = "Implement login endpoint";

/** `GET /api/agent-orchestration/runs?task_id=…` — what useTaskSessions reads. */
const RUNS_FIXTURE = {
	runs: [
		{
			id: "sess-1",
			state: "completed",
			startedAt: "2026-01-01T10:00:00.000Z",
			agentId: "agent-dev-1",
			effectivenessScore: null,
		},
	],
};

const TEAMS_FIXTURE = {
	teams: [{ id: "t1", name: "Alpha Core", phase: "build", active: true }],
};

async function seedTaskTree(page: import("@playwright/test").Page): Promise<void> {
	await page.route("**/api/agent-orchestration/runs**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(RUNS_FIXTURE),
		});
	});
	await page.route("**/api/teams", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(TEAMS_FIXTURE),
		});
	});

	const root = makeTask(ROOT_TASK_ID, { title: ROOT_TITLE, teamId: "t1" });
	const child = makeTask(TASK_ID, {
		title: TASK_TITLE,
		teamId: "t1",
		parentTaskId: ROOT_TASK_ID,
		ownerAgentId: "Dev Agent 1",
		state: "in_progress",
	});

	// The subtask, opened directly: one ancestor, so the breadcrumb has a middle segment.
	await mockTaskTree(page, { task: child, ancestors: [root] });
	// The root, for the click-through test: the subtask hangs underneath it.
	await mockTaskTree(page, { task: root, children: [{ ...child, children: [] }] });
}

test.describe("W3 AC-26 — Task detail route", () => {
	test.beforeEach(async ({ page }) => {
		await seedTaskTree(page);
	});

	test("navigating to /work/task/:taskId renders task detail page", async ({ page }) => {
		await page.goto(`/work/task/${TASK_ID}`);
		await expect(page.getByTestId("task-detail-page")).toBeVisible();
	});
});

test.describe("W3 AC-27 — Breadcrumb", () => {
	test.beforeEach(async ({ page }) => {
		await seedTaskTree(page);
		await page.goto(`/work/task/${TASK_ID}`);
		await page.waitForSelector("[data-testid='task-detail-page']");
	});

	test("breadcrumb shows 'Work'", async ({ page }) => {
		await expect(page.getByTestId("task-breadcrumb")).toContainText("Work");
	});

	test("breadcrumb shows the ancestor task title", async ({ page }) => {
		await expect(page.getByTestId("task-breadcrumb")).toContainText(ROOT_TITLE);
	});

	test("breadcrumb shows task title", async ({ page }) => {
		await expect(page.getByTestId("task-breadcrumb")).toContainText(TASK_TITLE);
	});
});

test.describe("W3 AC-28 — Metadata strip", () => {
	test.beforeEach(async ({ page }) => {
		await seedTaskTree(page);
		await page.goto(`/work/task/${TASK_ID}`);
		await page.waitForSelector("[data-testid='task-meta-strip']");
	});

	test("metadata strip is visible", async ({ page }) => {
		await expect(page.getByTestId("task-meta-strip")).toBeVisible();
	});

	test("metadata strip shows owner name", async ({ page }) => {
		await expect(page.getByTestId("task-meta-strip")).toContainText("Dev Agent 1");
	});

	test("metadata strip shows status", async ({ page }) => {
		await expect(page.getByTestId("task-meta-strip")).toContainText("In progress");
	});

	// @lore BB1: replaces the old "Started" cell. The strip carries Depth now —
	// a task can sit at any level, so how deep it is IS the new metadata.
	test("metadata strip shows depth relative to the root task", async ({ page }) => {
		await expect(page.getByTestId("task-meta-strip")).toContainText("Level 1");
	});
});

test.describe("W3 AC-29 — Sessions section", () => {
	test.beforeEach(async ({ page }) => {
		await seedTaskTree(page);
		await page.goto(`/work/task/${TASK_ID}`);
		await page.waitForSelector("[data-testid='task-sessions-section']");
	});

	test("sessions section is visible", async ({ page }) => {
		await expect(page.getByTestId("task-sessions-section")).toBeVisible();
	});
});

test.describe("W3 AC-32 — Task detail max-width 800px", () => {
	test("detail body has max-width ≤ 800px", async ({ page }) => {
		await seedTaskTree(page);
		await page.goto(`/work/task/${TASK_ID}`);
		await page.waitForSelector("[data-testid='task-detail-body']");
		const width = await page
			.getByTestId("task-detail-body")
			.evaluate((el) => el.getBoundingClientRect().width);
		expect(width).toBeLessThanOrEqual(800);
	});
});

test.describe("W3 — Task detail from its parent task", () => {
	test("clicking a subtask row on the parent navigates to that task's detail page", async ({
		page,
	}) => {
		await seedTaskTree(page);
		await page.goto(`/work/task/${ROOT_TASK_ID}`);
		await page.waitForSelector("[data-testid='subtask-row']");
		await page.locator(`[data-testid='subtask-link-${TASK_ID}']`).first().click();
		await expect(page).toHaveURL(new RegExp(`/work/task/${TASK_ID}`));
	});
});
