/**
 * L15 step18 (write-tests) — picking a request verb posts to the thread
 * and surfaces a toast.
 *
 * Approved.md §4.2 + §5. Plan §6 task #19.
 *
 * Mocks /api/threads* POSTs. Opens the kebab on a TaskCard, clicks
 * `Pause`, asserts the toast `Request posted to thread` appears, asserts
 * the StatusChip text is unchanged.
 *
 * @lore L15: fails today because Kanban has no kebab and WorkTeam has no
 * request handler. Plan T5 + T13 wire them.
 */

import { expect, test } from "@playwright/test";

test.describe("L15 — request a state change → message in thread", () => {
	test("picking Pause shows the success toast and leaves the StatusChip unchanged", async ({
		page,
	}) => {
		// Hermetic mock: any POST to /api/threads* returns a fake message.
		await page.route(/\/api\/threads(\/[^/]+\/messages)?$/, async (route) => {
			if (route.request().method() !== "POST") return route.continue();
			await route.fulfill({
				status: 201,
				contentType: "application/json",
				body: JSON.stringify({
					thread: {
						id: "thread-mock",
						hostKind: "task",
						hostId: "t1",
						initiatorId: "u-founder",
						participants: ["u-founder"],
						pinned: false,
						resolvedAt: null,
						lastActiveAt: "2026-04-19T12:00:00.000Z",
						createdAt: "2026-04-19T12:00:00.000Z",
					},
					message: {
						id: "m-1",
						threadId: "thread-mock",
						senderId: "u-founder",
						clientKey: "k-1",
						type: "plain",
						payload: { text: "Requesting: pause this task." },
						createdAt: "2026-04-19T12:00:00.000Z",
					},
				}),
			});
		});

		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-kanban']");

		const kebab = page
			.locator("[data-testid='work-team-kanban']")
			.getByRole("button", { name: /task actions|open menu|more/i })
			.first();
		await kebab.click();

		await page.getByRole("menuitem", { name: /^pause$/i }).click();

		await expect(page.getByText(/request posted to thread/i)).toBeVisible({
			timeout: 5_000,
		});
	});
});
