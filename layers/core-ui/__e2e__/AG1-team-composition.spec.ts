/**
 * AG1 — Team screen desktop composition: Playwright E2E spec.
 *
 * Tests: AC-1 (sections visible, content column ≤960px), AC-2 (label/value pairing),
 * AC-3 (empty team intentional; Status "—"/"No agents"), AC-4(c) (dialogs reachable),
 * AC-5(b) (screenshots captured for visual review).
 *
 * Strategy: hermetic page.route() mocks for the team page's action-door
 * calls — mirror L13 precedent.
 * No DB seeding. The dev server serves the SPA bundle.
 *
 * Screenshots: test-results/AG1-NN-<state>-<width>.png (U11 naming convention).
 * Numbered AG1-01 … AG1-06 sequentially for reviewer scan order:
 *   01 populated 1280px, 02 populated 2000px, 03 populated 2560px
 *   04 empty 1280px,     05 empty 2000px,     06 empty 2560px
 *
 * @lore AG1: page.route() LIFO — register test-specific routes AFTER the auto-use
 * fixture in ./fixtures.ts registers defaults; last-registered wins.
 *
 * @lore AG1: Screenshots are review artifacts, not pixel-diff assertions.
 * A green spec with green lint is the builder's deliverable; the reviewer's
 * "/review" skill closes AC-5's qualitative aesthetic half.
 *
 * @lore BC5 T9: `GET /api/teams/:id` is gone — `useTeam` composes the page
 * from `search_users({teamId})` + `search_tasks({teamId,state})` +
 * `open_task` (`mockTeamPage`). `capacity`/`phase`/`leadAgentId` and the
 * routines section are gone with the columns/table that carried them
 * (D-c7jgxy) — the "Status" tile is "Agent Health" now (still "—"/"No
 * agents" when the roster is empty), and the AC-4 "new-routine-btn" dialog
 * test is deleted with the routines section itself.
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEAM_ID = "team-ag1";
const TEAM_URL = `/work/team/${TEAM_ID}`;

// Viewports to test per AC-1 (1280, 2000, 2560)
const VIEWPORTS = [1280, 2000, 2560] as const;

// Content column max-width ceiling: 960px + 1px tolerance
const MAX_CONTENT_WIDTH = 961;

// ---------------------------------------------------------------------------
// Mock fixtures
// ---------------------------------------------------------------------------

const POPULATED_ROSTER = [
	makeUserRow("agent-h", { kind: "ai", name: "Healthy Agent", role: "builder", agentCategory: "team" }),
	makeUserRow("agent-w", { kind: "ai", name: "Warning Agent", role: "builder", agentCategory: "team" }),
];

const POPULATED_TASKS = [
	makeTask("bet-1", { teamId: TEAM_ID, title: "Auth migration", state: "in_progress" }),
];

// ---------------------------------------------------------------------------
// Shared setup helpers
// ---------------------------------------------------------------------------

async function mockTeamRoute(page: import("@playwright/test").Page, populated: boolean): Promise<void> {
	const roster = populated ? POPULATED_ROSTER : [];

	// Sidebar's own `useTeams()` (unfiltered `search_users({})`) — registered
	// BEFORE mockTeamPage so mockTeamPage's teamId-specific handler (LIFO: the
	// later registration) wins for `{teamId}` calls and falls back to this one
	// for the unfiltered sidebar call.
	await mockSearchUsers(page, { rows: roster });

	await mockTeamPage(page, {
		teamId: TEAM_ID,
		teamName: populated ? "AG1 Core Team" : "Empty Team",
		roster,
		tasksInProgress: populated ? POPULATED_TASKS : [],
	});

	// `useTeamAgents`'s underlying `useAgents()` fetch — unused by the roster
	// row render (that reads `useTeam`'s own rows) but always fires on mount.
	await mockAgents(page, { agents: [] });

	// `useRosterRunState`'s session read — empty means every row renders idle/healthy.
	await mockSearchSessions(page, { rows: [] });

	// Stub artifacts endpoint
	await page.route("**/api/artifacts*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ items: [], nextCursor: null }),
		});
	});
}

