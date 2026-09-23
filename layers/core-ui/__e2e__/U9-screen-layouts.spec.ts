/**
 * U9 E2E tests — Screen Layouts: Conversations, Work, Knowledge.
 *
 * Covers AC-1, AC-2, AC-3, AC-6, AC-11:
 * - AC-1: Conversations filter bar shows "New Thread" button
 * - AC-2: Work/Portfolio renders bet grid (not team card grid / Canvas)
 * - AC-3: Team pill filters work on Work/Portfolio
 * - AC-6: Knowledge scope pills appear above Triage/Curated tabs
 * - AC-11: E2E tests prove layout after implementation
 *
 * @lore U9: These tests mock API endpoints to avoid needing a live backend.
 * The fixtures fixture auto-mocks the core APIs. We layer additional mocks
 * for /api/bets and /api/teams.
 */
import { expect, makeDocumentRow, makeUserRow, mockSearchThreads, mockSearchUsers, test } from "./fixtures";

const TEAM_ROSTER_U9 = [
	makeUserRow("agent-1", { kind: "ai", team: { id: "team-alpha", name: "Alpha Team" } }),
	makeUserRow("agent-2", { kind: "ai", team: { id: "team-beta", name: "Beta Team" } }),
];

const DOCUMENT_ROWS = [
	makeDocumentRow("k1", {
		title: "Auth Strategy Decision",
		body: "body content",
		updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
	}),
];

// ---------------------------------------------------------------------------
// AC-1: Conversations page Hearth styling
// ---------------------------------------------------------------------------

test.describe("U9 AC-1: Conversations page — New Thread button + filter pills", () => {
	test.beforeEach(async ({ page }) => {
		await mockSearchThreads(page, { rows: [] });
		await page.goto("/conversations");
		await page.waitForSelector("[data-testid='conversations-page']");
	});

	test("filter bar is visible", async ({ page }) => {
		await expect(page.getByTestId("conversations-filter-bar")).toBeVisible();
	});

	test('"New Thread" button is visible in the filter bar', async ({ page }) => {
		// AC-1: "New Thread" button should be in the filter bar
		await expect(page.getByRole("button", { name: /new thread/i })).toBeVisible();
	});

	test("active filter pill (All) uses btn-primary class", async ({ page }) => {
		const allTab = page.getByRole("tab", { name: /^all$/i });
		await expect(allTab).toBeVisible();
		const className = await allTab.getAttribute("class");
		expect(className).toContain("btn-primary");
		expect(className).not.toContain("btn-neutral");
	});

	test("filter pills still work after New Thread button added", async ({ page }) => {
		// Verify existing filter functionality is unbroken
		await page.getByRole("tab", { name: /^blocking$/i }).click();
		await expect(page.getByRole("tab", { name: /^blocking$/i })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});
});

// ---------------------------------------------------------------------------
// AC-2 + AC-3: Work Portfolio — bet grid + team pill filters
// ---------------------------------------------------------------------------

test.describe("U9 AC-2 + AC-3: Work Portfolio — bet grid + team pills", () => {
	test.beforeEach(async ({ page }) => {
		await mockSearchUsers(page, { rows: TEAM_ROSTER_U9 });

		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-overview-page']");
	});

	test('"All bets" heading is visible (not "Portfolio Canvas")', async ({ page }) => {
		await expect(page.getByText(/all bets/i)).toBeVisible();
		await expect(page.getByText(/portfolio canvas/i)).not.toBeVisible();
	});

	test("bet grid is visible (data-testid=bet-grid)", async ({ page }) => {
		await expect(page.getByTestId("bet-grid")).toBeVisible();
	});

	test("bet cards appear in the grid", async ({ page }) => {
		// Both bets from fixture should be visible
		await expect(page.getByText("Draft Bet Alpha")).toBeVisible();
		await expect(page.getByText("Active Bet Beta")).toBeVisible();
	});

	test("old team card grid is gone (no data-testid=team-card)", async ({ page }) => {
		// Canvas team cards should no longer exist
		await expect(page.getByTestId("team-card")).toHaveCount(0);
	});

	test('"New bet" button is visible and uses btn-primary', async ({ page }) => {
		const newBetBtn = page.getByRole("button", { name: /new bet/i });
		await expect(newBetBtn).toBeVisible();
		const className = await newBetBtn.getAttribute("class");
		expect(className).toContain("btn-primary");
	});

	test("team pill filters are visible (All Teams + 2 team pills)", async ({ page }) => {
		await expect(page.getByRole("button", { name: /all teams/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /alpha team/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /beta team/i })).toBeVisible();
	});

	test("clicking a team pill filters bets by that team", async ({ page }) => {
		// Initially both bets visible
		await expect(page.getByText("Draft Bet Alpha")).toBeVisible();
		await expect(page.getByText("Active Bet Beta")).toBeVisible();

		// Click Alpha Team pill
		await page.getByRole("button", { name: /alpha team/i }).click();

		// Only Alpha Team's bet (Draft Bet Alpha) should be visible
		await expect(page.getByText("Draft Bet Alpha")).toBeVisible();
		await expect(page.getByText("Active Bet Beta")).not.toBeVisible();
	});

	test("clicking All Teams pill restores all bets", async ({ page }) => {
		// Filter to Alpha Team
		await page.getByRole("button", { name: /alpha team/i }).click();
		await expect(page.getByText("Active Bet Beta")).not.toBeVisible();

		// Click All Teams to restore
		await page.getByRole("button", { name: /all teams/i }).click();
		await expect(page.getByText("Active Bet Beta")).toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// AC-6: Knowledge scope pills
// ---------------------------------------------------------------------------

test.describe("U9 AC-6: Knowledge scope pills", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/actions/search_documents", async (route) => {
			if (route.request().method() !== "POST") {
				await route.continue();
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: DOCUMENT_ROWS }),
			});
		});

		await page.goto("/documents");
		await page.waitForSelector("[data-testid='document-list-page']");
	});

	test("scope pills bar is visible above the tabs", async ({ page }) => {
		await expect(page.getByTestId("document-scope-pills")).toBeVisible();
	});

	test('scope pills include "All", "Shared", "Team", "Private"', async ({ page }) => {
		// @lore AE1: Pills were renamed from old category names (Practices/Products/Factory)
		// to simplified labels (Shared/Team/Private) in AD6.
		const scopePills = page.getByTestId("document-scope-pills");
		await expect(scopePills.getByTestId("scope-pill-all")).toBeVisible();
		await expect(scopePills.getByTestId("scope-pill-shared")).toBeVisible();
		await expect(scopePills.getByTestId("scope-pill-team")).toBeVisible();
		await expect(scopePills.getByTestId("scope-pill-private")).toBeVisible();
	});

	test('"All" scope pill is active by default (btn-primary)', async ({ page }) => {
		const allPill = page.getByTestId("scope-pill-all");
		const className = await allPill.getAttribute("class");
		expect(className).toContain("btn-primary");
	});

	test("Triage/Curated tabs use btn-primary for active (not btn-neutral)", async ({ page }) => {
		const tabs = page.getByTestId("document-tabs");
		const activeTab = tabs.locator("[aria-selected='true']");
		await expect(activeTab).toBeVisible();
		const className = await activeTab.getAttribute("class");
		expect(className).toContain("btn-primary");
		expect(className).not.toContain("btn-neutral");
	});
});
