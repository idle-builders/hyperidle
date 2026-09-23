/**
 * AI3 — One clock — E2E tests for the shared time vocabulary.
 *
 * RED phase: tests fail until green phase migrates all 17 call sites to the
 * shared time formatter (framework/presentation-format/src/format/time.ts).
 *
 * Acceptance criteria verified:
 *   AC-1: Same age → same label across ≥ 4 surfaces within each register
 *   AC-3: Invalid/unparseable timestamp → TIME_PLACEHOLDER "—" on all surfaces
 *         EXCEPT CommentRow sender-header chip (carve-out: hides chip, no "—")
 *   AC-4: absoluteDate renders MMM D, YYYY
 *
 * Strategy: page.route() overrides (LIFO) inject seeded timestamps into the
 * core API mocks. Import from ./fixtures for the base M3 mocks.
 *
 * @lore AI3: E2E verifies one-clock consolidation. page.route() LIFO means
 * test-specific routes registered AFTER the fixture's auto-use routes win.
 * No real DB or server is required — all data comes from mock responses.
 *
 * @lore AI3 selectors: ThreadRow uses data-testid="thread-time" (added AI3).
 * The document list row uses data-testid="document-row" and data-testid="document-time"
 * (added AI3 — the shared Row primitive, not the design-system DocRow primitive).
 * NotificationPopover uses data-testid="notification-time" (added AI3).
 * AppShell wires NotificationPopover via onNotificationClick → notifOpen state (added AI3).
 * WorkTask metadata strip uses data-testid="task-started-at" (added AI3).
 *
 * @lore AI3 cross-surface agreement: AC-1 Phase 4 strengthened to capture each
 * surface's textContent and assert all four are strictly equal (Set.size === 1).
 * Surface-4 (work-task) uses overrideTaskId seam — page.route() mocks /api/bets/:id
 * with a task whose startedAt = SEED_CREATED_AT. Screenshot saved to test-results/.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ChangeRow } from "@hyperidle/domain-model";
import {
	expect,
	makeDocumentRow,
	makeThreadListRow,
	makeUserRow,
	mockSearchDocuments,
	mockSearchTasks,
	mockSearchThreads,
	mockThread,
	mockUser,
	test,
} from "./fixtures";

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

// ── Mock data builders ──────────────────────────────────────────────────────

/**
 * ThreadListRow shape expected by useConversationsThreads.isThreadListRow validator.
 * Must have: id, hostKind (one of: bet/task/document/artifact/agent/user/team/factory),
 * hostId, initiatorId, participants (string[]), pinned, lastActiveAt, createdAt,
 * hasUnresolvedReview. Optional: blocking, title.
 */
// @lore BC3: no `task` host kind — a task's own thread is `team`-hosted.
function makeSeedThread() {
	return makeThreadListRow("ai3-seed-thread", {
		title: "AI3 seed thread",
		computedTitle: "AI3 seed thread",
		hostKind: "team",
		hostId: "ai3-seed-task",
		initiatorId: "test-founder",
		members: ["test-founder"],
		lastActiveAt: SEED_CREATED_AT,
		createdAt: SEED_CREATED_AT,
		hasUnresolvedReview: false,
	});
}

function makeBadThread() {
	return makeThreadListRow("ai3-bad-thread", {
		title: "AI3 bad-timestamp thread",
		computedTitle: "AI3 bad-timestamp thread",
		hostKind: "team",
		hostId: "ai3-bad-task",
		initiatorId: "test-founder",
		members: ["test-founder"],
		lastActiveAt: BAD_TIMESTAMP,
		createdAt: BAD_TIMESTAMP,
		hasUnresolvedReview: false,
	});
}

function makeSeedDocument() {
	return makeDocumentRow("ai3-seed-item", {
		title: "AI3 Seed Item",
		body: "Seeded for one-clock AC tests",
		updatedBy: "human",
		createdAt: SEED_CREATED_AT,
		updatedAt: SEED_CREATED_AT,
	});
}

function makeBadDocument() {
	return {
		...makeSeedDocument(),
		id: "ai3-bad-item",
		title: "AI3 Bad Timestamp Item",
		createdAt: BAD_TIMESTAMP,
		updatedAt: BAD_TIMESTAMP,
	};
}

/**
 * @lore BC5 T10: the inbox carries a `ChangeRow` now (`open_user({}).inbox`),
 * not a notification-type registry row — `NotificationPopover` renders
 * `row.change.at` as the time label and links via `linkForChange` (object +
 * objectId), so a seed row needs a real `ChangeRow` shape.
 */
