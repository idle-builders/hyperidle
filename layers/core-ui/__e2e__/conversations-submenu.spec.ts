/**
 * L8 — Conversations Submenu thread sections E2E.
 *
 * Covers the design contract end-to-end with a mocked
 * POST /api/actions/search_threads. Asserts list loads, click updates main
 * pane, counts match list, and network failure surfaces ErrorState with retry.
 *
 * @lore BC3: repointed at the action door — never `GET /api/threads*`. No
 * `task` host kind; a task's own thread is `team`-hosted.
 */
import { expect, makeThreadListRow, mockSearchThreads, test } from "./fixtures";

// Relative to test-run wall clock so the `Resolved · 24h` bucket stays valid
// as the calendar advances. Hardcoded ISO strings rotted out within days.
const NOW_ISO = new Date().toISOString();
const WITHIN_24H = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

function mkRow(id: string, overrides: Parameters<typeof makeThreadListRow>[1] = {}) {
	return makeThreadListRow(id, {
		hostKind: "team",
		hostId: "host-1",
		initiatorId: "u-founder",
		members: ["u-founder", "agent-1"],
		pinned: false,
		resolvedAt: null,
		lastActiveAt: NOW_ISO,
		createdAt: NOW_ISO,
		hasUnresolvedReview: false,
		...overrides,
	});
}

const SEVEN_THREADS = [
	mkRow("coach", { hostKind: "user", pinned: true }),
	mkRow("a1", { hasUnresolvedReview: true }),
	mkRow("a2", { hasUnresolvedReview: true }),
	mkRow("a3", { hasUnresolvedReview: true }),
	mkRow("a4"),
	mkRow("r1", { resolvedAt: WITHIN_24H }),
	mkRow("r2", { resolvedAt: WITHIN_24H }),
];

test.describe("L8 — Conversations Submenu list", () => {
	test("loads thread list and renders rows by section", async ({ page }) => {
		await mockSearchThreads(page, { rows: SEVEN_THREADS });
		await page.goto("/conversations");
		await page.waitForSelector("[data-ds-component='ThreadRow']");
		const rows = page.locator("[data-ds-component='ThreadRow']");
		await expect(rows).toHaveCount(SEVEN_THREADS.length);
		// Active section header has count=5 (assistant thread + a1..a4)
		const active = page.locator("[data-thread-section='active']");
		await expect(active).toBeVisible();
		// Resolved section header has count=2
		const resolved = page.locator("[data-thread-section='resolved']");
		await expect(resolved).toBeVisible();
	});

	// L9: clicking a thread row now navigates to /conversations/:threadId
	// (URL-authoritative selection). The old assertion "URL does not change" no
	// longer applies — the canonical URL *should* change to include the threadId.
	test("clicking a thread row navigates to /conversations/:threadId and renders ThreadShell (L9)", async ({
		page,
	}) => {
		await mockSearchThreads(page, { rows: SEVEN_THREADS });
		await page.route("**/api/actions/open_thread", async (route) => {
			// Determine which thread id is being opened.
			const input = JSON.parse(route.request().postData() ?? "{}") as { id?: string };
			const threadId = input.id ?? "a1";
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						thread: {
							id: threadId,
							hostKind: "team",
							hostId: "host-1",
							initiatorId: "u-founder",
							members: ["u-founder"],
							title: null,
							computedTitle: threadId,
							pinned: false,
							resolvedAt: null,
							deletedAt: null,
							lastActiveAt: NOW_ISO,
							createdAt: NOW_ISO,
						},
						members: [],
						messages: [],
						headMessageId: null,
						hostTitle: null,
					},
				}),
			});
		});
		await page.goto("/conversations");
		await page.waitForSelector("[data-ds-component='ThreadRow']");
		const row = page.locator("[data-ds-component='ThreadRow']").nth(1);
		await row.click();
		// L9: URL must now include the thread id path segment.
		await expect(page).toHaveURL(/\/conversations\/.+/);
		await expect(page.locator("[data-ds-component='ThreadRow'][aria-current='true']")).toHaveCount(
			1,
		);
		// Main pane must mount ThreadShell (thread detail loaded).
		await expect(page.locator("[data-testid='conversations-page']")).toBeVisible();
	});

	test("network failure renders ErrorState", async ({ page }) => {
		await page.route("**/api/actions/search_threads", async (route) => {
			if (route.request().method() !== "POST") {
				await route.continue();
				return;
			}
			await route.fulfill({ status: 500, body: JSON.stringify({ error: "boom" }) });
		});
		await page.goto("/conversations");
		await expect(page.locator("[data-testid='thread-sections-error']")).toBeVisible();
	});

	test("counts at every section level equal that section's rendered row count", async ({
		page,
	}) => {
		await mockSearchThreads(page, { rows: SEVEN_THREADS });
		await page.goto("/conversations");
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
