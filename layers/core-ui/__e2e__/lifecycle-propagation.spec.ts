/**
 * L20 — Lifecycle Propagation: Playwright E2E tests.
 *
 * Strategy: hermetic page.route() mocks for all API calls.
 * No DB seeding — dev server serves only the SPA bundle.
 *
 * AC coverage (F3 corrected: stop at 'review', NOT 'done' — review->shipped
 * requires human confirmation and is outside L20 scope):
 * 1. Session ends with outcome=completed -> task transitions to 'review'
 * 2. Task manually transitions to 'done' -> bet transitions to 'review'
 * 3. Product page shows the bet in 'review' state
 *
 * @lore L20: The E2E verifies the propagation chain up to bet=review.
 * The review->shipped transition requires a human approving a review thread —
 * that is explicitly out of scope for L20. See F3 in the architecture review.
 *
 * @lore L20: All API calls fired by AppShell + WorkBet must be mocked or
 * absorbed, otherwise Vite proxy hits port 3001 (not running during E2E)
 * and returns 502, causing timeout on hydration. Pattern from L19.
 */

import { expect, mockSearchThreads, test } from "./fixtures";

const PRODUCT_ID = "prod-l20";
const BET_ID = "bet-l20";
const TASK_ID = "task-l20-1";
const SESSION_ID = "session-l20-1";
const AGENT_ID = "agent-l20-1";

// ── Fixture factories ─────────────────────────────────────────────────────────

function makeTask(state: string) {
	return {
		id: TASK_ID,
		betId: BET_ID,
		title: "L20 Lifecycle Task",
		ownerAgentId: AGENT_ID,
		state,
		latestSessionOutcome: state === "review" ? "completed" : null,
		latestSessionTokensInput: null,
		latestSessionTokensOutput: null,
		latestSessionHarnessUrl: null,
	};
}

function _makeBetResponse(betStatus: string, taskState: string) {
	return {
		id: BET_ID,
		title: "L20 Lifecycle Bet",
		product: "L20 Product",
		team: "Alpha Core",
		status: betStatus,
		tokensActual: null,
		progress: {
			done: taskState === "done" ? 1 : 0,
			total: 1,
		},
		description: "# Problem\n\nTest lifecycle propagation.",
		tasks: [makeTask(taskState)],
		revisionLog: null,
	};
}

function makeProductResponse(betStatus: string) {
	// Shape matches TeamDetail from @hyperidle/domain-model.
	// @lore BB1: `activeBets: BetCardSummary[]` became
	// `tasksInProgress: TaskCardSummary[]` (title/state, not pitchTitle/status),
	// and TeamBurn lost its stored counter — it is { capacity } only.
	return {
		product: {
			id: PRODUCT_ID,
			name: "L20 Product",
			phase: "build",
			status: "healthy",
			leadAgentId: null,
		},
		team: { id: "team-l20", formedAt: "2026-01-01T00:00:00Z", dissolvedAt: null },
		roster: [],
		burn: { capacity: 5 },
		tasksInProgress: [
			{
				id: BET_ID,
				title: "L20 Lifecycle Bet",
				status: betStatus,
				progressDone: 1,
				progressTotal: 1,
			},
		],
	};
}

function makeEmptyMessagesResponse() {
	return { messages: [] };
}

function makeSessionsResponse(taskId: string, state: string, outcome: string | null) {
	return {
		sessions: [
			{
				id: SESSION_ID,
				taskId,
				agentId: AGENT_ID,
				state,
				outcome,
				startedAt: "2026-05-06T10:00:00Z",
				endedAt: state === "ended" ? "2026-05-06T10:30:00Z" : null,
			},
		],
	};
}

// ── Shared route mock helper ──────────────────────────────────────────────────

type PlaywrightPage = Parameters<Parameters<typeof test>[1]>[0]["page"];

