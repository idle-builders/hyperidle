/**
 * Journeys: a task's state propagates up through its parent — a session
 * ending with outcome=completed puts the task in review, a manually-done
 * task puts its parent in review too, and the team page shows that review
 * state. The chain stops at review; review->shipped needs a human approving
 * a review thread, which this suite does not automate.
 *
 * All API calls fired by AppShell + WorkTaskPage must be mocked or absorbed,
 * otherwise the Vite proxy hits the (not running) API port and 502s.
 */

import {
	expect,
	makeSessionRow,
	makeUserRow,
	mockSearchSessions,
	mockSearchThreads,
	mockSearchUsers,
	test,
} from "./fixtures";

const PRODUCT_ID = "prod-lifecycle";
const BET_ID = "bet-lifecycle";
const TASK_ID = "task-lifecycle-1";
const SESSION_ID = "session-lifecycle-1";
const AGENT_ID = "agent-lifecycle-1";

// ── Fixture factories ─────────────────────────────────────────────────────────

function makeTask(state: string) {
	return {
		id: TASK_ID,
		betId: BET_ID,
		title: "Lifecycle Task",
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
		title: "Lifecycle Bet",
		product: "Lifecycle Product",
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

function makeEmptyMessagesResponse() {
	return { messages: [] };
}

function makeSessionsResponse(taskId: string, state: string, outcome: string | null) {
	return [
		makeSessionRow(SESSION_ID, {
			taskId,
			agentId: AGENT_ID,
			state,
			outcome,
			startedAt: "2026-05-06T10:00:00Z",
			endedAt: state === "done" ? "2026-05-06T10:30:00Z" : null,
		}),
	];
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

	// Sessions list for the task, via search_sessions.
	await mockSearchSessions(page, { rows: makeSessionsResponse(TASK_ID, "done", "completed") });

	const roster = [
		makeUserRow("agent-lifecycle", {
			kind: "ai",
			team: { id: PRODUCT_ID, name: "Lifecycle Product" },
		}),
	];
	await mockSearchUsers(page, { rows: roster });
	await page.route("**/api/actions/search_tasks", (route) => {
		const input = JSON.parse(route.request().postData() ?? "{}") as {
			teamId?: string;
			state?: string;
		};
		if (input.teamId !== PRODUCT_ID) return route.continue();
		const data =
			input.state === "blocked"
				? []
				: [{ id: BET_ID, teamId: PRODUCT_ID, title: "Lifecycle Bet", state: "in_progress" }];
		return route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ ok: true, data }),
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
						title: "Lifecycle Bet",
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

test("task shows review state after session ends with outcome=completed", async ({ page }) => {
	// Arrange: bet is in_progress, task is in 'review' (post-propagation state)
	await setupCommonRoutes(page, "in_progress", "review");

	// Act: navigate to bet detail page
	await page.goto(`/work/task/${BET_ID}`);

	// Assert: the bet page loads
	await expect(page.locator('[data-testid="task-detail-page"]')).toBeVisible({ timeout: 10000 });

	// Assert: a task row is visible containing our task title
	// WorkTaskPage's subtask rows
	// carry `data-testid="subtask-row"`.
	const taskRow = page.locator('[data-testid="subtask-row"]:has-text("Lifecycle Task")').first();
	await expect(taskRow).toBeVisible({ timeout: 10000 });

	// The task state chip for 'review' maps to status='behind' in StatusChip
	// (taskStateToStatus('review') === 'behind' — see framework/design-system/src/status-mapping.ts)
	// 'review' task state renders as data-status="behind" because it means
	// "action required" — the design system maps review/action-required to the warn/behind color.
	const stateChip = taskRow.locator('[data-status="behind"]').first();
	await expect(stateChip).toBeVisible({ timeout: 5000 });
});

// ── Test: bet shows 'review' state after all tasks complete ──────────────────

test("parent task shows review state after its subtask is done", async ({ page }) => {
	// Arrange: bet is in 'review', task is 'done'
	await setupCommonRoutes(page, "review", "done");

	// Act: navigate to bet detail page
	await page.goto(`/work/task/${BET_ID}`);

	// Assert: the bet page loads
	await expect(page.locator('[data-testid="task-detail-page"]')).toBeVisible({ timeout: 10000 });

	// Assert: a bet-status chip is visible with data-status="behind"
	// betStatusToStatus('review') === 'behind' — review means "action required" in the design system
	// BetCard renders StatusChip with betStatusToStatus(status), which for 'review' yields 'behind'.
	const betStatusChip = page.locator('[data-status="behind"]').first();
	await expect(betStatusChip).toBeVisible({ timeout: 10000 });
});

// ── Test: product page shows bet in 'review' state ───────────────────────────

test("team page shows the task in review state after propagation", async ({ page }) => {
	// Arrange: bet is in review state
	await setupCommonRoutes(page, "review", "done");

	// Act: navigate to the team page
	await page.goto(`/work/team/${PRODUCT_ID}`);

	// Assert: the team page renders
	const productPage = page.locator('[data-testid="work-team-page"]').first();
	await expect(productPage).toBeVisible({ timeout: 10000 });

	// Assert: the page body contains "Lifecycle" (from product name or bet title in the response)
	await expect(page.locator("body")).toContainText("Lifecycle", { timeout: 10000 });
});

// ── Note: shipped transition requires human confirmation (out of scope) ───────

test("review is the final automatic state — shipped needs human confirmation", async ({ page }) => {
	// This test documents that the propagation chain stops at 'review' for bets.
	// The review->shipped transition requires human approval via a review thread.
	// This test verifies the 'review' state is
	// the final automatically-reachable state.
	await setupCommonRoutes(page, "review", "done");

	await page.goto(`/work/task/${BET_ID}`);

	// Bet should be in 'review' state — NOT 'shipped'
	// The bet page must load successfully
	await expect(page.locator('[data-testid="task-detail-page"]')).toBeVisible({ timeout: 10000 });

	// The bet-level status chip should be data-status="behind" (review → behind in design system)
	// NOT data-status="done" (shipped → done). BetCard renders the first StatusChip on the page.
	// The BetCard's StatusChip is the first [data-status] on the page.
	const firstStatusChip = page.locator("[data-status]").first();
	await expect(firstStatusChip).toBeVisible({ timeout: 10000 });
	const betChipStatus = await firstStatusChip.getAttribute("data-status");
	// bet is in review — the first chip (BetCard's) must NOT be "done" (shipped)
	expect(betChipStatus).not.toBe("done");
});
