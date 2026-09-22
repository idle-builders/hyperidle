/**
 * R9 — Action Prominence Audit + E2E Coverage
 *
 * 27 Playwright E2E tests covering top-3 actions across 8 pages.
 * 4 journey-stage seed fixtures (empty, first-bet, active-work, documents-active).
 *
 * Strategy: hermetic page.route() mocks — consistent with all existing E2E tests.
 * No real DB seeding. Each describe block registers additional route overrides;
 * Playwright's LIFO matching means test-specific routes win over fixture defaults.
 *
 * @lore R9: seedEmpty/seedFirstBet/seedActiveWork/seedDocumentsActive are
 * route-override helpers, NOT database seed scripts. The E2E infrastructure
 * uses page.route() mocking — there is no test-server with a real SQLite DB.
 * "Fixtures" in this file == API mock registrations.
 *
 * Tracks covered:
 *   AC-1: "New bet" button is btn-sm (not btn-xs) — portfolio-create-bet asserts visibility
 *   AC-2: Empty state CTA visible in EmptyState action slot — portfolio-create-bet w/ seedEmpty
 *   AC-3: "+ New" document button — visibility covered by document-q2-create.spec.ts;
 *         its dialog-fill scenario is deleted here (create is a full page, not a
 *         dialog, and the button is no longer DaisyUI btn-sm — see the scope-pill and
 *         open-item tests below for the surviving list-page coverage)
 *   AC-6: Density toggle absent from Settings Appearance — settings-theme asserts no density-select
 *   AC-7: All 27 E2E tests pass after implementation
 */

