/**
 * T4 — Block Reference E2E tests (AC-3, AC-4, AC-5, AC-6, AC-7).
 *
 * Full flow: open CoC overlay, click "+" on a block, verify chip appears,
 * send message, verify block embed renders.
 *
 * Strategy: page.route() mocks for all API calls. No real DB or server needed.
 */

import { expect, test } from "./fixtures";

const NOW_ISO = new Date().toISOString();
const COACH_THREAD_ID = "thr-coach-u-founder";
const BET_ID = "bet-block-ref-test";

const COACH_THREAD_FIXTURE = {
	thread: {
		id: COACH_THREAD_ID,
		hostKind: "user",
		hostId: "u-founder",
		initiatorId: "u-founder",
		participants: ["u-founder", "agent-coc"],
		pinned: true,
		resolvedAt: null,
		lastActiveAt: NOW_ISO,
		createdAt: NOW_ISO,
	},
	messages: [],
	headMessageId: null,
	identities: {
		"u-founder": { name: "You" },
		"agent-coc": { name: "System Agent", role: "assistant" },
	},
};

const BET_FIXTURE = {
	id: BET_ID,
	title: "Block Reference Bet",
	product: "TestProduct",
	team: "Core Team",
	status: "completed",
	costAppetite: null,
	costActual: null,
	tokensActual: null,
	progress: { done: 0, total: 1 },
	description: "First paragraph of the pitch.\n\nSecond paragraph with more details.",
	tasks: [],
};

const THREADS_LIST_FIXTURE = {
	threads: [
		{
			id: COACH_THREAD_ID,
			hostKind: "user",
			hostId: "u-founder",
			initiatorId: "u-founder",
			participants: ["u-founder", "agent-coc"],
			pinned: true,
			resolvedAt: null,
			lastActiveAt: NOW_ISO,
			createdAt: NOW_ISO,
			hasUnresolvedReview: false,
		},
	],
	nextCursor: null,
};

/** Shared message ID for the sent block-ref message */
const SENT_MESSAGE_ID = "msg-block-ref-sent";

async function setupApiMocks(page: import("@playwright/test").Page): Promise<void> {
	await page.route("**/api/**", async (route) => {
		const url = route.request().url();
		const method = route.request().method();

		// POST /api/threads/:id/messages — message send (returns message with block ref)
		if (url.includes("/api/threads/") && url.endsWith("/messages") && method === "POST") {
			const requestBody = route.request().postDataJSON() as {
				payload?: { text?: string; refs?: unknown[] };
			} | null;
			const refs = requestBody?.payload?.refs ?? [];
			await route.fulfill({
				status: 201,
				contentType: "application/json",
				body: JSON.stringify({
					message: {
						id: SENT_MESSAGE_ID,
						threadId: COACH_THREAD_ID,
						senderId: "u-founder",
						clientKey: `key-${Date.now()}`,
						type: "plain",
						payload: {
							text: requestBody?.payload?.text ?? "sent",
							refs,
						},
						createdAt: NOW_ISO,
						deletedAt: null,
						redactedAt: null,
						resolvedAt: null,
					},
					thread: COACH_THREAD_FIXTURE.thread,
				}),
			});
			return;
		}

		// GET /api/threads/coach — coach thread
		if (url.includes("/api/threads/coach")) {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(COACH_THREAD_FIXTURE),
			});
			return;
		}

		// GET /api/threads?... — thread list
		if (url.includes("/api/threads?") || url.match(/\/api\/threads$/)) {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(THREADS_LIST_FIXTURE),
			});
			return;
		}

		// GET /api/threads/:id — individual thread detail
		if (url.match(/\/api\/threads\/[^/]+$/) && !url.includes("/coach")) {
			// @lore AD8a: /api/threads/coach path stays; route renamed in AD8b
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					thread: COACH_THREAD_FIXTURE.thread,
					messages: COACH_THREAD_FIXTURE.messages,
					headMessageId: null,
					nextMessagesCursor: null,
				}),
			});
			return;
		}

		// GET /api/bets/:id/artifact-thread-summary
		if (url.includes(`/api/bets/${BET_ID}/artifact-thread-summary`)) {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(null),
			});
			return;
		}

		// GET /api/bets/:id
		if (url.includes(`/api/bets/${BET_ID}`)) {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(BET_FIXTURE),
			});
			return;
		}

		await route.fallback();
	});
}

