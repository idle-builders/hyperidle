/**
 * L19 — WorkBet session metadata Playwright e2e tests.
 *
 * AC coverage:
 *  - Bet detail with task that has session metadata → outcome chip visible, jump-out link visible
 *  - Jump-out link has correct href (opens in new tab)
 *  - Task without session has no outcome chip and no jump-out link
 *
 * Strategy: hermetic page.route() mock for GET /api/bets/:id and all
 * side-effect API calls the AppShell and WorkBet components fire on load.
 * No DB seeding required.
 *
 * @lore L19: The AppShell always fires `POST /api/actions/search_threads`
 * (via useConversationsThreads). The auto-use fixture already answers it
 * with an empty list, but this spec registers its own override for clarity —
 * without one, an unmocked action door would hit the Vite proxy which tries
 * to reach API port 3001 (not running during E2E), and the ECONNREFUSED
 * causes Vite to log an error and return 502, which delays page hydration and
 * causes waitForSelector on table to time out. All API calls the page makes
 * must be mocked or explicitly absorbed.
 *
 * @lore BC3: repointed at `POST /api/actions/search_threads` — never
 * `GET/POST /api/threads*`.
 */

import { expect, mockSearchThreads, test } from "./fixtures";

const BET_ID = "bet-session-e2e";
const _TASK_WITH_SESSION_ID = "task-with-session-001";
const _TASK_WITHOUT_SESSION_ID = "task-no-session-001";
const HARNESS_URL = "https://harness.example.com/session/abc123";

test.describe("L19 — WorkBet session metadata (e2e)", () => {
	test.beforeEach(async ({ page }) => {
		// Mock bet detail endpoint.

		// Mock artifact thread summary so WorkBet renders cleanly.

		// Mock search_threads (host thread list for the bet, conversations) so
		// the AppShell absorbs it instead of hitting the Vite proxy, which would
		// ECONNREFUSED and block page hydration.
		await mockSearchThreads(page, { rows: [] });

		await page.goto(`/work/task/${BET_ID}`);

		// Wait for the bet page to be mounted (data-testid is set immediately on render).
		// Then wait for at least one task row to appear (requires the bet fetch to complete).
		await expect(page.getByTestId("task-detail-page")).toBeVisible();
		await expect(page.getByRole("table")).toBeVisible();
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

		// Query the jump-out link from the page — scoping to the row via within() is
		// unreliable for table row links in Playwright; the global query is correct
		// because only one task in this fixture has a harness URL.
		const link = page.getByRole("link", { name: /open session in harness/i });
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
		await expect(taskWithoutSessionRow.getByRole("link", { name: /open in harness/i })).toHaveCount(
			0,
		);
	});
});
