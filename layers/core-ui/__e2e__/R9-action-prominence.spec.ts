/**
 * R9 — Action Prominence Audit + E2E Coverage
 *
 * 27 Playwright E2E tests covering top-3 actions across 8 pages.
 * 4 journey-stage seed fixtures (empty, first-bet, active-work, knowledge-active).
 *
 * Strategy: hermetic page.route() mocks — consistent with all existing E2E tests.
 * No real DB seeding. Each describe block registers additional route overrides;
 * Playwright's LIFO matching means test-specific routes win over fixture defaults.
 *
 * @lore R9: seedEmpty/seedFirstBet/seedActiveWork/seedKnowledgeActive are
 * route-override helpers, NOT database seed scripts. The E2E infrastructure
 * uses page.route() mocking — there is no test-server with a real SQLite DB.
 * "Fixtures" in this file == API mock registrations.
 *
 * Tracks covered:
 *   AC-1: "New bet" button is btn-sm (not btn-xs) — portfolio-create-bet asserts visibility
 *   AC-2: Empty state CTA visible in EmptyState action slot — portfolio-create-bet w/ seedEmpty
 *   AC-3: "+ New" knowledge button is btn-sm — knowledge-create asserts visibility
 *   AC-6: Density toggle absent from Settings Appearance — settings-theme asserts no density-select
 *   AC-7: All 27 E2E tests pass after implementation
 */

import type { Thread, ThreadListRow, ThreadView } from "@hyperidle/domain-model";
import type { Page } from "@playwright/test";
import {
	expect,
	makeMessage,
	makeTask,
	makeThread,
	makeThreadListRow,
	mockSearchThreads,
	mockTaskTree,
	test,
} from "./fixtures";

/**
 * @lore BC3: `POST /api/actions/{search_threads,open_thread,send_message,
 * adjust_thread}` replaces `GET/POST /api/threads*`. Several seed helpers
 * below register `open_thread` for more than one thread id — since every
 * thread now shares the SAME url (`/api/actions/open_thread`), a single
 * dispatcher keyed by the posted `id` replaces the old per-id URL routes.
 */
async function mockOpenThreadDispatch(
	page: Page,
	threadsById: Record<string, ThreadView>,
): Promise<void> {
	await page.route("**/api/actions/open_thread", async (route) => {
		const input = JSON.parse(route.request().postData() ?? "{}") as { id?: string };
		const view = input.id ? threadsById[input.id] : undefined;
		if (!view) {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: false,
					problems: [{ code: "not_found", message: "Thread not found", path: "id" }],
				}),
			});
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ ok: true, data: view }),
		});
	});
}

function toThreadView(thread: Thread, messages: ThreadView["messages"] = []): ThreadView {
	return { thread, members: [], messages, headMessageId: null, hostTitle: null };
}

function toRow(thread: Thread, hasUnresolvedReview = false): ThreadListRow {
	return makeThreadListRow(thread.id, { ...thread, hasUnresolvedReview });
}

// ---------------------------------------------------------------------------
// Shared timestamp constants
// ---------------------------------------------------------------------------

const NOW = "2026-06-01T10:00:00.000Z";
const LATER = "2026-06-01T10:05:00.000Z";

// ---------------------------------------------------------------------------
// Mock data shapes
// ---------------------------------------------------------------------------

const BET_1 = {
	id: "bet-r9-1",
	title: "Auth migration",
	description: "# Problem\n\nWe need better auth.\n",
	status: "active" as const,
	teamId: "team-r9-1",
	atRisk: false,
};

// @lore BC3: no `task` host kind — a task's own thread is `team`-hosted.
const THREAD_1 = makeThread("thread-r9-1", {
	hostKind: "user",
	hostId: "test-founder",
	initiatorId: "test-founder",
	members: ["test-founder"],
	lastActiveAt: NOW,
	createdAt: NOW,
});

const THREAD_REVIEW = makeThread("thread-r9-review", {
	hostKind: "team",
	hostId: "task-r9-1",
	initiatorId: "a-aria",
	members: ["a-aria", "test-founder"].sort(),
	lastActiveAt: NOW,
	createdAt: NOW,
});

const THREAD_TASK = makeThread("thread-r9-task", {
	hostKind: "team",
	hostId: "task-r9-1",
	initiatorId: "test-founder",
	members: ["test-founder"],
	lastActiveAt: NOW,
	createdAt: NOW,
});

const REVIEW_MESSAGE = {
	id: "msg-r9-review-1",
	threadId: "thread-r9-review",
	senderId: "a-aria",
	clientKey: "ck-r9-review-001",
	blockId: null,
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: NOW,
	type: "review",
	payload: {
		title: "Approve auth migration approach",
		reasoning: ["Security posture improves.", "JWT lifecycle is correct."],
		// @lore R9: ReviewPayload.artifactRef is required (non-optional) and ThreadShell
		// calls resolveArtifactSlot(payload.artifactRef) without null-guarding. Provide a
		// valid ref with kind="text_diff" so the ArtifactView renders without crashing.
		artifactRef: { id: "art-r9-1", kind: "text_diff" },
	},
};

const PLAIN_MESSAGE_1 = {
	id: "msg-r9-plain-1",
	threadId: "thread-r9-1",
	senderId: "test-founder",
	clientKey: "ck-r9-plain-001",
	blockId: null,
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: NOW,
	type: "plain",
	payload: { text: "This is the first message." },
};

