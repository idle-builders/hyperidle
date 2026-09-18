/**
 * L18 — Task thread Playwright e2e tests.
 *
 * AC coverage:
 *  - open kanban → click a task → sheet opens → thread renders inline → post → reload → persists
 *
 * @lore BC3: repointed at `POST /api/actions/{search_threads,open_thread,
 * send_message}` — never `GET/POST /api/threads*`. There is no `task` host
 * kind — a task's own thread is `team`-hosted. This test ("kanban task →
 * sheet opens → thread renders inline") is already on
 * `known-pre-existing-failures.ts` (`TaskSheet`/`bet-task-row` no longer
 * exist anywhere in `layers/core-ui/src`) — mechanical mock migration only.
 */

import { expect, makeMessage, makeThread, makeThreadListRow, mockSearchThreads, test } from "./fixtures";

const NOW = "2026-05-05T09:00:00.000Z";
const LATER = "2026-05-05T09:05:00.000Z";
const FOUNDER_ID = "u-founder";
const THREAD_ID = "t-task-001";
const TASK_ID = "task-kanban-001";

test.describe("L18 — Task sheet thread surface", () => {
	test("kanban task → sheet opens → thread renders inline", async ({ page }) => {
		const postedMessages: Array<Record<string, unknown>> = [];
		let postObserved = false;
		const composedText = "Task thread comment posted inline.";

		const thread = makeThread(THREAD_ID, {
			hostKind: "team",
			hostId: TASK_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		await mockSearchThreads(page, {
			rows: [makeThreadListRow(THREAD_ID, { ...thread, hasUnresolvedReview: false })],
		});

		await page.route("**/api/actions/open_thread", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						thread: { ...thread, lastActiveAt: postObserved ? LATER : NOW },
						members: [],
						messages: postObserved ? postedMessages : [],
						headMessageId: null,
						hostTitle: null,
					},
				}),
			});
		});

		await page.route("**/api/actions/send_message", async (route) => {
			const msg = makeMessage("msg-task-001", THREAD_ID, {
				senderId: FOUNDER_ID,
				payload: { text: composedText },
				clientKey: "ck-task-001",
				createdAt: LATER,
			});
			postedMessages.push(msg);
			postObserved = true;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: { message: msg, thread } }),
			});
		});

		// @lore L13: WorkTeam (Kanban) was deleted; TaskSheet is now mounted in
		// WorkBet. Navigate to the bet detail page and click a task row to open
		// the sheet. The bet mock must be registered before the thread mocks so
		// the page renders before we try to click.

		await page.goto("/work/task/b1");
		await page.waitForSelector("[data-testid='task-detail-page']");

		// Click the first task row (bet-task-row) to open the task sheet
		const taskCards = page.locator("[data-testid='bet-task-row']");
		await taskCards.first().click();

		// The task sheet should open
		await expect(page.getByRole("dialog")).toBeVisible();

		// L18: Thread section renders inline in the sheet (AC §621: "Open thread" affordance
		// also present for navigation to conversations view, per L15 compatibility requirement).
		await expect(page.getByTestId("host-thread-section")).toBeVisible();

		// Post a message
		const composer = page.getByPlaceholder(/reply to thread|write a message|start a discussion/i);
		await composer.fill(composedText);
		await page.getByRole("button", { name: /^send$/i }).click();

		await expect(page.getByText(composedText)).toBeVisible();
	});
});
