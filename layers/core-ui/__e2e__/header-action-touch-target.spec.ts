/**
 * A page's primary header/section action button — the one way to start the
 * page's main task ("+ New", "New task", "+ Add agent", "Customize") — stays
 * at the 44px touch floor at every viewport, including desktop. Most buttons
 * intentionally shrink on desktop (a mouse doesn't need a touch target), but
 * these are exempt: they were measured at 32px on desktop, under the
 * product's own touch-target rule.
 */
import {
	expect,
	makeDocumentRow,
	makeTask,
	makeUserRow,
	mockAgents,
	mockSearchDocuments,
	mockSearchSessions,
	mockSearchUsers,
	mockTeamPage,
	test,
} from "./fixtures";

const TEAM_ID = "team-header-touch";
const MIN_TOUCH_PX = 44;

async function heightOf(page: import("@playwright/test").Page, selector: string): Promise<number> {
	const box = await page.locator(selector).first().boundingBox();
	return Math.round(box?.height ?? 0);
}

test.describe("header action buttons stay at the touch floor on desktop", () => {
	test("Team page's '+ New task' and '+ Add agent' buttons are at least 44px tall at 1280px", async ({
		page,
	}) => {
		const roster = [makeUserRow("agent-h", { kind: "ai", name: "Healthy Agent", role: "builder" })];
		await mockSearchUsers(page, { rows: roster });
		await mockTeamPage(page, {
			teamId: TEAM_ID,
			teamName: "Header Touch Team",
			roster,
			tasksInProgress: [
				makeTask("task-header-touch-1", { teamId: TEAM_ID, title: "Task A", state: "in_progress" }),
			],
		});
		await mockAgents(page, { agents: [] });
		await mockSearchSessions(page, { rows: [] });
		await page.route("**/api/artifacts*", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ items: [], nextCursor: null }),
			}),
		);

		await page.setViewportSize({ width: 1280, height: 900 });
		await page.goto(`/work/team/${TEAM_ID}`);
		await expect(page.getByTestId("work-team-page")).toBeVisible();

		expect(await heightOf(page, "[data-testid='new-task-btn']")).toBeGreaterThanOrEqual(
			MIN_TOUCH_PX,
		);
		expect(await heightOf(page, "[data-testid='add-agent-btn']")).toBeGreaterThanOrEqual(
			MIN_TOUCH_PX,
		);
		expect(await heightOf(page, "[data-testid='agent-customize-btn']")).toBeGreaterThanOrEqual(
			MIN_TOUCH_PX,
		);
	});

	test("Portfolio page's 'New task' button is at least 44px tall at 1280px", async ({ page }) => {
		const roster = [
			makeUserRow("agent-a", { kind: "ai", name: "Agent A", team: { id: "p1", name: "Alpha" } }),
			makeUserRow("agent-b", { kind: "ai", name: "Agent B", team: { id: "p2", name: "Beta" } }),
		];
		await mockSearchUsers(page, { rows: roster });

		await page.setViewportSize({ width: 1280, height: 900 });
		await page.goto("/work/portfolio");
		await expect(page.getByTestId("work-overview-page")).toBeVisible();

		expect(await heightOf(page, "button:has-text('New task')")).toBeGreaterThanOrEqual(
			MIN_TOUCH_PX,
		);
	});

	test("Document list's '+ New' button is at least 44px tall at 1280px", async ({ page }) => {
		await mockSearchDocuments(page, {
			rows: [makeDocumentRow("k-header-touch", { title: "Doc" })],
		});

		await page.setViewportSize({ width: 1280, height: 900 });
		await page.goto("/documents");
		await expect(page.getByTestId("document-list-page")).toBeVisible();

		const newButton = page.getByRole("button", { name: "+ New" });
		await expect(newButton).toBeVisible();
		const box = await newButton.boundingBox();
		expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
	});
});
