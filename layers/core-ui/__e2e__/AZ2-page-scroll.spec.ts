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

import { expect, type Page, type Route, test } from "./fixtures";

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

async function mockAppShell(page: Page): Promise<void> {
	await page.route("**/api/hint-progress*", async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ dismissed: [] }),
		});
	});
}

// ---------------------------------------------------------------------------
// AC1/AC2/VS1/VS3 — the team page, the live defect. Full detail at every
// viewport: a large roster + many bets + routines guarantees content taller
// than the pane, matching the audit's live measurement (0 containers, 538px /
// 706px clipped before the fix).
// ---------------------------------------------------------------------------

const TEAM_ID = "team-az2";
const TEAM_URL = `/work/team/${TEAM_ID}`;

function makeOverflowingTeam() {
	return {
		team: {
			id: TEAM_ID,
			name: "AZ2 Scroll Team",
			phase: "build",
			status: "healthy",
			leadAgentId: "agent-0",
		},
		teamMembers: { id: TEAM_ID, formedAt: new Date().toISOString(), dissolvedAt: null },
		roster: Array.from({ length: 24 }, (_, i) => ({
			agentId: `agent-${i}`,
			name: `Agent ${i}`,
			role: "builder",
			isLead: i === 0,
			agentCategory: "team",
			operationalStatus: "idle",
			healthLevel: "healthy",
			healthDetail: "Healthy",
			activeTaskTitle: null,
			activeTaskId: null,
			activeBetId: null,
		})),
		burn: { capacity: 20, activeBets: 8 },
		activeBets: Array.from({ length: 8 }, (_, i) => ({
			id: `bet-${i}`,
			descriptionTitle: `Bet number ${i}`,
			status: "active",
			progressDone: i,
			progressTotal: 8,
		})),
		routines: Array.from({ length: 6 }, (_, i) => ({
			id: `routine-${i}`,
			name: `Routine ${i}`,
			state: "active",
			scheduleLabel: "Every day at 8:00 AM",
			agentName: "Agent 0",
			agentInitials: "A0",
			lastRunAt: new Date(Date.now() - 86400000).toISOString(),
			lastRunOutcome: "success",
			nextRunAt: new Date(Date.now() + 86400000).toISOString(),
		})),
	};
}

async function mockTeamRoute(page: Page): Promise<void> {
	await page.route(`**/api/teams/${TEAM_ID}`, async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(makeOverflowingTeam()),
		});
	});
	await page.route("**/api/agents*", async (route: Route) => {
		await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
	});
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
// AC1/AC2 — /artifacts/:id, the second real defect (round.md §2.4). No
// scaffold at all before the fix (shape E) — no root height, no scroll
// region. A large code diff forces content taller than the pane.
// ---------------------------------------------------------------------------

const ARTIFACT_ID = "artifact-az2";
const ARTIFACT_URL = `/artifacts/${ARTIFACT_ID}`;

function makeOverflowingArtifact() {
	return {
		id: ARTIFACT_ID,
		producingTaskId: "task-az2",
		producingTaskTitle: "AZ2 fixture task",
		kind: "code_diff",
		preview: {
			kind: "code_diff",
			file: "layers/core-ui/src/Big.tsx",
			hunks: Array.from({ length: 20 }, (_, h) => ({
				header: `@@ -${h * 10},10 +${h * 10},10 @@`,
				lines: Array.from({ length: 12 }, (_, l) => ({
					kind: "add" as const,
					text: `+ line ${h}-${l} of a very long artifact that must scroll`,
				})),
			})),
		},
		threadCount: 0,
		createdAt: "2026-04-28T12:00:00.000Z",
	};
}

async function mockArtifactAppShell(page: Page): Promise<void> {
	await page.route("**/api/threads?**participant_id=**", async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ threads: [], nextCursor: null }),
		});
	});
	await page.route("**/api/teams**", async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ teams: [] }),
		});
	});
	await page.route("**/api/threads?**host_kind=artifact**", async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ threads: [], nextCursor: null }),
		});
	});
}