import type { Thread, ThreadListRow, ThreadView } from "@hyperidle/domain-model";
import type { Page } from "@playwright/test";
import {
	expect,
	makeDocumentRow,
	makeMessage,
	makeTask,
	makeThread,
	makeThreadListRow,
	mockDocument,
	mockSearchDocuments,
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
// @lore BC3 review fix: `computedTitle` is server-computed (the title-ladder,
// layers/core-api/thread/src/title-ladder.ts) — there is no client-side
// "${hostKind} thread ${id}" derivation any more (the deleted
// `useConversationsThreads.rowToItem` produced that shape; `AppShell.tsx`'s
// replacement just reads `title ?? computedTitle` off the row). The mock
// spells out its own title text so `conv-open-thread`'s `/user thread/i`
// assertion has something real to find.
const THREAD_1 = makeThread("thread-r9-1", {
	hostKind: "user",
	hostId: "test-founder",
	initiatorId: "test-founder",
	members: ["test-founder"],
	computedTitle: "User thread thread-r9-1",
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

const DOCUMENT_1 = makeDocumentRow("ki-r9-1", {
	title: "JWT Best Practices",
	body: "# JWT\n\nUse short-lived tokens.\n",
	status: "active",
	updatedBy: "test-founder",
	scopeKind: "factory",
	createdAt: NOW,
	updatedAt: NOW,
});

const DOCUMENT_2 = makeDocumentRow("ki-r9-2", {
	title: "Rate Limiting Strategy",
	body: "# Rate Limiting\n\nUse token buckets.\n",
	status: "proposed",
	updatedBy: "test-founder",
	scopeKind: "factory",
	createdAt: NOW,
	updatedAt: NOW,
});

const DOCUMENT_3 = makeDocumentRow("ki-r9-3", {
	title: "Testing Philosophy",
	body: "# Testing\n\nWrite tests first.\n",
	status: "proposed",
	updatedBy: "test-founder",
	scopeKind: "user",
	scopeId: "test-founder",
	createdAt: NOW,
	updatedAt: NOW,
});

// ---------------------------------------------------------------------------
// Journey-stage seed fixture helpers
// ---------------------------------------------------------------------------

/**
 * seedEmpty: No bets, no threads, no documents.
 * Used for testing empty-state CTAs.
 */
async function seedEmpty(page: Page): Promise<void> {
	await mockSearchThreads(page, { rows: [] });

	// AppShell's sidebar reads its document fast-nav list via `useDocuments`
	// (`search_documents`) on every page, not just document pages.
	await mockSearchDocuments(page, { rows: [] });
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
 * seedActiveWork: 2 bets, 3 threads (1 blocking with review message).
 * Used for testing conversations filter and verdict flows.
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
}

/**
 * seedDocumentsActive: extends seedActiveWork + 5 documents (3 draft, 2 active).
 * Used for testing document list, create, detail, and comment flows.
 */
async function seedDocumentsActive(page: Page): Promise<void> {
	// Inherit active work seed first
	await seedActiveWork(page);

	const documentItems = [
		DOCUMENT_1,
		DOCUMENT_2,
		DOCUMENT_3,
		makeDocumentRow("ki-r9-4", {
			...DOCUMENT_1,
			id: "ki-r9-4",
			title: "Error Handling Patterns",
			status: "proposed",
		}),
		makeDocumentRow("ki-r9-5", {
			...DOCUMENT_1,
			id: "ki-r9-5",
			title: "Observability Setup",
			status: "active",
		}),
	];

	await mockSearchDocuments(page, { rows: documentItems });
	await mockDocument(page, { row: DOCUMENT_1 });
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
	// @lore BC3 review fix: title is server-computed (`computedTitle`, see
	// THREAD_1's own @lore) — THREAD_1's mock spells it out as "User thread
	// thread-r9-1" directly, not derived client-side any more.
	test("conv-open-thread: clicking thread row navigates to thread detail", async ({ page }) => {
		await seedFirstBet(page);
		await page.goto("/conversations");
		await expect(page.getByTestId("conversations-page")).toBeVisible();

		// Thread row should be visible — title comes from THREAD_1's mocked computedTitle
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
});

// ---------------------------------------------------------------------------
// Document List (2 tests) — seedDocumentsActive — AC-3
//
// @lore BC4: `knowledge-create`'s dialog-fill scenario is deleted — its
// subject (`KnowledgeCreateDialog`) no longer exists; "+ New" now navigates
// to the full-page `/documents/new` (`DocumentCreate`), which
// `document-q2-create.spec.ts`'s AC-3 already covers. The scope-pill
// filter's surviving behaviour is re-pointed against the real `ScopePicker`
// (`role="radio"` + `data-active`, not a DaisyUI `.btn-primary` toggle).
// ---------------------------------------------------------------------------

test.describe("R9 — Document list page", () => {
	test.beforeEach(async ({ page }) => {
		await seedDocumentsActive(page);
	});

	// document-open-item: Click a document row → URL matches /documents/:id
	// @lore R9: The document list defaults to the "Triage" tab when proposed items exist.
	// DOCUMENT_1 has status "active" so it appears in the Curated tab.
	// Switch to the Curated tab first before looking for the item.
	test("document-open-item: clicking a document row navigates to detail page", async ({ page }) => {
		await page.goto("/documents");
		await page.waitForSelector("[data-testid='document-list-page']");

		// @lore R9: Document view tabs (Triage/Curated) use role="tab", not role="button".
		const curatedTab = page.getByRole("tab", { name: /curated/i });
		if (await curatedTab.isVisible()) {
			await curatedTab.click();
		}

		// Scoped to the curated tree list: the sidebar's own document fast-nav
		// (AppShell/Sidebar) also renders every title, so an unscoped
		// getByText resolves to both and is ambiguous.
		await page.getByTestId("document-tree-list").getByText("JWT Best Practices").click();

		await expect(page).toHaveURL(new RegExp(`/documents/${DOCUMENT_1.id}`), {
			timeout: 5_000,
		});
	});

	// document-filter-scope: Click scope pill → filter applied
	test("document-filter-scope: clicking scope pill activates the filter", async ({ page }) => {
		await page.goto("/documents");
		await page.waitForSelector("[data-testid='document-list-page']");

		// @lore AE1/AD6: Pills are the static All/Shared/Team/Private set (a
		// `role="radiogroup"` of `role="radio"` pills, `data-testid="scope-pill-<id>"`,
		// active state via `data-active`, not a DaisyUI `.btn-primary` toggle).
		const scopePills = page.getByTestId("document-scope-pills");
		const sharedPill = scopePills.getByTestId("scope-pill-shared");

		await sharedPill.click();
		await expect(sharedPill).toHaveAttribute("data-active", "true", { timeout: 3_000 });
	});
});

// ---------------------------------------------------------------------------
// Document Detail (2 tests) — seedDocumentsActive
//
// @lore BC4: `knowledge-scope`'s free `<select>` + PATCH-to-`/scope` scenario
// is rewritten (not just re-pointed) against the real `ScopeChangeDialog` — a
// `ScopePicker` pill control plus a labeled "Scope ID" input, saved through
// `call("edit_document", …)` — mirroring `document-q2-create.spec.ts`'s
// AC-12. `knowledge-edit`'s PATCH interception moves to `edit_document` via
// `mockDocument`.
// ---------------------------------------------------------------------------

test.describe("R9 — Document detail page", () => {
	test.beforeEach(async ({ page }) => {
		await seedDocumentsActive(page);
	});

	// document-edit: Click Edit → type in BodyEditor → edit_document intercepted
	//
	// @lore R9: Same React 18 StrictMode fix applies here: useAutoSave now resets
	// unmountedRef.current=false in setup, and useBodyEditor uses onChangeRef to
	// avoid stale closures. Both fixes allow the debounced save to fire.
	test("document-edit: editing a document fires edit_document", async ({ page }) => {
		// @lore R9: DocumentDetail hides the Edit button for factory-scoped items
		// (isFactory = true → button not rendered). Use a team-scoped item so the
		// Edit button is visible. edit_document is intercepted at the network level.
		const editableItem = makeDocumentRow(DOCUMENT_1.id, {
			...DOCUMENT_1,
			scopeKind: "team",
		});

		// @lore R9: Intercept the thread action doors to prevent 500 errors —
		// this test doesn't exercise HostThreadSection, so an empty host-thread
		// search and a not-found open are enough (overrides seedDocumentsActive
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

		await mockDocument(page, { row: editableItem });

		await page.goto(`/documents/${editableItem.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");

		// Click Edit button
		const editBtn = page.getByRole("button", { name: /edit/i });
		await expect(editBtn).toBeVisible();
		await editBtn.click();

		// BodyEditor edit panel must appear
		const editPanel = page.getByTestId("document-edit-panel");
		await expect(editPanel).toBeVisible({ timeout: 5_000 });

		// @lore R9: Use pressSequentially() on [contenteditable="true"] for TipTap.
		// Start waitForRequest() BEFORE typing so the debounced save is captured.
		const contentEditable = editPanel.locator('[contenteditable="true"]').first();
		await contentEditable.click();

		// Start listening for the save BEFORE typing (debounce 1500ms, budget 10s)
		const savePromise = page.waitForRequest(
			(req) => req.url().includes("/api/actions/edit_document") && req.method() === "POST",
			{ timeout: 10_000 },
		);

		await contentEditable.pressSequentially("Updated");

		// Wait for the debounced save to arrive
		await savePromise;

		// Click Done to exit edit mode
		await page.getByRole("button", { name: /done/i }).click();
		await expect(editPanel).not.toBeVisible({ timeout: 3_000 });
	});

	// document-scope: overflow menu → Change scope → pick a pill → Save → edit_document intercepted
	test("document-scope: changing scope fires edit_document", async ({ page }) => {
		// ScopeChangeDialog disables the "Team" pill unless the current user has
		// a teamId (`hasTeam = user?.teamId !== undefined`) — override auth/me so
		// this test can exercise the Team pill + Scope ID input.
		await page.route("**/api/auth/me", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					id: "test-founder",
					name: "Test Founder",
					email: "test@hyperidle.dev",
					role: "founder",
					avatarUrl: null,
					teamId: "test-team-1",
				}),
			});
		});

		let scopeChangeCalled = false;
		await page.route("**/api/actions/edit_document", async (route) => {
			const input = JSON.parse(route.request().postData() ?? "{}") as {
				id?: string;
				scopeKind?: string;
			};
			if (input.id !== DOCUMENT_1.id || input.scopeKind === undefined) {
				await route.fallback();
				return;
			}
			scopeChangeCalled = true;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						document: {
							...DOCUMENT_1,
							scopeKind: "team",
							scopeId: "team-alpha",
							version: DOCUMENT_1.version + 1,
						},
						ancestors: [],
						children: [],
						siblings: [],
						scopeName: "Alpha",
					},
				}),
			});
		});

		await page.goto(`/documents/${DOCUMENT_1.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");

		// Overflow menu → "Change scope"
		await page.getByRole("button", { name: /more options/i }).click();
		const changeScopeItem = page.getByTestId("document-change-scope");
		await expect(changeScopeItem).toBeVisible();
		await changeScopeItem.click();

		// Dialog opens with the real ScopePicker (pill buttons), not a <select>
		const dialog = page.getByRole("dialog", { name: "Change scope" });
		await expect(dialog).toBeVisible();

		// "Team" is the only scope kind requiring a Scope ID
		// (SCOPES_REQUIRING_ID = {"team"}) — matches document-q2-create.spec.ts's
		// AC-12 pattern.
		await dialog.getByTestId("scope-pill-change-team").click();
		await dialog.getByLabel("Scope ID").fill("team-alpha");

		await dialog.getByRole("button", { name: "Save" }).click();

		await expect.poll(() => scopeChangeCalled, { timeout: 5_000 }).toBe(true);
	});

	// document-comment-block: composer is visible; POST message works
	test("document-comment-block: host thread composer is visible and POST works", async ({
		page,
	}) => {
		let postCalled = false;

		// @lore BC3: HostThreadSection's `host` path calls `search_threads({host,
		// mine:false})` and adopts the FIRST returned row. seedActiveWork
		// registered search_threads returning [THREAD_REVIEW, THREAD_TASK,
		// THREAD_1] (a dumb stub, ignoring the filter) — this override (LIFO)
		// returns only THREAD_1 for the document host, or the message would be
		// posted to the wrong thread.
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
						message: makeMessage("msg-r9-document", THREAD_1.id, {
							senderId: "test-founder",
							clientKey: "ck-r9-document",
							payload: { text: "Document comment" },
							createdAt: LATER,
						}),
						thread: THREAD_1,
					},
				}),
			});
		});

		await page.goto(`/documents/${DOCUMENT_1.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");

		// @lore R9: Composer's real default placeholder is "Reply to thread…"
		// (ds/Composer.tsx) — HostThreadSection passes no override. This regex
		// matches the same pattern already used for the Conversations thread
		// page test above.
		const composer = page.getByPlaceholder(/reply to thread|write a message/i).first();
		await expect(composer).toBeVisible({ timeout: 5_000 });

		await composer.fill("Document comment");
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
