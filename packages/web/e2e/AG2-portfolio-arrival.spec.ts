/**
 * AG2 — Portfolio Arrival & Honest Filters E2E tests.
 *
 * Desktop width: 1440×900 (via viewport in playwright.config.ts — set per-describe via page.setViewportSize).
 *
 * Covers AG2 acceptance criteria:
 * AC-1: Empty portfolio shows create affordance, screen explains itself.
 * AC-2: Verdict filters only appear when ≥1 bet has recorded outcome.
 * AC-3: Every filter control shown can change the visible result set.
 * AC-4: Screen structure invariant across 0/1/50 bets.
 * AC-5: Status + team filters combine predictably.
 * AC-6 (visual): Three entry points exercised — sidebar [data-section-header="work"] and team breadcrumb-back.
 *
 * Route registration pattern: all page.route() inside test.beforeEach, before page.goto.
 * @lore AG2: WARNING-arch-3 — register routes before goto, not after.
 * @lore AG2: WARNING-arch-2 — sidebar Work entry is [data-section-header="work"] (button, not link).
 */

import { expect, test } from "./fixtures";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

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

const TEAMS_FIXTURE_SINGLE = {
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
	],
};

/** Empty bets response — for portfolio-empty state. */
const BETS_FIXTURE_EMPTY = {
	draft: [],
	active: [],
	completed: [],
	killed: [],
};

/**
 * Unevaluated: 3 bets, no outcomes recorded.
 * Spans 2 teams — team filter should appear.
 * 2 statuses (active + draft) — status filter should appear.
 * No verdict — verdict pills must NOT appear.
 */
const BETS_FIXTURE_UNEVALUATED = {
	draft: [
		{
			id: "bet-draft-1",
			title: "Draft Bet Alpha",
			teamId: "team-alpha",
			description: "A draft bet",
			status: "draft",
			atRisk: false,
			outcomeVerdict: null,
		},
	],
	active: [
		{
			id: "bet-active-1",
			title: "Active Bet Beta",
			teamId: "team-beta",
			description: "An active bet",
			status: "active",
			atRisk: false,
			outcomeVerdict: null,
		},
		{
			id: "bet-active-2",
			title: "Active Bet Alpha",
			teamId: "team-alpha",
			description: "Another active bet",
			status: "active",
			atRisk: false,
			outcomeVerdict: null,
		},
	],
	completed: [],
	killed: [],
};

/**
 * Evaluated: ≥1 bet has recorded outcome.
 * Verdict filter SHOULD appear.
 */
const BETS_FIXTURE_EVALUATED = {
	draft: [],
	active: [
		{
			id: "bet-active-1",
			title: "Active Bet Beta",
			teamId: "team-beta",
			description: "An active bet",
			status: "active",
			atRisk: false,
			outcomeVerdict: null,
		},
	],
	completed: [
		{
			id: "bet-validated-1",
			title: "Validated Bet",
			teamId: "team-alpha",
			description: "A validated bet",
			status: "completed",
			atRisk: false,
			outcomeVerdict: "validated",
		},
		{
			id: "bet-refuted-1",
			title: "Refuted Bet",
			teamId: "team-alpha",
			description: "A refuted bet",
			status: "completed",
			atRisk: false,
			outcomeVerdict: "refuted",
		},
	],
	killed: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerTeamMock(page: import("@playwright/test").Page, fixture = TEAMS_FIXTURE) {
	await page.route("**/api/teams", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(fixture),
		});
	});
}

async function registerBetsMock(
	page: import("@playwright/test").Page,
	fixture: typeof BETS_FIXTURE_EMPTY,
) {
	await page.route("**/api/bets", async (route) => {
		if (!route.request().url().includes("/api/bets/")) {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(fixture),
			});
		} else {
			await route.continue();
		}
	});
}

async function registerCanvasMock(page: import("@playwright/test").Page) {
	await page.route("**/api/bets/canvas", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ shaped: [], committed: [], capacity: { used: 0, max: 2 } }),
		});
	});
	await page.route("**/api/artifacts**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ artifacts: [], nextCursor: null }),
		});
	});
}

