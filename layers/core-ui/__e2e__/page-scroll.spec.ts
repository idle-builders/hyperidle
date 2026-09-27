/**
 * Real-browser checks: every page scrolls to its end and clips nothing —
 * jsdom does no layout, so a component test can never answer "can the user
 * reach the last element", only a real browser can.
 *
 * Viewports: 1440x900 and 1024x768 (the shortest common desktop height —
 * worst case), and 375x812 (the mobile AppShell branch, a different DOM
 * chain at the <=768px cut).
 *
 * @lore a sweep over zero routes reads as passing forever — the first assertion hard-fails if ROUTES is empty; keep it when trimming the list.
 */

import {
	expect,
	makeDocumentRow,
	makeTask,
	makeThread,
	makeUserRow,
	mockAgents,
	mockDocument,
	mockSearchDocuments,
	mockSearchSessions,
	mockSearchThreads,
	mockSearchUsers,
	mockTeamPage,
	mockThread,
	mockUser,
	type Page,
	type Route,
	test,
} from "./fixtures";

// ---------------------------------------------------------------------------
// The viewport set — named once, here, so it stops being folklore (round.md §1).
// ---------------------------------------------------------------------------

const SCROLL_VIEWPORTS = [
	{ name: "desktop-1440", width: 1440, height: 900 },
	{ name: "desktop-1024", width: 1024, height: 768 },
	{ name: "mobile-375", width: 375, height: 812 },
] as const;

const DESKTOP_VIEWPORTS = SCROLL_VIEWPORTS.filter((v) => v.name !== "mobile-375");

// ---------------------------------------------------------------------------
// Measurement — the same two numbers the audit reported (clippedPx, scroll
// container count), computed the same way: walk every element, find scroll
// containers (scrollHeight > clientHeight with a scrolling computed
// overflow-y), and find content clipped by a hidden-overflow ancestor that no
// scrollable ancestor between it and the clipped element can reach.
// ---------------------------------------------------------------------------

interface ScrollMeasurement {
	scrollContainers: number;
	/** The largest single distance any element's bottom edge extends past an
	 * unreachable hidden-overflow ancestor's bottom edge. 0 = nothing clipped. */
	clippedPx: number;
}

/**
 * Runs inside the browser via page.evaluate — must be a self-contained
 * function (no closures over outer-scope variables; Playwright serializes it
 * via toString()).
 */
function measureScroll(): ScrollMeasurement {
	const all = Array.from(document.querySelectorAll<HTMLElement>("body *"));

	function isScrollContainer(el: HTMLElement): boolean {
		const cs = getComputedStyle(el);
		return (
			el.scrollHeight > el.clientHeight + 1 &&
			(cs.overflowY === "auto" || cs.overflowY === "scroll")
		);
	}

	const scrollContainers = all.filter(isScrollContainer);

	let clippedPx = 0;
	for (const el of all) {
		let node = el.parentElement;
		while (node && node !== document.body) {
			const cs = getComputedStyle(node);
			if (cs.overflowY === "hidden") {
				const rect = el.getBoundingClientRect();
				const nodeRect = node.getBoundingClientRect();
				const overflowBottom = rect.bottom - nodeRect.bottom;
				if (overflowBottom > 4) {
					clippedPx = Math.max(clippedPx, overflowBottom);
				}
				break;
			}
			if (isScrollContainer(node)) break;
			node = node.parentElement;
		}
	}

	return { scrollContainers: scrollContainers.length, clippedPx };
}

async function measure(page: Page): Promise<ScrollMeasurement> {
	return page.evaluate(measureScroll);
}

async function scrollToEndOfContainer(page: Page, selector: string): Promise<void> {
	await page.evaluate((sel) => {
		const el = document.querySelector(sel);
		if (el) el.scrollTop = el.scrollHeight;
	}, selector);
}

async function mockAppShell(_page: Page): Promise<void> {
	// No shell-wide stubs needed beyond the fixtures.ts auto-use defaults.
}

