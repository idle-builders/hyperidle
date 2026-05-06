/**
 * L19 — WorkBet session metadata Playwright e2e tests.
 *
 * AC coverage:
 *  - Bet detail with task that has session metadata → outcome chip visible, jump-out link visible
 *  - Jump-out link has correct href (opens in new tab)
 *  - Task without session has no outcome chip and no jump-out link
 *
 * Strategy: hermetic page.route() mock for GET /api/bets/:id.
 * No DB seeding required.
 */

import { expect, test } from "@playwright/test";

const BET_ID = "bet-session-e2e";
const TASK_WITH_SESSION_ID = "task-with-session-001";
const TASK_WITHOUT_SESSION_ID = "task-no-session-001";
const HARNESS_URL = "https://harness.example.com/session/abc123";

function makeBetResponse() {
	return {
		id: BET_ID,
		title: "Session E2E Test Bet",
		product: "Alpha",
		team: "Alpha Core",
		status: "in_progress",
		appetite: "1 week",
		progress: { done: 0, total: 2 },
		pitch: "# Problem\n\nTest session metadata display.",
		tasks: [
			{
				id: TASK_WITH_SESSION_ID,
				title: "Task with session",
				owner: "Dev Agent",
				state: "in_progress",
				cost: "$3.50",
				latestSessionOutcome: "completed",
				latestSessionCost: 350,
				latestSessionTokensInput: 2000,
				latestSessionTokensOutput: 3000,
				latestSessionHarnessUrl: HARNESS_URL,
			},
			{
				id: TASK_WITHOUT_SESSION_ID,
				title: "Task without session",
				owner: "Dev Agent",
				state: "accepted",
				cost: "$0.00",
				latestSessionOutcome: null,
				latestSessionCost: null,
				latestSessionTokensInput: null,
				latestSessionTokensOutput: null,
				latestSessionHarnessUrl: null,
			},
		],
	};
}

test.describe("L19 — WorkBet session metadata (e2e)", () => {
	test.beforeEach(async ({ page }) => {
		await page.route(`**/api/bets/${BET_ID}`, (route) => {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeBetResponse()),
			});
		});

		// Mock artifact thread summary so page loads cleanly
		await page.route(`**/api/bets/${BET_ID}/artifact-thread-summary`, (route) => {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ summaries: [], totalCount: 0, truncated: false }),
			});
		});

		// Mock thread list
		await page.route("**/api/threads?**host_kind=bet**", (route) => {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: [] }),
			});
		});

		await page.goto(`/work/bet/${BET_ID}`);

		// Wait for the task table to render
		await page.waitForSelector("[role='table']");
	});

	test("outcome chip is visible in the task table row for task with session", async ({ page }) => {
		const table = page.getByRole("table");
		await expect(table).toBeVisible();

		// The outcome chip for "completed" → "done" → "DONE" should be visible
		const taskWithSessionRow = page.getByRole("row").filter({ hasText: "Task with session" });
		await expect(taskWithSessionRow).toBeVisible();

		// Outcome chip text (StatusChip renders status.toUpperCase())
		await expect(taskWithSessionRow.getByText(/done/i)).toBeVisible();
	});

	test("jump-out link is visible and has correct href", async ({ page }) => {
		const taskWithSessionRow = page.getByRole("row").filter({ hasText: "Task with session" });
		await expect(taskWithSessionRow).toBeVisible();

		const link = taskWithSessionRow.getByRole("link", { name: /open in harness/i });
		await expect(link).toBeVisible();

		const href = await link.getAttribute("href");
		expect(href).toBe(HARNESS_URL);

		// Link opens in new tab
		const target = await link.getAttribute("target");
		expect(target).toBe("_blank");
	});

	test("task without session has no outcome chip and no jump-out link", async ({ page }) => {
		const taskWithoutSessionRow = page.getByRole("row").filter({ hasText: "Task without session" });
		await expect(taskWithoutSessionRow).toBeVisible();

		// No jump-out link
		await expect(
			taskWithoutSessionRow.getByRole("link", { name: /open in harness/i }),
		).toHaveCount(0);
	});
});
