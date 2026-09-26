/**
 * Real-browser checks: the team page's content column stays under its
 * 960px cap at every desktop width, a stat tile's label and value paint
 * inside the tile's own bounds, and "+ Add agent" opens its dialog.
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

const TEAM_ID = "team-layout-test";
const TEAM_URL = `/work/team/${TEAM_ID}`;

const VIEWPORTS = [1280, 2000, 2560] as const;

// Content column max-width ceiling: 960px + 1px tolerance
const MAX_CONTENT_WIDTH = 961;

const POPULATED_ROSTER = [
	makeUserRow("agent-h", {
		kind: "ai",
		name: "Healthy Agent",
		role: "builder",
		agentCategory: "team",
	}),
	makeUserRow("agent-w", {
		kind: "ai",
		name: "Warning Agent",
		role: "builder",
		agentCategory: "team",
	}),
];

const POPULATED_TASKS = [
	makeTask("task-layout-1", { teamId: TEAM_ID, title: "Auth migration", state: "in_progress" }),
];

async function mockTeamRoute(
	page: import("@playwright/test").Page,
	populated: boolean,
): Promise<void> {
	const roster = populated ? POPULATED_ROSTER : [];

	// Sidebar's own `useTeams()` (unfiltered `search_users({})`) — registered
	// BEFORE mockTeamPage so mockTeamPage's teamId-specific handler (LIFO: the
	// later registration) wins for `{teamId}` calls and falls back to this one
	// for the unfiltered sidebar call.
	await mockSearchUsers(page, { rows: roster });

	await mockTeamPage(page, {
		teamId: TEAM_ID,
		teamName: populated ? "Layout Test Team" : "Empty Team",
		roster,
		tasksInProgress: populated ? POPULATED_TASKS : [],
	});

	await mockAgents(page, { agents: [] });
	await mockSearchSessions(page, { rows: [] });

	await page.route("**/api/artifacts*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ items: [], nextCursor: null }),
		});
	});
}

test.describe("team page content column stays capped at every desktop width", () => {
	for (const width of VIEWPORTS) {
		test(`populated team at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 1100 });
			await mockTeamRoute(page, true);

			await page.goto(TEAM_URL);
			await page.waitForSelector("[data-testid='work-team-page']");
			await page.waitForLoadState("networkidle");

			await expect(page.getByTestId("team-burn-vs-cap")).toBeVisible();
			await expect(page.getByTestId("team-active-tasks")).toBeVisible();
			await expect(page.getByTestId("team-agents")).toBeVisible();

			// @lore PageScaffold(frame="page") wraps both the pinned header and
			// the scroll body's children in their own PageFrame — two on this
			// page, so the selector scopes inside [data-page-scroll] to land on
			// the body's column, not the header's.
			const innerColumn = page.locator("[data-page-scroll] [data-page-frame] > div").first();
			const box = await innerColumn.boundingBox();
			expect(box).not.toBeNull();
			if (box) {
				expect(box.width).toBeLessThanOrEqual(MAX_CONTENT_WIDTH);
			}
		});

		test(`empty team at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 1100 });
			await mockTeamRoute(page, false);

			await page.goto(TEAM_URL);
			await page.waitForSelector("[data-testid='work-team-page']");
			await page.waitForLoadState("networkidle");

			await expect(page.getByTestId("team-burn-vs-cap")).toBeVisible();
			await expect(page.getByTestId("team-active-tasks")).toBeVisible();
			await expect(page.getByTestId("team-agents")).toBeVisible();

			const innerColumn = page.locator("[data-page-scroll] [data-page-frame] > div").first();
			const box = await innerColumn.boundingBox();
			expect(box).not.toBeNull();
			if (box) {
				expect(box.width).toBeLessThanOrEqual(MAX_CONTENT_WIDTH);
			}

			const tiles = page.locator("[data-testid='stat-tile']");
			await expect(tiles).toHaveCount(2);

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
			expect(healthTileText).toContain("No agents");
			expect(healthTileText).not.toContain("Healthy");

			await expect(page.getByTestId("team-active-tasks-empty")).toBeVisible();
		});
	}
});

test("a stat tile's label and value paint within the tile's own bounds", async ({ page }) => {
	await page.setViewportSize({ width: 2000, height: 1100 });
	await mockTeamRoute(page, true);

	await page.goto(TEAM_URL);
	await page.waitForSelector("[data-testid='work-team-page']");
	await page.waitForLoadState("networkidle");

	const burnSection = page.getByTestId("team-burn-vs-cap");
	const statTiles = burnSection.locator("[data-testid='stat-tile']");
	const count = await statTiles.count();
	expect(count).toBeGreaterThan(0);

	for (let i = 0; i < count; i++) {
		const tile = statTiles.nth(i);
		const tileBox = await tile.boundingBox();
		expect(tileBox).not.toBeNull();

		const spans = tile.locator("span");
		const spanCount = await spans.count();
		expect(spanCount).toBeGreaterThanOrEqual(2);

		const valueSpan = spans.nth(1);
		const valueBox = await valueSpan.boundingBox();
		expect(valueBox).not.toBeNull();

		if (tileBox && valueBox) {
			expect(valueBox.x).toBeGreaterThanOrEqual(tileBox.x - 1);
			expect(valueBox.x + valueBox.width).toBeLessThanOrEqual(tileBox.x + tileBox.width + 1);
		}
	}
});

test("clicking + Add agent opens the add-agent dialog", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await mockTeamRoute(page, true);

	await page.goto(TEAM_URL);
	await page.waitForSelector("[data-testid='work-team-page']");
	await page.waitForLoadState("networkidle");

	await expect(page.getByTestId("add-agent-btn")).toBeVisible();
	await page.getByTestId("add-agent-btn").click();

	await expect(page.getByRole("dialog")).toBeVisible({ timeout: 3000 });
});
