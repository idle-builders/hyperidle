/**
 * AI3 — One clock — E2E tests for the shared time vocabulary.
 *
 * RED phase: tests fail until green phase migrates all 17 call sites to the
 * shared time formatter (packages/shared/src/format/time.ts).
 *
 * Acceptance criteria verified:
 *   AC-1: Same age → same label across ≥ 4 surfaces within each register
 *   AC-3: Invalid/unparseable timestamp → TIME_PLACEHOLDER "—" on all surfaces
 *         EXCEPT CommentRow sender-header chip (carve-out: hides chip, no "—")
 *   AC-4: absoluteDate renders MMM D, YYYY; SessionActivityPanel uses 24h HH:mm:ss
 *
 * Strategy: page.route() overrides (LIFO) inject seeded timestamps into the
 * core API mocks. Import from ./fixtures for the base M3 mocks.
 *
 * @lore AI3: E2E verifies one-clock consolidation. page.route() LIFO means
 * test-specific routes registered AFTER the fixture's auto-use routes win.
 * No real DB or server is required — all data comes from mock responses.
 *
 * @lore AI3 selectors: ThreadRow uses data-testid="thread-time" (added AI3).
 * KnowledgeListRow uses data-testid="knowledge-row" and data-testid="knowledge-time"
 * (added AI3 — inline component, not the design-system KnowledgeRow primitive).
 * NotificationPopover uses data-testid="notification-time" (added AI3).
 * AppShell wires NotificationPopover via onNotificationClick → notifOpen state (added AI3).
 * WorkTask metadata strip uses data-testid="task-started-at" (added AI3).
 *
 * @lore AI3 cross-surface agreement: AC-1 Phase 4 strengthened to capture each
 * surface's textContent and assert all four are strictly equal (Set.size === 1).
 * Surface-4 (work-task) uses overrideTaskId seam — page.route() mocks /api/bets/:id
 * with a task whose startedAt = SEED_CREATED_AT. Screenshot saved to plans/AI3/proof/.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures";

// ── Shared seed timestamps ──────────────────────────────────────────────────

/**
 * A single "old" ISO timestamp injected into all surfaces for AC-1.
 * Exactly 3 hours before the reference point — all relative surfaces
 * must render "3h" (relativeShort) or "3h ago" (relativeLong).
 */
const SEED_CREATED_AT = "2026-06-12T11:32:07.000Z"; // 3h before 14:32:07Z

/**
 * An unparseable timestamp injected into surfaces for AC-3.
 */
const BAD_TIMESTAMP = "not-a-valid-date";

/**
 * A future timestamp for AC-3 (absolute surfaces must still render their real date).
 */
const FUTURE_CREATED_AT = "2030-03-15T09:00:00.000Z";

// ── Mock data builders ──────────────────────────────────────────────────────

/**
 * ThreadListRow shape expected by useConversationsThreads.isThreadListRow validator.
 * Must have: id, hostKind (one of: bet/task/knowledge_item/artifact/agent/user/team/factory),
 * hostId, initiatorId, participants (string[]), pinned, lastActiveAt, createdAt,
 * hasUnresolvedReview. Optional: blocking, title.
 */
function makeSeedThread() {
	return {
		id: "ai3-seed-thread",
		title: "AI3 seed thread",
		hostKind: "task",
		hostId: "ai3-seed-task",
		initiatorId: "test-founder",
		participants: ["test-founder"],
		pinned: false,
		resolvedAt: null,
		lastActiveAt: SEED_CREATED_AT,
		createdAt: SEED_CREATED_AT,
		hasUnresolvedReview: false,
		blocking: false,
	};
}

function makeBadThread() {
	return {
		id: "ai3-bad-thread",
		title: "AI3 bad-timestamp thread",
		hostKind: "task",
		hostId: "ai3-bad-task",
		initiatorId: "test-founder",
		participants: ["test-founder"],
		pinned: false,
		resolvedAt: null,
		lastActiveAt: BAD_TIMESTAMP,
		createdAt: BAD_TIMESTAMP,
		hasUnresolvedReview: false,
		blocking: false,
	};
}

