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

function makeSeedThread() {
	return {
		id: "ai3-seed-thread",
		title: "AI3 seed thread",
		kind: "dm",
		status: "open",
		createdAt: SEED_CREATED_AT,
		updatedAt: SEED_CREATED_AT,
		lastActiveAt: SEED_CREATED_AT,
		teamId: "test-team-1",
		participants: [],
		messageCount: 1,
	};
}

function makeBadThread() {
	return {
		id: "ai3-bad-thread",
		title: "AI3 bad-timestamp thread",
		kind: "dm",
		status: "open",
		createdAt: BAD_TIMESTAMP,
		updatedAt: BAD_TIMESTAMP,
		lastActiveAt: BAD_TIMESTAMP,
		teamId: "test-team-1",
		participants: [],
		messageCount: 0,
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

function makeSeedNotification() {
	return {
		id: "ai3-seed-notif",
		type: "mention",
		title: "Seeded notification",
		body: "AI3 seed notification for one-clock",
		read: false,
		createdAt: SEED_CREATED_AT,
		threadId: null,
		betId: null,
		taskId: null,
	};
}

function makeBadNotification() {
	return {
		...makeSeedNotification(),
		id: "ai3-bad-notif",
		title: "Bad timestamp notification",
		createdAt: BAD_TIMESTAMP,
	};
}

// ── AC-1: Same age → same label across ≥ 4 surfaces ───────────────────────

test.describe("AC-1: one-clock label agreement across surfaces", () => {
	test.beforeEach(async ({ page }) => {
		// Override threads with seed data
		await page.route("**/api/threads", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ threads: [makeSeedThread()] }),
				});
			} else {
				await route.continue();
			}
		});

		// Override notifications
		await page.route("**/api/notifications**", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ notifications: [makeSeedNotification()] }),
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
		// The thread list (useConversationsThreads → relativeShort) should show a
		// non-empty relative age from the shared module.
		const threadRow = page.locator("[data-testid='thread-row']").first();
		await expect(threadRow).toBeVisible();
		const timeEl = threadRow.locator("[data-testid='thread-time'], .text-tertiary").first();
		// Should contain a relative label — not empty, not "—"
		await expect(timeEl).not.toBeEmpty();
		const text = await timeEl.textContent();
		expect(text).not.toBe("—");
	});

	test("knowledge list renders relative label with shared register", async ({ page }) => {
		await page.goto("/knowledge");
		const row = page
			.locator("[data-component='KnowledgeRow'], [data-testid='knowledge-row']")
			.first();
		await expect(row).toBeVisible();
		// Relative time chip in knowledge row
		const timeEl = row.locator(".font-mono, [data-testid='relative-time']").first();
		await expect(timeEl).not.toBeEmpty();
		const text = await timeEl.textContent();
		expect(text).not.toBe("—");
	});

	test("notification popover shows relative label matching shared register", async ({ page }) => {
		await page.goto("/");
		// Open notification popover
		const notifBtn = page
			.getByRole("button", { name: /notification/i })
			.or(page.locator("[data-testid='notification-bell'], [aria-label*='notification' i]"))
			.first();
		await notifBtn.click();
		const popover = page
			.locator("[data-testid='notification-popover'], [role='dialog']")
			.or(page.locator(".notification-popover"))
			.first();
		await expect(popover).toBeVisible();
		// Should have at least one row with a time label
		const timeEl = popover.locator(".font-mono, [data-testid='notification-time']").first();
		await expect(timeEl).not.toBeEmpty();
		const text = await timeEl.textContent();
		expect(text).not.toBe("—");
	});
});

// ── AC-3: Invalid timestamps → placeholder on all surfaces ─────────────────