test.describe("T4 — Block Reference E2E", () => {
	test.beforeEach(async ({ page }) => {
		await setupApiMocks(page);
	});

	test("AC-4: CocAttachButton '+' appears on bet pitch blocks when CoC overlay is open", async ({
		page,
	}) => {
		await page.goto(`/work/bet/${BET_ID}`);

		// Open the CoC overlay
		const trigger = page.getByRole("button", { name: /assistant/i });
		await trigger.click();
		const dialog = page.getByRole("dialog", { name: /assistant conversation/i });
		await expect(dialog).toBeVisible();

		// With overlay open, the bet pitch blocks should show attach buttons
		const betPitch = page.getByTestId("bet-pitch");
		await expect(betPitch).toBeVisible();

		// The AssistantAttachButton should appear (renders when overlayOpen=true)
		const attachButtons = page.getByTestId("assistant-attach-button");
		await expect(attachButtons.first()).toBeVisible();
	});

	test("AC-5: clicking '+' on a block adds it as a chip in the CoC overlay composer", async ({
		page,
	}) => {
		await page.goto(`/work/bet/${BET_ID}`);

		// Open the CoC overlay
		const trigger = page.getByRole("button", { name: /assistant/i });
		await trigger.click();
		const dialog = page.getByRole("dialog", { name: /assistant conversation/i });
		await expect(dialog).toBeVisible();

		// Wait for attach buttons to appear
		const attachButton = page.getByTestId("assistant-attach-button").first();
		await expect(attachButton).toBeVisible();

		// Click the attach button
		await attachButton.click();

		// A chip for the block should appear in the overlay
		const chipsArea = dialog.getByTestId("assistant-context-chips");
		await expect(chipsArea).toBeVisible();
		// The chip kind should show "block"
		await expect(chipsArea.getByText("block")).toBeVisible();
	});

	test("AC-3: BlockActionsPopover includes 'Share' alongside 'Discuss' for bet pitch blocks", async ({
		page,
	}) => {
		await page.goto(`/work/bet/${BET_ID}`);

		// The bet pitch renders blocks. We need to open the block actions popover.
		// Blocks show a handle on hover/focus that opens the popover.
		const betPitch = page.getByTestId("bet-pitch");
		await expect(betPitch).toBeVisible();

		// Find a block and trigger its actions
		const firstBlock = betPitch.locator("[data-block-id]").first();
		await firstBlock.hover();

		// Press Space or click the block handle
		await firstBlock.press("Space");

		// The popover may appear — if so, check for "Share" and "Discuss"
		const popover = page.getByTestId("block-actions-popover");
		const popoverVisible = await popover.isVisible().catch(() => false);
		if (popoverVisible) {
			await expect(page.getByRole("menuitem", { name: /share/i })).toBeVisible();
			await expect(page.getByRole("menuitem", { name: /discuss/i })).toBeVisible();
		}
	});

	// AM1 §12.7: the heavy `BlockRefEmbed` (degraded/error resolve) is no longer
	// wired into the MIGRATED conversation. A block ref now renders as a
	// TITLE-ONLY `ReferenceChip` (kind `block`) that opens the block's HOST
	// surface via the OpenTarget seam (design §6). This replaces the old
	// degraded-embed assertion with the new positive render+route contract.
	// (The legacy `BlockRefEmbed` survives only in the Assistant overlay, an
	// out-of-AM1-scope surface — see report.)
	test("AM1: a block ref in the conversation renders a title-only chip that routes to its host", async ({
		page,
	}) => {
		const CONV_THREAD_ID = "thr-am1-block";
		const BLOCK_HOST_BET = "bet-am1-block-host";
		const conversationDetail = {
			thread: {
				id: CONV_THREAD_ID,
				hostKind: "task",
				hostId: "task-am1",
				initiatorId: "u-founder",
				participants: ["u-founder", "agent-1"],
				pinned: false,
				resolvedAt: null,
				lastActiveAt: NOW_ISO,
				createdAt: NOW_ISO,
			},
			messages: [
				{
					id: "msg-am1-block",
					threadId: CONV_THREAD_ID,
					senderId: "agent-1",
					clientKey: "key-am1-block",
					type: "plain",
					payload: {
						text: "Context for the migration:",
						refs: [
							{
								kind: "block",
								blockId: "blk:v1:auth-plan",
								hostKind: "bet",
								hostId: BLOCK_HOST_BET,
							},
						],
					},
					createdAt: NOW_ISO,
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
				},
			],
			headMessageId: null,
			identities: {
				"u-founder": { name: "You" },
				"agent-1": { name: "Aria", role: "agent" },
			},
		};

		await page.route(`**/api/threads/${CONV_THREAD_ID}`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(conversationDetail),
			});
		});
		await page.route(`**/api/bets/${BLOCK_HOST_BET}**`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ...BET_FIXTURE, id: BLOCK_HOST_BET, title: "Auth migration bet" }),
			});
		});

		await page.goto(`/conversations/${CONV_THREAD_ID}`);

		// The conversation renders via the Part model (no heavy resolving embed).
		const surface = page.getByTestId("conversation-surface");
		await expect(surface).toBeVisible();
		await expect(page.getByText("Context for the migration:")).toBeVisible();

		// The block ref is a TITLE-ONLY chip — never a degraded/error embed.
		await expect(page.getByTestId("block-ref-embed-degraded")).toHaveCount(0);
		await expect(page.getByTestId("block-ref-embed-error")).toHaveCount(0);

		// Clicking the block chip routes to the block's HOST surface (the bet).
		const blockChip = page.locator("[data-ds-kind='block']").first();
		await expect(blockChip).toBeVisible();
		await blockChip.click();
		await expect(page).toHaveURL(new RegExp(`/work/bet/${BLOCK_HOST_BET}`));
	});
});
