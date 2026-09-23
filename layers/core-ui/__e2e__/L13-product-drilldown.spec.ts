/**
 * L13 — Playwright e2e: Team (product) drill-down from Portfolio.
 *
 * Strategy: hermetic page.route() mocks for the team page's action-door calls.
 * No DB seeding required — the dev server serves the SPA bundle.
 *
 * @lore U6: Route renamed from /work/product/:productId to /work/team/:teamId.
 * The "product" concept maps 1:1 to a team in the current model.
 *
 * @lore BC5 T9: `GET /api/teams` and `GET /api/teams/:id` are gone —
 * `useTeams`/`useTeam` compose the portfolio and team pages from
 * `search_users`/`search_tasks`/`open_task` (`mockTeamPage`). A team with no
 * member (`search_users({teamId})` empty) is the "not found" case now — a
 * 404 status code from a REST route has no equivalent, so the (6) test
 * relies on `mockTeamPage` simply never having seeded that team id.
 *
 * Flow covered:
 * 1. Drill-down: Portfolio → click product card → URL becomes /work/team/:id
 *    → team header / roster / active-bets / burn-vs-cap all visible.
 * 2. Empty state: team with zero active bets shows product-active-bets-empty.
 * 3. Roster + bets visible: seeded team has roster rows + bet cards.
 * 4. Breadcrumb: click breadcrumb chip → URL returns to /work/portfolio.
 * 5. Legacy redirect: /work/product/:id → /work/team/:id.
 * 6. Unknown team: /work/team/does-not-exist → product-not-found empty state.
 * 7. No-Kanban: negative assertion — no Kanban region on the Team page.
 */

import {
	expect,
	makeTask,
	makeUserRow,
	mockAgents,
	mockSearchSessions,
	mockSearchUsers,
	mockTeamPage,
	test,
} from "./fixtures";

const PRODUCT_ID = "p1";

const ROSTER = [
	makeUserRow("agent-lead", { kind: "ai", name: "Lead Agent", role: "lead" }),
	makeUserRow("agent-member", { kind: "ai", name: "Alice Agent", role: "member" }),
];

const ACTIVE_TASK = makeTask("b1", {
	teamId: PRODUCT_ID,
	title: "Auth migration",
	state: "in_progress",
});