test.describe("AZ2 AC1/AC2 — /artifacts/:id reaches its end at every viewport", () => {
	for (const viewport of AZ2_VIEWPORTS) {
		test(`artifact permalink: >=1 scroll container, clippedPx===0 at ${viewport.name}`, async ({
			page,
		}) => {
			await page.setViewportSize({ width: viewport.width, height: viewport.height });
			await mockArtifactAppShell(page);
			await page.route(`**/api/artifacts/${ARTIFACT_ID}`, async (route: Route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeOverflowingArtifact()),
				});
			});
			await page.goto(ARTIFACT_URL);
			await page.waitForSelector("[data-ds-component='ArtifactPreview']");
			await page.waitForLoadState("networkidle");

			const before = await measure(page);
			expect(before.scrollContainers).toBeGreaterThanOrEqual(1);
			expect(before.clippedPx).toBe(0);
		});
	}

	test("AC1: the last line of the artifact diff is reachable by scrolling to the end", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await mockArtifactAppShell(page);
		await page.route(`**/api/artifacts/${ARTIFACT_ID}`, async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeOverflowingArtifact()),
			});
		});
		await page.goto(ARTIFACT_URL);
		await page.waitForSelector("[data-ds-component='ArtifactPreview']");
		await page.waitForLoadState("networkidle");

		await scrollToEndOfContainer(page, "[data-page-scroll]");
		await expect(
			page.getByText("line 19-11 of a very long artifact that must scroll"),
		).toBeInViewport();
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

const BET_ID = "bet-az2";
const TASK_ID = "task-az2";
const ROUTINE_ID = "routine-az2";
const AGENT_ID = "agent-az2";
const KNOWLEDGE_ID = "knowledge-az2";
const THREAD_ID = "thread-az2";

async function mockDefaultThreads(page: Page): Promise<void> {
	await page.route("**/api/threads?**", async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ threads: [], nextCursor: null }),
		});
	});
}