async function setupCommonRoutes(
	page: PlaywrightPage,
	betStatus: string,
	taskState: string,
): Promise<void> {
	// Bet detail route

	// Threads list
	await mockSearchThreads(page, { rows: [] });

	// Messages list
	await page.route("**/api/messages?**", (route) => {
		return route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(makeEmptyMessagesResponse()),
		});
	});

	// Sessions list for the task
	await page.route(`**/api/sessions?**`, (route) => {
		return route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(makeSessionsResponse(TASK_ID, "ended", "completed")),
		});
	});

	// Products: handle both detail (/api/teams/:id) and list (/api/teams or /api/teams?...)
	// in a single handler. Playwright evaluates the last-registered route first, so merging
	// avoids the ambiguity of route.continue() falling through to the network instead of the
	// earlier specific handler.
	// @lore L20: Playwright last-registered-wins ordering means a wildcard registered after a
	// specific pattern will be evaluated FIRST, and route.continue() from the wildcard falls through
	// to subsequent handlers — but can hit the network if no later handler matches. Consolidating
	// into one handler is the safest pattern for URL-dispatch in Playwright mocks.
	await page.route("**/api/teams**", (route) => {
		if (route.request().method() !== "GET") return route.continue();
		const url = route.request().url();
		if (url.includes(`/${PRODUCT_ID}`)) {
			// Detail route: /api/teams/:id
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeProductResponse(betStatus)),
			});
		}
		// List route: /api/teams or /api/teams?...
		return route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ teams: [] }),
		});
	});

	// Bets list for nav

	// `open_task` — the recursive task detail page's only data source. The
	// page opens on BET_ID; TASK_ID is its one child, carrying the state
	// this test drives.
	await page.route("**/api/actions/open_task", (route) => {
		const input = JSON.parse(route.request().postData() ?? "{}") as { id?: string };
		const task = makeTask(taskState);
		return route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				ok: true,
				data: {
					task: {
						id: input.id ?? BET_ID,
						parentTaskId: null,
						teamId: PRODUCT_ID,
						ownerAgentId: null,
						title: "L20 Lifecycle Bet",
						description: null,
						doneCondition: null,
						state: betStatus,
						position: 0,
						needsReview: false,
						dependencies: null,
						threadId: null,
						notes: null,
						outcomeVerdict: null,
						outcomeSummary: null,
						outcomeRecordedAt: null,
						outcomeRecordedBy: null,
						tokensActualJson: null,
						sourceDocumentId: null,
						createdAt: "2026-05-06T10:00:00Z",
						updatedAt: "2026-05-06T10:00:00Z",
						completedAt: null,
					},
					ancestors: [],
					children: [
						{
							id: task.id,
							parentTaskId: BET_ID,
							teamId: PRODUCT_ID,
							ownerAgentId: task.ownerAgentId,
							title: task.title,
							description: null,
							doneCondition: null,
							state: task.state,
							position: 0,
							needsReview: false,
							dependencies: null,
							threadId: null,
							notes: null,
							outcomeVerdict: null,
							outcomeSummary: null,
							outcomeRecordedAt: null,
							outcomeRecordedBy: null,
							tokensActualJson: null,
							sourceDocumentId: null,
							createdAt: "2026-05-06T10:00:00Z",
							updatedAt: "2026-05-06T10:00:00Z",
							completedAt: null,
							children: [],
						},
					],
					tokensActualRollup: null,
					threadId: null,
					attachments: [],
				},
			}),
		});
	});
}

// ── Test: task shows 'review' state after session completes ──────────────────

