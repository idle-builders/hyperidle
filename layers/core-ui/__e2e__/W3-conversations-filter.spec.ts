/**
 * Journey: the conversations thread list renders as one flat list — no
 * Active/Resolved section grouping.
 *
 * @lore BC3: repointed at `POST /api/actions/search_threads` — never `GET
 * /api/threads*`. Filter chips (Blocking/Unread) were removed from this page
 * — neither ever matched real state (`blocking` is hardcoded false in
 * `AppShell.rowToItem`) — so only the flat-list shape survives here.
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
