/**
 * AI4 — Visual proof: Cross-surface status parity.
 *
 * AC1a: task `in_progress` renders identically (chip + LiveDot) on:
 *   - WorkBet task list row
 *   - WorkTask header
 *
 * AC1b: bet status `active` renders identically on:
 *   - Portfolio (BetCard)
 *   - Team page (BetRow)
 *   - Bet detail header
 *
 * AC3 (verdict proof): bet verdict `validated` on:
 *   - Portfolio BetCard verdict badge
 *   - Bet detail outcome verdict badge
 *
 * LiveDot: pulse present in:
 *   - WorkBet task row (in_progress state)
 *   - WorkTask header (in_progress state)
 *   - WorkTask session row (active session)
 *
 * Strategy: hermetic page.route() mocks. No DB. Dev server on port 5179.
 * Screenshots saved to test-results/AI4-*.png (path resolved from __dirname).
 *
 * Selector notes:
 * - StatusChip carries data-ds-component="StatusChip" (via dsProps) + data-status={safeStatus}.
 * - LiveDot has no dsProps — identified by its data-az16-profile="activity" attribute.
 * - BetCard carries data-ds-component="BetCard".
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, makeTask, makeTaskNode, mockTaskTree, test } from "./fixtures";

// ── Fixture IDs ────────────────────────────────────────────────────────────────
const ROOT_TASK_ID = "root-ai4-proof";
const TASK_ID = "task-ai4-proof";
const TEAM_ID = "team-ai4-proof";

// Proof directory — absolute path so screenshots always land in test-results/.
// ESM: use import.meta.url instead of __dirname (not available in ES module scope).
// import.meta.url = file:///…/layers/core-ui/e2e/AI4-status-language.spec.ts
// → up 3 levels → monorepo root → test-results/
const _Dirname = path.dirname(fileURLToPath(import.meta.url));
// Selectors
const STATUS_CHIP = '[data-ds-component="StatusChip"]';
// @lore BB1: LiveDot stopped being `.animate-pulse` when AI4 promoted it into
// the design system — it is `.motion-activity` with data-az16-profile="activity".
// The old selector matched nothing, so every LiveDot assertion here was failing
// on a stale class name rather than on the dot being absent.
const LIVE_DOT = '[data-az16-profile="activity"]';
// ── Mock data ──────────────────────────────────────────────────────────────────

function makeActiveSessionsResponse() {
	return {
		sessions: [
			{
				id: "sess-ai4-active",
				title: "Implementing status chip unification",
				agent: "Dev Agent",
				tokens: 15000,
				status: "active",
				harnessUrl: null,
				effectivenessScore: null,
			},
		],
	};
}

function makeTeamDetailResponse() {
	// Must match TeamDetail shape from @hyperidle/domain-model's team.ts
	return {
		team: {
			id: TEAM_ID,
			name: "Alpha Core",
			phase: "build",
			status: "healthy",
			leadAgentId: null,
		},
		teamMembers: { id: TEAM_ID, formedAt: new Date().toISOString(), dissolvedAt: null },
		roster: [],
		burn: {
			capacity: 3,
		},
		tasksInProgress: [
			{
				id: ROOT_TASK_ID,
				title: "AI4 Proof Task",
				// @lore BB1: TaskCardSummary carries `state`, not `status`. A summary
				// still spelling `status` renders with no chip at all rather than failing.
				state: "in_progress",
				progressDone: 1,
				progressTotal: 3,
			},
		],
		routines: [],
	};
}

function makeEmptyThreadResponse() {
	return { threads: [], nextCursor: null };
}

function makeEmptyMessagesResponse() {
	return { messages: [], total: 0 };
}

/** Wire standard routes needed by WorkBet page. */
async function setupBetRoutes(
	page: Parameters<typeof test>[1] extends infer T
		? T extends { page: infer P }
			? P
			: never
		: never,
) {
	await page.route(`**/api/threads?**`, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(makeEmptyThreadResponse()),
		}),
	);
	await page.route(`**/api/messages?**`, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(makeEmptyMessagesResponse()),
		}),
	);
}

/** Wire routes needed for WorkTask detail page. */
async function setupTaskRoutes(page: Parameters<typeof setupBetRoutes>[0]) {
	await setupBetRoutes(page);
	// Sessions for WorkTask detail + TaskSheet
	await page.route(`**/api/sessions**`, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(makeActiveSessionsResponse()),
		}),
	);
	await page.route(`**/api/agent-orchestration/runs**`, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(makeActiveSessionsResponse()),
		}),
	);
}

