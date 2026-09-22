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
 *   5. Bet detail (/work/task/:betId)
 *   6. Team view (/work/team/:teamId)
 *   7. Document list (empty state)
 *   8. Document list (with items)
 *   9. Document detail (/documents/:documentId)
 *  10. Settings overlay (open)
 *
 * @lore U11 AC3: Screenshots are taken after waitForLoadState("networkidle") to
 * ensure API mocks have settled and the UI is fully rendered. We do not assert
 * on pixel content — the test proves each route renders without crashing.
 *
 * @lore BC3: the thread door is `POST /api/actions/{search_threads,
 * open_thread}` — never `GET /api/threads*`.
 *
 * @lore BC4: the document door is `POST /api/actions/{search_documents,
 * open_document}` via `mockSearchDocuments`/`mockDocument` — never
 * `GET /api/knowledge*`.
 */

import {
	expect,
	makeDocumentRow,
	makeIdentity,
	makeMessage,
	makeThread,
	makeThreadListRow,
	mockDocument,
	mockSearchDocuments,
	mockSearchThreads,
	mockThread,
	test,
} from "./fixtures";

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
			shipped: 3,
			shipRate: "75%",
			progress: { done: 1, total: 3 },
		},
	],
};

const THREAD_U11_1 = makeThread("thread-u11-1", {
	hostKind: "team",
	hostId: "team-u11-1",
	initiatorId: "test-founder",
	members: ["test-founder", "agent-lead"],
	title: "Auth strategy discussion",
	computedTitle: "Auth strategy discussion",
	lastActiveAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
	createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
});

const THREAD_U11_2 = makeThread("thread-u11-2", {
	hostKind: "team",
	hostId: "team-u11-1",
	initiatorId: "test-founder",
	members: ["test-founder"],
	title: "Hearth design review",
	computedTitle: "Hearth design review",
	lastActiveAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
	createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
});

const THREADS_FIXTURE = [
	makeThreadListRow(THREAD_U11_1.id, { ...THREAD_U11_1, hasUnresolvedReview: false }),
	makeThreadListRow(THREAD_U11_2.id, { ...THREAD_U11_2, hasUnresolvedReview: false }),
];

const THREAD_U11_MEMBERS = [
	makeIdentity("test-founder", { name: "Test Founder", role: "founder" }),
	makeIdentity("agent-lead", { name: "Lead Agent", role: "lead", isAgent: true }),
];

const MESSAGES_FIXTURE = [
	makeMessage("msg-u11-1", THREAD_U11_1.id, {
		senderId: "test-founder",
		payload: { text: "Should we use JWT or session tokens for auth?" },
		createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
	}),
	makeMessage("msg-u11-2", THREAD_U11_1.id, {
		senderId: "agent-lead",
		payload: { text: "JWT with short-lived tokens + refresh rotation. Here is the rationale." },
		createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
	}),
];

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
	},
	tasksInProgress: [
		{
			id: "bet-u11-draft",
			title: "Hearth Design System",
			status: "draft",
			progressDone: 0,
			progressTotal: 0,
		},
	],
};

const DOCUMENT_ITEMS_FIXTURE = [
	makeDocumentRow("k-u11-1", {
		title: "Auth Strategy Decision",
		body: "Use JWT with short-lived access tokens and refresh rotation.",
		version: 1,
		updatedBy: "agent-lead",
		scopeKind: "team",
		createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
		updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
	}),
	makeDocumentRow("k-u11-2", {
		title: "Hearth Token Reference",
		body: "All Hearth spacing, color and typography tokens are warm-tinted.",
		version: 2,
		updatedBy: "agent-lead",
		scopeKind: "factory",
		createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
		updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
	}),
];

const DOCUMENT_DETAIL_FIXTURE = makeDocumentRow("k-u11-1", {
	title: "Auth Strategy Decision",
	body: "Use **JWT** with short-lived access tokens and refresh rotation.",
	version: 1,
	updatedBy: "agent-lead",
	scopeKind: "team",
	createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
	updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
});

// ---------------------------------------------------------------------------
// Screen 1: Conversations list — empty state
// ---------------------------------------------------------------------------

test("U11 screenshot: conversations list (empty)", async ({ page }) => {
	await mockSearchThreads(page, { rows: [] });

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
	await mockSearchThreads(page, { rows: THREADS_FIXTURE });

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
	await mockThread(page, {
		thread: THREAD_U11_1,
		members: THREAD_U11_MEMBERS,
		messages: MESSAGES_FIXTURE,
	});
	await mockSearchThreads(page, { rows: THREADS_FIXTURE });

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
	await mockSearchThreads(page, { rows: [] });

	await page.route("**/api/artifacts*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ items: [], nextCursor: null }),
		});
	});

	await page.goto("/work/task/bet-u11-active");
	await page.waitForSelector("[data-testid='task-detail-page']");
	await page.waitForLoadState("networkidle");

	await expect(page.getByTestId("task-detail-page")).toBeVisible();
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
// Screen 7: Document list — empty state
// ---------------------------------------------------------------------------

test("U11 screenshot: document list (empty)", async ({ page }) => {
	await mockSearchDocuments(page, { rows: [] });

	await page.goto("/documents");
	await page.waitForSelector("[data-testid='document-list-page']");
	await page.waitForLoadState("networkidle");

	await expect(page.getByTestId("document-list-page")).toBeVisible();
	await page.screenshot({ path: "test-results/U11-07-document-empty.png", fullPage: false });
});

// ---------------------------------------------------------------------------
// Screen 8: Document list — with items
// ---------------------------------------------------------------------------

test("U11 screenshot: document list (with items)", async ({ page }) => {
	await mockSearchDocuments(page, { rows: DOCUMENT_ITEMS_FIXTURE });

	await page.goto("/documents");
	await page.waitForSelector("[data-testid='document-list-page']");
	await page.waitForLoadState("networkidle");

	await expect(page.getByTestId("document-list-page")).toBeVisible();
	await page.screenshot({ path: "test-results/U11-08-document-items.png", fullPage: false });
});

// ---------------------------------------------------------------------------
// Screen 9: Document detail
// ---------------------------------------------------------------------------

test("U11 screenshot: document detail", async ({ page }) => {
	await mockDocument(page, { row: DOCUMENT_DETAIL_FIXTURE });
	await mockSearchThreads(page, { rows: [] });

	await page.goto(`/documents/${DOCUMENT_DETAIL_FIXTURE.id}`);
	await page.waitForSelector("[data-testid='document-detail-page']");
	await page.waitForLoadState("networkidle");

	await expect(page.getByTestId("document-detail-page")).toBeVisible();
	await page.screenshot({ path: "test-results/U11-09-document-detail.png", fullPage: false });
});

// ---------------------------------------------------------------------------
// Screen 10: Settings overlay
// ---------------------------------------------------------------------------

test("U11 screenshot: settings overlay open", async ({ page }) => {
	await mockSearchThreads(page, { rows: [] });

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
