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
 * Screenshots saved to plans/AI4/proof/ (path resolved from __dirname).
 *
 * Selector notes:
 * - StatusChip carries data-ds-component="StatusChip" (via dsProps) + data-status={safeStatus}.
 * - LiveDot has no dsProps — identified by aria-hidden="true" + class containing "animate-pulse".
 * - BetCard carries data-ds-component="BetCard".
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures";

// ── Fixture IDs ────────────────────────────────────────────────────────────────
const BET_ID = "bet-ai4-proof";
const TASK_ID = "task-ai4-proof";
const TEAM_ID = "team-ai4-proof";

// Proof directory — absolute path so screenshots always land in plans/AI4/proof/
// ESM: use import.meta.url instead of __dirname (not available in ES module scope).
// import.meta.url = file:///…/layers/core-ui/e2e/AI4-status-language.spec.ts
// → up 3 levels → monorepo root → plans/AI4/proof/
const Dirname = path.dirname(fileURLToPath(import.meta.url));
const PROOF_DIR = path.resolve(Dirname, "../../../plans/AI4/proof");

// Selectors
const STATUS_CHIP = '[data-ds-component="StatusChip"]';
const LIVE_DOT = '[aria-hidden="true"].animate-pulse';
const BET_CARD = '[data-ds-component="BetCard"]';

// ── Mock data ──────────────────────────────────────────────────────────────────

/** Active bet with an in_progress task — for AC1a/AC1b tests. */
function makeBetResponse(overrides: Record<string, unknown> = {}) {
	return {
		id: BET_ID,
		title: "AI4 Proof Bet",
		product: "Alpha",
		team: TEAM_ID,
		status: "active",
		tokensActual: null,
		progress: { done: 1, total: 3 },
		atRisk: false,
		description: "# Problem\n\nVisual proof for AI4 status parity.",
		hypothesis: null,
		outcomeVerdict: null,
		outcomeSummary: null,
		tasks: [
			{
				id: TASK_ID,
				title: "Unify status chips",
				owner: "Dev Agent",
				state: "in_progress",
				startedAt: "2026-01-01T10:00:00.000Z",
				outcomeVerdict: null,
				ownerAgentId: null,
			},
		],
		revisionLog: null,
		...overrides,
	};
}

/** Completed bet with a validated verdict — for AC3 verdict proof. */
function makeCompletedBetResponse() {
	return {
		id: BET_ID,
		title: "AI4 Proof Bet (Completed)",
		product: "Alpha",
		team: TEAM_ID,
		// Must be "completed" or "killed" for outcome-section to render in WorkBet
		status: "completed",
		tokensActual: null,
		progress: { done: 3, total: 3 },
		atRisk: false,
		description: "# Problem\n\nVisual proof for AI4 status parity.",
		hypothesis: "Shipping a status unification will improve consistency.",
		outcomeVerdict: "validated",
		outcomeSummary: "The hypothesis held — status chips are now unified across all surfaces.",
		tasks: [],
		revisionLog: null,
	};
}

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

function makeBetsGroupedResponse() {
	return {
		draft: [],
		active: [
			{
				id: BET_ID,
				title: "AI4 Proof Bet",
				teamId: TEAM_ID,
				status: "active",
				description: "Visual proof for AI4 status parity.",
				atRisk: false,
				outcomeVerdict: null,
			},
		],
		completed: [],
		killed: [],
	};
}

/** Portfolio with a completed+validated bet — for AC3 verdict proof on portfolio. */
function makeCompletedBetsGroupedResponse() {
	return {
		draft: [],
		active: [],
		completed: [
			{
				id: BET_ID,
				title: "AI4 Proof Bet (Completed)",
				teamId: TEAM_ID,
				status: "completed",
				description: "Visual proof for AI4 status parity.",
				atRisk: false,
				outcomeVerdict: "validated",
			},
		],
		killed: [],
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
		teamMembers: { id: "tm1", formedAt: new Date().toISOString(), dissolvedAt: null },
		roster: [],
		burn: {
			capacity: 3,
			activeBets: 1,
		},
		activeBets: [
			{
				id: BET_ID,
				descriptionTitle: "AI4 Proof Bet",
				status: "active",
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
	await page.route(`**/api/bets/${BET_ID}`, (route) => {
		if (route.request().method() === "GET") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeBetResponse()),
			});
		}
		return route.continue();
	});
	await page.route(`**/api/bets/${BET_ID}/artifact-thread-summary`, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ summaries: [], totalCount: 0, truncated: false }),
		}),
	);
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
	await page.route(`**/api/tasks/${TASK_ID}/sessions`, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(makeActiveSessionsResponse()),
		}),
	);
}