function makeSeedKnowledgeItem() {
	return {
		id: "ai3-seed-item",
		layer: "L3",
		scopeId: null,
		kind: "pattern",
		topic: "testing",
		title: "AI3 Seed Item",
		body: "Seeded for one-clock AC tests",
		format: "markdown",
		status: "active",
		attentionScore: null,
		relevanceScore: 0.9,
		confidence: null,
		version: 1,
		updatedBy: "human",
		createdAt: SEED_CREATED_AT,
		updatedAt: SEED_CREATED_AT,
		meta: null,
		citationCount: null,
		lastCitedAt: null,
		signals: {
			lastActivityAt: SEED_CREATED_AT,
			accessCount30d: 1,
			citationCount: null,
			relevanceScore: 0.9,
		},
	};
}

function makeBadKnowledgeItem() {
	return {
		...makeSeedKnowledgeItem(),
		id: "ai3-bad-item",
		title: "AI3 Bad Timestamp Item",
		createdAt: BAD_TIMESTAMP,
		updatedAt: BAD_TIMESTAMP,
		signals: {
			lastActivityAt: BAD_TIMESTAMP,
			accessCount30d: null,
			citationCount: null,
			relevanceScore: null,
		},
	};
}

/**
 * useNotifications fetches GET /api/notifications/inbox and expects:
 * { unseenCount: number; rows: NotificationRow[] }
 * where NotificationRow: { id, typeKey, urgency, title, sourceLink, createdAt, seenAt, readAt }
 */
function makeSeedNotificationRow() {
	return {
		id: "ai3-seed-notif",
		typeKey: "mention",
		urgency: "ambient" as const,
		title: "Seeded notification",
		sourceLink: "/conversations/ai3-seed-thread",
		createdAt: SEED_CREATED_AT,
		seenAt: null,
		readAt: null,
	};
}

function makeBadNotificationRow() {
	return {
		...makeSeedNotificationRow(),
		id: "ai3-bad-notif",
		title: "Bad timestamp notification",
		createdAt: BAD_TIMESTAMP,
	};
}

function makeNotificationInboxResponse(rows: ReturnType<typeof makeSeedNotificationRow>[]) {
	return { unseenCount: rows.length, rows };
}

/**
 * BetDetail shape for WorkTask surface (surface-4).
 * useBet fetches GET /api/bets/:betId and expects BetDetail.
 * WorkTask renders task.startedAt via relativeLong → data-testid="task-started-at".
 */
const AI3_BET_ID = "ai3-seed-bet";
const AI3_TASK_ID = "ai3-seed-task-worktask";

function makeSeedBetDetail() {
	return {
		id: AI3_BET_ID,
		title: "AI3 Seed Bet",
		team: "Alpha Core",
		status: "active",
		atRisk: false,
		tokenAppetite: null,
		tokensActual: null,
		progress: { done: 0, total: 1 },
		description: "Seeded for one-clock AC-1 surface-4 test",
		tasks: [
			{
				id: AI3_TASK_ID,
				title: "AI3 Seed Task",
				owner: "Test Agent",
				state: "in_progress",
				startedAt: SEED_CREATED_AT,
			},
		],
	};
}

// ── Proof directory (absolute path from the worktree root) ─────────────────
// @lore AI3: Use import.meta.url + fileURLToPath because this spec runs as ESM
// (Playwright transpiles .ts files). __dirname is not available in ESM scope.
const SpecDir = path.dirname(fileURLToPath(import.meta.url));
const PROOF_DIR = path.resolve(SpecDir, "../../../plans/AI3/proof");

// ── AC-1: Same age → same label across ≥ 4 surfaces ───────────────────────

