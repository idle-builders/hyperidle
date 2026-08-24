/**
 * AG1 — Team screen desktop composition: Playwright E2E spec.
 *
 * Tests: AC-1 (sections visible, content column ≤960px), AC-2 (label/value pairing),
 * AC-3 (empty team intentional; Status "—"/"No agents"), AC-4(c) (dialogs reachable),
 * AC-5(b) (screenshots captured for visual review).
 *
 * Strategy: hermetic page.route() mocks for /api/teams/:id — mirror L13 precedent.
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
 */

import { expect, test } from "./fixtures";

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

function makePopulatedTeam() {
	return {
		team: {
			id: TEAM_ID,
			name: "AG1 Core Team",
			phase: "build",
			status: "healthy",
			leadAgentId: "agent-h",
		},
		teamMembers: {
			id: TEAM_ID,
			formedAt: new Date().toISOString(),
			dissolvedAt: null,
		},
		roster: [
			{
				agentId: "agent-h",
				name: "Healthy Agent",
				role: "builder",
				isLead: true,
				agentCategory: "team",
				operationalStatus: "active",
				healthLevel: "healthy",
				healthDetail: "Healthy",
				activeTaskTitle: "Implement auth flow",
				activeTaskId: "task-1",
				activeBetId: "bet-1",
			},
			{
				agentId: "agent-w",
				name: "Warning Agent",
				role: "builder",
				isLead: false,
				agentCategory: "team",
				operationalStatus: "idle",
				healthLevel: "warning",
				healthDetail: "2 of 6 sessions failed",
				activeTaskTitle: null,
				activeTaskId: null,
				activeBetId: null,
			},
		],
		burn: {
			capacity: 5,
			activeBets: 2,
		},
		activeBets: [
			{
				id: "bet-1",
				descriptionTitle: "Auth migration",
				status: "active",
				progressDone: 1,
				progressTotal: 2,
			},
		],
		routines: [
			{
				id: "routine-1",
				name: "Daily digest",
				state: "active",
				scheduleLabel: "Every day at 8:00 AM",
				agentName: "Healthy Agent",
				agentInitials: "HA",
				lastRunAt: new Date(Date.now() - 86400000).toISOString(),
				lastRunOutcome: "success",
				nextRunAt: new Date(Date.now() + 86400000).toISOString(),
			},
		],
	};
}

function makeEmptyTeam() {
	return {
		team: {
			id: TEAM_ID,
			name: "Empty Team",
			phase: "build",
			status: "healthy",
			leadAgentId: null,
		},
		teamMembers: {
			id: TEAM_ID,
			formedAt: new Date().toISOString(),
			dissolvedAt: null,
		},
		roster: [],
		burn: {
			capacity: 5,
			activeBets: 0,
		},
		activeBets: [],
		routines: [],
	};
}

// ---------------------------------------------------------------------------
// Shared setup helpers
// ---------------------------------------------------------------------------