// A large roster + many tasks guarantees content taller than the pane at
// every viewport.
const TEAM_ID = "team-scroll-test";
const TEAM_URL = `/work/team/${TEAM_ID}`;

const OVERFLOWING_ROSTER = Array.from({ length: 24 }, (_, i) =>
	makeUserRow(`agent-${i}`, {
		kind: "ai",
		name: `Agent ${i}`,
		role: "builder",
		agentCategory: "team",
	}),
);

const OVERFLOWING_TASKS = Array.from({ length: 8 }, (_, i) =>
	makeTask(`bet-${i}`, { teamId: TEAM_ID, title: `Bet number ${i}`, state: "in_progress" }),
);

async function mockTeamRoute(page: Page): Promise<void> {
	await mockSearchUsers(page, { rows: OVERFLOWING_ROSTER });
	await mockTeamPage(page, {
		teamId: TEAM_ID,
		teamName: "Scroll Test Team",
		roster: OVERFLOWING_ROSTER,
		tasksInProgress: OVERFLOWING_TASKS,
	});
	await mockAgents(page, { agents: [] });
	await mockSearchSessions(page, { rows: [] });
	await page.route("**/api/artifacts*", async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ items: [], nextCursor: null }),
		});
	});
}

test.describe("the team page reaches its end at every viewport", () => {
	for (const viewport of SCROLL_VIEWPORTS) {
		test(`at ${viewport.name}: at least one scroll container, nothing clipped`, async ({
			page,
		}) => {
			await page.setViewportSize({ width: viewport.width, height: viewport.height });
			await mockAppShell(page);
			await mockTeamRoute(page);
			await page.goto(TEAM_URL);
			await page.waitForSelector("[data-testid='work-team-page']");
			await page.waitForLoadState("networkidle");

			const before = await measure(page);
			expect(before.scrollContainers).toBeGreaterThanOrEqual(1);
			expect(before.clippedPx).toBe(0);
		});
	}

	for (const viewport of DESKTOP_VIEWPORTS) {
		test(`at ${viewport.name}: scrolling the region reaches the last agent row`, async ({
			page,
		}) => {
			await page.setViewportSize({ width: viewport.width, height: viewport.height });
			await mockAppShell(page);
			await mockTeamRoute(page);
			await page.goto(TEAM_URL);
			await page.waitForSelector("[data-testid='work-team-page']");
			await page.waitForLoadState("networkidle");

			await scrollToEndOfContainer(page, "[data-page-scroll]");

			const agentRows = page.getByTestId("agent-row");
			const lastAgentRow = agentRows.last();
			await expect(lastAgentRow).toBeInViewport();
		});
	}

	test("the team page's scroll region has overflow-y:auto and responds to the mouse wheel", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await mockAppShell(page);
		await mockTeamRoute(page);
		await page.goto(TEAM_URL);
		await page.waitForSelector("[data-testid='work-team-page']");
		await page.waitForLoadState("networkidle");

		const scroller = page.locator("[data-page-scroll]").first();
		await expect(scroller).toHaveCount(1);
		const overflowY = await scroller.evaluate((el) => getComputedStyle(el).overflowY);
		expect(overflowY).toBe("auto");

		const before = await scroller.evaluate((el) => el.scrollTop);
		await scroller.hover();
		await page.mouse.wheel(0, 600);
		await page.waitForTimeout(100);
		const after = await scroller.evaluate((el) => el.scrollTop);
		expect(after).toBeGreaterThan(before);
	});
});

// A broader regression net, one desktop viewport, across every other page —
// fixtures are intentionally light (these pages are already structurally
// correct); the job here is to catch a regression, not to force new
// overflow on pages that never had the defect.

interface RouteCase {
	name: string;
	url: string;
	readySelector: string;
	setup: (page: Page) => Promise<void>;
}

const ROOT_TASK_ID = "task-scroll-net";
const AGENT_ID = "agent-scroll-net";
const DOCUMENT_ID = "document-scroll-net";
const THREAD_ID = "thread-scroll-net";

