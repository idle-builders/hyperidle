/**
 * L19/W3 — WorkBet task list Playwright e2e tests.
 *
 * AC coverage:
 *  - Bet detail renders flat task rows, not the retired task table.
 *  - Task rows navigate to task detail.
 *  - Session metadata/jump-out links are not exposed in the bet task list.
 *
 * Strategy: hermetic page.route() mock for GET /api/bets/:id and all
 * side-effect API calls the AppShell and WorkBet components fire on load.
 * No DB seeding required.
 *
 * @lore L19: The AppShell always fires GET /api/threads?participant_id=…
 * (via useConversationsThreads). Without a mock this hits the Vite proxy
 * which tries to reach API port 3001 — not running during E2E. The ECONNREFUSED
 * causes Vite to log an error and return 502, which delays page hydration and
 * causes waitForSelector on table to time out. All API calls the page makes
 * must be mocked or explicitly absorbed.
 */

import { expect, test } from "./fixtures";

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
		costAppetite: { minor: 50000, currency: "USD" },
		costActual: null,
		tokensActual: null,
		progress: { done: 0, total: 2 },
		description: "# Problem\n\nTest session metadata display.",
		tasks: [
			{
				id: TASK_WITH_SESSION_ID,
				betId: BET_ID,
				title: "Task with session",
				ownerAgentId: "agent-dev-1",
				state: "in_progress",
				costActual: { minor: 350, currency: "USD" },
				costCap: null,
				latestSessionOutcome: "completed",
				latestSessionCost: 350,
				latestSessionTokensInput: 2000,
				latestSessionTokensOutput: 3000,
				latestSessionHarnessUrl: HARNESS_URL,
			},
			{
				id: TASK_WITHOUT_SESSION_ID,
				betId: BET_ID,
				title: "Task without session",
				ownerAgentId: "agent-dev-1",
				state: "accepted",
				costActual: null,
				costCap: null,
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
		// Mock bet detail endpoint.
		await page.route(`**/api/bets/${BET_ID}`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeBetResponse()),
			});
		});

		// Mock artifact thread summary so WorkBet renders cleanly.
		await page.route(`**/api/bets/${BET_ID}/artifact-thread-summary`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ summaries: [], totalCount: 0, truncated: false }),
			});
		});

		// Mock all /api/threads calls (host thread list for the bet, conversations).
		// The AppShell fires GET /api/threads?participant_id=… which must be absorbed
		// to prevent a Vite proxy ECONNREFUSED that blocks page hydration.
		await page.route("**/api/threads**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: [], nextCursor: null }),
			});
		});

		await page.goto(`/work/bet/${BET_ID}`);

			// Wait for the bet page and current flat task rows to render.
			await expect(page.getByTestId("work-bet-page")).toBeVisible();
			await expect(page.getByTestId("task-row")).toHaveCount(2);
		});

		test("task list renders flat rows and no retired task table", async ({ page }) => {
			await expect(page.getByRole("table")).toHaveCount(0);

			const taskWithSessionRow = page.getByTestId("task-row").filter({ hasText: "Task with session" });
			await expect(taskWithSessionRow).toBeVisible();
			await expect(taskWithSessionRow).toContainText("In progress");
		});

		test("task row navigates to task detail", async ({ page }) => {
			const taskWithSessionRow = page.getByRole("button", { name: "Task with session" });
			await expect(taskWithSessionRow).toBeVisible();

			await taskWithSessionRow.click();
			await expect(page).toHaveURL(new RegExp(`/work/bet/${BET_ID}/task/${TASK_WITH_SESSION_ID}`));
		});

		test("bet task list does not expose session metadata or harness jump-out links", async ({ page }) => {
			const taskWithoutSessionRow = page.getByTestId("task-row").filter({ hasText: "Task without session" });
			await expect(taskWithoutSessionRow).toBeVisible();

			await expect(page.getByTestId("task-session-metadata")).toHaveCount(0);
			await expect(page.getByRole("link", { name: /open session in harness/i })).toHaveCount(0);
		});
	});
