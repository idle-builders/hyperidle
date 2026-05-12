/**
 * L10 — Conversations Submenu filter chips actually filter (E2E).
 *
 * AC (TRACK-L L10:351–357):
 *   - chip click → list narrows;
 *   - clear → list restores;
 *   - filter-empty state surfaces a Clear filter affordance.
 *
 * Plan §6: web-only fixture. The hook accepts an optional `blocking?: boolean`
 * wire field. We inject the fixture via `page.route('**\/api/threads*', ...)`.
 */

import { expect, test } from "./fixtures";

const NOW_ISO = "2026-04-30T12:00:00.000Z";

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
	blocking?: boolean;
}

function mkRow(overrides: Partial<MockListRow>): MockListRow {
	return {
		id: overrides.id ?? "t1",
		hostKind: overrides.hostKind ?? "task",
		hostId: overrides.hostId ?? "host-1",
		initiatorId: overrides.initiatorId ?? "u-founder",
		participants: overrides.participants ?? ["u-founder"],
		pinned: overrides.pinned ?? false,
		resolvedAt: overrides.resolvedAt ?? null,
		lastActiveAt: overrides.lastActiveAt ?? NOW_ISO,
		createdAt: overrides.createdAt ?? NOW_ISO,
		hasUnresolvedReview: overrides.hasUnresolvedReview ?? false,
		blocking: overrides.blocking,
	};
}

const MIXED_THREADS: MockListRow[] = [
	mkRow({ id: "b1aaaa01", blocking: true }),
	mkRow({ id: "b2aaaa02", blocking: true }),
	mkRow({ id: "a1aaaa03", blocking: false }),
	mkRow({ id: "a2aaaa04", blocking: false }),
	mkRow({ id: "a3aaaa05", blocking: false }),
];

const ASYNC_ONLY: MockListRow[] = [
	mkRow({ id: "a1aaaa01", blocking: false }),
	mkRow({ id: "a2aaaa02", blocking: false }),
];

test.describe("L10 — Conversations filter chips actually filter", () => {
	test("clicking 'Blocking' narrows; '× Clear' restores; 'Async' narrows again; 'All' restores", async ({
		page,
	}) => {
		await page.route("**/api/threads*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: MIXED_THREADS, nextCursor: null }),
			});
		});

		await page.goto("/conversations");
		await page.waitForSelector("[data-ds-component='ThreadRow']");
		await expect(page.locator("[data-ds-component='ThreadRow']")).toHaveCount(5);

		// Blocking → 2 rows.
		await page.getByRole("tab", { name: /^blocking$/i }).click();
		await expect(page.locator("[data-ds-component='ThreadRow']")).toHaveCount(2);

		// Inline `× Clear` is mounted while filter is non-default.
		const clearButton = page.getByTestId("submenu-filter-clear");
		await expect(clearButton).toBeVisible();
		await clearButton.click();
		await expect(page.locator("[data-ds-component='ThreadRow']")).toHaveCount(5);
		await expect(page.getByTestId("submenu-filter-clear")).toHaveCount(0);

		// Async → 3 rows.
		await page.getByRole("tab", { name: /^async$/i }).click();
		await expect(page.locator("[data-ds-component='ThreadRow']")).toHaveCount(3);

		// Click 'All' chip → restored to 5.
		await page.getByRole("tab", { name: /^all$/i }).click();
		await expect(page.locator("[data-ds-component='ThreadRow']")).toHaveCount(5);
	});

	test("filter-empty: clicking 'Blocking' on async-only data shows the filter-empty EmptyState; Clear filter restores", async ({
		page,
	}) => {
		await page.route("**/api/threads*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: ASYNC_ONLY, nextCursor: null }),
			});
		});

		await page.goto("/conversations");
		await page.waitForSelector("[data-ds-component='ThreadRow']");
		await expect(page.locator("[data-ds-component='ThreadRow']")).toHaveCount(2);

		await page.getByRole("tab", { name: /^blocking$/i }).click();
		const filterEmpty = page.getByTestId("thread-sections-filter-empty");
		await expect(filterEmpty).toBeVisible();

		await filterEmpty.getByRole("button", { name: /clear filter/i }).click();
		await expect(page.locator("[data-ds-component='ThreadRow']")).toHaveCount(2);
		await expect(page.getByRole("tab", { name: /^all$/i })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});

	test("touch targets ≥ 44 CSS px on chips + clear button at viewport ≤ 1024 (auto-density comfortable)", async ({
		page,
	}) => {
		// AQ-015 — verifies the touch-target floor that jsdom cannot lay
		// out reliably. Plan §4 escalation hint: assert per-element bounding
		// box dimensions in Playwright.
		// @lore L10 Arch W1: plan §4 originally promised a Vitest
		// `Submenu.touch-target.test.tsx`. jsdom does not lay flex/min-h
		// boxes reliably, so the Vitest path was infeasible and we landed
		// directly at the Playwright bbox check below. This is the verified
		// harness for AQ-015 on the chip row.
		await page.setViewportSize({ width: 1024, height: 800 });
		await page.route("**/api/threads*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: MIXED_THREADS, nextCursor: null }),
			});
		});
		await page.goto("/conversations");
		await page.waitForSelector("[data-ds-component='ThreadRow']");

		// Activate Blocking so the clear button is mounted too.
		await page.getByRole("tab", { name: /^blocking$/i }).click();
		const clear = page.getByTestId("submenu-filter-clear");
		await expect(clear).toBeVisible();

		const targets = [
			page.getByRole("tab", { name: /^all$/i }),
			page.getByRole("tab", { name: /^blocking$/i }),
			page.getByRole("tab", { name: /^async$/i }),
			clear,
		];
		for (const locator of targets) {
			const box = await locator.boundingBox();
			expect(box, `bounding box must exist for ${await locator.textContent()}`).not.toBeNull();
			if (!box) continue;
			expect(box.height).toBeGreaterThanOrEqual(44);
			expect(box.width).toBeGreaterThanOrEqual(44);
		}
	});

	test("error state disables chips (aria-disabled='true')", async ({ page }) => {
		await page.route("**/api/threads*", async (route) => {
			await route.fulfill({ status: 500, body: JSON.stringify({ error: "boom" }) });
		});
		await page.goto("/conversations");
		await expect(page.getByTestId("thread-sections-error")).toBeVisible();
		await expect(page.getByRole("tab", { name: /^blocking$/i })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
	});
});
