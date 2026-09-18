/**
 * W3 — Conversations filter E2E tests: AC-5, AC-6, AC-7, AC-8.
 *
 * AC-5: Thread list is flat (no Active/Resolved section headers).
 * AC-6: Filter chips are toggle-style (Blocking, Unread) — not mutually exclusive tabs.
 * AC-7: "Blocking" badge visible on blocking thread rows.
 * AC-8: "New thread" button in header.
 *
 * @lore BC3: repointed at `POST /api/actions/search_threads` — never `GET
 * /api/threads*`. `blocking`/`unread` are no longer part of `ThreadListRow`'s
 * wire shape — `AppShell.rowToItem` hardcodes `blocking: false` now (own
 * @lore) — so every AC-6/AC-7 assertion that depends on a thread actually
 * being blocking is already on `known-pre-existing-failures.ts`. This is a
 * mechanical mock migration only, not an attempt to resurrect the field.
 */

import { expect, makeThreadListRow, mockSearchThreads, test } from "./fixtures";

const NOW_ISO = new Date().toISOString();

function mkThread(id: string) {
	return makeThreadListRow(id, {
		hostKind: "team",
		hostId: "host-1",
		initiatorId: "u-founder",
		members: ["u-founder"],
		pinned: false,
		resolvedAt: null,
		lastActiveAt: NOW_ISO,
		createdAt: NOW_ISO,
		hasUnresolvedReview: false,
		title: `Thread ${id}`,
		computedTitle: `Thread ${id}`,
	});
}

const MIXED_THREADS = [
	mkThread("t1"),
	mkThread("t2"),
	mkThread("t3"),
	mkThread("t4"),
	mkThread("t5"),
];

test.describe("W3 AC-5 — Flat thread list (no section grouping)", () => {
	test.beforeEach(async ({ page }) => {
		await mockSearchThreads(page, { rows: MIXED_THREADS });
		await page.goto("/conversations");
		await page.waitForSelector("[data-ds-component='ThreadRow']");
	});

	test("no 'Active' section header rendered", async ({ page }) => {
		await expect(page.locator("[data-thread-section='active']")).not.toBeVisible();
	});

	test("no 'Resolved' section header rendered", async ({ page }) => {
		await expect(page.locator("[data-thread-section='resolved']")).not.toBeVisible();
	});

	test("all threads visible in a flat list", async ({ page }) => {
		const rows = page.locator("[data-ds-component='ThreadRow']");
		await expect(rows).toHaveCount(MIXED_THREADS.length);
	});
});

test.describe("W3 AC-6 — Toggle-style filter chips", () => {
	test.beforeEach(async ({ page }) => {
		await mockSearchThreads(page, { rows: MIXED_THREADS });
		await page.goto("/conversations");
		await page.waitForSelector("[data-ds-component='ThreadRow']");
	});

	test("renders 'Blocking' toggle chip (aria-pressed, not role=tab)", async ({ page }) => {
		const blockingChip = page.getByRole("button", { name: /^blocking$/i });
		await expect(blockingChip).toBeVisible();
		// Must have aria-pressed (toggle), not role="tab"
		await expect(blockingChip).toHaveAttribute("aria-pressed");
	});

	test("renders 'Unread' toggle chip", async ({ page }) => {
		const unreadChip = page.getByRole("button", { name: /^unread$/i });
		await expect(unreadChip).toBeVisible();
		await expect(unreadChip).toHaveAttribute("aria-pressed");
	});

	test("does NOT render 'All' tab", async ({ page }) => {
		await expect(page.getByRole("tab", { name: /^all$/i })).not.toBeVisible();
	});

	test("does NOT render 'Async' tab", async ({ page }) => {
		await expect(page.getByRole("tab", { name: /^async$/i })).not.toBeVisible();
	});

	test("toggling Blocking chip filters to blocking threads only", async ({ page }) => {
		const blockingChip = page.getByRole("button", { name: /^blocking$/i });
		await blockingChip.click();

		// Only 2 blocking threads shown
		const rows = page.locator("[data-ds-component='ThreadRow']");
		await expect(rows).toHaveCount(2);
		await expect(blockingChip).toHaveAttribute("aria-pressed", "true");
	});

	test("toggling Blocking chip off restores all threads", async ({ page }) => {
		const blockingChip = page.getByRole("button", { name: /^blocking$/i });

		// Toggle on
		await blockingChip.click();
		await expect(page.locator("[data-ds-component='ThreadRow']")).toHaveCount(2);

		// Toggle off
		await blockingChip.click();
		await expect(page.locator("[data-ds-component='ThreadRow']")).toHaveCount(MIXED_THREADS.length);
	});

	test("Blocking and Unread chips are independently toggleable", async ({ page }) => {
		const blockingChip = page.getByRole("button", { name: /^blocking$/i });
		const unreadChip = page.getByRole("button", { name: /^unread$/i });

		// Toggle both on independently
		await blockingChip.click();
		await expect(blockingChip).toHaveAttribute("aria-pressed", "true");
		await expect(unreadChip).toHaveAttribute("aria-pressed", "false");

		await unreadChip.click();
		// Both can be active simultaneously
		await expect(blockingChip).toHaveAttribute("aria-pressed", "true");
		await expect(unreadChip).toHaveAttribute("aria-pressed", "true");
	});
});

test.describe("W3 AC-7 — Blocking badge on thread rows", () => {
	test.beforeEach(async ({ page }) => {
		await mockSearchThreads(page, { rows: MIXED_THREADS });
		await page.goto("/conversations");
		await page.waitForSelector("[data-ds-component='ThreadRow']");
	});

	test("blocking threads show a 'Blocking' text badge", async ({ page }) => {
		// Threads t1 and t2 are blocking — they should show a badge
		const badges = page
			.locator("[data-badge='blocking'], .badge--blocking, [class*='blocking']")
			.filter({
				hasText: "Blocking",
			});
		// At least 2 blocking badges should be visible
		const count = await badges.count();
		expect(count).toBeGreaterThanOrEqual(2);
	});

	test("non-blocking threads do NOT show a 'Blocking' text badge", async ({ page }) => {
		// Get all thread rows and verify only blocking ones have the badge
		const rows = page.locator("[data-ds-component='ThreadRow']");
		const rowCount = await rows.count();
		let nonBlockingWithBadge = 0;
		for (let i = 0; i < rowCount; i++) {
			const row = rows.nth(i);
			const rowId = await row.getAttribute("data-thread-id");
			const isBlocking = ["t1", "t2"].includes(rowId ?? "");
			const hasBadge = (await row.locator(".badge--blocking, [data-badge='blocking']").count()) > 0;
			if (!isBlocking && hasBadge) {
				nonBlockingWithBadge++;
			}
		}
		expect(nonBlockingWithBadge).toBe(0);
	});
});

test.describe("W3 AC-8 — New thread button in header", () => {
	test.beforeEach(async ({ page }) => {
		await mockSearchThreads(page, { rows: MIXED_THREADS });
		await page.goto("/conversations");
		await page.waitForSelector("[data-conversations-header]");
	});

	test("'New thread' button is visible in the conversations header", async ({ page }) => {
		const header = page.locator("[data-conversations-header]");
		const newThreadBtn = header.getByRole("button", { name: /new thread/i });
		await expect(newThreadBtn).toBeVisible();
	});
});