// ---------------------------------------------------------------------------
// AC-1 + AC-5(b): Section visibility + content column width + screenshots
// Populated team at 1280 / 2000 / 2560 px
// ---------------------------------------------------------------------------

test.describe("AG1 populated team — section visibility & column width per viewport", () => {
	for (const width of VIEWPORTS) {
		const frameNum = width === 1280 ? "01" : width === 2000 ? "02" : "03";

		test(`(${frameNum}) populated at ${width}px — sections visible, column ≤ ${MAX_CONTENT_WIDTH}px`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: 1100 });
			await mockTeamRoute(page, true);

			await page.goto(TEAM_URL);
			await page.waitForSelector("[data-testid='work-team-page']");
			await page.waitForLoadState("networkidle");

			// AC-1: all main sections visible
			await expect(page.getByTestId("work-team-page")).toBeVisible();
			await expect(page.getByTestId("team-burn-vs-cap")).toBeVisible();
			await expect(page.getByTestId("team-active-tasks")).toBeVisible();
			await expect(page.getByTestId("team-agents")).toBeVisible();

			// AC-1: content column ≤ 961px (cap holds at all desktop widths)
			// @lore AZ2/BC5: PageScaffold(frame="page") wraps BOTH the pinned
			// header AND the scroll body's children in their own PageFrame (a
			// max-w-[1120px] frame, [data-page-frame]) — two on this page, the
			// header's (outside [data-page-scroll]) and the body's (inside it).
			// WorkTeam's own max-w-[960px] content column is the body PageFrame's
			// first child, so the selector must scope inside [data-page-scroll]
			// to land on the right one.
			const innerColumn = page.locator("[data-page-scroll] [data-page-frame] > div").first();
			const box = await innerColumn.boundingBox();
			expect(box).not.toBeNull();
			if (box) {
				expect(box.width).toBeLessThanOrEqual(MAX_CONTENT_WIDTH);
			}

			// AC-5(b): screenshot for visual review
			await page.screenshot({
				path: `test-results/AG1-${frameNum}-populated-${width}.png`,
				fullPage: false,
			});
		});
	}
});

// ---------------------------------------------------------------------------
// AC-1 + AC-3 + AC-5(b): Empty team at 1280 / 2000 / 2560 px
// ---------------------------------------------------------------------------

test.describe("AG1 empty team — intentional composition & column width per viewport", () => {
	for (const width of VIEWPORTS) {
		const frameNum = width === 1280 ? "04" : width === 2000 ? "05" : "06";

		test(`(${frameNum}) empty at ${width}px — both tiles render, Agent Health "—"/"No agents"`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: 1100 });
			await mockTeamRoute(page, false);

			await page.goto(TEAM_URL);
			await page.waitForSelector("[data-testid='work-team-page']");
			await page.waitForLoadState("networkidle");

			// AC-1: visible
			await expect(page.getByTestId("work-team-page")).toBeVisible();
			await expect(page.getByTestId("team-burn-vs-cap")).toBeVisible();
			await expect(page.getByTestId("team-active-tasks")).toBeVisible();
			await expect(page.getByTestId("team-agents")).toBeVisible();

			// AC-1: content column ≤ 961px
			// @lore AZ2/BC5: see the populated-team case above — the content column
			// is [data-page-frame]'s first child, not [data-page-scroll]'s.
			const innerColumn = page.locator("[data-page-scroll] [data-page-frame] > div").first();
			const box = await innerColumn.boundingBox();
			expect(box).not.toBeNull();
			if (box) {
				expect(box.width).toBeLessThanOrEqual(MAX_CONTENT_WIDTH);
			}

			// AC-3: both tiles rendered (Active tasks, Agent Health) — testid="stat-tile"
			const tiles = page.locator("[data-testid='stat-tile']");
			await expect(tiles).toHaveCount(2);

			// AC-3: Agent Health tile value is "—" (NOT "On track"/"Healthy")
			// Find the Agent Health tile by its label span
			const burnSection = page.getByTestId("team-burn-vs-cap");
			const statTiles = burnSection.locator("[data-testid='stat-tile']");
			const count = await statTiles.count();
			let healthTileText = "";
			for (let i = 0; i < count; i++) {
				const tileText = (await statTiles.nth(i).textContent()) ?? "";
				if (tileText.toUpperCase().includes("AGENT HEALTH")) {
					healthTileText = tileText;
					break;
				}
			}
			// Agent Health tile must contain "No agents" and must NOT contain "Healthy"
			expect(healthTileText).toContain("No agents");
			expect(healthTileText).not.toContain("Healthy");

			// AC-3: empty section state present
			await expect(page.getByTestId("team-active-tasks-empty")).toBeVisible();

			// AC-5(b): screenshot
			await page.screenshot({
				path: `test-results/AG1-${frameNum}-empty-${width}.png`,
				fullPage: false,
			});
		});
	}
});

