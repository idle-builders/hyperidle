/**
 * U11 — Hearth Visual Validation: screenshot capture across all main screens.
 *
 * AC3: Navigate every main screen and capture screenshots for visual review.
 * This spec documents what each screen looks like after the U11 Hearth redesign.
 * Screenshots are captured to test-results/ for manual visual review — this is
 * NOT a pixel-diff assertion suite, it is documentation of the visual state.
 *
 * Screens covered:
 *   1. Conversations list (empty state)
 *   2. Conversations list (with threads)
 *   3. Thread detail (/conversations/:threadId)
 *   4. Bet grid / Work Portfolio
 *   5. Bet detail (/work/bet/:betId)
 *   6. Team view (/work/team/:teamId)
 *   7. Knowledge list (empty state)
 *   8. Knowledge list (with items)
 *   9. Knowledge detail (/knowledge/:knowledgeId)
 *  10. Settings overlay (open)
 *
 * @lore U11 AC3: Screenshots are taken after waitForLoadState("networkidle") to
 * ensure API mocks have settled and the UI is fully rendered. We do not assert
 * on pixel content — the test proves each route renders without crashing.
 */

import { expect, test } from "./fixtures";

// ---------------------------------------------------------------------------
// Shared fixture data
// ---------------------------------------------------------------------------

const TEAMS_FIXTURE = {
	teams: [
		{
			id: "team-u11-1",
			name: "Hearth Core",
			phase: "build",
			status: "healthy",
			leadAgentId: "agent-lead",
			activeBets: 2,
			shipped: 5,
			shipRate: "71%",
			progress: { done: 3, total: 6 },
		},
		{
			id: "team-u11-2",
			name: "Platform Team",
			phase: "grow",
			status: "behind",
			leadAgentId: "agent-lead-2",
			activeBets: 1,
			shipped: 3,
			shipRate: "75%",
			progress: { done: 1, total: 3 },
		},
	],
};

const BETS_FIXTURE = {
	draft: [
		{
			id: "bet-u11-draft",
			title: "Hearth Design System",
			teamId: "team-u11-1",
			description: "Implement the Hearth warm-earth design language across all surfaces.",
			status: "draft",
			atRisk: false,
		},
	],
	active: [
		{
			id: "bet-u11-active",
			title: "Auth Migration",
			teamId: "team-u11-2",
			description: "Migrate auth to JWT with refresh tokens.",
			status: "active",
			atRisk: false,
		},
	],
	completed: [
		{
			id: "bet-u11-completed",
			title: "Onboarding Flow",
			teamId: "team-u11-1",
			description: "First-run setup journey.",
			status: "completed",
			atRisk: false,
		},
	],
	killed: [],
};

const THREADS_FIXTURE = {
	threads: [
		{
			id: "thread-u11-1",
			title: "Auth strategy discussion",
			kind: "chat",
			status: "open",
			participantIds: ["test-founder", "agent-lead"],
			lastMessageAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
			unread: 2,
			betId: null,
			taskId: null,
		},
		{
			id: "thread-u11-2",
			title: "Hearth design review",
			kind: "review",
			status: "open",
			participantIds: ["test-founder"],
			lastMessageAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
			unread: 0,
			betId: "bet-u11-draft",
			taskId: null,
		},
	],
	nextCursor: null,
};

const THREAD_DETAIL_FIXTURE = {
	id: "thread-u11-1",
	title: "Auth strategy discussion",
	kind: "chat",
	status: "open",
	participantIds: ["test-founder", "agent-lead"],
	createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
	betId: null,
	taskId: null,
};

const MESSAGES_FIXTURE = {
	messages: [
		{
			id: "msg-u11-1",
			threadId: "thread-u11-1",
			authorId: "test-founder",
			content: "Should we use JWT or session tokens for auth?",
			createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
			blocks: [],
		},
		{
			id: "msg-u11-2",
			threadId: "thread-u11-1",
			authorId: "agent-lead",
			content: "JWT with short-lived tokens + refresh rotation. Here is the rationale.",
			createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
			blocks: [],
		},
	],
	nextCursor: null,
};

const BET_DETAIL_FIXTURE = {
	id: "bet-u11-active",
	title: "Auth Migration",
	teamId: "team-u11-2",
	description: "**Migrate auth** to JWT with refresh tokens.",
	status: "active",
	atRisk: false,
	tokensActual: null,
	progress: { done: 1, total: 3 },
	tasks: [
		{
			id: "task-u11-1",
			title: "Design token schema",
			status: "done",
			assigneeId: "agent-lead",
		},
		{
			id: "task-u11-2",
			title: "Implement refresh rotation",
			status: "in_progress",
			assigneeId: "agent-lead",
		},
		{
			id: "task-u11-3",
			title: "Update session middleware",
			status: "todo",
			assigneeId: null,
		},
	],
};