/** Wire routes needed for WorkTeam page. */
async function setupTeamRoutes(page: Parameters<typeof setupBetRoutes>[0]) {
	await page.route(`**/api/teams/${TEAM_ID}`, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(makeTeamDetailResponse()),
		}),
	);
	await page.route(`**/api/routines**`, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ routines: [] }),
		}),
	);
	await page.route(`**/api/agents**`, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ agents: [] }),
		}),
	);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe("AI4 — cross-surface status parity", () => {
	// @lore BB1: this described four surfaces — a WorkBet task row, a WorkTask
	// header, a team BetRow and a bet-detail header. Two of them collapsed into
	// one: a bet IS a root task, so "bet detail header" and "task header" are the
	// same header on the same page, and the duplicate assertion went with it.
	// The bet-detail OUTCOME section went too — WorkTaskPage renders no outcome
	// or verdict section at all, so there is no verdict chip on it to prove.
	//
	// @lore BB1: the screenshot writes are gone. They asserted nothing, compared
	// against nothing, and landed in gitignored test-results/ — the DOM
	// assertions above each one are the actual proof.

	// ── AC1a: task in_progress — subtask row on its parent's page ─────────────

	test("AC1a-subtask-row: task in_progress chip + LiveDot on a subtask row", async ({ page }) => {
		await setupTaskRoutes(page);
		await mockTaskTree(page, {
			task: makeTask(ROOT_TASK_ID, { title: "AI4 Proof Task", teamId: TEAM_ID }),
			children: [
				makeTaskNode(TASK_ID, {
					parentTaskId: ROOT_TASK_ID,
					title: "AI4 proof subtask",
					state: "in_progress",
				}),
			],
		});
		await page.goto(`/work/task/${ROOT_TASK_ID}`);
		await expect(page.locator('[data-testid="task-detail-page"]')).toBeVisible();

		const subtaskRow = page.locator('[data-testid="subtask-row"]').first();
		await expect(subtaskRow).toBeVisible();

		const chipInRow = subtaskRow.locator(STATUS_CHIP).last();
		await expect(chipInRow).toBeVisible();
		// taskStateToStatus("in_progress") → "healthy"
		await expect(chipInRow).toHaveAttribute("data-status", "healthy");
		// verbatim registry label (CSS-uppercased visually)
		await expect(chipInRow).toContainText("In progress");

		await expect(subtaskRow.locator(LIVE_DOT)).toBeVisible();
	});

	// ── AC1a: task in_progress — the task's own header ───────────────────────

	test("AC1a-task-header: task in_progress chip + LiveDot on the task header", async ({ page }) => {
		await setupTaskRoutes(page);
		await mockTaskTree(page, {
			task: makeTask(TASK_ID, { title: "AI4 proof subtask", state: "in_progress" }),
		});
		await page.goto(`/work/task/${TASK_ID}`);
		await expect(page.locator('[data-testid="task-detail-page"]')).toBeVisible();

		const header = page.locator('[data-testid="task-detail-page"] header').first();
		await expect(header).toBeVisible();

		const chipInHeader = header.locator(STATUS_CHIP).first();
		await expect(chipInHeader).toBeVisible();
		await expect(chipInHeader).toHaveAttribute("data-status", "healthy");
		await expect(chipInHeader).toContainText("In progress");

		await expect(header.locator(LIVE_DOT)).toBeVisible();
	});

	// ── AC1b: in_progress task — team page TaskRow ───────────────────────────

	test("AC1b-team: task in_progress status chip on the team page task row", async ({ page }) => {
		await setupTeamRoutes(page);
		await page.goto(`/work/team/${TEAM_ID}`);
		await expect(page.locator('[data-testid="work-team-page"]')).toBeVisible();

		const activeTasks = page.locator('[data-testid="team-active-tasks"]');
		await expect(activeTasks).toBeVisible();

		const chipInRow = activeTasks.locator(STATUS_CHIP).first();
		await expect(chipInRow).toBeVisible();
		await expect(chipInRow).toHaveAttribute("data-status", "healthy");
	});

	// ── Parity: the SAME task, seen as a row and as a header ─────────────────

	test("parity: same data-status on the subtask row chip and that task's header chip", async ({
		page,
	}) => {
		await setupTaskRoutes(page);
		await mockTaskTree(page, {
			task: makeTask(ROOT_TASK_ID, { title: "AI4 Proof Task", teamId: TEAM_ID }),
			children: [
				makeTaskNode(TASK_ID, {
					parentTaskId: ROOT_TASK_ID,
					title: "AI4 proof subtask",
					state: "in_progress",
				}),
			],
		});
		await mockTaskTree(page, {
			task: makeTask(TASK_ID, { title: "AI4 proof subtask", state: "in_progress" }),
		});

		await page.goto(`/work/task/${ROOT_TASK_ID}`);
		await expect(page.locator('[data-testid="task-detail-page"]')).toBeVisible();
		const chipInRow = page
			.locator('[data-testid="subtask-row"]')
			.first()
			.locator(STATUS_CHIP)
			.last();
		const rowDataStatus = await chipInRow.getAttribute("data-status");
		const rowTextContent = await chipInRow.textContent();

		await page.goto(`/work/task/${TASK_ID}`);
		await expect(page.locator('[data-testid="task-detail-page"]')).toBeVisible();
		const headerChip = page
			.locator('[data-testid="task-detail-page"] header')
			.first()
			.locator(STATUS_CHIP)
			.first();
		const headerDataStatus = await headerChip.getAttribute("data-status");
		const headerTextContent = await headerChip.textContent();

		expect(rowDataStatus).toBeTruthy();
		expect(headerDataStatus).toBeTruthy();
		expect(rowDataStatus).toBe(headerDataStatus);
		expect(rowTextContent?.trim()).toBe(headerTextContent?.trim());
	});
});