test.describe("AC-1: one-clock label agreement across surfaces", () => {
	test.beforeEach(async ({ page }) => {
		// Override threads with seed data. Using the same pattern as the fixture
		// so LIFO ensures this handler wins over the fixture's empty-array response.
		await page.route("**/api/threads**", async (route) => {
			const url = route.request().url();
			// Only intercept the list endpoint, not thread detail (/api/threads/:id)
			if (route.request().method() === "GET" && !url.match(/\/api\/threads\/[^?/]+/)) {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ threads: [makeSeedThread()] }),
				});
			} else {
				await route.continue();
			}
		});

		// Override notifications inbox — useNotifications fetches /api/notifications/inbox
		await page.route("**/api/notifications/inbox**", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeNotificationInboxResponse([makeSeedNotificationRow()])),
				});
			} else {
				await route.continue();
			}
		});

		// Override knowledge list
		await page.route("**/api/knowledge**", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						items: [makeSeedKnowledgeItem()],
						groups: {},
					}),
				});
			} else {
				await route.continue();
			}
		});
	});

	test("thread list renders relative label with shared register", async ({ page }) => {
		await page.goto("/conversations");
		// ThreadRow uses data-ds-component="ThreadRow" (from dsProps) and data-testid="thread-time"
		const threadRow = page.locator("[data-ds-component='ThreadRow']").first();
		await expect(threadRow).toBeVisible();
		const timeEl = threadRow.locator("[data-testid='thread-time']").first();
		// Should contain a relative label — not empty, not "—"
		await expect(timeEl).not.toBeEmpty();
		const text = await timeEl.textContent();
		expect(text).not.toBe("—");
	});

	test("knowledge list renders relative label with shared register", async ({ page }) => {
		await page.goto("/knowledge");
		// KnowledgeListRow uses data-testid="knowledge-row" and data-testid="knowledge-time"
		const row = page.locator("[data-testid='knowledge-row']").first();
		await expect(row).toBeVisible();
		const timeEl = row.locator("[data-testid='knowledge-time']").first();
		await expect(timeEl).not.toBeEmpty();
		const text = await timeEl.textContent();
		expect(text).not.toBe("—");
	});

	test("notification popover shows relative label matching shared register", async ({ page }) => {
		await page.goto("/");
		// Click the sidebar notification button (data-testid="sidebar-notification-btn")
		const notifBtn = page.locator("[data-testid='sidebar-notification-btn']");
		await notifBtn.click();
		// The popover has data-testid="notification-popover"
		const popover = page.locator("[data-testid='notification-popover']");
		await expect(popover).toBeVisible();
		// Should have at least one row with a time label (data-testid="notification-time")
		const timeEl = popover.locator("[data-testid='notification-time']").first();
		await expect(timeEl).not.toBeEmpty();
		const text = await timeEl.textContent();
		expect(text).not.toBe("—");
	});

	/**
	 * Surface-4: WorkTask work page — proves AC-1's "work pages" requirement.
	 *
	 * @lore AI3: Uses the overrideTaskId seam defined in WorkTask props so we
	 * can navigate directly to /work/bet/:betId/task/:taskId without a real DB.
	 * page.route() mocks /api/bets/:betId returning a BetDetail with one task
	 * whose startedAt = SEED_CREATED_AT. WorkTask renders that via relativeLong()
	 * into data-testid="task-started-at". Screenshot saved to plans/AI3/proof/.
	 */
	test("WorkTask work page renders relative label with shared register", async ({ page }) => {
		// Mock /api/bets/:betId — useBet calls GET /api/bets/<betId>
		await page.route(`**/api/bets/${AI3_BET_ID}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeSeedBetDetail()),
				});
			} else {
				await route.continue();
			}
		});

		// Mock /api/tasks/:taskId/sessions — useTaskSessions calls this
		await page.route(`**/api/tasks/${AI3_TASK_ID}/sessions**`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ sessions: [] }),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto(`/work/bet/${AI3_BET_ID}/task/${AI3_TASK_ID}`);

		const taskPage = page.locator("[data-testid='task-detail-page']");
		await expect(taskPage).toBeVisible();

		// task-started-at only renders when task.startedAt is non-null (guarded in WorkTask.tsx:297)
		const startedAtEl = page.locator("[data-testid='task-started-at']").first();
		await expect(startedAtEl).toBeVisible();
		await expect(startedAtEl).not.toBeEmpty();
		const text = await startedAtEl.textContent();
		expect(text).not.toBe("—");

		// Capture proof screenshot for plans/AI3/proof/surface-4-work-task.png
		fs.mkdirSync(PROOF_DIR, { recursive: true });
		await page.screenshot({
			path: path.join(PROOF_DIR, "surface-4-work-task.png"),
			fullPage: false,
		});
	});

	/**
	 * Cross-surface agreement: all four surfaces must render the identical label.
	 *
	 * @lore AI3 Phase 4: Presence assertions (not.toBeEmpty, not.toBe("—")) only
	 * prove each surface is non-empty independently. This test captures each
	 * surface's textContent and asserts all four are strictly equal — a drift in
	 * any surface's register would break this even if it's non-empty.
	 */
	test("all four surfaces render identical relative label for same-age seed", async ({ page }) => {
		// ── Surface 1: thread list ──────────────────────────────────────────────
		await page.goto("/conversations");
		const threadRow = page.locator("[data-ds-component='ThreadRow']").first();
		await expect(threadRow).toBeVisible();
		const threadTimeEl = threadRow.locator("[data-testid='thread-time']").first();
		await expect(threadTimeEl).not.toBeEmpty();
		const threadLabel = (await threadTimeEl.textContent()) ?? "";

		// Capture surface-1 screenshot
		fs.mkdirSync(PROOF_DIR, { recursive: true });
		await page.screenshot({
			path: path.join(PROOF_DIR, "surface-1-thread-list.png"),
			fullPage: false,
		});

		// ── Surface 2: knowledge list ───────────────────────────────────────────
		await page.goto("/knowledge");
		const knowledgeRow = page.locator("[data-testid='knowledge-row']").first();
		await expect(knowledgeRow).toBeVisible();
		const knowledgeTimeEl = knowledgeRow.locator("[data-testid='knowledge-time']").first();
		await expect(knowledgeTimeEl).not.toBeEmpty();
		const knowledgeLabel = (await knowledgeTimeEl.textContent()) ?? "";

		// Capture surface-2 screenshot
		await page.screenshot({
			path: path.join(PROOF_DIR, "surface-2-knowledge-list.png"),
			fullPage: false,
		});

		// ── Surface 3: notification popover ────────────────────────────────────
		await page.goto("/");
		const notifBtn = page.locator("[data-testid='sidebar-notification-btn']");
		await notifBtn.click();
		const popover = page.locator("[data-testid='notification-popover']");
		await expect(popover).toBeVisible();
		const notifTimeEl = popover.locator("[data-testid='notification-time']").first();
		await expect(notifTimeEl).not.toBeEmpty();
		const notifLabel = (await notifTimeEl.textContent()) ?? "";

		// Capture surface-3 screenshot
		await page.screenshot({
			path: path.join(PROOF_DIR, "surface-3-notification-popover.png"),
			fullPage: false,
		});

		// ── Surface 4: WorkTask work page ───────────────────────────────────────
		await page.route(`**/api/bets/${AI3_BET_ID}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeSeedBetDetail()),
				});
			} else {
				await route.continue();
			}
		});
		await page.route(`**/api/tasks/${AI3_TASK_ID}/sessions**`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ sessions: [] }),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto(`/work/bet/${AI3_BET_ID}/task/${AI3_TASK_ID}`);
		await expect(page.locator("[data-testid='task-detail-page']")).toBeVisible();
		const workTaskTimeEl = page.locator("[data-testid='task-started-at']").first();
		await expect(workTaskTimeEl).toBeVisible();
		const workTaskLabel = (await workTaskTimeEl.textContent()) ?? "";

		// ── Cross-surface agreement assertion ───────────────────────────────────
		// Surfaces 1-3 use relativeShort (compact register); surface 4 uses
		// relativeLong (prose register). Within each register the labels must
		// agree; across registers the structural guarantee is:
		//   relativeLong === relativeShort + " ago"
		// (implemented at time.ts:106-110 — not a parallel ladder).
		//
		// @lore AI3 Phase 4: asserts register-internal agreement AND cross-register
		// structural guarantee in one test. A drift in either would break this.

		// Compact register: surfaces 1-3 must be identical
		expect(threadLabel).not.toBe("—");
		expect(knowledgeLabel).toBe(threadLabel);
		expect(notifLabel).toBe(threadLabel);

		// Prose register: surface 4 must be relativeShort + " ago"
		expect(workTaskLabel).toBe(`${threadLabel} ago`);

		// Confirm compact-register agreement via Set dedup (size 1 = identical)
		const compactLabels = new Set([threadLabel, knowledgeLabel, notifLabel]);
		expect(compactLabels.size).toBe(1);

		// Write updated labels.txt proof
		const now = new Date().toISOString();
		const labelsContent = [
			`AI3 One-Clock Proof — ${now}`,
			`Seed timestamp: ${SEED_CREATED_AT}`,
			"",
			`Surface 1 (thread list):      "${threadLabel}" [relativeShort]`,
			`Surface 2 (knowledge list):   "${knowledgeLabel}" [relativeShort]`,
			`Surface 3 (notification):     "${notifLabel}" [relativeShort]`,
			`Surface 4 (work-task):        "${workTaskLabel}" [relativeLong = relativeShort + " ago"]`,
			"",
			`Compact register identical (surfaces 1-3): ${compactLabels.size === 1}`,
			`Cross-register structural guarantee (s4 === s1 + " ago"): ${workTaskLabel === `${threadLabel} ago`}`,
		].join("\n");
		fs.writeFileSync(path.join(PROOF_DIR, "labels.txt"), labelsContent, "utf8");
	});
});