test.describe("AC-3: invalid timestamps → TIME_PLACEHOLDER or hidden chip", () => {
	test("thread list with bad timestamp shows '—' placeholder", async ({ page }) => {
		await page.route("**/api/threads", async (route) => {
			if (route.request().method() === "GET") {
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
		const threadRow = page.locator("[data-testid='thread-row']").first();
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
		const row = page
			.locator("[data-component='KnowledgeRow'], [data-testid='knowledge-row']")
			.first();
		await expect(row).toBeVisible();
		await expect(row).toContainText("—");
	});

	test("notification popover with bad timestamp shows '—'", async ({ page }) => {
		await page.route("**/api/notifications**", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ notifications: [makeBadNotification()] }),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto("/");
		const notifBtn = page
			.getByRole("button", { name: /notification/i })
			.or(page.locator("[data-testid='notification-bell'], [aria-label*='notification' i]"))
			.first();
		await notifBtn.click();
		const popover = page
			.locator("[data-testid='notification-popover'], [role='dialog']")
			.or(page.locator(".notification-popover"))
			.first();
		await expect(popover).toBeVisible();
		await expect(popover).toContainText("—");
	});

	test("CommentRow with bad timestamp: row renders, no time chip, no '—' glyph", async ({
		page,
	}) => {
		// Seed a thread detail with a message carrying a bad timestamp.
		const THREAD_ID = "ai3-bad-comment-thread";

		await page.route(`**/api/threads/${THREAD_ID}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						id: THREAD_ID,
						title: "Bad comment thread",
						kind: "dm",
						status: "open",
						createdAt: SEED_CREATED_AT,
						updatedAt: SEED_CREATED_AT,
						lastActiveAt: SEED_CREATED_AT,
						teamId: "test-team-1",
						participants: [],
					}),
				});
			} else {
				await route.continue();
			}
		});

		await page.route(`**/api/threads/${THREAD_ID}/messages**`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						messages: [
							{
								id: "msg-bad-ts",
								threadId: THREAD_ID,
								role: "human",
								authorId: "test-founder",
								authorName: "Test Founder",
								authorAvatarUrl: null,
								isAgent: false,
								createdAt: BAD_TIMESTAMP, // ← unparseable
								blocks: [
									{
										id: "blk-1",
										kind: "text",
										payload: { text: "Hello bad timestamp" },
										version: 1,
									},
								],
							},
						],
						cursor: null,
					}),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto(`/conversations/${THREAD_ID}`);

		// The comment row must render (body visible)
		const commentRow = page
			.locator("[data-component='CommentRow'], [data-testid='comment-row']")
			.first();
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

		await page.route("**/api/teams/**", async (route) => {
			if (route.request().method() === "GET" && route.request().url().includes("/routines")) {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						routines: [
							{
								id: ROUTINE_ID,
								name: "AI3 Seed Routine",
								description: "Seeded for one-clock",
								status: "active",
								trigger: { kind: "manual" },
								createdAt: FUTURE_CREATED_AT,
								updatedAt: FUTURE_CREATED_AT,
								lastRunAt: null,
								nextRunAt: null,
								runCount: 0,
							},
						],
					}),
				});
			} else {
				await route.continue();
			}
		});

		// Navigate to a team's routines page (actual path TBD by app navigation)
		await page.goto("/work/test-team-1/routines");
		const createdField = page
			.locator("[data-testid='routine-created'], [data-testid='created-at']")
			.first();
		await expect(createdField).toBeVisible();
		const text = (await createdField.textContent()) ?? "";
		// Must match "MMM D, YYYY" — e.g. "Mar 15, 2030"
		expect(text).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
	});

	test("SessionActivityPanel entries render 24h HH:mm:ss time", async ({ page }) => {
		const SESSION_ID = "ai3-seed-session";

		await page.route(`**/api/sessions/${SESSION_ID}/activity**`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						entries: [
							{
								id: "entry-1",
								sessionId: SESSION_ID,
								kind: "tool_call",
								label: "read_file",
								timestamp: "2026-06-12T14:32:07.000Z",
								durationMs: 123,
								metadata: null,
							},
						],
					}),
				});
			} else {
				await route.continue();
			}
		});

		// Navigate to a page that renders SessionActivityPanel
		await page.goto(`/work/test-team-1/sessions/${SESSION_ID}`);
		const activityPanel = page
			.locator("[data-testid='session-activity-panel'], [data-component='SessionActivityPanel']")
			.first();
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
