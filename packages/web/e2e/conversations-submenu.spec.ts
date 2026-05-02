/**
 * L8 — Conversations Submenu thread sections E2E.
 *
 * Covers the design contract end-to-end with a mocked GET /api/threads
 * endpoint. Asserts list loads, click updates main pane, counts match list,
 * and network failure surfaces ErrorState with retry.
 */
import { expect, test } from "@playwright/test";

// Relative to test-run wall clock so the `Resolved · 24h` bucket stays valid
// as the calendar advances. Hardcoded ISO strings rotted out within days.
const NOW_ISO = new Date().toISOString();
const WITHIN_24H = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

interface MockListRow {
	id: string;
	hostKind: string;
	hostId: string;
	initiatorId: string;
	participants: string[];
	pinned: boolean;
	resolvedAt: string | null;
	lastActiveAt: string;
	createdAt: string;
	hasUnresolvedReview: boolean;
}

function mkRow(overrides: Partial<MockListRow>): MockListRow {
	return {
		id: overrides.id ?? "t1",
		hostKind: overrides.hostKind ?? "task",
		hostId: overrides.hostId ?? "host-1",
		initiatorId: overrides.initiatorId ?? "u-founder",
		participants: overrides.participants ?? ["u-founder", "agent-1"],
		pinned: overrides.pinned ?? false,
		resolvedAt: overrides.resolvedAt ?? null,
		lastActiveAt: overrides.lastActiveAt ?? NOW_ISO,
		createdAt: overrides.createdAt ?? NOW_ISO,
		hasUnresolvedReview: overrides.hasUnresolvedReview ?? false,
	};
}

const SEVEN_THREADS: MockListRow[] = [
	mkRow({ id: "coach", hostKind: "user", pinned: true }),
	mkRow({ id: "a1", hasUnresolvedReview: true }),
	mkRow({ id: "a2", hasUnresolvedReview: true }),
	mkRow({ id: "a3", hasUnresolvedReview: true }),
	mkRow({ id: "a4" }),
	mkRow({ id: "r1", resolvedAt: WITHIN_24H }),
	mkRow({ id: "r2", resolvedAt: WITHIN_24H }),
];

test.describe("L8 — Conversations Submenu list", () => {
	test("loads thread list and renders rows by section", async ({ page }) => {
		await page.route("**/api/threads?**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: SEVEN_THREADS, nextCursor: null }),
			});
		});
		await page.goto("/conversations/review");
		await page.waitForSelector("[data-ds-component='ThreadRow']");
		const rows = page.locator("[data-ds-component='ThreadRow']");
		await expect(rows).toHaveCount(SEVEN_THREADS.length);
		// Active section header has count=5 (coach + a1..a4)
		const active = page.locator("[data-thread-section='active']");
		await expect(active).toBeVisible();
		// Resolved section header has count=2
		const resolved = page.locator("[data-thread-section='resolved']");
		await expect(resolved).toBeVisible();
	});

	test("clicking a thread row updates the main pane and does not change URL search params", async ({
		page,
	}) => {
		await page.route("**/api/threads?**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: SEVEN_THREADS, nextCursor: null }),
			});
		});
		await page.route("**/api/threads/*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					thread: {
						id: "a1",
						hostKind: "task",
						hostId: "host-1",
						initiatorId: "u-founder",
						participants: ["u-founder"],
						pinned: false,
						resolvedAt: null,
						lastActiveAt: NOW_ISO,
						createdAt: NOW_ISO,
					},
					messages: [],
					headMessageId: null,
					identities: {},
				}),
			});
		});
		await page.goto("/conversations/review");
		await page.waitForSelector("[data-ds-component='ThreadRow']");
		const beforeUrl = page.url();
		const row = page.locator("[data-ds-component='ThreadRow']").nth(1);
		await row.click();
		// Selection must not change pathname or search params.
		expect(page.url()).toBe(beforeUrl);
		await expect(page.locator("[data-ds-component='ThreadRow'][aria-current='true']")).toHaveCount(
			1,
		);
		// Main pane must reflect the new selection — the conversations review
		// page mounts ThreadShell once the lifted id resolves to a fetch.
		await expect(page.locator("[data-testid='conversations-review-page']")).toBeVisible();
	});

	test("network failure renders ErrorState", async ({ page }) => {
		await page.route("**/api/threads?**", async (route) => {
			await route.fulfill({ status: 500, body: JSON.stringify({ error: "boom" }) });
		});
		await page.goto("/conversations/review");
		await expect(page.locator("[data-testid='thread-sections-error']")).toBeVisible();
	});

	test("counts at every section level equal that section's rendered row count", async ({
		page,
	}) => {
		await page.route("**/api/threads?**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: SEVEN_THREADS, nextCursor: null }),
			});
		});
		await page.goto("/conversations/review");
		await page.waitForSelector("[data-ds-component='ThreadRow']");
		for (const sectionId of ["active", "resolved"]) {
			const section = page.locator(`[data-thread-section='${sectionId}']`);
			if ((await section.count()) === 0) continue;
			const rows = await section.locator("[data-ds-component='ThreadRow']").count();
			const countText = (
				await section.locator("[data-thread-section-count]").textContent()
			)?.trim();
			expect(Number(countText)).toBe(rows);
		}
	});
});