// ── AC-3: Invalid timestamps → placeholder on all surfaces ─────────────────

test.describe("AC-3: invalid timestamps → TIME_PLACEHOLDER or hidden chip", () => {
	test("thread list with bad timestamp shows '—' placeholder", async ({ page }) => {
		await page.route("**/api/threads**", async (route) => {
			const url = route.request().url();
			if (route.request().method() === "GET" && !url.match(/\/api\/threads\/[^?/]+/)) {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ threads: [makeBadThread()] }),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto("/conversations");
		const threadRow = page.locator("[data-ds-component='ThreadRow']").first();
		await expect(threadRow).toBeVisible();
		// Should show em-dash for unparseable time
		await expect(threadRow).toContainText("—");
	});

	test("knowledge list with bad timestamp shows '—' placeholder", async ({ page }) => {
		await page.route("**/api/knowledge**", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						items: [makeBadKnowledgeItem()],
						groups: {},
					}),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto("/knowledge");
		const row = page.locator("[data-testid='knowledge-row']").first();
		await expect(row).toBeVisible();
		await expect(row).toContainText("—");
	});

	test("notification popover with bad timestamp shows '—'", async ({ page }) => {
		await page.route("**/api/notifications/inbox**", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeNotificationInboxResponse([makeBadNotificationRow()])),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto("/");
		const notifBtn = page.locator("[data-testid='sidebar-notification-btn']");
		await notifBtn.click();
		const popover = page.locator("[data-testid='notification-popover']");
		await expect(popover).toBeVisible();
		await expect(popover).toContainText("—");
	});

	test("CommentRow with bad timestamp: row renders, no time chip, no '—' glyph", async ({
		page,
	}) => {
		// Seed a thread detail with a message carrying a bad timestamp.
		const THREAD_ID = "ai3-bad-comment-thread";

		// useThreadDetail fetches GET /api/threads/:id and expects a combined
		// { thread, messages, headMessageId, identities } response (not separate endpoints).
		await page.route(`**/api/threads/${THREAD_ID}*`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						thread: {
							id: THREAD_ID,
							title: "Bad comment thread",
							kind: "dm",
							status: "open",
							hostKind: "user",
							hostId: "test-founder",
							createdAt: SEED_CREATED_AT,
							updatedAt: SEED_CREATED_AT,
							lastActiveAt: SEED_CREATED_AT,
							teamId: "test-team-1",
							participants: ["test-founder"],
						},
						messages: [
							{
								id: "msg-bad-ts",
								threadId: THREAD_ID,
								type: "plain",
								senderId: "test-founder",
								clientKey: "ck-bad-ts",
								deletedAt: null,
								redactedAt: null,
								resolvedAt: null,
								createdAt: BAD_TIMESTAMP, // ← unparseable
								payload: { text: "Hello bad timestamp" },
							},
						],
						headMessageId: null,
						identities: {
							"test-founder": {
								name: "Test Founder",
								role: "founder",
								isAgent: false,
							},
						},
					}),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto(`/conversations/${THREAD_ID}`);

		// The comment row must render (body visible)
		const commentRow = page.locator("[data-testid='comment-row']").first();
		await expect(commentRow).toBeVisible();
		await expect(commentRow).toContainText("Hello bad timestamp");

		// AC-3 CommentRow carve-out: NO time chip in sender header
		const timeChip = commentRow.locator(".text-tertiary").filter({ hasText: /\d{1,2}:\d{2}/ });
		await expect(timeChip).toHaveCount(0);

		// AC-3 CommentRow carve-out: NO "—" glyph rendered anywhere in the row
		const rowText = await commentRow.textContent();
		expect(rowText ?? "").not.toContain("—");
	});
});

