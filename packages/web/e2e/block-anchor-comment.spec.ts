/**
 * L18 — Block-anchored comment Playwright e2e tests.
 *
 * AC coverage:
 *  - open Bet detail → focus a pitch block → open actions popover → "Comment on this block"
 *    → composer opens with prefilled blockId reference → post → message renders inline-after-payload
 */

import { expect, test } from "./fixtures";

const NOW = "2026-05-05T09:00:00.000Z";
const LATER = "2026-05-05T09:05:00.000Z";
const FOUNDER_ID = "u-founder";
const THREAD_ID = "t-bet-anchor";
const BET_ID = "bet-anchor-test";

function makeBetResponse() {
	return {
		id: BET_ID,
		title: "Block Anchor Test Bet",
		product: "Alpha",
		team: "Alpha Core",
		status: "completed",
		costAppetite: { minor: 100000, currency: "USD" },
		costActual: null,
		tokensActual: null,
		progress: { done: 0, total: 1 },
		description:
			"# Problem\n\nThis paragraph block will receive an anchored comment.\n\n## Solution\n\nAnother block here.",
		tasks: [],
	};
}

function makeThreadListResponse() {
	return { threads: [], nextCursor: null };
}

function makeCreateThreadResponse() {
	return {
		thread: {
			id: THREAD_ID,
			hostKind: "bet",
			hostId: BET_ID,
			initiatorId: FOUNDER_ID,
			participants: [FOUNDER_ID],
			pinned: false,
			resolvedAt: null,
			lastActiveAt: NOW,
			createdAt: NOW,
		},
		messages: [
			{
				id: "msg-init",
				threadId: THREAD_ID,
				senderId: FOUNDER_ID,
				type: "plain",
				payload: { text: "Thread started." },
				clientKey: "ck-init",
				deletedAt: null,
				redactedAt: null,
				resolvedAt: null,
				createdAt: NOW,
			},
		],
	};
}

test.describe("L18 — Block-anchored comment flow", () => {
	test("focus block → open popover → Discuss → composer prefilled → post → message inline after block", async ({
		page,
	}) => {
		let threadCreated = false;
		const postedMessages: Array<Record<string, unknown>> = [];
		let postedBlockId: string | null = null;
		const composedText = "This is my anchored comment on the block.";

		await page.route(`**/api/bets/${BET_ID}`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeBetResponse()),
			});
		});

		await page.route(`**/api/bets/${BET_ID}/artifact-thread-summary`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ summaries: [], totalCount: 0, truncated: false }),
			});
		});

		await page.route(`**/api/threads?**host_kind=bet**`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(
					threadCreated
						? { threads: [makeCreateThreadResponse().thread] }
						: makeThreadListResponse(),
				),
			});
		});

		await page.route("**/api/threads", async (route) => {
			if (route.request().method() === "POST") {
				threadCreated = true;
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify(makeCreateThreadResponse()),
				});
			} else {
				await route.continue();
			}
		});

		await page.route(`**/api/threads/${THREAD_ID}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						thread: makeCreateThreadResponse().thread,
						messages: postedMessages,
						headMessageId: null,
						nextMessagesCursor: null,
					}),
				});
			} else {
				await route.continue();
			}
		});

		await page.route(`**/api/threads/${THREAD_ID}/messages`, async (route) => {
			if (route.request().method() === "POST") {
				const body = route.request().postDataJSON() as {
					payload: { text: string; blockId?: string };
				};
				postedBlockId = body.payload.blockId ?? null;
				const msg = {
					id: "msg-anch-001",
					threadId: THREAD_ID,
					senderId: FOUNDER_ID,
					type: "plain",
					payload: { text: composedText, blockId: postedBlockId },
					clientKey: "ck-anch-001",
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: LATER,
				};
				postedMessages.push(msg);
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({ message: msg, thread: makeCreateThreadResponse().thread }),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto(`/work/bet/${BET_ID}`);

		// Find a block in the pitch and open its actions
		const firstBlock = page.locator("[data-ds-component='block']").first();
		await firstBlock.focus();
		await page.keyboard.press(" ");

		// The block actions menu should appear
		await expect(page.getByRole("menu", { name: /block actions/i })).toBeVisible();

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
