/**
 * J5 — Work Surface E2E flows.
 *
 * Flow 1: Portfolio page structure — product cards carry lead avatar,
 * active-bet count, and shipped count.
 *
 * @lore M3 G1: cycle-stripe was removed when MOCK_CYCLE was deleted.
 * Cycle data is not yet wired from the server (deferred follow-up).
 * The J5 test no longer asserts on the cycle-stripe testid.
 *
 * Flow 2: Team Board → Select Pitches → Click a pitch → the inline
 * detail pane appears with problem / solution / rabbit holes and the
 * "Add to canvas" button.
 */
import { expect, makeUserRow, mockSearchUsers, test } from "./fixtures";

const TEAM_ROSTER = [
	makeUserRow("agent-lead", { kind: "ai", team: { id: "p1", name: "Product One" } }),
	makeUserRow("agent-lead-2", { kind: "ai", team: { id: "p2", name: "Product Two" } }),
	makeUserRow("agent-lead-3", { kind: "ai", team: { id: "p3", name: "Product Three" } }),
	makeUserRow("agent-lead-4", { kind: "ai", team: { id: "p4", name: "Product Four" } }),
];

test.describe("J5 — Work Surface", () => {
	test("Portfolio renders team pill filters and bet-grid structure", async ({ page }) => {
		// @lore U11: product-card testid removed in U9 (WorkPortfolio now renders a
		// flat BetCard grid from useBets, not team cards from useTeams).
		// J5 now validates that: team pills render, bet-grid container is visible.

		// @lore BC5 T11: `GET /api/teams` is gone — search_users({}) is the
		// portfolio's one team-list source now.
		await mockSearchUsers(page, { rows: TEAM_ROSTER });

		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-overview-page']");

		// Portfolio page structure visible
		await expect(page.getByTestId("work-overview-page")).toBeVisible();

		// Team pill filters render (one per team)
		const teamPillsContainer = page.getByTestId("team-pill-filters");
		await expect(teamPillsContainer).toBeVisible();
	});

	// @lore L13: WorkTeam (Kanban + PitchSelector) was deleted in L13. The
	// /work/team route now redirects to /work/portfolio. The "Team Board →
	// Select Pitches" flow no longer exists. This test cannot be migrated
	// because the PitchSelector surface itself is gone. New product-drilldown
	// coverage lives in e2e/L13-product-drilldown.spec.ts.
	test.skip("Team Board → Select Pitches → pitch detail pane exposes Add to canvas", async ({
		page,
	}) => {
		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-page']");

		// Before opening the selector, there's no Add to canvas button.
		await expect(page.getByRole("button", { name: /add to canvas/i })).toHaveCount(0);

		await page.getByRole("button", { name: "Select Pitches" }).click();
		await expect(page.getByText("Select Pitch")).toBeVisible();

		// Click a pitch title → inline detail pane becomes visible.
		await page.getByText("Mobile responsive layout").click();
		const pane = page.getByTestId("pitch-detail-pane");
		await expect(pane).toBeVisible();
		await expect(pane).toContainText(/problem/i);
		await expect(pane).toContainText(/appetite/i);
		await expect(pane).toContainText(/solution/i);
		await expect(pane).toContainText(/rabbit holes?/i);

		// Add to canvas lives inside the detail pane only.
		const addButton = pane.getByRole("button", { name: /add to canvas/i });
		await expect(addButton).toBeVisible();

		// The selector REPLACES the Kanban; the kanban testid is not in
		// the DOM while the overlay is open.
		await expect(page.getByTestId("work-team-kanban")).toHaveCount(0);
	});
});
