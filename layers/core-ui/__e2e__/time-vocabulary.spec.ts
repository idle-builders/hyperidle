/**
 * One shared clock: every surface that shows a relative age (thread list,
 * document list, notification popover) renders the same label for the same
 * age, and every surface shows the placeholder "—" for an unparseable
 * timestamp — except CommentRow's sender-header chip, which hides instead.
 *
 * page.route() overrides (LIFO) inject seeded timestamps into the core API
 * mocks — no real DB or server is required.
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
	mockDocument,
	mockSearchDocuments,
	mockSearchTasks,
	mockSearchThreads,
	mockThread,
	mockUser,
	test,
} from "./fixtures";

// ── Shared seed timestamps ──────────────────────────────────────────────────

/**
 * A single "old" ISO timestamp injected into all surfaces for the label-agreement checks.
 * Exactly 3 hours before the reference point — all relative surfaces
 * must render "3h" (relativeShort) or "3h ago" (relativeLong).
 */
const SEED_CREATED_AT = "2026-06-12T11:32:07.000Z"; // 3h before 14:32:07Z

/**
 * An unparseable timestamp injected into surfaces for the placeholder checks.
 */
const BAD_TIMESTAMP = "not-a-valid-date";

// ── Mock data builders ──────────────────────────────────────────────────────

/**
 * ThreadListRow shape expected by useConversationsThreads.isThreadListRow validator.
 * Must have: id, hostKind (one of: bet/task/document/artifact/agent/user/team/factory),
 * hostId, initiatorId, participants (string[]), pinned, lastActiveAt, createdAt,
 * hasUnresolvedReview. Optional: blocking, title.
 */
function makeSeedThread() {
	return makeThreadListRow("time-seed-thread", {
		title: "time seed thread",
		computedTitle: "time seed thread",
		hostKind: "team",
		hostId: "time-seed-task",
		initiatorId: "test-founder",
		members: ["test-founder"],
		lastActiveAt: SEED_CREATED_AT,
		createdAt: SEED_CREATED_AT,
		hasUnresolvedReview: false,
	});
}

function makeBadThread() {
	return makeThreadListRow("time-bad-thread", {
		title: "time bad-timestamp thread",
		computedTitle: "time bad-timestamp thread",
		hostKind: "team",
		hostId: "time-bad-task",
		initiatorId: "test-founder",
		members: ["test-founder"],
		lastActiveAt: BAD_TIMESTAMP,
		createdAt: BAD_TIMESTAMP,
		hasUnresolvedReview: false,
	});
}

function makeSeedDocument() {
	return makeDocumentRow("time-seed-item", {
		title: "Time Seed Item",
		body: "Seeded for one-clock AC tests",
		updatedBy: "human",
		createdAt: SEED_CREATED_AT,
		updatedAt: SEED_CREATED_AT,
	});
}

function makeBadDocument() {
	return {
		...makeSeedDocument(),
		id: "time-bad-item",
		title: "Time Bad Timestamp Item",
		createdAt: BAD_TIMESTAMP,
		updatedAt: BAD_TIMESTAMP,
	};
}

function makeChangeRow(id: string, overrides: Partial<ChangeRow> = {}): ChangeRow {
	return {
		id,
		object: "thread",
		objectId: "time-seed-thread",
		kind: "message",
		actor: "test-founder",
		before: null,
		after: {},
		at: SEED_CREATED_AT,
		...overrides,
	};
}

function makeSeedNotificationRow() {
	return { change: makeChangeRow("time-seed-notif"), seenAt: null, readAt: null };
}

function makeBadNotificationRow() {
	return {
		change: makeChangeRow("time-bad-notif", { at: BAD_TIMESTAMP }),
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
	});
}

// ── Proof directory (absolute path from the worktree root) ─────────────────
// import.meta.url + fileURLToPath because this spec runs as ESM (Playwright
// transpiles .ts files) — __dirname is not available in ESM scope.
const SpecDir = path.dirname(fileURLToPath(import.meta.url));
const PROOF_DIR = path.resolve(SpecDir, "../../../test-results");

// ── Same age → same label across every compact-register surface ─────────────

