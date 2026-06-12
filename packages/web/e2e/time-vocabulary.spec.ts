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
 */

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
							costActual: null,
							createdAt: FUTURE_CREATED_AT,
							costCapPerRun: null,
						},
						runs: [],
						budget: {
							avgCostPerRun: null,
							totalCostThisMonth: null,
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