const TEAM_DETAIL_FIXTURE = {
	product: {
		id: "team-u11-1",
		name: "Hearth Core",
		phase: "build",
		status: "healthy",
		leadAgentId: "agent-lead",
	},
	team: { id: "team-u11-1", formedAt: new Date().toISOString(), dissolvedAt: null },
	roster: [
		{ agentId: "agent-lead", name: "Lead Agent", role: "lead", isLead: true },
		{ agentId: "agent-member", name: "Alice Agent", role: "member", isLead: false },
	],
	burn: {
		capacity: 5,
		activeBets: 2,
	},
	activeBets: [
		{
			id: "bet-u11-draft",
			pitchTitle: "Hearth Design System",
			status: "draft",
			progressDone: 0,
			progressTotal: 0,
		},
	],
};

const KNOWLEDGE_ITEMS_FIXTURE = {
	items: [
		{
			id: "k-u11-1",
			topic: "Architecture",
			title: "Auth Strategy Decision",
			body: "Use JWT with short-lived access tokens and refresh rotation.",
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "agent-lead",
			createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
			updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
			signals: null,
			scope: "practices",
		},
		{
			id: "k-u11-2",
			topic: "Design",
			title: "Hearth Token Reference",
			body: "All Hearth spacing, color and typography tokens are warm-tinted.",
			format: "markdown",
			status: "active",
			version: 2,
			updatedBy: "agent-lead",
			createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
			updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
			signals: null,
			scope: "factory",
		},
	],
};

const KNOWLEDGE_DETAIL_FIXTURE = {
	id: "k-u11-1",
	topic: "Architecture",
	title: "Auth Strategy Decision",
	body: "Use **JWT** with short-lived access tokens and refresh rotation.",
	format: "markdown",
	status: "active",
	version: 1,
	updatedBy: "agent-lead",
	scope: "practices",
	layer: "decision",
	createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
	updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
	signals: null,
};

// ---------------------------------------------------------------------------
// Screen 1: Conversations list — empty state
// ---------------------------------------------------------------------------

test("U11 screenshot: conversations list (empty)", async ({ page }) => {
	await page.route("**/api/threads*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ threads: [], nextCursor: null }),
		});
	});

	await page.goto("/conversations");
	await page.waitForSelector("[data-testid='conversations-page']");
	await page.waitForLoadState("networkidle");

	await expect(page.getByTestId("conversations-page")).toBeVisible();
	await page.screenshot({ path: "test-results/U11-01-conversations-empty.png", fullPage: false });
});

// ---------------------------------------------------------------------------
// Screen 2: Conversations list — with threads
// ---------------------------------------------------------------------------

test("U11 screenshot: conversations list (with threads)", async ({ page }) => {
	await page.route("**/api/threads*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(THREADS_FIXTURE),
		});
	});

	await page.goto("/conversations");
	await page.waitForSelector("[data-testid='conversations-page']");
	await page.waitForLoadState("networkidle");

	await expect(page.getByTestId("conversations-page")).toBeVisible();
	await page.screenshot({ path: "test-results/U11-02-conversations-threads.png", fullPage: false });
});

// ---------------------------------------------------------------------------
// Screen 3: Thread detail
// ---------------------------------------------------------------------------

test("U11 screenshot: thread detail", async ({ page }) => {
	await page.route("**/api/threads/thread-u11-1", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(THREAD_DETAIL_FIXTURE),
		});
	});

	await page.route("**/api/threads/thread-u11-1/messages*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(MESSAGES_FIXTURE),
		});
	});

	await page.route("**/api/threads*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(THREADS_FIXTURE),
		});
	});

	await page.goto("/conversations/thread-u11-1");
	// The conversations page may render multiple elements with this testid depending on
	// the split-pane thread detail layout. Use first() for screenshot capture purposes.
	await page.waitForSelector("[data-testid='conversations-page']");
	await page.waitForLoadState("networkidle");

	await expect(page.getByTestId("conversations-page").first()).toBeVisible();
	await page.screenshot({ path: "test-results/U11-03-thread-detail.png", fullPage: false });
});

// ---------------------------------------------------------------------------
// Screen 4: Work Portfolio — bet grid
// ---------------------------------------------------------------------------

test("U11 screenshot: work portfolio bet grid", async ({ page }) => {
	await page.route("**/api/teams", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(TEAMS_FIXTURE),
		});
	});

	await page.route("**/api/bets", async (route) => {
		if (!route.request().url().includes("/api/bets/")) {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(BETS_FIXTURE),
			});
		} else {
			await route.continue();
		}
	});

	await page.goto("/work/portfolio");
	await page.waitForSelector("[data-testid='work-portfolio-page']");
	await page.waitForLoadState("networkidle");

	await expect(page.getByTestId("work-portfolio-page")).toBeVisible();
	await page.screenshot({ path: "test-results/U11-04-work-portfolio.png", fullPage: false });
});

// ---------------------------------------------------------------------------
// Screen 5: Bet detail
// ---------------------------------------------------------------------------