const ROUTES: readonly RouteCase[] = [
	{
		name: "work-overview",
		url: "/work",
		readySelector: "[data-testid^='work-overview-page']",
		setup: async (page) => {
			await page.route("**/api/teams", async (route: Route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						teams: [
							{ id: "t1", name: "Team One", status: "healthy", activeBets: 2 },
							{ id: "t2", name: "Team Two", status: "healthy", activeBets: 1 },
						],
					}),
				});
			});
		},
	},
	{
		name: "work-bet",
		url: `/work/bet/${BET_ID}`,
		readySelector: "[data-testid='work-bet-page']",
		setup: async (page) => {
			await mockDefaultThreads(page);
			await page.route(`**/api/bets/${BET_ID}`, async (route: Route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						id: BET_ID,
						title: "AZ2 fixture bet",
						team: "Alpha",
						teamId: "t1",
						status: "active",
						atRisk: false,
						tokenAppetite: null,
						tokensActual: null,
						progress: { done: 1, total: 3 },
						description: "# Fixture bet",
						tasks: [{ id: TASK_ID, title: "A task", owner: "Dev", state: "in_progress" }],
					}),
				});
			});
		},
	},
	{
		name: "work-task",
		url: `/work/bet/${BET_ID}/task/${TASK_ID}`,
		readySelector: "[data-testid='task-detail-page']",
		setup: async (page) => {
			await mockDefaultThreads(page);
			await page.route(`**/api/bets/${BET_ID}`, async (route: Route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						id: BET_ID,
						title: "AZ2 fixture bet",
						team: "Alpha",
						teamId: "t1",
						status: "active",
						atRisk: false,
						tokenAppetite: null,
						tokensActual: null,
						progress: { done: 1, total: 3 },
						description: "# Fixture bet",
						tasks: [
							{
								id: TASK_ID,
								title: "AZ2 fixture task",
								owner: "Dev Agent",
								state: "in_progress",
								startedAt: "2026-01-01T10:00:00.000Z",
							},
						],
					}),
				});
			});
			await page.route("**/api/sessions*", async (route: Route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ sessions: [] }),
				});
			});
		},
	},
	{
		name: "work-routine",
		url: `/work/routine/${ROUTINE_ID}`,
		readySelector: "[data-testid='work-routine-page']",
		setup: async (page) => {
			await page.route(`**/api/routines/${ROUTINE_ID}`, async (route: Route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						routine: {
							id: ROUTINE_ID,
							name: "AZ2 fixture routine",
							teamName: "Alpha",
							state: "active",
							scheduleLabel: "Daily",
							triggerType: "schedule",
							triggerConfig: JSON.stringify({ cron: "0 8 * * *" }),
							autonomyLevel: 2,
							silent: false,
							lastRunAt: null,
							lastRunOutcome: null,
							nextRunAt: null,
							createdAt: "2026-01-01T00:00:00.000Z",
							agentName: "Agent 0",
						},
						runs: [],
					}),
				});
			});
		},
	},
	{
		name: "agent-profile",
		url: `/agents/${AGENT_ID}`,
		readySelector: "[data-testid='agent-profile-page']",
		setup: async (page) => {
			await page.route(`**/api/agents/${AGENT_ID}/profile`, async (route: Route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						id: AGENT_ID,
						name: "AZ2 fixture agent",
						role: "builder",
						agentCategory: "team",
						teamId: "t1",
						teamName: "Alpha",
						harnessType: null,
						harnessAvailable: true,
						maxConcurrentSessions: 1,
						createdAt: "2026-01-01T00:00:00.000Z",
						systemPrompt: null,
						harnessCapabilities: {
							toolUse: true,
							mcpSupport: false,
							fileEditing: true,
							subAgents: false,
						},
						reviewTrackRecord: {
							totalVerdicts: 0,
							approvalRate: 0,
							windowDays: 30,
							recentVerdicts: [],
						},
					}),
				});
			});
			await page.route("**/api/agents/*/runs*", async (route: Route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ recentSessions: [], activeSession: null }),
				});
			});
		},
	},
	{
		name: "knowledge-list",
		url: "/knowledge",
		readySelector: "[data-testid='knowledge-list-page']",
		setup: async (page) => {
			await page.route("**/api/knowledge", async (route: Route) => {
				if (route.request().method() !== "GET") return route.continue();
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ items: [] }),
				});
			});
		},
	},
	{
		name: "knowledge-detail",
		url: `/knowledge/${KNOWLEDGE_ID}`,
		readySelector: "[data-testid='knowledge-detail-page']",
		setup: async (page) => {
			await mockDefaultThreads(page);
			await page.route(`**/api/knowledge/${KNOWLEDGE_ID}`, async (route: Route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						id: KNOWLEDGE_ID,
						title: "AZ2 fixture knowledge item",
						status: "active",
						confidence: 0.8,
						originAgent: "Agent 0",
						timestamp: "2026-01-01T00:00:00.000Z",
						body: "Fixture content.",
						scopeName: null,
						topic: null,
					}),
				});
			});
		},
	},
	{
		name: "knowledge-create",
		url: "/knowledge/new",
		readySelector: "[data-testid='knowledge-create-page']",
		setup: async () => undefined,
	},
	{
		name: "work-bet-create",
		url: "/work/bet/new",
		readySelector: "[data-testid='bet-create-page']",
		setup: async (page) => {
			await page.route("**/api/teams", async (route: Route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						teams: [{ id: "t1", name: "Alpha", phase: "build", active: true }],
					}),
				});
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
			await page.route(`**/api/threads/${THREAD_ID}`, async (route: Route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						thread: { id: THREAD_ID, hostKind: "bet", hostId: BET_ID },
						messages: [],
						headMessageId: null,
						identities: {},
					}),
				});
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