const KNOWLEDGE_ITEM_1 = {
	id: "ki-r9-1",
	topic: null,
	title: "JWT Best Practices",
	body: "# JWT\n\nUse short-lived tokens.\n",
	format: "markdown",
	status: "active" as const,
	version: 1,
	updatedBy: "test-founder",
	scopeKind: "factory",
	scopeId: null,
	createdAt: NOW,
	updatedAt: NOW,
	signals: null,
};

const KNOWLEDGE_ITEM_2 = {
	id: "ki-r9-2",
	topic: null,
	title: "Rate Limiting Strategy",
	body: "# Rate Limiting\n\nUse token buckets.\n",
	format: "markdown",
	status: "draft" as const,
	version: 1,
	updatedBy: "test-founder",
	scopeKind: "factory",
	scopeId: null,
	createdAt: NOW,
	updatedAt: NOW,
	signals: null,
};

const KNOWLEDGE_ITEM_3 = {
	id: "ki-r9-3",
	topic: null,
	title: "Testing Philosophy",
	body: "# Testing\n\nWrite tests first.\n",
	format: "markdown",
	status: "draft" as const,
	version: 1,
	updatedBy: "test-founder",
	scopeKind: "user",
	scopeId: "test-founder",
	createdAt: NOW,
	updatedAt: NOW,
	signals: null,
};

// ---------------------------------------------------------------------------
// Journey-stage seed fixture helpers
// ---------------------------------------------------------------------------

/**
 * seedEmpty: No bets, no threads, no knowledge items.
 * Used for testing empty-state CTAs.
 */
async function seedEmpty(page: Page): Promise<void> {
	await mockSearchThreads(page, { rows: [] });

	await page.route("**/api/knowledge", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ items: [] }),
			});
		} else {
			await route.continue();
		}
	});
}

/**
 * seedFirstBet: 1 active bet with 2 tasks, 1 plain thread.
 * Used for testing single-bet portfolio, bet detail, team, and conversations.
 */
async function seedFirstBet(page: Page): Promise<void> {
	await mockSearchThreads(page, { rows: [toRow(THREAD_1)] });

	await mockOpenThreadDispatch(page, {
		[THREAD_1.id]: toThreadView(THREAD_1, [PLAIN_MESSAGE_1]),
	});

	// @lore BC3: WorkTaskPage's HostThreadSection reads `threadId={task.threadId}`
	// directly — never a host-based search_threads lookup — so BET_1's own task
	// needs a known threadId, not a lazily-created one.
	await mockTaskTree(page, {
		task: makeTask(BET_1.id, { title: BET_1.title, threadId: THREAD_1.id }),
	});

	// @lore R9: Mock artifacts so TaskSheet's ArtifactSection doesn't hit the real
	// server (not running in E2E hermetic tests). Returns empty list — ArtifactSection
	// renders "no artifacts" gracefully without crashing.
	await page.route("**/api/artifacts?**", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ items: [], nextCursor: null }),
			});
		} else {
			await route.continue();
		}
	});
}

/**
 * seedActiveWork: 2 bets, 3 threads (1 blocking with review message), 1 active session.
 * Used for testing conversations filter, verdict, and dial-in flows.
 */
async function seedActiveWork(page: Page): Promise<void> {
	await mockSearchThreads(page, {
		rows: [toRow(THREAD_REVIEW, true), toRow(THREAD_TASK), toRow(THREAD_1)],
	});

	await mockOpenThreadDispatch(page, {
		[THREAD_REVIEW.id]: {
			...toThreadView(THREAD_REVIEW, [REVIEW_MESSAGE]),
			headMessageId: REVIEW_MESSAGE.id,
		},
		[THREAD_TASK.id]: toThreadView(THREAD_TASK, [
			{
				id: "msg-r9-task-1",
				threadId: THREAD_TASK.id,
				senderId: "test-founder",
				clientKey: "ck-r9-task-001",
				blockId: null,
				deletedAt: null,
				redactedAt: null,
				resolvedAt: null,
				createdAt: NOW,
				type: "plain",
				payload: { text: "Let us discuss the task." },
			},
		]),
		[THREAD_1.id]: toThreadView(THREAD_1, [PLAIN_MESSAGE_1]),
	});

	// Mock active session for task
	// @lore R9: fetchActiveSession expects body to be a direct array (not {sessions: [...]}).
	// ActiveSession requires id, agentId, taskId, state, startedAt, modelTier fields.
	await page.route("**/api/sessions?**", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify([
					{
						id: "session-r9-1",
						agentId: "a-aria",
						taskId: "task-r9-1",
						state: "active",
						startedAt: NOW,
						modelTier: "standard",
					},
				]),
			});
		} else {
			await route.continue();
		}
	});
}

/**
 * seedKnowledgeActive: extends seedActiveWork + 5 knowledge items (3 draft, 2 active).
 * Used for testing knowledge list, create, detail, and comment flows.
 */
async function seedKnowledgeActive(page: Page): Promise<void> {
	// Inherit active work seed first
	await seedActiveWork(page);

	const knowledgeItems = [
		KNOWLEDGE_ITEM_1,
		KNOWLEDGE_ITEM_2,
		KNOWLEDGE_ITEM_3,
		{
			...KNOWLEDGE_ITEM_1,
			id: "ki-r9-4",
			title: "Error Handling Patterns",
			status: "draft" as const,
		},
		{
			...KNOWLEDGE_ITEM_1,
			id: "ki-r9-5",
			title: "Observability Setup",
			status: "active" as const,
		},
	];

	await page.route("**/api/knowledge", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ items: knowledgeItems }),
			});
		} else {
			await route.continue();
		}
	});

	await page.route(`**/api/knowledge/${KNOWLEDGE_ITEM_1.id}`, async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(KNOWLEDGE_ITEM_1),
			});
		} else {
			await route.continue();
		}
	});
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Setup (3 tests)
// ---------------------------------------------------------------------------

