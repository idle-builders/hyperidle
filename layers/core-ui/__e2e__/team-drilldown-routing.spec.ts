/**
 * Journey: navigating to a team page, its legacy URL, and its breadcrumb
 * back to the portfolio — real router concerns (URL changes, redirects,
 * history) that WorkTeam.test.tsx's component-level rendering checks don't
 * cover.
 *
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

// Two teams so the portfolio's 1-team short-circuit doesn't redirect straight
// back into /work/team/:id when the breadcrumb navigates there.
const ROSTER = [
	makeUserRow("agent-lead", {
		kind: "ai",
		name: "Lead Agent",
		role: "lead",
		team: { id: PRODUCT_ID, name: "HyperIdle Core" },
	}),
	makeUserRow("agent-other", {
		kind: "ai",
		name: "Other Agent",
		team: { id: "p2", name: "Other Team" },
	}),
];

const ACTIVE_TASK = makeTask("b1", {
	teamId: PRODUCT_ID,
	title: "Auth migration",
	state: "in_progress",
});

test.describe("Team drill-down routing", () => {
	test.beforeEach(async ({ page }) => {
		await mockSearchUsers(page, { rows: ROSTER });
		await mockAgents(page, { agents: [] });
		await mockSearchSessions(page, { rows: [] });
		await mockTeamPage(page, {
			teamId: PRODUCT_ID,
			teamName: "HyperIdle Core",
			roster: ROSTER,
			tasksInProgress: [ACTIVE_TASK],
		});
	});

	test("navigating to /work/team/:id renders the team page", async ({ page }) => {
		await page.goto(`/work/team/${PRODUCT_ID}`);
		await expect(page).toHaveURL(/\/work\/team\//, { timeout: 5000 });
		await page.waitForSelector("[data-testid='work-team-page']");
	});

	test("legacy /work/product/:id redirects to /work/team/:id", async ({ page }) => {
		await page.goto(`/work/product/${PRODUCT_ID}`);
		await expect(page).toHaveURL(/\/work\/team\//, { timeout: 5000 });
		await expect(page.getByTestId("work-team-page")).toBeVisible();
	});

	test("breadcrumb click returns to /work/portfolio", async ({ page }) => {
		await page.goto(`/work/team/${PRODUCT_ID}`);
		await page.waitForSelector("[data-testid='work-team-page']");

		await page.getByTestId("team-breadcrumb-back").click();

		await expect(page).toHaveURL(/\/work$/, { timeout: 5000 });
		await expect(page.getByTestId("work-overview-page")).toBeVisible();
	});
});