// ---------------------------------------------------------------------------
// AC-2: Label/value pairing — tile label and value within same bounding column
// ---------------------------------------------------------------------------

test("AG1 AC-2 — stat tile label and value are adjacent within tile bounds (not opposite-edge)", async ({
	page,
}) => {
	await page.setViewportSize({ width: 2000, height: 1100 });
	await mockTeamRoute(page, true);

	await page.goto(TEAM_URL);
	await page.waitForSelector("[data-testid='work-team-page']");
	await page.waitForLoadState("networkidle");

	const burnSection = page.getByTestId("team-burn-vs-cap");
	const statTiles = burnSection.locator("[data-testid='stat-tile']");
	const count = await statTiles.count();

	// For each tile, assert label and value are horizontally within the tile box
	for (let i = 0; i < count; i++) {
		const tile = statTiles.nth(i);
		const tileBox = await tile.boundingBox();
		expect(tileBox).not.toBeNull();

		// The value span is the second span inside the tile (label=0, value=1)
		const spans = tile.locator("span");
		const spanCount = await spans.count();
		expect(spanCount).toBeGreaterThanOrEqual(2);

		const valueSpan = spans.nth(1);
		const valueBox = await valueSpan.boundingBox();
		expect(valueBox).not.toBeNull();

		if (tileBox && valueBox) {
			// Value must be horizontally inside the tile (not at the opposite window edge)
			expect(valueBox.x).toBeGreaterThanOrEqual(tileBox.x - 1);
			expect(valueBox.x + valueBox.width).toBeLessThanOrEqual(tileBox.x + tileBox.width + 1);
		}
	}
});

// ---------------------------------------------------------------------------
// AC-4(c): Dialog reachability — "+ Add agent" works
// Tier-2 testid upgraded to Tier-1 by clicking it (AG1 assertion). The
// routines dialog this block also covered is gone with the routines section
// (subscriptions replace routines; they live on AgentProfile, not here).
// ---------------------------------------------------------------------------

test("AG1 AC-4 — clicking add-agent-btn opens add-agent dialog", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await mockTeamRoute(page, true);

	await page.goto(TEAM_URL);
	await page.waitForSelector("[data-testid='work-team-page']");
	await page.waitForLoadState("networkidle");

	// add-agent-btn visible and clickable
	await expect(page.getByTestId("add-agent-btn")).toBeVisible();
	await page.getByTestId("add-agent-btn").click();

	// A dialog must appear after click
	await expect(page.getByRole("dialog")).toBeVisible({ timeout: 3000 });
});

// ---------------------------------------------------------------------------
// AC-4: L13-preserved behaviors — breadcrumb back, 404, team-burn-vs-cap
// (Regression guard — existing L13 coverage; mirrored here to anchor testids
// for the AG1 spec context. L13 itself must also stay green.)
// ---------------------------------------------------------------------------

test("AG1 AC-4 regression — breadcrumb back navigates to /work/portfolio", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await mockTeamRoute(page, true);

	await page.goto(TEAM_URL);
	await page.waitForSelector("[data-testid='work-team-page']");

	await page.getByTestId("team-breadcrumb-back").click();
	await expect(page).toHaveURL(/\/work\/portfolio/, { timeout: 5000 });
});
