/**
 * W3 — Conversations filter E2E tests: AC-5, AC-6, AC-7, AC-8.
 *
 * AC-5: Thread list is flat (no Active/Resolved section headers).
 * AC-6: Legacy filter chips are absent from the flat conversations list.
 * AC-7: "Blocking" badge visible on blocking thread rows.
 * AC-8: "New thread" button in header.
 */

import { expect, test } from "./fixtures";

const NOW_ISO = new Date().toISOString();

function mkThread(overrides: {
	id: string;
	blocking?: boolean;
	unread?: boolean;
	resolvedAt?: string | null;
}) {
	return {
		id: overrides.id,
		hostKind: "task",
		hostId: "host-1",
		initiatorId: "u-founder",
		participants: ["u-founder"],
		pinned: false,
		resolvedAt: overrides.resolvedAt ?? null,
		lastActiveAt: NOW_ISO,
		createdAt: NOW_ISO,
		hasUnresolvedReview: false,
		blocking: overrides.blocking ?? false,
		unread: overrides.unread ?? false,
		title: `Thread ${overrides.id}`,
	};
}

const MIXED_THREADS = [
	mkThread({ id: "t1", blocking: true }),
	mkThread({ id: "t2", blocking: true }),
	mkThread({ id: "t3", blocking: false }),
	mkThread({ id: "t4", blocking: false }),
	mkThread({ id: "t5", blocking: false, unread: true }),
];

test.describe("W3 AC-5 — Flat thread list (no section grouping)", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/threads*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: MIXED_THREADS, nextCursor: null }),
			});
		});
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

test.describe("W3 AC-6 — Legacy filter chips removed", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/threads*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: MIXED_THREADS, nextCursor: null }),
			});
		});
		await page.goto("/conversations");
		await page.waitForSelector("[data-ds-component='ThreadRow']");
	});

	test("does NOT render legacy filter tabs", async ({ page }) => {
		await expect(page.getByRole("tab", { name: /^all$/i })).not.toBeVisible();
		await expect(page.getByRole("tab", { name: /^async$/i })).not.toBeVisible();
	});

	test("does NOT render removed Blocking or Unread toggle chips", async ({ page }) => {
		await expect(page.getByRole("button", { name: /^blocking$/i })).not.toBeVisible();
		await expect(page.getByRole("button", { name: /^unread$/i })).not.toBeVisible();
		await expect(page.locator("[data-ds-component='ThreadRow']")).toHaveCount(MIXED_THREADS.length);
	});
});

test.describe("W3 AC-7 — Blocking badge on thread rows", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/threads*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: MIXED_THREADS, nextCursor: null }),
			});
		});
		await page.goto("/conversations");
		await page.waitForSelector("[data-ds-component='ThreadRow']");
	});

	test("blocking threads show a 'Blocking' text badge", async ({ page }) => {
		await expect(page.getByTestId("thread-row-blocking-badge")).toHaveCount(2);
	});

	test("non-blocking threads do NOT show a 'Blocking' text badge", async ({ page }) => {
		for (const id of ["t3", "t4", "t5"]) {
			const row = page.locator("[data-ds-component='ThreadRow']", { hasText: `Thread ${id}` });
			await expect(row.getByTestId("thread-row-blocking-badge")).toHaveCount(0);
		}
	});
});

test.describe("W3 AC-8 — New thread button in header", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/threads*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: MIXED_THREADS, nextCursor: null }),
			});
		});
		await page.goto("/conversations");
		await page.waitForSelector("[data-conversations-header]");
	});

	test("'New thread' button is visible in the conversations header", async ({ page }) => {
		const header = page.locator("[data-conversations-header]");
		const newThreadBtn = header.getByRole("button", { name: /new thread/i });
		await expect(newThreadBtn).toBeVisible();
	});
});
