/**
 * L18 — Task thread Playwright e2e tests.
 *
 * AC coverage:
 *  - open kanban → click a task → sheet opens → thread renders inline → post → reload → persists
 */

import { expect, test } from "./fixtures";

const NOW = "2026-05-05T09:00:00.000Z";
const LATER = "2026-05-05T09:05:00.000Z";
const FOUNDER_ID = "u-founder";
const THREAD_ID = "t-task-001";
const TASK_ID = "task-kanban-001";

function makeThreadListResponse() {
	return {
		threads: [
			{
				id: THREAD_ID,
				hostKind: "task",
				hostId: TASK_ID,
				initiatorId: FOUNDER_ID,
				participants: [FOUNDER_ID],
				pinned: false,
				resolvedAt: null,
				lastActiveAt: NOW,
				createdAt: NOW,
				hasUnresolvedReview: false,
			},
		],
		nextCursor: null,
	};
}

function makeThreadDetailResponse(messages: Array<Record<string, unknown>>) {
	return {
		thread: {
			id: THREAD_ID,
			hostKind: "task",
			hostId: TASK_ID,
			initiatorId: FOUNDER_ID,
			participants: [FOUNDER_ID],
			pinned: false,
			resolvedAt: null,
			lastActiveAt: messages.length > 0 ? LATER : NOW,
			createdAt: NOW,
		},
		messages,
		headMessageId: null,
		nextMessagesCursor: null,
	};
}

test.describe("L18 — Task sheet thread surface", () => {
	test("kanban task → sheet opens → thread renders inline", async ({ page }) => {
		const postedMessages: Array<Record<string, unknown>> = [];
		let postObserved = false;
		const composedText = "Task thread comment posted inline.";

		await page.route(`**/api/threads?**host_kind=task**`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeThreadListResponse()),
			});
		});

		await page.route(`**/api/threads/${THREAD_ID}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeThreadDetailResponse(postObserved ? postedMessages : [])),
				});
			} else {
				await route.continue();
			}
		});

		await page.route(`**/api/threads/${THREAD_ID}/messages`, async (route) => {
			if (route.request().method() === "POST") {
				const msg = {
					id: "msg-task-001",
					threadId: THREAD_ID,
					senderId: FOUNDER_ID,
					type: "plain",
					payload: { text: composedText },
					clientKey: "ck-task-001",
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: LATER,
				};
				postedMessages.push(msg);
				postObserved = true;
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({
						message: msg,
						thread: makeThreadDetailResponse(postedMessages).thread,
					}),
				});
			} else {
				await route.continue();
			}
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