function makeChangeRow(id: string, overrides: Partial<ChangeRow> = {}): ChangeRow {
	return {
		id,
		object: "thread",
		objectId: "ai3-seed-thread",
		kind: "message",
		actor: "test-founder",
		before: null,
		after: {},
		at: SEED_CREATED_AT,
		...overrides,
	};
}

function makeSeedNotificationRow() {
	return { change: makeChangeRow("ai3-seed-notif"), seenAt: null, readAt: null };
}

function makeBadNotificationRow() {
	return {
		change: makeChangeRow("ai3-bad-notif", { at: BAD_TIMESTAMP }),
		seenAt: null,
		readAt: null,
	};
}

/** Overrides open_user({}) so its `.inbox` carries the given rows. */
async function mockInbox(
	page: import("@playwright/test").Page,
	rows: ReturnType<typeof makeSeedNotificationRow>[],
): Promise<void> {
	await mockUser(page, {
		row: makeUserRow("test-founder", {
			name: "Test Founder",
			team: { id: "test-team-1", name: "Test Team" },
		}),
		self: true,
		inbox: rows,
		connections: { connections: [], inherited: [] },
		behaviour: [],
	});
}

// ── Proof directory (absolute path from the worktree root) ─────────────────
// @lore AI3: Use import.meta.url + fileURLToPath because this spec runs as ESM
// (Playwright transpiles .ts files). __dirname is not available in ESM scope.
const SpecDir = path.dirname(fileURLToPath(import.meta.url));
const PROOF_DIR = path.resolve(SpecDir, "../../../test-results");

// ── AC-1: Same age → same label across every compact-register surface ─────

test.describe("AC-1: one-clock label agreement across surfaces", () => {
	test.beforeEach(async ({ page }) => {
		// Override threads with seed data. LIFO ensures this handler wins over
		// the fixture's empty-array response.
		await mockSearchThreads(page, { rows: [makeSeedThread()] });

		// Override the inbox — useNotifications reads open_user({}).inbox.
		await mockInbox(page, [makeSeedNotificationRow()]);

		// useTeams' per-team task-stat reads (the 1-team short-circuit on "/"
		// needs this to resolve before it can redirect to /work/team/:id).
		await mockSearchTasks(page, { rows: [] });

		// Override document list
		await mockSearchDocuments(page, { rows: [makeSeedDocument()] });
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

	test("document list renders relative label with shared register", async ({ page }) => {
		await page.goto("/documents");
		// The document list row uses data-testid="document-row" and data-testid="document-time"
		const row = page.locator("[data-testid='document-row']").first();
		await expect(row).toBeVisible();
		const timeEl = row.locator("[data-testid='document-time']").first();
		await expect(timeEl).not.toBeEmpty();
		const text = await timeEl.textContent();
		expect(text).not.toBe("—");
	});

	test("notification closes the utility, navigates, and retains temporal Back", async ({
		page,
	}) => {
		await page.goto("/");
		await expect(page).toHaveURL(/\/work\/team\/test-team-1$/);
		const originUrl = page.url();
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
		await page.getByTestId("notification-row-ai3-seed-notif").locator("[role='button']").click();
		await expect(popover).toHaveCount(0);
		await expect(page).toHaveURL(/\/conversations\/ai3-seed-thread$/);
		await page.goBack();
		await expect(page).toHaveURL(originUrl);
	});

	/**
	 * Cross-surface agreement: every compact-register surface renders the
	 * identical label.
	 *
	 * @lore AI3 Phase 4: Presence assertions (not.toBeEmpty, not.toBe("—")) only
	 * prove each surface is non-empty independently. This test captures each
	 * surface's textContent and asserts they are strictly equal — a drift in
	 * any surface's register would break this even if it's non-empty.
	 *
	 * @lore BB1: there was a fourth surface here, the work-task page, and it was
	 * the ONLY prose-register (relativeLong) surface in this test. WorkTaskPage
	 * renders no timestamp at all, so there is nothing left to read: the meta
	 * strip carries owner, status, depth and session counts only. The
	 * cross-register guarantee (relativeLong === relativeShort + " ago") is
	 * asserted directly in utils/__tests__/time.test.ts, and ArtifactTimestamp
	 * is the remaining prose-register surface.
	 */
	test("all compact surfaces render identical relative label for same-age seed", async ({
		page,
	}) => {
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
			path: path.join(PROOF_DIR, "AI3-surface-1-thread-list.png"),
			fullPage: false,
		});

		// ── Surface 2: document list ───────────────────────────────────────────
		await page.goto("/documents");
		const documentRow = page.locator("[data-testid='document-row']").first();
		await expect(documentRow).toBeVisible();
		const documentTimeEl = documentRow.locator("[data-testid='document-time']").first();
		await expect(documentTimeEl).not.toBeEmpty();
		const documentLabel = (await documentTimeEl.textContent()) ?? "";

		// Capture surface-2 screenshot
		await page.screenshot({
			path: path.join(PROOF_DIR, "AI3-surface-2-document-list.png"),
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
			path: path.join(PROOF_DIR, "AI3-surface-3-notification-popover.png"),
			fullPage: false,
		});

		// ── Cross-surface agreement assertion ───────────────────────────────────
		// Surfaces 1-3 use relativeShort (compact register); surface 4 uses
		// All remaining surfaces use relativeShort (compact register), so they
		// must render byte-identical labels for the same seed.

		// Compact register: surfaces 1-3 must be identical
		expect(threadLabel).not.toBe("—");
		expect(documentLabel).toBe(threadLabel);
		expect(notifLabel).toBe(threadLabel);

		// Confirm compact-register agreement via Set dedup (size 1 = identical)
		const compactLabels = new Set([threadLabel, documentLabel, notifLabel]);
		expect(compactLabels.size).toBe(1);

		// Write updated labels.txt proof
		const now = new Date().toISOString();
		const labelsContent = [
			`AI3 One-Clock Proof — ${now}`,
			`Seed timestamp: ${SEED_CREATED_AT}`,
			"",
			`Surface 1 (thread list):      "${threadLabel}" [relativeShort]`,
			`Surface 2 (document list):   "${documentLabel}" [relativeShort]`,
			`Surface 3 (notification):     "${notifLabel}" [relativeShort]`,
			"",
			`Compact register identical (surfaces 1-3): ${compactLabels.size === 1}`,
		].join("\n");
		fs.writeFileSync(path.join(PROOF_DIR, "AI3-labels.txt"), labelsContent, "utf8");
	});
});