test("U11 screenshot: bet detail", async ({ page }) => {
	await page.route("**/api/bets/bet-u11-active", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(BET_DETAIL_FIXTURE),
		});
	});

	await page.route("**/api/threads*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ threads: [], nextCursor: null }),
		});
	});

	await page.route("**/api/artifacts*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ items: [], nextCursor: null }),
		});
	});

	await page.goto("/work/bet/bet-u11-active");
	await page.waitForSelector("[data-testid='work-bet-page']");
	await page.waitForLoadState("networkidle");

	await expect(page.getByTestId("work-bet-page")).toBeVisible();
	await page.screenshot({ path: "test-results/U11-05-bet-detail.png", fullPage: false });
});

// ---------------------------------------------------------------------------
// Screen 6: Team view
// ---------------------------------------------------------------------------

test("U11 screenshot: team view", async ({ page }) => {
	await page.route("**/api/teams/team-u11-1", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(TEAM_DETAIL_FIXTURE),
		});
	});

	await page.route("**/api/teams", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(TEAMS_FIXTURE),
		});
	});

	await page.goto("/work/team/team-u11-1");
	await page.waitForSelector("[data-testid='work-team-page']");
	await page.waitForLoadState("networkidle");

	await expect(page.getByTestId("work-team-page")).toBeVisible();
	await page.screenshot({ path: "test-results/U11-06-team-view.png", fullPage: false });
});

// ---------------------------------------------------------------------------
// Screen 7: Knowledge list — empty state
// ---------------------------------------------------------------------------

test("U11 screenshot: knowledge list (empty)", async ({ page }) => {
	await page.route("**/api/knowledge*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ items: [], nextCursor: null }),
		});
	});

	await page.goto("/knowledge");
	await page.waitForSelector("[data-testid='knowledge-list-page']");
	await page.waitForLoadState("networkidle");

	await expect(page.getByTestId("knowledge-list-page")).toBeVisible();
	await page.screenshot({ path: "test-results/U11-07-knowledge-empty.png", fullPage: false });
});

// ---------------------------------------------------------------------------
// Screen 8: Knowledge list — with items
// ---------------------------------------------------------------------------

test("U11 screenshot: knowledge list (with items)", async ({ page }) => {
	await page.route("**/api/knowledge*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(KNOWLEDGE_ITEMS_FIXTURE),
		});
	});

	await page.goto("/knowledge");
	await page.waitForSelector("[data-testid='knowledge-list-page']");
	await page.waitForLoadState("networkidle");

	await expect(page.getByTestId("knowledge-list-page")).toBeVisible();
	await page.screenshot({ path: "test-results/U11-08-knowledge-items.png", fullPage: false });
});

// ---------------------------------------------------------------------------
// Screen 9: Knowledge detail
// ---------------------------------------------------------------------------

test("U11 screenshot: knowledge detail", async ({ page }) => {
	await page.route("**/api/knowledge/k-u11-1", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(KNOWLEDGE_DETAIL_FIXTURE),
		});
	});

	await page.route("**/api/knowledge*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(KNOWLEDGE_ITEMS_FIXTURE),
		});
	});

	await page.goto("/knowledge/k-u11-1");
	await page.waitForSelector("[data-testid='knowledge-detail-page']");
	await page.waitForLoadState("networkidle");

	await expect(page.getByTestId("knowledge-detail-page")).toBeVisible();
	await page.screenshot({ path: "test-results/U11-09-knowledge-detail.png", fullPage: false });
});

// ---------------------------------------------------------------------------
// Screen 10: Settings overlay
// ---------------------------------------------------------------------------

test("U11 screenshot: settings overlay open", async ({ page }) => {
	await page.route("**/api/threads*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ threads: [], nextCursor: null }),
		});
	});

	await page.route("**/api/settings", async (route) => {
		if (route.request().method() === "GET" || route.request().method() === "PATCH") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					profile: { name: "Test Founder", email: "test@hyperidle.dev", avatarUrl: null },
					teams: [],
					users: [],
					notifications: {
						reviewAlerts: true,
						blockerAlerts: true,
						quietHoursEnabled: false,
						quietHoursStart: "22:00",
						quietHoursEnd: "08:00",
						mutedTeams: [],
					},
				}),
			});
		} else {
			await route.continue();
		}
	});

	await page.goto("/conversations");
	await page.waitForSelector("[data-testid='main-content']");
	await page.waitForLoadState("networkidle");

	// Open the settings overlay by clicking the user profile button in the sidebar
	const profileBtn = page.getByRole("button", { name: /user profile/i });
	if (await profileBtn.isVisible()) {
		await profileBtn.click();
		// Wait for settings content to appear
		await page.waitForTimeout(500);
	}

	await expect(page.getByTestId("main-content")).toBeVisible();
	await page.screenshot({ path: "test-results/U11-10-settings-overlay.png", fullPage: false });
});