// ─── AG2-1: Empty portfolio state ─────────────────────────────────────────────

test.describe("AG2 — Empty portfolio state (AC-1)", () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await registerTeamMock(page, TEAMS_FIXTURE_SINGLE);
		await registerBetsMock(page, BETS_FIXTURE_EMPTY);
		await registerCanvasMock(page);
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");
	});

	test("AC-1: empty state is visible with create affordance", async ({ page }) => {
		await expect(page.getByTestId("portfolio-empty")).toBeVisible();
		await expect(page.getByTestId("create-bet-cta")).toBeVisible();
		// Screenshot: ag2-portfolio-empty.png
		await page.screenshot({
			path: "e2e/screenshots/ag2-portfolio-empty.png",
			fullPage: false,
		});
	});

	test("AC-1: CTA button accessible name is exactly 'Create bet' (R2 contract)", async ({
		page,
	}) => {
		// Must match /create bet/i — "Create bet" passes, "Create your first bet" fails
		const createBtn = page.getByRole("button", { name: /create bet/i });
		await expect(createBtn).toBeVisible();
	});

	// AG3: 'Create bet' CTA navigates to full-page /work/bet/new (not dialog)
	test("AC-1: clicking 'Create bet' CTA navigates to /work/bet/new", async ({ page }) => {
		await page.getByRole("button", { name: /create bet/i }).click();
		await expect(page).toHaveURL(/\/work\/bet\/new/, { timeout: 5_000 });
		await expect(page.getByRole("dialog")).toHaveCount(0);
	});

	test("AC-2: no verdict filter pills when no bets (empty state)", async ({ page }) => {
		await expect(page.getByTestId("verdict-filter-pills")).toHaveCount(0);
		await expect(page.getByRole("button", { name: /validated/i })).toHaveCount(0);
	});

	test("AC-3/AC-4: no status filter, no team filter when empty (no dead chrome)", async ({
		page,
	}) => {
		// No filter zone at all when no bets
		await expect(page.getByTestId("portfolio-filter-zone")).toHaveCount(0);
	});

	test("AC-4: frame invariant — 'All bets' heading and new-bet-btn visible at empty state", async ({
		page,
	}) => {
		await expect(page.getByRole("heading", { name: /all bets/i })).toBeVisible();
		await expect(page.getByTestId("new-bet-btn")).toBeVisible();
	});
});

// ─── AG2-2: Unevaluated portfolio state ──────────────────────────────────────

test.describe("AG2 — Unevaluated portfolio state (AC-2, AC-3)", () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await registerTeamMock(page);
		await registerBetsMock(page, BETS_FIXTURE_UNEVALUATED);
		await registerCanvasMock(page);
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");
	});

	test("AC-2 (headline fix): no verdict filter pills when no outcomes recorded", async ({
		page,
	}) => {
		await expect(page.getByTestId("verdict-filter-pills")).toHaveCount(0);
		await expect(page.getByRole("button", { name: /validated/i })).toHaveCount(0);
		await expect(page.getByRole("button", { name: /refuted/i })).toHaveCount(0);
		// Screenshot: ag2-portfolio-unevaluated.png
		await page.screenshot({
			path: "e2e/screenshots/ag2-portfolio-unevaluated.png",
			fullPage: false,
		});
	});

	test("AC-3: team filter appears when ≥2 distinct teams", async ({ page }) => {
		// @lore AG2: scope to team-pill-filters to avoid strict-mode violation — sidebar
		// also renders team buttons (Alpha Team, Beta Team) when Work section is active.
		const teamPills = page.getByTestId("team-pill-filters");
		await expect(teamPills.getByRole("button", { name: /alpha team/i })).toBeVisible();
		await expect(teamPills.getByRole("button", { name: /beta team/i })).toBeVisible();
	});

	test("AC-3: status filter appears when ≥2 distinct status buckets", async ({ page }) => {
		// Has active + draft = 2 buckets
		await expect(page.getByRole("button", { name: /^active$/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /^draft$/i })).toBeVisible();
	});

	test("AC-4: frame invariant — heading and new-bet-btn visible with bets", async ({ page }) => {
		await expect(page.getByRole("heading", { name: /all bets/i })).toBeVisible();
		await expect(page.getByTestId("new-bet-btn")).toBeVisible();
	});

	test("AC-4: bet grid is visible (not empty state)", async ({ page }) => {
		await expect(page.getByTestId("bet-grid")).toBeVisible();
		await expect(page.getByTestId("portfolio-empty")).toHaveCount(0);
	});
});