// ── AC-3: Invalid timestamps → placeholder on all surfaces ─────────────────

test.describe("AC-3: invalid timestamps → TIME_PLACEHOLDER or hidden chip", () => {
	test("thread list with bad timestamp shows '—' placeholder", async ({ page }) => {
		await mockSearchThreads(page, { rows: [makeBadThread()] });

		await page.goto("/conversations");
		const threadRow = page.locator("[data-ds-component='ThreadRow']").first();
		await expect(threadRow).toBeVisible();
		// Should show em-dash for unparseable time
		await expect(threadRow).toContainText("—");
	});

	test("document list with bad timestamp shows '—' placeholder", async ({ page }) => {
		await mockSearchDocuments(page, { rows: [makeBadDocument()] });

		await page.goto("/documents");
		const row = page.locator("[data-testid='document-row']").first();
		await expect(row).toBeVisible();
		await expect(row).toContainText("—");
	});

	test("notification popover with bad timestamp shows '—'", async ({ page }) => {
		await mockInbox(page, [makeBadNotificationRow()]);

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

		// useThread calls POST /api/actions/open_thread and expects a combined
		// { thread, members, messages, headMessageId, hostTitle } response.
		await mockThread(page, {
			thread: {
				id: THREAD_ID,
				hostKind: "user",
				hostId: "test-founder",
				initiatorId: "test-founder",
				members: ["test-founder"],
				title: "Bad comment thread",
				computedTitle: "Bad comment thread",
				pinned: false,
				resolvedAt: null,
				deletedAt: null,
				createdAt: SEED_CREATED_AT,
				lastActiveAt: SEED_CREATED_AT,
			},
			members: [{ id: "test-founder", name: "Test Founder", role: "founder", isAgent: false }],
			messages: [
				{
					id: "msg-bad-ts",
					threadId: THREAD_ID,
					type: "plain",
					senderId: "test-founder",
					clientKey: "ck-bad-ts",
					blockId: null,
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: BAD_TIMESTAMP, // ← unparseable
					payload: { text: "Hello bad timestamp" },
				},
			],
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

// ── AC-4: Absolute format ────────────────────────────────────────────────
//
// @lore BC5 T9: "WorkRoutine 'Created' field renders MMM D, YYYY format"
// deleted. Its subject — `/work/routine/:id`, WorkRoutine's "Created" field —
// is gone with WorkRoutine and the routines table.