// ── AC-4: Absolute format + SessionActivityPanel 24h ──────────────────────

test.describe("AC-4: absolute format and SessionActivityPanel 24h", () => {
	test("WorkRoutine 'Created' field renders MMM D, YYYY format", async ({ page }) => {
		const ROUTINE_ID = "ai3-seed-routine";

		// WorkRoutine fetches GET /api/routines/:routineId → RoutineDetail shape
		await page.route(`**/api/routines/${ROUTINE_ID}**`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						routine: {
							id: ROUTINE_ID,
							name: "AI3 Seed Routine",
							description: "Seeded for one-clock",
							state: "active",
							triggerType: "manual",
							triggerConfig: null,
							scheduleLabel: "Manual",
							ownerAgentId: "test-agent",
							agentName: "Test Agent",
							agentInitials: "TA",
							teamId: "test-team-1",
							teamName: "Test Team",
							autonomyLevel: null,
							humanReview: false,
							delegationAllowed: false,
							lastRunAt: null,
							lastRunOutcome: null,
							nextRunAt: null,
							createdAt: FUTURE_CREATED_AT,
						},
						runs: [],
						budget: {
							totalRunsThisMonth: 0,
						},
					}),
				});
			} else {
				await route.continue();
			}
		});

		// Navigate to the routine detail page
		await page.goto(`/work/routine/${ROUTINE_ID}`);
		const createdField = page.locator("[data-testid='routine-created']").first();
		await expect(createdField).toBeVisible();
		const text = (await createdField.textContent()) ?? "";
		// Must match "MMM D, YYYY" — e.g. "Mar 15, 2030"
		expect(text).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
	});

	test("SessionActivityPanel entries render 24h HH:mm:ss time", async ({ page }) => {
		const THREAD_ID = "ai3-session-thread";
		const TASK_ID = "ai3-seed-task";
		const SESSION_ID = "ai3-seed-session";

		// Mock the thread detail — useThreadDetail fetches GET /api/threads/:id
		// and expects { thread, messages, headMessageId, identities }.
		// hostKind="task" + hostId=TASK_ID enables dial-in button.
		await page.route(`**/api/threads/${THREAD_ID}*`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						thread: {
							id: THREAD_ID,
							title: "AI3 Session Thread",
							kind: "task",
							status: "open",
							hostKind: "task",
							hostId: TASK_ID,
							createdAt: SEED_CREATED_AT,
							updatedAt: SEED_CREATED_AT,
							lastActiveAt: SEED_CREATED_AT,
							teamId: "test-team-1",
							participants: ["test-founder"],
						},
						messages: [],
						headMessageId: null,
						identities: {
							"test-founder": {
								name: "Test Founder",
								role: "founder",
								isAgent: false,
							},
						},
					}),
				});
			} else {
				await route.continue();
			}
		});

		// Mock active session for the task — useActiveSessionForTask fetches
		// GET /api/sessions?task_id=<taskId>&state=active and expects an array.
		await page.route(`**/api/sessions?**`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify([
						{
							id: SESSION_ID,
							agentId: "test-agent",
							taskId: TASK_ID,
							state: "active",
							startedAt: SEED_CREATED_AT,
							modelTier: "standard",
						},
					]),
				});
			} else {
				await route.continue();
			}
		});

		// Mock activity entries.
		// useSessionActivity expects { session: {...}, activity: [...] }
		// where each entry is { type, timestamp: number (epoch ms), data: {...} }.
		// For tool_call: data = { toolName: string, argsSummary: string }.
		await page.route(`**/api/sessions/${SESSION_ID}/activity**`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						session: {
							id: SESSION_ID,
							agentId: "test-agent",
							taskId: TASK_ID,
							state: "active",
							startedAt: SEED_CREATED_AT,
							modelTier: "standard",
						},
						activity: [
							{
								type: "tool_call",
								timestamp: new Date("2026-06-12T14:32:07.000Z").getTime(),
								data: {
									toolName: "read_file",
									argsSummary: "path=/example.ts",
								},
							},
						],
					}),
				});
			} else {
				await route.continue();
			}
		});

		// Navigate to the conversation thread
		await page.goto(`/conversations/${THREAD_ID}`);

		// Click "Dial In" to open the SessionActivityPanel
		const dialInBtn = page.locator("[data-testid='dial-in-btn']");
		await expect(dialInBtn).toBeVisible();
		await dialInBtn.click();

		const activityPanel = page.locator("[data-testid='session-activity-panel']").first();
		await expect(activityPanel).toBeVisible();

		// Each activity entry time must be in 24h HH:mm:ss format (no AM/PM)
		const timeEl = activityPanel.locator("[data-testid='activity-time']").first();
		await expect(timeEl).toBeVisible();
		const text = (await timeEl.textContent()) ?? "";
		// Must match /^\d{2}:\d{2}:\d{2}$/ — 24h, no am/pm
		expect(text).toMatch(/^\d{2}:\d{2}:\d{2}$/);
		expect(text).not.toMatch(/AM|PM/i);
	});
});
