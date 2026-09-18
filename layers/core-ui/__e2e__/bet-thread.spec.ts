/**
 * L18 — Bet thread Playwright e2e tests.
 *
 * AC coverage:
 *  - open Bet detail → thread surface shows → post a comment → reload → message persists
 *
 * @lore BC3: there is no `task` host kind — a task's own thread is
 * `team`-hosted, and `WorkTaskPage` already knows its id via
 * `open_task(id).threadId` (`HostThreadSection`'s `threadId` prop), never
 * resolved through `search_threads`.
 */

import { expect, makeTask, makeThread, mockTaskTree, mockThread, test } from "./fixtures";

const NOW = "2026-05-05T09:00:00.000Z";
const FOUNDER_ID = "u-founder";
const THREAD_ID = "t-bet-001";
const ROOT_TASK_ID = "task-thread-test";

test.describe("L18 — Task detail thread surface", () => {
	test("thread surface shows on task detail; post a comment; reload; message persists", async ({
		page,
	}) => {
		const composedText = "This is a test comment on the bet thread.";

		await mockTaskTree(page, {
			task: makeTask(ROOT_TASK_ID, { threadId: THREAD_ID }),
		});

		await mockThread(page, {
			thread: makeThread(THREAD_ID, {
				hostKind: "team",
				hostId: ROOT_TASK_ID,
				initiatorId: FOUNDER_ID,
				members: [FOUNDER_ID],
				lastActiveAt: NOW,
				createdAt: NOW,
			}),
			messages: [],
		});

		await page.goto(`/work/task/${ROOT_TASK_ID}`);

		// Thread surface should be visible
		await expect(page.getByTestId("host-thread-section")).toBeVisible();

		// Post a comment
		const composer = page.getByPlaceholder(/reply to thread|write a message|start a discussion/i);
		await composer.fill(composedText);
		await page.getByRole("button", { name: /^send$/i }).click();

		// After posting, the message appears
		await expect(page.getByText(composedText)).toBeVisible();

		// Reload the page
		await page.reload();

		// Message should persist after reload
		await expect(page.getByText(composedText)).toBeVisible();
	});
});