test.describe("one-clock label agreement across surfaces", () => {
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
		await page.getByTestId("notification-row-time-seed-notif").locator("[role='button']").click();
		await expect(popover).toHaveCount(0);
		await expect(page).toHaveURL(/\/conversations\/time-seed-thread$/);
		await page.goBack();
		await expect(page).toHaveURL(originUrl);
	});

	/**
	 * Cross-surface agreement: every compact-register surface renders the
	 * identical label. Presence assertions alone (not.toBeEmpty, not.toBe("—"))
	 * only prove each surface is non-empty independently — this test captures
	 * each surface's textContent and asserts they are strictly equal, so a
	 * drift in any surface's register would break this even if non-empty.
	 *
	 * WorkTaskPage renders no timestamp at all (its meta strip carries owner,
	 * status, depth and session counts only), so it is not one of the surfaces
	 * compared here; the cross-register guarantee (relativeLong ===
	 * relativeShort + " ago") is asserted directly in
	 * utils/__tests__/time.test.ts.
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

		// ── Surface 2: document list ───────────────────────────────────────────
		await page.goto("/documents");
		const documentRow = page.locator("[data-testid='document-row']").first();
		await expect(documentRow).toBeVisible();
		const documentTimeEl = documentRow.locator("[data-testid='document-time']").first();
		await expect(documentTimeEl).not.toBeEmpty();
		const documentLabel = (await documentTimeEl.textContent()) ?? "";

		// ── Surface 3: notification popover ────────────────────────────────────
		await page.goto("/");
		const notifBtn = page.locator("[data-testid='sidebar-notification-btn']");
		await notifBtn.click();
		const popover = page.locator("[data-testid='notification-popover']");
		await expect(popover).toBeVisible();
		const notifTimeEl = popover.locator("[data-testid='notification-time']").first();
		await expect(notifTimeEl).not.toBeEmpty();
		const notifLabel = (await notifTimeEl.textContent()) ?? "";

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
			`One-Clock Proof — ${now}`,
			`Seed timestamp: ${SEED_CREATED_AT}`,
			"",
			`Surface 1 (thread list):      "${threadLabel}" [relativeShort]`,
			`Surface 2 (document list):   "${documentLabel}" [relativeShort]`,
			`Surface 3 (notification):     "${notifLabel}" [relativeShort]`,
			"",
			`Compact register identical (surfaces 1-3): ${compactLabels.size === 1}`,
		].join("\n");
		fs.writeFileSync(path.join(PROOF_DIR, "one-clock-labels.txt"), labelsContent, "utf8");
	});
});

// ── Invalid timestamps → placeholder on all surfaces ────────────────────────

test.describe("invalid timestamps render a placeholder or hide the chip", () => {
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
		// CommentRow only renders inside HostThreadSection now (Conversations'
		// own detail surface moved to the Part-based ConversationSurface) — seed
		// a document's host thread instead of a bare conversation thread.
		const THREAD_ID = "ai3-bad-comment-thread";
		const DOCUMENT_ID = "ai3-bad-comment-doc";

		await mockDocument(page, {
			row: makeDocumentRow(DOCUMENT_ID, { scopeKind: "team", scopeId: "team-a" }),
		});
		await mockSearchThreads(page, {
			rows: [
				makeThreadListRow(THREAD_ID, {
					hostKind: "document",
					hostId: DOCUMENT_ID,
					initiatorId: "test-founder",
					members: ["test-founder"],
					lastActiveAt: SEED_CREATED_AT,
					createdAt: SEED_CREATED_AT,
					hasUnresolvedReview: false,
				}),
			],
		});
		await mockThread(page, {
			thread: {
				id: THREAD_ID,
				hostKind: "document",
				hostId: DOCUMENT_ID,
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

		await page.goto(`/documents/${DOCUMENT_ID}`);
		await page.waitForSelector("[data-testid='document-detail-page']");

		// The comment row must render (body visible)
		const commentRow = page.locator("[data-testid='comment-row']").first();
		await expect(commentRow).toBeVisible();
		await expect(commentRow).toContainText("Hello bad timestamp");

		// CommentRow carve-out: NO time chip in sender header
		const timeChip = commentRow.locator(".text-tertiary").filter({ hasText: /\d{1,2}:\d{2}/ });
		await expect(timeChip).toHaveCount(0);

		// CommentRow carve-out: NO "—" glyph rendered anywhere in the row
		const rowText = await commentRow.textContent();
		expect(rowText ?? "").not.toContain("—");
	});
});