async function mockTeamRoute(
	page: import("@playwright/test").Page,
	fixture: ReturnType<typeof makePopulatedTeam> | ReturnType<typeof makeEmptyTeam>,
): Promise<void> {
	await page.route(`**/api/teams/${TEAM_ID}`, async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(fixture),
			});
		} else {
			await route.continue();
		}
	});

	// Stub agent configs endpoint so AgentRow doesn't hit a real server
	await page.route("**/api/agents*", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify([]),
			});
		} else {
			await route.continue();
		}
	});

	// Stub hint-progress endpoint (prevents real API calls from hint hooks)
	await page.route("**/api/hint-progress*", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ dismissed: [] }),
			});
		} else {
			await route.continue();
		}
	});

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
			await mockTeamRoute(page, makePopulatedTeam());

			await page.goto(TEAM_URL);
			await page.waitForSelector("[data-testid='work-team-page']");
			await page.waitForLoadState("networkidle");

			// AC-1: all main sections visible
			await expect(page.getByTestId("work-team-page")).toBeVisible();
			await expect(page.getByTestId("team-burn-vs-cap")).toBeVisible();
			await expect(page.getByTestId("team-active-bets")).toBeVisible();
			await expect(page.getByTestId("team-routines")).toBeVisible();
			await expect(page.getByTestId("team-agents")).toBeVisible();

			// AC-1: content column ≤ 961px (cap holds at all desktop widths)
			// @lore AZ2: work-team-page now sits on PageScaffold's root (consistent
			// across every WorkTeam branch); the scroll body is the scaffold's own
			// [data-page-scroll] element, and the max-w-[960px] content column is
			// its first child.
			const innerColumn = page.locator("[data-page-scroll] > div").first();
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

		test(`(${frameNum}) empty at ${width}px — all 4 tiles render, Status "—"/"No agents"`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: 1100 });
			await mockTeamRoute(page, makeEmptyTeam());

			await page.goto(TEAM_URL);
			await page.waitForSelector("[data-testid='work-team-page']");
			await page.waitForLoadState("networkidle");

			// AC-1: visible
			await expect(page.getByTestId("work-team-page")).toBeVisible();
			await expect(page.getByTestId("team-burn-vs-cap")).toBeVisible();
			await expect(page.getByTestId("team-active-bets")).toBeVisible();
			await expect(page.getByTestId("team-routines")).toBeVisible();
			await expect(page.getByTestId("team-agents")).toBeVisible();

			// AC-1: content column ≤ 961px
			// @lore AZ2: see the populated-team case above — work-team-page is
			// PageScaffold's root now; the content column is [data-page-scroll]'s
			// first child.
			const innerColumn = page.locator("[data-page-scroll] > div").first();
			const box = await innerColumn.boundingBox();
			expect(box).not.toBeNull();
			if (box) {
				expect(box.width).toBeLessThanOrEqual(MAX_CONTENT_WIDTH);
			}

			// AC-3: all 4 tiles rendered — testid="stat-tile"
			const tiles = page.locator("[data-testid='stat-tile']");
			await expect(tiles).toHaveCount(4);

			// AC-3: Status tile value is "—" (NOT "Healthy")
			// Find the Status tile by its label span
			const burnSection = page.getByTestId("team-burn-vs-cap");
			const statTiles = burnSection.locator("[data-testid='stat-tile']");
			const count = await statTiles.count();
			let statusTileText = "";
			for (let i = 0; i < count; i++) {
				const tileText = (await statTiles.nth(i).textContent()) ?? "";
				if (tileText.toUpperCase().includes("STATUS")) {
					statusTileText = tileText;
					break;
				}
			}
			// Status tile must contain "No agents" and must NOT contain "Healthy"
			expect(statusTileText).toContain("No agents");
			expect(statusTileText).not.toContain("Healthy");

			// AC-3: empty section states all present
			await expect(page.getByTestId("team-active-bets-empty")).toBeVisible();
			await expect(page.getByTestId("team-routines-empty")).toBeVisible();

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
	await mockTeamRoute(page, makePopulatedTeam());

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
// AC-4(c): Dialog reachability — "+ New routine" and "+ Add agent" work
// Tier-2 testids upgraded to Tier-1 by clicking them (AG1 assertion)
// ---------------------------------------------------------------------------

test("AG1 AC-4 — clicking new-routine-btn opens routine dialog", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await mockTeamRoute(page, makePopulatedTeam());

	await page.goto(TEAM_URL);
	await page.waitForSelector("[data-testid='work-team-page']");
	await page.waitForLoadState("networkidle");

	// new-routine-btn visible and clickable
	await expect(page.getByTestId("new-routine-btn")).toBeVisible();
	await page.getByTestId("new-routine-btn").click();

	// A dialog must appear after click
	await expect(page.getByRole("dialog")).toBeVisible({ timeout: 3000 });
});

test("AG1 AC-4 — clicking add-agent-btn opens add-agent dialog", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await mockTeamRoute(page, makePopulatedTeam());

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
	await mockTeamRoute(page, makePopulatedTeam());

	await page.route("**/api/bets*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ draft: [], active: [], completed: [], killed: [] }),
		});
	});

	await page.goto(TEAM_URL);
	await page.waitForSelector("[data-testid='work-team-page']");

	await page.getByTestId("team-breadcrumb-back").click();
	await expect(page).toHaveURL(/\/work\/portfolio/, { timeout: 5000 });
});
