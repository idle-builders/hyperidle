/**
 * L18 — Block-anchored comment Playwright e2e tests.
 *
 * AC coverage:
 *  - open Bet detail → focus a pitch block → open actions popover → "Comment on this block"
 *    → composer opens with prefilled blockId reference → post → message renders inline-after-payload
 *
 * @lore BC3: there is no `bet`/`task` host kind — a task's own thread is
 * `team`-hosted, and the task page already knows its id via
 * `open_task(id).threadId` (never lazily created from the task page, unlike
 * the knowledge page's `host`-prop path).
 */

import { expect, makeMessage, makeTask, makeThread, mockTaskTree, test } from "./fixtures";

const NOW = "2026-05-05T09:00:00.000Z";
const LATER = "2026-05-05T09:05:00.000Z";
const FOUNDER_ID = "u-founder";
const THREAD_ID = "t-bet-anchor";
const BET_ID = "bet-anchor-test";

test.describe("L18 — Block-anchored comment flow", () => {
	test("focus block → open popover → Discuss → composer prefilled → post → message inline after block", async ({
		page,
	}) => {
		const postedMessages = [
			makeMessage("msg-init", THREAD_ID, {
				senderId: FOUNDER_ID,
				payload: { text: "Thread started." },
				clientKey: "ck-init",
				createdAt: NOW,
			}),
		];
		let postedBlockId: string | null = null;
		const composedText = "This is my anchored comment on the block.";

		await mockTaskTree(page, { task: makeTask(BET_ID, { threadId: THREAD_ID }) });

		const thread = makeThread(THREAD_ID, {
			hostKind: "team",
			hostId: BET_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		await page.route("**/api/actions/open_thread", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						thread,
						members: [],
						messages: postedMessages,
						headMessageId: null,
						hostTitle: null,
					},
				}),
			});
		});

		await page.route("**/api/actions/send_message", async (route) => {
			const body = route.request().postDataJSON() as {
				text: string;
				blockId?: string;
			};
			postedBlockId = body.blockId ?? null;
			const msg = makeMessage("msg-anch-001", THREAD_ID, {
				senderId: FOUNDER_ID,
				payload: { text: composedText, blockId: postedBlockId },
				clientKey: "ck-anch-001",
				blockId: postedBlockId,
				createdAt: LATER,
			});
			postedMessages.push(msg);
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: { message: msg, thread } }),
			});
		});

		await page.goto(`/work/task/${BET_ID}`);

		// Find a block in the pitch and open its actions
		const firstBlock = page.locator("[data-ds-component='block']").first();
		await firstBlock.focus();
		await page.keyboard.press(" ");

		// The block actions popover should appear
		await expect(page.getByTestId("block-actions-popover")).toBeVisible();

		// Click Discuss
		await page.getByRole("menuitem", { name: /discuss/i }).click();

		// The prefill chip should appear in the composer
		await expect(page.getByTestId("host-thread-prefill-chip")).toBeVisible();

		// Type and post the anchored message
		const composer = page.getByPlaceholder(/reply to thread|write a message|start a discussion/i);
		await composer.fill(composedText);
		await page.getByRole("button", { name: /^send$/i }).click();

		// Wait for the composer to clear — this happens after setComposerText("") in handleSend,
		// which only runs AFTER the POST to /messages completes. Waiting here ensures postedBlockId
		// is captured before we assert it.
		// @lore L18: do NOT assert getByText(composedText) before the composer clears — the text
		// is also in the filled textarea before clearing, causing the assertion to pass prematurely
		// while the POST is still in-flight (race condition).
		await expect(composer).toHaveValue("");

		// After posting, the message appears in the chronological thread log.
		// Use .first() because the message appears in BOTH the chronological thread log
		// (host-thread-section) AND the inline anchored slot (anchored-messages).
		await expect(page.getByText(composedText).first()).toBeVisible();

		// The blockId was forwarded in the POST body
		expect(postedBlockId).not.toBeNull();

		// The message also renders inline after the block (inline-after-payload slot)
		await expect(page.getByTestId("anchored-messages")).toBeVisible();
	});
});