async function mockDefaultThreads(page: Page): Promise<void> {
	await mockSearchThreads(page, { rows: [] });
}

const ROUTES: readonly RouteCase[] = [
	{
		name: "work-overview",
		url: "/work",
		readySelector: "[data-testid^='work-overview-page']",
		setup: async (page) => {
			await mockSearchUsers(page, {
				rows: [
					makeUserRow("agent-t1", { kind: "ai", team: { id: "t1", name: "Team One" } }),
					makeUserRow("agent-t2", { kind: "ai", team: { id: "t2", name: "Team Two" } }),
				],
			});
			await page.route("**/api/actions/search_tasks", async (route: Route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ ok: true, data: [] }),
				});
			});
		},
	},
	{
		// @lore The bet page and its nested task page are the same page now, so this is one row.
		name: "work-task",
		url: `/work/task/${ROOT_TASK_ID}`,
		readySelector: "[data-testid='task-detail-page']",
		setup: async (page) => {
			await mockDefaultThreads(page);
		},
	},
	{
		// @lore `/work/routine/:id` and WorkRoutine are gone — subscriptions replace routines, and they live on AgentProfile now, not their own page.
		name: "agent-profile",
		url: `/agents/${AGENT_ID}`,
		readySelector: "[data-testid='agent-profile-page']",
		setup: async (page) => {
			await mockUser(page, {
				row: makeUserRow(AGENT_ID, {
					kind: "ai",
					name: "Scroll-net fixture agent",
					role: "builder",
					agentCategory: "team",
					team: { id: "t1", name: "Alpha" },
				}),
			});
			await mockSearchSessions(page, { rows: [] });
			await page.route("**/api/actions/search_tasks", async (route: Route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ ok: true, data: [] }),
				});
			});
		},
	},
	{
		name: "document-list",
		url: "/documents",
		readySelector: "[data-testid='document-list-page']",
		setup: async (page) => {
			await mockSearchDocuments(page, { rows: [] });
		},
	},
	{
		name: "document-detail",
		url: `/documents/${DOCUMENT_ID}`,
		readySelector: "[data-testid='document-detail-page']",
		setup: async (page) => {
			await mockDefaultThreads(page);
			await mockDocument(page, {
				row: makeDocumentRow(DOCUMENT_ID, {
					title: "Scroll-net fixture document",
					body: "Fixture content.",
				}),
			});
		},
	},
	{
		name: "document-create",
		url: "/documents/new",
		readySelector: "[data-testid='document-create-page']",
		setup: async (page) => {
			await mockSearchDocuments(page, { rows: [] });
		},
	},
	{
		name: "work-task-create",
		url: "/work/task/new",
		readySelector: "[data-testid='task-create-page']",
		setup: async (page) => {
			await mockSearchUsers(page, {
				rows: [makeUserRow("u-scroll-net", { team: { id: "t1", name: "Alpha" } })],
			});
		},
	},
	{
		name: "conversations-list",
		url: "/conversations",
		readySelector: "[data-testid='conversations-page']",
		setup: async () => undefined,
	},
	{
		name: "conversations-thread",
		url: `/conversations/${THREAD_ID}`,
		readySelector: "[data-testid='conversations-page']",
		setup: async (page) => {
			// @lore No `bet` host kind — a task's own thread is `team`-hosted.
			await mockThread(page, {
				thread: makeThread(THREAD_ID, { hostKind: "team", hostId: ROOT_TASK_ID }),
				messages: [],
			});
		},
	},
];

test.describe("scroll regression net across the remaining pages", () => {
	// The sweep must never silently cover zero routes.
	expect(ROUTES.length).toBeGreaterThan(0);

	for (const route of ROUTES) {
		test(`${route.name} renders with nothing clipped at desktop-1440`, async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			await mockAppShell(page);
			await route.setup(page);
			await page.goto(route.url);
			await page.waitForSelector(route.readySelector);
			await page.waitForLoadState("networkidle");

			const result = await measure(page);
			expect(result.clippedPx).toBe(0);
		});
	}
});