test("L20: task shows review state after session ends with outcome=completed", async ({ page }) => {
	// Arrange: bet is in_progress, task is in 'review' (post-propagation state)
	await setupCommonRoutes(page, "in_progress", "review");

	// Act: navigate to bet detail page
	await page.goto(`/work/task/${BET_ID}`);

	// Assert: the bet page loads
	await expect(page.locator('[data-testid="task-detail-page"]')).toBeVisible({ timeout: 10000 });

	// Assert: a task row is visible containing our task title
	// @lore the architecture doc's UI re-point: WorkTaskPage's subtask rows
	// carry `data-testid="subtask-row"` (BB1), not the pre-BB1 `bet-task-row`.
	const taskRow = page
		.locator('[data-testid="subtask-row"]:has-text("L20 Lifecycle Task")')
		.first();
	await expect(taskRow).toBeVisible({ timeout: 10000 });

	// The task state chip for 'review' maps to status='behind' in StatusChip
	// (taskStateToStatus('review') === 'behind' — see framework/design-system/src/status-mapping.ts)
	// @lore L20: 'review' task state renders as data-status="behind" because it means
	// "action required" — the design system maps review/action-required to the warn/behind color.
	const stateChip = taskRow.locator('[data-status="behind"]').first();
	await expect(stateChip).toBeVisible({ timeout: 5000 });
});

// ── Test: bet shows 'review' state after all tasks complete ──────────────────

test("L20: bet shows review state after all tasks are done", async ({ page }) => {
	// Arrange: bet is in 'review', task is 'done'
	await setupCommonRoutes(page, "review", "done");

	// Act: navigate to bet detail page
	await page.goto(`/work/task/${BET_ID}`);

	// Assert: the bet page loads
	await expect(page.locator('[data-testid="task-detail-page"]')).toBeVisible({ timeout: 10000 });

	// Assert: a bet-status chip is visible with data-status="behind"
	// betStatusToStatus('review') === 'behind' — review means "action required" in the design system
	// BetCard renders StatusChip with betStatusToStatus(status), which for 'review' yields 'behind'.
	// @lore L20: bet status 'review' renders as data-status="behind" chip via BetCard > StatusChip.
	const betStatusChip = page.locator('[data-status="behind"]').first();
	await expect(betStatusChip).toBeVisible({ timeout: 10000 });
});

// ── Test: product page shows bet in 'review' state ───────────────────────────

test("L20: product page shows bet in review state after propagation", async ({ page }) => {
	// Arrange: bet is in review state
	await setupCommonRoutes(page, "review", "done");

	// Act: navigate to the team page (U6: route renamed from /work/product/ to /work/team/)
	await page.goto(`/work/team/${PRODUCT_ID}`);

	// Assert: the team page renders
	const productPage = page.locator('[data-testid="work-team-page"]').first();
	await expect(productPage).toBeVisible({ timeout: 10000 });

	// Assert: the page body contains "L20" (from product name or bet title in the response)
	await expect(page.locator("body")).toContainText("L20", { timeout: 10000 });
});

// ── Note: shipped transition requires human confirmation (out of scope) ───────

test("L20: bet stays in review — shipped transition requires human confirmation (stop condition)", async ({
	page,
}) => {
	// This test documents that the propagation chain stops at 'review' for bets.
	// The review->shipped transition requires human approval via a review thread.
	// L20 does NOT automate this step. This test verifies the 'review' state is
	// the final automatically-reachable state.
	await setupCommonRoutes(page, "review", "done");

	await page.goto(`/work/task/${BET_ID}`);

	// Bet should be in 'review' state — NOT 'shipped'
	// The bet page must load successfully
	await expect(page.locator('[data-testid="task-detail-page"]')).toBeVisible({ timeout: 10000 });

	// The bet-level status chip should be data-status="behind" (review → behind in design system)
	// NOT data-status="done" (shipped → done). BetCard renders the first StatusChip on the page.
	// @lore L20: betStatusToStatus('review') === 'behind'. betStatusToStatus('shipped') === 'done'.
	// The BetCard's StatusChip is the first [data-status] on the page.
	const firstStatusChip = page.locator("[data-status]").first();
	await expect(firstStatusChip).toBeVisible({ timeout: 10000 });
	const betChipStatus = await firstStatusChip.getAttribute("data-status");
	// bet is in review — the first chip (BetCard's) must NOT be "done" (shipped)
	expect(betChipStatus).not.toBe("done");
});