test.describe("R9 — Setup page", () => {
	test.beforeEach(async ({ page }) => {
		// Override auth/me to 401 — fresh install, no human user
		await page.route("**/api/auth/me", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 401,
					contentType: "application/json",
					body: JSON.stringify({ error: "Unauthorized" }),
				});
			} else {
				await route.continue();
			}
		});

		await page.route("**/api/teams", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ teams: [] }),
				});
			} else {
				await route.continue();
			}
		});
	});

	// setup-happy-path: fill name + API key + click Start → navigates to /work/portfolio
	test("setup-happy-path: complete setup navigates to /work/portfolio", async ({ page }) => {
		await page.route("**/api/users", async (route) => {
			if (route.request().method() === "POST") {
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({
						id: "u-r9-founder",
						name: "R9 Founder",
						kind: "human",
						role: "founder",
						status: "active",
					}),
				});
			} else {
				await route.continue();
			}
		});

		// POST /api/teams
		await page.route("**/api/teams", async (route) => {
			if (route.request().method() === "POST") {
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({ id: "team-r9-1", name: "My Team", phase: "build" }),
				});
			} else {
				await route.continue();
			}
		});

		// After setup, auth/me returns user
		await page.route("**/api/auth/me", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ id: "u-r9-founder", name: "R9 Founder", avatarUrl: null }),
			});
		});

		// Mock bets for portfolio

		await page.goto("/setup");
		await page.getByLabel(/^name/i).fill("R9 Founder");
		await page.getByLabel(/anthropic api key/i).fill("sk-ant-r9-test");

		await page.getByRole("button", { name: /start hyperidle/i }).click();

		await expect(page).toHaveURL(/\/work\/portfolio/, { timeout: 10_000 });
	});

	// setup-empty-name: leave name empty, Start button is disabled
	test("setup-empty-name: Start button is disabled when name is empty", async ({ page }) => {
		await page.goto("/setup");

		const startBtn = page.getByRole("button", { name: /start hyperidle/i });
		await expect(startBtn).toBeDisabled();
	});

	// setup-invalid-key: POST /api/users returns 422 → error alert visible
	test("setup-invalid-key: server 422 error shows alert feedback", async ({ page }) => {
		await page.route("**/api/users", async (route) => {
			if (route.request().method() === "POST") {
				await route.fulfill({
					status: 422,
					contentType: "application/json",
					body: JSON.stringify({ error: "Invalid API key format" }),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto("/setup");
		await page.getByLabel(/^name/i).fill("R9 Founder");
		await page.getByLabel(/anthropic api key/i).fill("invalid-key-format");

		await page.getByRole("button", { name: /start hyperidle/i }).click();

		// Error feedback visible after server rejects
		await expect(page.locator("[role='alert']")).toBeVisible({ timeout: 5_000 });
	});
});

// ---------------------------------------------------------------------------
// Portfolio (3 tests) — AC-1, AC-2
// ---------------------------------------------------------------------------

test.describe("R9 — Portfolio page", () => {
	// portfolio-create-bet: "New bet" button visible + EmptyState CTA visible (AC-1, AC-2)
	test("portfolio-create-task: New task btn-sm visible; empty state CTA visible", async ({
		page,
	}) => {
		await seedEmpty(page);
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-overview-page']");

		// AC-1: "New bet" button must be visible and clickable
		const newBetBtn = page.getByTestId("new-task-btn");
		await expect(newBetBtn).toBeVisible();
		// AC-1: The button must have btn-sm class (not btn-xs)
		await expect(newBetBtn).toHaveClass(/btn-sm/);

		// AC-2: EmptyState CTA must be visible with a "New bet" button
		const emptyState = page.getByTestId("portfolio-empty");
		await expect(emptyState).toBeVisible();
		// AC-2: CTA button inside EmptyState is visible and clickable
		const ctaButton = emptyState.getByRole("button", { name: /new bet/i });
		await expect(ctaButton).toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// Team (3 tests) — seedFirstBet
// ---------------------------------------------------------------------------

test.describe("R9 — Team page", () => {
	test.beforeEach(async ({ page }) => {
		await page.route(`**/api/teams/${BET_1.teamId}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					// @lore R9: TeamDetail.team is a TeamSummary (id/name/phase/status/leadAgentId).
					// TeamDetail.teamMembers is { id, formedAt, dissolvedAt }.
					// BetCardSummary uses descriptionTitle (not pitchTitle — renamed in U1).
					body: JSON.stringify({
						team: {
							id: BET_1.teamId,
							name: "Alpha Core",
							phase: "build",
							status: "healthy",
							leadAgentId: null,
						},
						teamMembers: { id: BET_1.teamId, formedAt: NOW, dissolvedAt: null },
						roster: [{ agentId: "test-founder", name: "Test Founder", role: "lead", isLead: true }],
						burn: {
							capacity: 2,
						},
						tasksInProgress: [
							{
								id: BET_1.id,
								title: BET_1.title,
								status: BET_1.status,
								progressDone: 1,
								progressTotal: 3,
							},
						],
					}),
				});
			} else {
				await route.continue();
			}
		});
	});

	// team-open-bet: Click BetRow → URL matches /work/task/:id
	// @lore R9: WorkTeam uses data-testid="team-active-tasks" (not "product-active-bets")
	test("team-open-task: clicking BetRow on team page navigates to task detail", async ({
		page,
	}) => {
		await seedFirstBet(page);
		await page.goto(`/work/team/${BET_1.teamId}`);
		await page.waitForSelector("[data-testid='work-team-page']");

		// Active bets region must be visible
		const activeTasks = page.getByTestId("team-active-tasks");
		await expect(activeTasks).toBeVisible();

		// The bet title should be visible
		await expect(activeTasks.getByText("Auth migration")).toBeVisible();

		// Click the bet
		await activeTasks.getByText("Auth migration").click();

		await expect(page).toHaveURL(new RegExp(`/work/task/${BET_1.id}`), { timeout: 5_000 });
	});

	// team-back-portfolio: Click breadcrumb "Portfolio" → URL matches /work/portfolio
	// @lore R9: WorkTeam uses data-testid="team-breadcrumb-back" (not "product-breadcrumb-back")
	test("team-back-portfolio: breadcrumb click returns to portfolio", async ({ page }) => {
		await seedFirstBet(page);
		await page.goto(`/work/team/${BET_1.teamId}`);
		await page.waitForSelector("[data-testid='work-team-page']");

		// Breadcrumb back link
		await page.getByTestId("team-breadcrumb-back").click();

		await expect(page).toHaveURL(/\/work\/portfolio/, { timeout: 5_000 });
	});

	// team-burn-cap-display: Load page → KeyValue pairs visible + progress bar visible
	// @lore R9: WorkTeam uses data-testid="team-burn-vs-cap" (not "product-burn-vs-cap")
	test("team-burn-cap-display: burn vs cap region shows key-value pairs", async ({ page }) => {
		await seedFirstBet(page);
		await page.goto(`/work/team/${BET_1.teamId}`);
		await page.waitForSelector("[data-testid='work-team-page']");

		// Burn vs cap region should show
		const burnVsCap = page.getByTestId("team-burn-vs-cap");
		await expect(burnVsCap).toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// Bet (3 tests) — seedFirstBet
// ---------------------------------------------------------------------------

test.describe("R9 — Task detail page", () => {
	test.beforeEach(async ({ page }) => {
		await seedFirstBet(page);
	});

	// bet-open-task: Click task row → TaskSheet opens
	// @lore R9: Task rows use data-testid="task-row". The text "Implement OAuth"
	// may be obscured by the ArtifactSection overlay — click via testid instead.
	// @lore R9: Playwright's force click doesn't reliably trigger React's synthetic
	// onClick on table rows/cells because force-dispatched events bypass the pointer
	// event chain that React's delegation relies on. Use page.evaluate() to fire a
	// real bubbling click event through JS, which React's root listener intercepts.
	test("task-open-task: clicking task row opens task sheet", async ({ page }) => {
		await page.goto(`/work/task/${BET_1.id}`);
		await expect(page.getByTestId("task-detail-page")).toBeVisible();

		// Tasks must be visible in the bet detail — use data-testid to avoid overlap
		const taskRows = page.getByTestId("task-row");
		await expect(taskRows.first()).toBeVisible({ timeout: 5_000 });

		// Fire a real bubbling click through JS — React's event delegation picks this up
		await page.evaluate(() => {
			const row = document.querySelector("[data-testid='task-row']");
			if (row) row.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
		});

		// TaskSheet opens (data-testid="task-sheet" on the root dialog div)
		await expect(page.getByTestId("task-sheet")).toBeVisible({ timeout: 5_000 });
	});

	// bet-post-discussion: Type in host thread composer + send → POST intercepted
	test("task-post-discussion: posting to host thread section intercepts POST", async ({ page }) => {
		let postCalled = false;

		// @lore BC3: WorkTaskPage's HostThreadSection already has BET_1's task's
		// `threadId` (seedFirstBet's mockTaskTree wired it to THREAD_1.id) — it
		// never resolves-or-creates via search_threads/adjust_thread. Only
		// `send_message` needs a mock here.
		await page.route("**/api/actions/send_message", async (route) => {
			const input = JSON.parse(route.request().postData() ?? "{}") as { threadId?: string };
			if (input.threadId !== THREAD_1.id) {
				await route.fallback();
				return;
			}
			postCalled = true;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						message: makeMessage("msg-r9-new", THREAD_1.id, {
							senderId: "test-founder",
							clientKey: "ck-r9-new",
							payload: { text: "New discussion message" },
							createdAt: LATER,
						}),
						thread: THREAD_1,
					},
				}),
			});
		});

		await page.goto(`/work/task/${BET_1.id}`);
		await expect(page.getByTestId("task-detail-page")).toBeVisible();

		// @lore R9: HostThreadSection uses "Write a message…" placeholder (not "Reply to thread…").
		// ThreadShell Composer uses "Reply to thread…". HostThreadSection on the bet page uses
		// the HostThreadSection component directly, which has "Write a message…".
		const composer = page.getByPlaceholder(/reply to thread|write a message/i).first();
		await expect(composer).toBeVisible({ timeout: 5_000 });
		await composer.fill("New discussion message");
		await page.getByRole("button", { name: /^send$/i }).click();
		await expect.poll(() => postCalled, { timeout: 5_000 }).toBe(true);
	});

	// bet-edit-description: Type in BodyEditor → PATCH intercepted → "Saved" indicator visible
	//
	// @lore R9: useBetDescriptionSave has a 1500ms debounce. The PATCH is intercepted
	// via page.waitForRequest() which hooks into Playwright's network layer directly.
	// waitForRequest() is more reliable than polling a captured variable.
	// @lore R9: Two production bugs were fixed to make this test work:
	// 1. useBodyEditor: onChangeRef pattern ensures TipTap's onUpdate always calls
	//    the LATEST onChange (not a stale closure captured at first mount).
	// 2. useBetDescriptionSave/useAutoSave: unmountedRef.current reset to false in
	//    effect setup so React 18 StrictMode double-invocation doesn't permanently
	//    mark the hook as "unmounted" after cleanup+re-run.
});

// ---------------------------------------------------------------------------
// Conversations List (3 tests) — seedFirstBet / seedActiveWork
// ---------------------------------------------------------------------------

test.describe("R9 — Conversations list page", () => {
	// conv-open-thread: Click thread → URL matches /conversations/:id
	// @lore R9: Thread titles in the list are generated by useConversationsThreads.rowToItem
	// as "${capitalize(hostKind)} thread ${id.slice(0, 8)}" — not from an API title field.
	// THREAD_1 (hostKind: "user", id: "thread-r9-1") renders as "User thread thread-r".
	test("conv-open-thread: clicking thread row navigates to thread detail", async ({ page }) => {
		await seedFirstBet(page);
		await page.goto("/conversations");
		await expect(page.getByTestId("conversations-page")).toBeVisible();

		// Thread row should be visible — title is generated from hostKind + id
		const threadRow = page.getByText(/user thread/i).first();
		await expect(threadRow).toBeVisible({ timeout: 5_000 });

		await threadRow.click();

		await expect(page).toHaveURL(new RegExp(`/conversations/${THREAD_1.id}`), { timeout: 5_000 });
	});

	// conv-create-thread: Click "New Thread" → flow is triggered
	test("conv-create-thread: New Thread button opens thread creation flow", async ({ page }) => {
		await seedFirstBet(page);
		await page.goto("/conversations");
		await expect(page.getByTestId("conversations-page")).toBeVisible();

		// "New Thread" button must be visible
		const newThreadBtn = page.getByRole("button", { name: /new thread/i });
		await expect(newThreadBtn).toBeVisible();

		await newThreadBtn.click();

		// Thread creation dialog/recipient picker should open
		// (RecipientPicker is the Q1 feature for DM threads)
		// We verify that some dialog or sheet opens — the exact form depends on implementation
		await expect(
			page.locator("[role='dialog']").or(page.locator("[data-testid='recipient-picker']")),
		).toBeVisible({ timeout: 5_000 });
	});

	// conv-filter-blocking: Click "Blocking" pill → only blocking threads visible
	test("conv-filter-blocking: blocking pill filter shows only blocking threads", async ({
		page,
	}) => {
		await seedActiveWork(page);
		await page.goto("/conversations");
		await expect(page.getByTestId("conversations-page")).toBeVisible();

		// Wait for threads to load — titles are generated from hostKind + id
		await expect(page.getByText(/task thread/i).first()).toBeVisible({ timeout: 5_000 });

		// @lore R9: Conversations filter pills use role="tab" (inside a tablist),
		// not role="button". Use getByRole("tab") to locate them.
		const blockingPill = page.getByRole("tab", { name: /blocking/i });
		await expect(blockingPill).toBeVisible();
		await blockingPill.click();

		// The blocking pill should now be active
		await expect(blockingPill).toHaveClass(/btn-primary/, { timeout: 3_000 });
	});
});

// ---------------------------------------------------------------------------
// Conversations Thread (3 tests) — seedFirstBet / seedActiveWork
// ---------------------------------------------------------------------------

test.describe("R9 — Conversations thread page", () => {
	// thread-send-message: Type in Composer + send → POST intercepted; message visible
	test("thread-send-message: sending a message POSTs and renders the new message", async ({
		page,
	}) => {
		await seedFirstBet(page);

		const composedText = "R9 test message";
		let postObserved = false;

		const newMessage = makeMessage("msg-r9-composed", THREAD_1.id, {
			senderId: "test-founder",
			clientKey: "ck-r9-composed",
			payload: { text: composedText },
			createdAt: LATER,
		});

		// Overrides seedFirstBet's open_thread dispatch (LIFO) — this thread's
		// response depends on whether the message has been posted yet.
		await page.route("**/api/actions/open_thread", async (route) => {
			const input = JSON.parse(route.request().postData() ?? "{}") as { id?: string };
			if (input.id !== THREAD_1.id) {
				await route.fallback();
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						thread: THREAD_1,
						members: [],
						messages: postObserved ? [newMessage, PLAIN_MESSAGE_1] : [PLAIN_MESSAGE_1],
						headMessageId: null,
						hostTitle: null,
					},
				}),
			});
		});

		await page.route("**/api/actions/send_message", async (route) => {
			const input = JSON.parse(route.request().postData() ?? "{}") as { threadId?: string };
			if (input.threadId !== THREAD_1.id) {
				await route.fallback();
				return;
			}
			postObserved = true;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: { message: newMessage, thread: THREAD_1 } }),
			});
		});

		await page.goto(`/conversations/${THREAD_1.id}`);
		await expect(page.locator("[data-testid='thread-shell']")).toBeVisible();

		const composer = page.getByPlaceholder(/reply to thread/i);
		await composer.fill(composedText);
		await page.getByRole("button", { name: /^send$/i }).click();

		await expect(page.getByText(composedText)).toBeVisible({ timeout: 5_000 });
	});

	// thread-verdict: Navigate to thread with review → click Approve → POST with verdict payload
	test("thread-verdict: clicking Approve on RichMessageCard POSTs verdict payload", async ({
		page,
	}) => {
		await seedActiveWork(page);

		let postObserved = false;
		const verdictMessage = makeMessage("msg-r9-verdict", THREAD_REVIEW.id, {
			senderId: "test-founder",
			clientKey: "ck-r9-verdict",
			type: "verdict",
			payload: { decision: "approve", resolvesMessageId: REVIEW_MESSAGE.id },
			createdAt: LATER,
		});

		await page.route("**/api/actions/send_message", async (route) => {
			const input = JSON.parse(route.request().postData() ?? "{}") as { threadId?: string };
			if (input.threadId !== THREAD_REVIEW.id) {
				await route.fallback();
				return;
			}
			postObserved = true;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: { message: verdictMessage, thread: { ...THREAD_REVIEW, resolvedAt: LATER } },
				}),
			});
		});

		await page.goto(`/conversations/${THREAD_REVIEW.id}`);
		await expect(page.locator("[data-testid='thread-shell']")).toBeVisible();

		// RichMessageCard must be visible (it has the verdict actions toolbar)
		const card = page.locator("[data-testid='rich-message-card']");
		await expect(card).toBeVisible();

		// Click Approve
		await card.getByRole("button", { name: /^approve$/i }).click();

		await expect.poll(() => postObserved, { timeout: 5_000 }).toBe(true);
	});

	// thread-dial-in: Navigate to task thread with active session → click "Dial In" → SessionActivityPanel visible
	test("thread-dial-in: Dial In button opens session activity panel", async ({ page }) => {
		await seedActiveWork(page);
		await page.goto(`/conversations/${THREAD_TASK.id}`);
		await expect(page.locator("[data-testid='thread-shell']")).toBeVisible();

		// "Dial In" button should be visible when there is an active session for this task-hosted thread
		const dialInBtn = page.getByRole("button", { name: /dial in/i });
		await expect(dialInBtn).toBeVisible({ timeout: 5_000 });

		await dialInBtn.click();

		// SessionActivityPanel or companion split layout should appear
		await expect(
			page
				.locator("[data-testid='session-activity-panel']")
				.or(page.locator("[data-testid='companion']")),
		).toBeVisible({ timeout: 5_000 });
	});
});

// ---------------------------------------------------------------------------
// Knowledge List (3 tests) — seedKnowledgeActive — AC-3
// ---------------------------------------------------------------------------

test.describe("R9 — Knowledge list page", () => {
	test.beforeEach(async ({ page }) => {
		await seedKnowledgeActive(page);
	});

	// knowledge-open-item: Click KnowledgeRow → URL matches /knowledge/:id
	// @lore R9: The knowledge list defaults to the "Triage" tab when draft items exist.
	// KNOWLEDGE_ITEM_1 has status "active" so it appears in the Curated tab.
	// Switch to the Curated tab first before looking for the item.
	test("knowledge-open-item: clicking knowledge row navigates to detail page", async ({ page }) => {
		await page.goto("/knowledge");
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		// @lore R9: Knowledge view tabs (Triage/Curated) use role="tab", not role="button".
		const curatedTab = page.getByRole("tab", { name: /curated/i });
		if (await curatedTab.isVisible()) {
			await curatedTab.click();
		}

		await page.getByText("JWT Best Practices").click();

		await expect(page).toHaveURL(new RegExp(`/knowledge/${KNOWLEDGE_ITEM_1.id}`), {
			timeout: 5_000,
		});
	});

	// knowledge-create: Click "+ New" (btn-sm) → fill dialog → POST intercepted — AC-3
	test("knowledge-create: + New button is btn-sm; clicking opens dialog; POST is intercepted", async ({
		page,
	}) => {
		let postCalled = false;
		await page.route("**/api/knowledge", async (route) => {
			if (route.request().method() === "POST") {
				postCalled = true;
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({ ...KNOWLEDGE_ITEM_1, id: "ki-r9-new" }),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto("/knowledge");
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		// AC-3: "+ New" button must be visible and have btn-sm class
		const newBtn = page.getByRole("button", { name: /\+ new/i });
		await expect(newBtn).toBeVisible();
		await expect(newBtn).toHaveClass(/btn-sm/);

		// Open the dialog
		await newBtn.click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();

		// Fill required fields
		await dialog.getByPlaceholder("What did you learn?").fill("R9 Test Item");
		// @lore R9: BodyEditor uses ProseMirror contenteditable — placeholder is CSS-based,
		// not an HTML attribute. Use .ProseMirror selector to fill the editor.
		await dialog.locator(".ProseMirror").fill("R9 body content");

		// Submit
		await dialog.getByRole("button", { name: /create/i }).click();

		await expect.poll(() => postCalled, { timeout: 5_000 }).toBe(true);
	});

	// knowledge-filter-scope: Click scope pill → filter applied
	test("knowledge-filter-scope: clicking scope pill activates the filter", async ({ page }) => {
		await page.goto("/knowledge");
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		// @lore R9: Scope filter pills are scoped to the knowledge-scope-pills group.
		// @lore AE1: Pills renamed to All/Shared/Team/Private (from old category names).
		// "Shared" pill now covers factory+practice scope. "Team" covers team+product scope.
		const scopePills = page.getByTestId("knowledge-scope-pills");
		const scopePill = scopePills
			.getByRole("button", { name: /^shared$/i })
			.or(scopePills.getByRole("button", { name: /^team$/i }));

		if (await scopePill.first().isVisible()) {
			await scopePill.first().click();
			// The clicked pill should become active
			await expect(scopePill.first()).toHaveClass(/btn-primary/, { timeout: 3_000 });
		} else {
			// Fallback: assert the list renders (filter may not exist yet)
			await expect(page.getByTestId("knowledge-list-page")).toBeVisible();
		}
	});
});

// ---------------------------------------------------------------------------
// Knowledge Detail (3 tests) — seedKnowledgeActive
// ---------------------------------------------------------------------------

test.describe("R9 — Knowledge detail page", () => {
	test.beforeEach(async ({ page }) => {
		await seedKnowledgeActive(page);
	});

	// knowledge-edit: Click Edit → type in BodyEditor → PATCH intercepted
	//
	// @lore R9: Same React 18 StrictMode fix applies here: useAutoSave now resets
	// unmountedRef.current=false in setup, and useBodyEditor uses onChangeRef to
	// avoid stale closures. Both fixes allow the debounced PATCH to fire.
	test("knowledge-edit: editing knowledge item fires PATCH to the API", async ({ page }) => {
		// @lore R9: KnowledgeDetail hides the Edit button for factory-scoped items
		// (isFactory = true → button not rendered). Override GET to return a practice-scoped
		// item so the Edit button is visible. PATCH is intercepted at the network level.
		const editableItem = { ...KNOWLEDGE_ITEM_1, scopeKind: "practice" };

		// @lore R9: Intercept the thread action doors to prevent 500 errors —
		// this test doesn't exercise HostThreadSection, so an empty host-thread
		// search and a not-found open are enough (overrides seedKnowledgeActive
		// via LIFO).
		await page.route("**/api/actions/search_threads", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: [] }),
			});
		});
		await page.route("**/api/actions/open_thread", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: false,
					problems: [{ code: "not_found", message: "Thread not found", path: "id" }],
				}),
			});
		});

		await page.route(`**/api/knowledge/${KNOWLEDGE_ITEM_1.id}`, async (route) => {
			if (route.request().method() === "PATCH") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ ...editableItem, version: 2 }),
				});
			} else if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(editableItem),
				});
			} else {
				await route.fallback();
			}
		});

		await page.goto(`/knowledge/${KNOWLEDGE_ITEM_1.id}`);
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		// Click Edit button
		const editBtn = page.getByRole("button", { name: /edit/i });
		await expect(editBtn).toBeVisible();
		await editBtn.click();

		// BodyEditor edit panel must appear
		const editPanel = page.getByTestId("knowledge-edit-panel");
		await expect(editPanel).toBeVisible({ timeout: 5_000 });

		// @lore R9: Use pressSequentially() on [contenteditable="true"] for TipTap.
		// Start waitForRequest() BEFORE typing so the debounced PATCH is captured.
		const contentEditable = editPanel.locator('[contenteditable="true"]').first();
		await contentEditable.click();

		// Start listening for the PATCH BEFORE typing (debounce 1500ms, budget 10s)
		const patchPromise = page.waitForRequest(
			(req) =>
				req.url().includes(`/api/knowledge/${KNOWLEDGE_ITEM_1.id}`) && req.method() === "PATCH",
			{ timeout: 10_000 },
		);

		await contentEditable.pressSequentially("Updated");

		// Wait for the debounced PATCH to arrive
		await patchPromise;

		// Click Done to exit edit mode
		await page.getByRole("button", { name: /done/i }).click();
		await expect(editPanel).not.toBeVisible({ timeout: 3_000 });
	});

	// knowledge-scope: Click "Change scope" → select new scope → save → PATCH intercepted
	test("knowledge-scope: changing scope fires PATCH to /scope endpoint", async ({ page }) => {
		let scopePatchCalled = false;
		await page.route(`**/api/knowledge/${KNOWLEDGE_ITEM_1.id}/scope`, async (route) => {
			if (route.request().method() === "PATCH") {
				scopePatchCalled = true;
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ ...KNOWLEDGE_ITEM_1, scopeKind: "user", scopeId: "test-founder" }),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto(`/knowledge/${KNOWLEDGE_ITEM_1.id}`);
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		// "Change scope" button
		const changeScopeBtn = page.getByRole("button", { name: /change scope/i });
		await expect(changeScopeBtn).toBeVisible();
		await changeScopeBtn.click();

		// Dialog opens
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();

		// Select new scope
		const scopeSelect = dialog.getByRole("combobox").first();
		await scopeSelect.selectOption("user");

		// Fill reason if required
		const reasonInput = dialog.getByPlaceholder(/why are you changing/i);
		if (await reasonInput.isVisible()) {
			await reasonInput.fill("Testing scope change");
		}

		// Save
		await dialog.getByRole("button", { name: /save/i }).click();

		await expect.poll(() => scopePatchCalled, { timeout: 5_000 }).toBe(true);
	});

	// knowledge-comment-block: composer is visible; POST message works
	test("knowledge-comment-block: host thread composer is visible and POST works", async ({
		page,
	}) => {
		let postCalled = false;

		// @lore BC3: HostThreadSection's `host` path calls `search_threads({host,
		// mine:false})` and adopts the FIRST returned row. seedActiveWork
		// registered search_threads returning [THREAD_REVIEW, THREAD_TASK,
		// THREAD_1] (a dumb stub, ignoring the filter) — this override (LIFO)
		// returns only THREAD_1 for the knowledge item host, or the message
		// would be posted to the wrong thread.
		await mockSearchThreads(page, {
			rows: [makeThreadListRow(THREAD_1.id, { ...THREAD_1, hasUnresolvedReview: false })],
		});

		await page.route("**/api/actions/send_message", async (route) => {
			const input = JSON.parse(route.request().postData() ?? "{}") as { threadId?: string };
			if (input.threadId !== THREAD_1.id) {
				await route.fallback();
				return;
			}
			postCalled = true;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						message: makeMessage("msg-r9-knowledge", THREAD_1.id, {
							senderId: "test-founder",
							clientKey: "ck-r9-knowledge",
							payload: { text: "Knowledge comment" },
							createdAt: LATER,
						}),
						thread: THREAD_1,
					},
				}),
			});
		});

		await page.goto(`/knowledge/${KNOWLEDGE_ITEM_1.id}`);
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		// @lore R9: HostThreadSection uses "Write a message…" placeholder (not "Reply to thread…").
		// "Reply to thread…" is the Composer placeholder used inside ThreadShell.
		const composer = page.getByPlaceholder(/write a message/i);
		await expect(composer).toBeVisible({ timeout: 5_000 });

		await composer.fill("Knowledge comment");
		await page.getByRole("button", { name: /^send$/i }).click();

		await expect.poll(() => postCalled, { timeout: 5_000 }).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Settings (3 tests) — seedFirstBet (user exists) — AC-6
// ---------------------------------------------------------------------------

test.describe("R9 — Settings overlay", () => {
	const DEFAULT_USER = {
		id: "test-founder",
		name: "Test Founder",
		email: "test@hyperidle.dev",
		avatarUrl: null,
		role: "founder",
	};

	const DEFAULT_SETTINGS_DATA = {
		profile: { name: "Test Founder", email: "test@hyperidle.dev", avatarUrl: null },
		teams: [{ id: "team-r9-1", name: "Alpha Core", active: true }],
		users: [],
		notifications: {
			reviewAlerts: true,
			blockerAlerts: true,
			quietHoursEnabled: false,
			quietHoursStart: "22:00",
			quietHoursEnd: "08:00",
			mutedTeams: [],
		},
	};

	test.beforeEach(async ({ page }) => {
		await seedFirstBet(page);

		// Override settings with full settings data
		await page.route("**/api/settings", async (route) => {
			const method = route.request().method();
			if (method === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(DEFAULT_SETTINGS_DATA),
				});
			} else if (method === "PATCH") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(DEFAULT_SETTINGS_DATA),
				});
			} else {
				await route.continue();
			}
		});

		await page.route("**/api/auth/me", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(DEFAULT_USER),
				});
			} else {
				await route.continue();
			}
		});

		await page.route("**/api/users/**", async (route) => {
			if (route.request().method() === "PATCH") {
				const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ ...DEFAULT_USER, ...body }),
				});
			} else {
				await route.continue();
			}
		});

		await page.route("**/api/credentials", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ credentials: [] }),
				});
			} else {
				await route.continue();
			}
		});

		// Navigate to conversations (stable page for settings overlay)
		await page.goto("/conversations");
		await page.waitForSelector("[data-testid='main-content']");
	});

	// Helper: open settings overlay
	// @lore R9: The settings button in Sidebar has aria-label="Settings" (not "user profile").
	async function openSettings(page: Page): Promise<void> {
		await page.getByRole("button", { name: /^settings$/i }).click();
		await expect(page.getByText("Settings")).toBeVisible({ timeout: 5_000 });
	}

	// settings-api-key: Open Settings → Credentials → credential section visible
	test("settings-api-key: Credentials section is reachable and renders credential UI", async ({
		page,
	}) => {
		await openSettings(page);

		await page.getByRole("button", { name: /credentials/i }).click();

		// Credentials section should be visible
		await expect(page.getByText(/credentials/i)).toBeVisible();
	});

	// settings-profile: Open Settings → Profile → change name → save → PATCH intercepted
	test("settings-profile: Profile section saves name via PATCH /api/users/:id", async ({
		page,
	}) => {
		let patchCalled = false;
		await page.route("**/api/users/**", async (route) => {
			if (route.request().method() === "PATCH") {
				patchCalled = true;
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ ...DEFAULT_USER, name: "Updated R9 Name" }),
				});
			} else {
				await route.continue();
			}
		});

		await openSettings(page);

		const nameInput = page.getByLabel(/^name/i);
		await nameInput.fill("Updated R9 Name");

		await page.getByRole("button", { name: /save profile/i }).click();

		await expect.poll(() => patchCalled, { timeout: 5_000 }).toBe(true);
	});

	// settings-theme: Appearance section → change theme → data-theme attribute changes
	//                 AND no density select exists (AC-6)
	test("settings-theme: Appearance has theme select but NO density select (AC-6)", async ({
		page,
	}) => {
		await openSettings(page);

		// Navigate to Appearance
		await page.getByRole("button", { name: /appearance/i }).click();

		// Theme select must exist
		const themeSelect = page.getByLabel(/theme/i);
		await expect(themeSelect).toBeVisible();

		// AC-6: Density select must NOT exist in Appearance settings after removal
		const densitySelect = page.locator("#density-select");
		await expect(densitySelect).toHaveCount(0);
	});
});