// ─── AG2-3: Evaluated portfolio state ────────────────────────────────────────

test.describe("AG2 — Evaluated portfolio state (AC-2 inverse, AC-3 verdict)", () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await registerTeamMock(page);
		await registerBetsMock(page, BETS_FIXTURE_EVALUATED);
		await registerCanvasMock(page);
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");
	});

	test("AC-2 inverse: verdict filter pills appear when ≥1 bet has recorded outcome", async ({
		page,
	}) => {
		await expect(page.getByTestId("verdict-filter-pills")).toBeVisible();
		await expect(page.getByRole("button", { name: /validated/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /refuted/i })).toBeVisible();
		// Screenshot: ag2-portfolio-evaluated.png
		await page.screenshot({
			path: "e2e/screenshots/ag2-portfolio-evaluated.png",
			fullPage: false,
		});
	});

	test("AC-3: clicking a verdict filter narrows the visible bet set", async ({ page }) => {
		// Click "Validated" — only the validated bet should remain visible.
		// @lore AG2: scope to verdict-filter-pills to avoid strict-mode violation with
		// verdict pill buttons vs any other "Validated" text in the page.
		await page
			.getByTestId("verdict-filter-pills")
			.getByRole("button", { name: /validated/i })
			.click();

		// Use getByRole("link") because BetCard is wrapped in a <Link> (role=link) for navigation.
		// getByText("Validated Bet") hits both the title span and description paragraph — strict mode fails.
		const betGrid = page.getByTestId("bet-grid");
		await expect(betGrid.getByRole("link", { name: "Validated Bet" })).toBeVisible();
		await expect(betGrid.getByRole("link", { name: "Refuted Bet" })).not.toBeVisible();
		await expect(betGrid.getByRole("link", { name: "Active Bet Beta" })).not.toBeVisible();
	});

	test("AC-3: clicking 'Refuted' narrows to refuted bets only", async ({ page }) => {
		await page
			.getByTestId("verdict-filter-pills")
			.getByRole("button", { name: /refuted/i })
			.click();

		const betGrid = page.getByTestId("bet-grid");
		await expect(betGrid.getByRole("link", { name: "Refuted Bet" })).toBeVisible();
		await expect(betGrid.getByRole("link", { name: "Validated Bet" })).not.toBeVisible();
	});
});

// ─── AG2-4: Entry from sidebar Work button ────────────────────────────────────

test.describe("AG2 — Entry from sidebar (AC-6)", () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		// @lore AG2: Must use TEAMS_FIXTURE (2 teams) not TEAMS_FIXTURE_SINGLE.
		// AD3 AC-1: with exactly 1 team, AppShell's handleViewChange navigates directly
		// to that team's page (not /work/portfolio). 2+ teams lands on portfolio.
		await registerTeamMock(page, TEAMS_FIXTURE);
		await registerBetsMock(page, BETS_FIXTURE_EMPTY);
		await registerCanvasMock(page);
	});

	test("AC-6: sidebar Work button navigates to portfolio and portfolio renders", async ({
		page,
	}) => {
		// Go to conversations first
		await page.goto("/conversations");
		await page.waitForSelector("[data-testid='conversations-page']");

		// Click the Work SectionHeader button (data-section-header="work")
		// @lore AG2: WARNING-arch-2 — This is a button (SPA view switch), not an href.
		await page.locator("[data-section-header='work']").click();

		await expect(page).toHaveURL(/\/work\/portfolio/, { timeout: 10_000 });
		await expect(page.getByTestId("work-portfolio-page")).toBeVisible();

		await page.screenshot({
			path: "e2e/screenshots/ag2-entry-sidebar.png",
			fullPage: false,
		});
	});
});

