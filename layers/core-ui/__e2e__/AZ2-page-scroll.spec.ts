/**
 * AZ2 — every page scrolls to its end.
 *
 * Runtime evidence for AC1–AC4 (a static codebase property — AC5 — is the
 * `design/no-handrolled-page-scaffold` lint rule instead; see round.md §4.3).
 * jsdom does no layout, so a component test can never answer "can the user
 * reach the last element" — only a real browser can. No screenshots, no image
 * comparison, no Docker (repo visual-regression policy).
 *
 * Supported viewports (round.md §1, Fork B — founder-approved all three):
 *   1440×900  — plan.md validation scenario 2 + the audit's primary measurement.
 *   1024×768  — plan.md validation scenario 1 + AC3. The shortest desktop
 *               height in the audit's set — worst case.
 *   375×812   — exercises the OTHER AppShell branch (mobile, ≤768px cut at
 *               useViewportBreakpoint.ts:23), a different DOM chain.
 *
 * @lore AZ2: a sweep that silently covers zero routes reads as passing
 * forever. The very first assertion in this file hard-fails if ROUTES is
 * empty — do not remove it when trimming the route list.
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

const AZ2_VIEWPORTS = [
	{ name: "desktop-1440", width: 1440, height: 900 },
	{ name: "desktop-1024", width: 1024, height: 768 },
	{ name: "mobile-375", width: 375, height: 812 },
] as const;

const DESKTOP_VIEWPORTS = AZ2_VIEWPORTS.filter((v) => v.name !== "mobile-375");

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

// ---------------------------------------------------------------------------
// Shared app-shell mocks (mirrors AG1-team-composition.spec.ts's mockAppShell).
// ---------------------------------------------------------------------------

async function mockAppShell(_page: Page): Promise<void> {
	// hint-progress route removed; no stubs needed
}

// ---------------------------------------------------------------------------
// AC1/AC2/VS1/VS3 — the team page, the live defect. Full detail at every
// viewport: a large roster + many bets + routines guarantees content taller
// than the pane, matching the audit's live measurement (0 containers, 538px /
// 706px clipped before the fix).
// ---------------------------------------------------------------------------

const TEAM_ID = "team-az2";
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
		teamName: "AZ2 Scroll Team",
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

test.describe("AZ2 AC1/AC2/AC3/VS1 — team page reaches its end at every viewport", () => {
	for (const viewport of AZ2_VIEWPORTS) {
		test(`team page: >=1 scroll container, clippedPx===0 at ${viewport.name}`, async ({ page }) => {
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
		test(`AC3/VS1: roster + artifacts reachable at ${viewport.name} — last agent row scrolls into view`, async ({
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

	test("AC4: the team page's scroll region carries data-page-scroll, overflow-y auto, and responds to wheel", async ({
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

// ---------------------------------------------------------------------------
// AC1/AC2/VS2 broader regression net — every other migrated page, one
// desktop viewport. Fixtures are intentionally light (these pages are
// documented in round.md §2.5 as already structurally correct); the job here
// is to catch a REGRESSION the migration might introduce, not to force new
// overflow on pages that never had the defect.
// ---------------------------------------------------------------------------

interface RouteCase {
	name: string;
	url: string;
	readySelector: string;
	setup: (page: Page) => Promise<void>;
}

const ROOT_TASK_ID = "task-az2";
const AGENT_ID = "agent-az2";
const DOCUMENT_ID = "document-az2";
const THREAD_ID = "thread-az2";

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
		// @lore BB1: was two rows, "work-bet" and "work-task" — a bet page and the
		// task page nested under it. They are the same page now, so this is one row.
		name: "work-task",
		url: `/work/task/${ROOT_TASK_ID}`,
		readySelector: "[data-testid='task-detail-page']",
		setup: async (page) => {
			await mockDefaultThreads(page);
		},
	},
	{
		// @lore BC5 T9: `/work/routine/:id` and WorkRoutine are gone — subscriptions
		// replace routines, and they live on AgentProfile now, not their own page.
		name: "agent-profile",
		url: `/agents/${AGENT_ID}`,
		readySelector: "[data-testid='agent-profile-page']",
		setup: async (page) => {
			await mockUser(page, {
				row: makeUserRow(AGENT_ID, {
					kind: "ai",
					name: "AZ2 fixture agent",
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
					title: "AZ2 fixture document",
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
				rows: [makeUserRow("u-az2", { team: { id: "t1", name: "Alpha" } })],
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
			// @lore BC3: no `bet` host kind — a task's own thread is `team`-hosted.
			await mockThread(page, {
				thread: makeThread(THREAD_ID, { hostKind: "team", hostId: ROOT_TASK_ID }),
				messages: [],
			});
		},
	},
];

test.describe("AZ2 AC1/AC2/VS2 — regression net across the remaining migrated pages", () => {
	// The sweep must never silently cover zero routes.
	expect(ROUTES.length).toBeGreaterThan(0);

	for (const route of ROUTES) {
		test(`${route.name}: renders, clippedPx===0 at desktop-1440`, async ({ page }) => {
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