/** Wire routes needed for WorkPortfolio page. */
async function setupPortfolioRoutes(page: Parameters<typeof setupBetRoutes>[0]) {
	await page.route(`**/api/bets`, (route) => {
		const url = route.request().url();
		if (route.request().method() === "GET" && !url.includes(`/api/bets/${BET_ID}`)) {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeBetsGroupedResponse()),
			});
		}
		return route.continue();
	});
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

test.describe("AI4 — Visual proof: cross-surface status parity", () => {
	// ── AC1a: task in_progress — WorkBet task list ────────────────────────────

	test("AC1a-workbet: task in_progress chip + LiveDot on WorkBet task list", async ({ page }) => {
		await setupBetRoutes(page);
		await page.goto(`/work/bet/${BET_ID}`);
		await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

		// Find the in_progress task row
		const taskRow = page.locator('[data-testid="task-row"]').first();
		await expect(taskRow).toBeVisible();

		// StatusChip must be present (state chip)
		const chipInRow = taskRow.locator(STATUS_CHIP).last();
		await expect(chipInRow).toBeVisible();
		// data-status = "healthy" (taskStateToStatus("in_progress") → healthy)
		await expect(chipInRow).toHaveAttribute("data-status", "healthy");
		// textContent = "In progress" (verbatim registry label; CSS-uppercased visually)
		await expect(chipInRow).toContainText("In progress");

		// LiveDot must be present (in_progress → pulse dot)
		const liveDot = taskRow.locator(LIVE_DOT);
		await expect(liveDot).toBeVisible();

		// Screenshot the status badge area of the task row
		const statusArea = taskRow.locator("span.flex.items-center").last();
		await statusArea.screenshot({
			path: `${PROOF_DIR}/ac1a-workbet-task-row-in-progress.png`,
		});
	});

	// ── AC1a: task in_progress — WorkTask header ─────────────────────────────

	test("AC1a-worktask: task in_progress chip + LiveDot on WorkTask header", async ({ page }) => {
		await setupTaskRoutes(page);
		await page.goto(`/work/bet/${BET_ID}/task/${TASK_ID}`);
		await expect(page.locator('[data-testid="task-detail-page"]')).toBeVisible();

		// Header has StatusChip + LiveDot for in_progress
		const header = page.locator('[data-testid="task-detail-page"] header').first();
		await expect(header).toBeVisible();

		const chipInHeader = header.locator(STATUS_CHIP).first();
		await expect(chipInHeader).toBeVisible();
		await expect(chipInHeader).toHaveAttribute("data-status", "healthy");
		await expect(chipInHeader).toContainText("In progress");

		// LiveDot in header
		const liveDotInHeader = header.locator(LIVE_DOT);
		await expect(liveDotInHeader).toBeVisible();

		// Screenshot the header status badge area
		const statusArea = header.locator(".flex.items-center").last();
		await statusArea.screenshot({
			path: `${PROOF_DIR}/ac1a-worktask-header-in-progress.png`,
		});
	});

	// ── LiveDot: WorkTask active session row ──────────────────────────────────

	test("livedot-worktask-session: LiveDot present in WorkTask active session row", async ({
		page,
	}) => {
		await setupTaskRoutes(page);
		await page.goto(`/work/bet/${BET_ID}/task/${TASK_ID}`);
		await expect(page.locator('[data-testid="task-detail-page"]')).toBeVisible();
		await expect(page.locator('[data-testid="task-sessions-section"]')).toBeVisible();

		const sessionRow = page.locator('[data-testid="session-row"]').first();
		await expect(sessionRow).toBeVisible();

		// Active session has LiveDot
		const liveDotInSession = sessionRow.locator(LIVE_DOT);
		await expect(liveDotInSession).toBeVisible();

		await sessionRow.screenshot({
			path: `${PROOF_DIR}/livedot-worktask-session-row-active.png`,
		});
	});

	// ── AC1b: bet status active — Portfolio (BetCard) ─────────────────────────

	test("AC1b-portfolio: bet active status chip on BetCard (portfolio)", async ({ page }) => {
		await setupPortfolioRoutes(page);
		await page.goto("/work/portfolio");
		await expect(page.locator('[data-testid="work-portfolio-page"]')).toBeVisible();

		// Wait for bet grid to render
		const betGrid = page.locator('[data-testid="bet-grid"]').first();
		await expect(betGrid).toBeVisible();

		const betCard = betGrid.locator(BET_CARD).first();
		await expect(betCard).toBeVisible();

		// First StatusChip in BetCard = bet status chip (label "Active")
		const chipInCard = betCard.locator(STATUS_CHIP).first();
		await expect(chipInCard).toBeVisible();
		await expect(chipInCard).toHaveAttribute("data-status", "healthy");
		// BET_STATUS_LABEL["active"] = "Active" — verbatim textContent, CSS-uppercased visually
		await expect(chipInCard).toContainText("Active");

		await chipInCard.screenshot({
			path: `${PROOF_DIR}/ac1b-portfolio-betcard-active-chip.png`,
		});
	});

	// ── AC1b: bet status active — Team page (BetRow) ──────────────────────────

	test("AC1b-team: bet active status chip on team BetRow", async ({ page }) => {
		await setupTeamRoutes(page);
		await page.goto(`/work/team/${TEAM_ID}`);
		await expect(page.locator('[data-testid="work-team-page"]')).toBeVisible();

		const activeBets = page.locator('[data-testid="team-active-bets"]');
		await expect(activeBets).toBeVisible();

		// BetRow in the team page has a StatusChip
		const chipInRow = activeBets.locator(STATUS_CHIP).first();
		await expect(chipInRow).toBeVisible();
		await expect(chipInRow).toHaveAttribute("data-status", "healthy");

		await chipInRow.screenshot({
			path: `${PROOF_DIR}/ac1b-team-betrow-active-chip.png`,
		});
	});

	// ── AC1b: bet status active — Bet detail header ───────────────────────────

	test("AC1b-betdetail: bet active status chip on bet detail header", async ({ page }) => {
		await setupBetRoutes(page);
		await page.goto(`/work/bet/${BET_ID}`);
		await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

		// The bet detail header StatusChip has label BET_STATUS_LABEL["active"] = "Active"
		const header = page.locator('[data-testid="work-bet-page"] header').first();
		await expect(header).toBeVisible();

		const chipInHeader = header.locator(STATUS_CHIP).first();
		await expect(chipInHeader).toBeVisible();
		await expect(chipInHeader).toHaveAttribute("data-status", "healthy");
		await expect(chipInHeader).toContainText("Active");

		await chipInHeader.screenshot({
			path: `${PROOF_DIR}/ac1b-betdetail-header-active-chip.png`,
		});
	});

	// ── AC3 (verdict proof): validated bet verdict — Portfolio BetCard ─────────

	test("AC3-portfolio: validated verdict chip on BetCard (portfolio)", async ({ page }) => {
		// Use a completed bet with a validated verdict so BetCard shows the verdict badge
		await page.route(`**/api/bets`, (route) => {
			const url = route.request().url();
			if (route.request().method() === "GET" && !url.includes(`/api/bets/${BET_ID}`)) {
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeCompletedBetsGroupedResponse()),
				});
			}
			return route.continue();
		});
		await page.goto("/work/portfolio");
		await expect(page.locator('[data-testid="work-portfolio-page"]')).toBeVisible();

		// Filter to "Completed" to see the completed bet
		// (portfolio may default to "All" which shows everything — just find the BetCard)
		const betGrid = page.locator('[data-testid="bet-grid"]').first();
		await expect(betGrid).toBeVisible();

		const betCard = betGrid.locator(BET_CARD).first();
		await expect(betCard).toBeVisible();

		// The verdict badge is a named testid on portfolio BetCard
		const verdictBadge = betCard.locator('[data-testid^="bet-card-verdict-badge"]').first();
		await expect(verdictBadge).toBeVisible();

		const verdictChip = verdictBadge.locator(STATUS_CHIP).first();
		await expect(verdictChip).toBeVisible();
		// betOutcomeVerdictToStatus("validated") → "healthy"
		await expect(verdictChip).toHaveAttribute("data-status", "healthy");
		// BET_OUTCOME_VERDICT_LABEL["validated"] = "Validated"
		await expect(verdictChip).toContainText("Validated");

		await verdictBadge.screenshot({
			path: `${PROOF_DIR}/ac3-portfolio-betcard-verdict-validated.png`,
		});
	});

	// ── AC3 (verdict proof): validated bet verdict — Bet detail ────────────────

	test("AC3-betdetail: validated verdict chip on bet detail outcome section", async ({ page }) => {
		// Use a COMPLETED bet — outcome-section only renders for completed/killed bets
		await page.route(`**/api/bets/${BET_ID}`, (route) => {
			if (route.request().method() === "GET") {
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeCompletedBetResponse()),
				});
			}
			return route.continue();
		});
		await page.route(`**/api/bets/${BET_ID}/artifact-thread-summary`, (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ summaries: [], totalCount: 0, truncated: false }),
			}),
		);
		await page.route(`**/api/threads?**`, (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: [], nextCursor: null }),
			}),
		);
		await page.route(`**/api/messages?**`, (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ messages: [], total: 0 }),
			}),
		);
		await page.goto(`/work/bet/${BET_ID}`);
		await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

		// The outcome section is present for completed bets
		const outcomeSection = page.locator('[data-testid="outcome-section"]');
		await expect(outcomeSection).toBeVisible({ timeout: 10000 });

		const verdictBadge = outcomeSection.locator('[data-testid="outcome-verdict-badge"]').first();
		await expect(verdictBadge).toBeVisible();

		const verdictChip = verdictBadge.locator(STATUS_CHIP).first();
		await expect(verdictChip).toBeVisible();
		await expect(verdictChip).toHaveAttribute("data-status", "healthy");
		await expect(verdictChip).toContainText("Validated");

		await verdictBadge.screenshot({
			path: `${PROOF_DIR}/ac3-betdetail-outcome-verdict-validated.png`,
		});
	});

	// ── Cross-surface parity assertion: same data-status on WorkBet vs WorkTask ──

	test("parity: same data-status on WorkBet task row chip and WorkTask header chip", async ({
		page,
	}) => {
		// Capture data-status from WorkBet task row
		await setupBetRoutes(page);
		await page.goto(`/work/bet/${BET_ID}`);
		await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

		const taskRow = page.locator('[data-testid="task-row"]').first();
		await expect(taskRow).toBeVisible();
		// Last STATUS_CHIP in the row = task state chip (not the verdict chip which is absent here)
		const chipInRow = taskRow.locator(STATUS_CHIP).last();
		const rowDataStatus = await chipInRow.getAttribute("data-status");
		const rowTextContent = await chipInRow.textContent();

		// Capture data-status from WorkTask header
		await setupTaskRoutes(page);
		await page.goto(`/work/bet/${BET_ID}/task/${TASK_ID}`);
		await expect(page.locator('[data-testid="task-detail-page"]')).toBeVisible();

		const headerChip = page
			.locator('[data-testid="task-detail-page"] header')
			.first()
			.locator(STATUS_CHIP)
			.first();
		const headerDataStatus = await headerChip.getAttribute("data-status");
		const headerTextContent = await headerChip.textContent();

		// Both must have identical data-status and textContent
		expect(rowDataStatus).toBeTruthy();
		expect(headerDataStatus).toBeTruthy();
		expect(rowDataStatus).toBe(headerDataStatus);
		expect(rowTextContent?.trim()).toBe(headerTextContent?.trim());

		// Screenshot side-by-side context
		await page
			.locator('[data-testid="task-detail-page"] header')
			.first()
			.screenshot({ path: `${PROOF_DIR}/parity-worktask-header-chip.png` });
	});
});