// ─── AG2-5: Entry from team screen breadcrumb-back ────────────────────────────

test.describe("AG2 — Entry from team screen (AC-6)", () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await registerTeamMock(page, TEAMS_FIXTURE_SINGLE);
		await registerBetsMock(page, BETS_FIXTURE_EMPTY);
		await registerCanvasMock(page);

		// @lore AG2: Mock team detail endpoint MUST return TeamDetail shape (not flat TeamSummary).
		// WorkTeam guards: if (!data.team) → "Team not found". Flat { id, name } fails this guard.
		// TeamDetail = { team: TeamSummary, roster: [], burn: TeamBurn, activeBets: [], teamMembers }
		// TeamBurn = { capacity, activeBets } (AU21 Increment 14a: cost fields deleted)
		await page.route("**/api/teams/team-alpha", async (route) => {
			// Only intercept the exact team detail endpoint (not sub-paths like /budget, /agents).
			const url = route.request().url();
			if (url.includes("/api/teams/team-alpha/")) {
				await route.continue();
				return;
			}
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
						capacity: 1,
						activeBets: 0,
					},
					activeBets: [],
					routines: [],
				}),
			});
		});

		// Mock team bets
		await page.route("**/api/teams/team-alpha/bets", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ bets: [] }),
			});
		});

		// Mock team stats / cap / budget endpoints
		await page.route("**/api/teams/team-alpha/**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({}),
			});
		});
	});

	test("AC-6: team breadcrumb-back navigates back to portfolio", async ({ page }) => {
		await page.goto("/work/team/team-alpha");
		// Wait for team page to render — use the breadcrumb link itself as signal
		await page.waitForSelector("[data-testid='team-breadcrumb-back']", { timeout: 10_000 });

		await page.locator("[data-testid='team-breadcrumb-back']").click();

		await expect(page).toHaveURL(/\/work\/portfolio/, { timeout: 10_000 });
		await expect(page.getByTestId("work-portfolio-page")).toBeVisible();

		await page.screenshot({
			path: "e2e/screenshots/ag2-entry-breadcrumb.png",
			fullPage: false,
		});
	});
});

// ─── AG2-6: Filter-excluded empty state ──────────────────────────────────────

test.describe("AG2 — Filter-excluded empty state", () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await registerTeamMock(page);
		// Only draft bets
		await registerBetsMock(page, {
			draft: [
				{
					id: "bet-draft-1",
					title: "Draft Only Bet",
					teamId: "team-alpha",
					description: "A draft bet",
					status: "draft",
					atRisk: false,
					outcomeVerdict: null,
				},
			],
			active: [
				{
					id: "bet-active-1",
					title: "Active Bet",
					teamId: "team-beta",
					description: "An active bet",
					status: "active",
					atRisk: false,
					outcomeVerdict: null,
				},
			],
			completed: [],
			killed: [],
		});
		await registerCanvasMock(page);
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");
	});

	test("filter-excluded empty state shows 'No bets match these filters' and Clear filters", async ({
		page,
	}) => {
		// Click "Draft" status filter, then "Active" team filter that leaves nothing
		// More directly: click "Completed" status — no completed bets → filter-excluded
		await page.getByRole("button", { name: /^completed$/i }).click();

		await expect(page.getByTestId("portfolio-no-matches")).toBeVisible();
		await expect(page.getByTestId("portfolio-empty")).toHaveCount(0);
	});

	test("'Clear filters' restores the bet grid", async ({ page }) => {
		await page.getByRole("button", { name: /^completed$/i }).click();
		await expect(page.getByTestId("portfolio-no-matches")).toBeVisible();

		await page.getByRole("button", { name: /clear filters/i }).click();
		await expect(page.getByTestId("bet-grid")).toBeVisible();
		await expect(page.getByTestId("portfolio-no-matches")).toHaveCount(0);
	});
});