test.describe("L13 — Product drill-down", () => {
	test.beforeEach(async ({ page }) => {
		await mockSearchUsers(page, { rows: ROSTER });
		await mockAgents(page, { agents: [] });
		await mockSearchSessions(page, { rows: [] });
		// Fallback so an unseeded team (test 6) still resolves search_tasks
		// instead of hitting the network — mockTeamPage's own handler
		// (registered per-test, after this one) wins for a seeded team id.
		await page.route("**/api/actions/search_tasks", async (route) => {
			if (route.request().method() !== "POST") {
				await route.continue();
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: [] }),
			});
		});
	});

	test("(1) drill-down: Navigate to /work/team/:id → team page with all regions", async ({
		page,
	}) => {
		await mockTeamPage(page, {
			teamId: PRODUCT_ID,
			teamName: "HyperIdle Core",
			roster: ROSTER,
			tasksInProgress: [ACTIVE_TASK],
		});

		// @lore U11: product-card click removed in U9 (WorkPortfolio renders BetCards,
		// not team cards). Navigate directly to /work/team/:id to test team detail page.
		await page.goto(`/work/team/${PRODUCT_ID}`);

		// URL should be /work/team/:id
		await expect(page).toHaveURL(/\/work\/team\//, { timeout: 5000 });

		// Team page should be visible
		await page.waitForSelector("[data-testid='work-team-page']");

		// Product header (name) visible
		await expect(page.getByText("HyperIdle Core")).toBeVisible();

		// Roster region visible
		await expect(page.getByTestId("team-agents")).toBeVisible();

		// Active bets region visible
		await expect(page.getByTestId("team-active-tasks")).toBeVisible();

		// Burn vs cap region visible
		await expect(page.getByTestId("team-burn-vs-cap")).toBeVisible();
	});

	test("(2) empty state: team with zero active bets shows team-active-tasks-empty", async ({
		page,
	}) => {
		const emptyProductId = "p-empty";
		await mockTeamPage(page, {
			teamId: emptyProductId,
			teamName: "Empty Product",
			roster: [makeUserRow("agent-empty", { kind: "ai", name: "Solo Agent" })],
			tasksInProgress: [],
		});

		await page.goto(`/work/team/${emptyProductId}`);
		await page.waitForSelector("[data-testid='work-team-page']");

		await expect(page.getByTestId("team-active-tasks-empty")).toBeVisible();
	});

	test("(3) roster + bets visible with seeded data", async ({ page }) => {
		await mockTeamPage(page, {
			teamId: PRODUCT_ID,
			teamName: "HyperIdle Core",
			roster: ROSTER,
			tasksInProgress: [ACTIVE_TASK],
		});

		await page.goto(`/work/team/${PRODUCT_ID}`);
		await page.waitForSelector("[data-testid='work-team-page']");

		// At least one roster row
		const rosterRows = page.getByTestId("agent-row");
		await expect(rosterRows.first()).toBeVisible();

		// At least one bet in the active-tasks region
		const betsRegion = page.getByTestId("team-active-tasks");
		await expect(betsRegion).toBeVisible();
		await expect(betsRegion.getByText("Auth migration")).toBeVisible();
	});

	test("(4) breadcrumb click returns to /work/portfolio", async ({ page }) => {
		await mockTeamPage(page, {
			teamId: PRODUCT_ID,
			teamName: "HyperIdle Core",
			roster: ROSTER,
			tasksInProgress: [ACTIVE_TASK],
		});

		await page.goto(`/work/team/${PRODUCT_ID}`);
		await page.waitForSelector("[data-testid='work-team-page']");

		// Click the breadcrumb chip
		await page.getByTestId("team-breadcrumb-back").click();

		await expect(page).toHaveURL(/\/work\/portfolio/, { timeout: 5000 });
		await expect(page.getByTestId("work-overview-page")).toBeVisible();
	});

	test("(5) legacy /work/product/:id redirects to /work/team/:id", async ({ page }) => {
		await mockTeamPage(page, {
			teamId: PRODUCT_ID,
			teamName: "HyperIdle Core",
			roster: ROSTER,
			tasksInProgress: [ACTIVE_TASK],
		});

		// @lore U6: /work/product/:productId now redirects to /work/team/:productId.
		await page.goto(`/work/product/${PRODUCT_ID}`);

		// Should redirect to /work/team/:id
		await expect(page).toHaveURL(/\/work\/team\//, { timeout: 5000 });
		await expect(page.getByTestId("work-team-page")).toBeVisible();
	});

	test("(6) unknown team /work/team/does-not-exist shows 404 empty state", async ({ page }) => {
		// No mockTeamPage call for "does-not-exist" — search_users({teamId})
		// naturally answers empty (no seeded row carries that team), which is
		// useTeam's own "404" case now (architecture.md §1).
		await page.goto("/work/team/does-not-exist");
		await page.waitForSelector("[data-testid='work-team-page']");

		await expect(page.getByTestId("team-not-found")).toBeVisible();
	});

	test("(7) no Kanban region on the Team page", async ({ page }) => {
		await mockTeamPage(page, {
			teamId: PRODUCT_ID,
			teamName: "HyperIdle Core",
			roster: ROSTER,
			tasksInProgress: [ACTIVE_TASK],
		});

		await page.goto(`/work/team/${PRODUCT_ID}`);
		await page.waitForSelector("[data-testid='work-team-page']");

		// Negative: no Kanban surface (tasks-across-bets view is gone per v3)
		await expect(page.locator("[data-testid='work-team-kanban']")).toHaveCount(0);
		await expect(page.locator("[data-droppable-column]")).toHaveCount(0);
	});
});
