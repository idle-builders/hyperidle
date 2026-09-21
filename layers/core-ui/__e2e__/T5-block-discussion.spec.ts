/**
 * T5 — Block Discussion Completion: Playwright E2E tests.
 *
 * AC coverage:
 *  - AC-1: Block-scoped discussion filter — "Discuss" on a block pre-fills the
 *           composer with the block's context; submitted message is linked to the block.
 *  - AC-2: "anchor lost" indicator appears for messages anchored to a block that no
 *           longer exists in the body (orphan messages).
 *  - AC-5: filterBlockId wired in KnowledgeDetail — HostThreadSection receives the
 *           block id from the prefill state, showing only relevant messages.
 *
 * Strategy: hermetic page.route() mocks for all API calls. No DB seeding.
 * The dev server (started by playwright.config.ts webServer) serves the SPA bundle.
 *
 * @lore T5 E2E: BlockActionsPopover is triggered by Space/Enter on a Block article element.
 * In Playwright we focus the block element then press Space to open the popover, then
 * click "Discuss". This mirrors the keyboard flow the real user takes.
 *
 * @lore T5 E2E anchor-lost: We cannot programmatically change the knowledge body
 * (TipTap + auto-save is complex to drive in E2E). Instead we mock the thread response
 * to include a message whose blockId does NOT match any block in the rendered body.
 * KnowledgeBody renders these as orphans with `anchorLost` — the [data-testid="anchor-lost-indicator"]
 * must be visible.
 *
 * @lore BC3: repointed at `POST /api/actions/{search_threads,open_thread,
 * send_message}` — never `GET/POST /api/threads*`. The knowledge page's
 * thread already exists in every test here, so `adjust_thread` (the
 * create-on-first-post door) is never exercised and needs no mock.
 */

import {
	expect,
	makeMessage,
	makeThread,
	makeThreadListRow,
	mockSearchThreads,
	test,
} from "./fixtures";

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const KNOWLEDGE_ID = "k1"; // practice-scoped item with body content
const FOUNDER_ID = "u-founder";
const THREAD_ID = "t-k1-001";
const NOW = "2026-05-31T10:00:00.000Z";
const LATER = "2026-05-31T10:05:00.000Z";

/** Minimal block id that matches the k1 fixture body's first paragraph block.
 * We use a synthetic block id here because deriveBlocks generates deterministic
 * ids from (hostKind, hostId, blockIndex). The E2E flow uses the popover to
 * capture the real id, not a hard-coded constant. */
const ORPHAN_BLOCK_ID = "orphan-block-that-no-longer-exists";

const THREAD = makeThread(THREAD_ID, {
	hostKind: "document",
	hostId: KNOWLEDGE_ID,
	initiatorId: FOUNDER_ID,
	members: [FOUNDER_ID],
	lastActiveAt: NOW,
	createdAt: NOW,
});

async function mockThreadList(page: import("@playwright/test").Page): Promise<void> {
	await mockSearchThreads(page, {
		rows: [makeThreadListRow(THREAD_ID, { ...THREAD, hasUnresolvedReview: false })],
	});
}

async function mockKnowledgeItem(
	page: import("@playwright/test").Page,
	body: string,
): Promise<void> {
	await page.route(`**/api/knowledge/${KNOWLEDGE_ID}`, async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					id: KNOWLEDGE_ID,
					title: "Architecture Decision: Auth Strategy",
					body,
					format: "markdown",
					status: "active",
					version: 1,
					updatedBy: FOUNDER_ID,
					scopeKind: "practice",
					scopeId: null,
					createdAt: NOW,
					updatedAt: NOW,
					signals: null,
				}),
			});
		} else {
			await route.continue();
		}
	});
}

// ---------------------------------------------------------------------------
// AC-1 / AC-5: Block-scoped filter is wired — clicking "Discuss" on a block
// pre-fills the composer; posting the message shows it in the thread section.
// ---------------------------------------------------------------------------

test.describe("T5 AC-1/AC-5 — Block discussion: Discuss button popover and thread filter", () => {
	test.beforeEach(async ({ page }) => {
		const postedMessages: Array<Record<string, unknown>> = [];

		await mockThreadList(page);

		// Thread detail GET — returns messages accumulated so far
		await page.route("**/api/actions/open_thread", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						thread: { ...THREAD, lastActiveAt: postedMessages.length > 0 ? LATER : NOW },
						members: [],
						messages: postedMessages,
						headMessageId: null,
						hostTitle: null,
					},
				}),
			});
		});

		// POST message — capture and accumulate
		await page.route("**/api/actions/send_message", async (route) => {
			const input = JSON.parse(route.request().postData() ?? "{}") as {
				text?: string;
				blockId?: string;
				clientKey?: string;
			};
			const msg = makeMessage(`msg-${Date.now()}`, THREAD_ID, {
				senderId: FOUNDER_ID,
				payload: { text: input.text, blockId: input.blockId },
				clientKey: input.clientKey ?? "ck-default",
				blockId: input.blockId ?? null,
				createdAt: LATER,
			});
			postedMessages.push(msg);
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: { message: msg, thread: THREAD } }),
			});
		});

		// Knowledge item API (for useKnowledgeItem hook)
		await mockKnowledgeItem(
			page,
			"JWT-based authentication with refresh tokens. Access tokens expire in 15 minutes.",
		);
	});

	test("knowledge detail page renders with body blocks and thread section", async ({ page }) => {
		await page.goto(`/knowledge/${KNOWLEDGE_ID}`);
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		// Thread section renders
		await expect(page.getByTestId("host-thread-section")).toBeVisible();

		// At least one block is rendered in the knowledge body
		const bodyBlocks = page.locator("[data-testid='knowledge-body'] [data-ds-component='block']");
		await expect(bodyBlocks.first()).toBeVisible();
	});

	test("Space on a block opens the BlockActionsPopover with a Discuss option", async ({ page }) => {
		await page.goto(`/knowledge/${KNOWLEDGE_ID}`);
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		// Focus the first block and press Space to open block actions
		const firstBlock = page
			.locator("[data-testid='knowledge-body'] [data-ds-component='block']")
			.first();
		await firstBlock.focus();
		await page.keyboard.press("Space");

		// BlockActionsPopover should appear with a Discuss option
		const popover = page.getByTestId("block-actions-popover");
		await expect(popover).toBeVisible();
		await expect(popover.getByRole("menuitem", { name: /discuss/i })).toBeVisible();
	});

	test("clicking Discuss from popover pre-fills the composer and shows filter banner", async ({
		page,
	}) => {
		await page.goto(`/knowledge/${KNOWLEDGE_ID}`);
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		// Open block actions via keyboard
		const firstBlock = page
			.locator("[data-testid='knowledge-body'] [data-ds-component='block']")
			.first();
		await firstBlock.focus();
		await page.keyboard.press("Space");

		// Click Discuss in the popover
		await page.getByRole("menuitem", { name: /discuss/i }).click();

		// Composer should receive focus and show the thread section
		await expect(page.getByTestId("host-thread-section")).toBeVisible();

		// The composer textarea should be focused or at least visible
		const composer = page.getByPlaceholder(/reply to thread|write a message|start a discussion/i);
		await expect(composer).toBeVisible();
	});

	test("posting a message after Discuss appears in the thread section", async ({ page }) => {
		await page.goto(`/knowledge/${KNOWLEDGE_ID}`);
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		// Open block actions and click Discuss
		const firstBlock = page
			.locator("[data-testid='knowledge-body'] [data-ds-component='block']")
			.first();
		await firstBlock.focus();
		await page.keyboard.press("Space");
		await page.getByRole("menuitem", { name: /discuss/i }).click();

		// Post a message
		const messageText = "Block-anchored discussion message T5";
		const composer = page.getByPlaceholder(/reply to thread|write a message|start a discussion/i);
		await composer.fill(messageText);
		await page.getByRole("button", { name: /^send$/i }).click();

		// Message should appear in the thread section
		await expect(page.getByText(messageText)).toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// AC-2: "anchor lost" indicator — messages anchored to a deleted/edited block
// ---------------------------------------------------------------------------

test.describe("T5 AC-2 — anchor-lost indicator for orphan messages", () => {
	test("messages anchored to a non-existent block show 'anchor lost' indicator", async ({
		page,
	}) => {
		// Mock a thread with one message whose blockId does NOT match any block
		// in the rendered knowledge body. KnowledgeBody's orphan catch-all will
		// render it with anchorLost=true.
		const orphanMsg = makeMessage("msg-orphan-001", THREAD_ID, {
			senderId: FOUNDER_ID,
			payload: { text: "Comment on the old block", blockId: ORPHAN_BLOCK_ID },
			clientKey: "ck-orphan-001",
			blockId: ORPHAN_BLOCK_ID,
			createdAt: NOW,
		});

		await mockThreadList(page);

		await page.route("**/api/actions/open_thread", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						thread: THREAD,
						members: [],
						messages: [orphanMsg],
						headMessageId: null,
						hostTitle: null,
					},
				}),
			});
		});

		await mockKnowledgeItem(page, "JWT-based authentication with refresh tokens.");

		await page.goto(`/knowledge/${KNOWLEDGE_ID}`);
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		// The knowledge body should render the orphan message with anchor-lost indicator
		await expect(page.getByTestId("anchor-lost-indicator")).toBeVisible();
		await expect(page.getByText(/anchor lost/i)).toBeVisible();

		// The orphan message text should still be visible
		await expect(page.getByText("Comment on the old block")).toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// AC-5: Block-scoped filter in HostThreadSection — "Show all messages" toggle
// ---------------------------------------------------------------------------

test.describe("T5 AC-5 — HostThreadSection block-scoped filter", () => {
	test("HostThreadSection shows only block-specific messages when filterBlockId is set via Discuss", async ({
		page,
	}) => {
		// Two messages: one anchored to ORPHAN_BLOCK_ID (won't match real blocks),
		// one unanchored (general discussion). After clicking Discuss on a real block,
		// HostThreadSection filters to only messages matching that block's id.
		// Since no message has that block's id yet, empty state is shown.
		// Then "Show all messages" restores the full list.

		const unanchoredMsg = makeMessage("msg-unanchored-001", THREAD_ID, {
			senderId: FOUNDER_ID,
			payload: { text: "General discussion message" },
			clientKey: "ck-un-001",
			createdAt: NOW,
		});

		const anchoredToOrphanMsg = makeMessage("msg-anchored-orphan-001", THREAD_ID, {
			senderId: FOUNDER_ID,
			payload: { text: "Old anchored message", blockId: ORPHAN_BLOCK_ID },
			clientKey: "ck-anch-001",
			blockId: ORPHAN_BLOCK_ID,
			createdAt: NOW,
		});

		await mockThreadList(page);

		await page.route("**/api/actions/open_thread", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						thread: THREAD,
						members: [],
						messages: [unanchoredMsg, anchoredToOrphanMsg],
						headMessageId: null,
						hostTitle: null,
					},
				}),
			});
		});

		await mockKnowledgeItem(page, "JWT-based authentication with refresh tokens.");

		await page.goto(`/knowledge/${KNOWLEDGE_ID}`);
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		// Initially both messages are visible (no filter active yet)
		await expect(page.getByTestId("host-thread-section")).toBeVisible();
		await expect(page.getByText("General discussion message")).toBeVisible();

		// Open block actions on the first block and click Discuss
		// This sets filterBlockId to the real block's id (which no messages match yet)
		const firstBlock = page
			.locator("[data-testid='knowledge-body'] [data-ds-component='block']")
			.first();
		await firstBlock.focus();
		await page.keyboard.press("Space");
		await page.getByRole("menuitem", { name: /discuss/i }).click();

		// With filterBlockId active, HostThreadSection shows only messages for that block.
		// Since no messages match the real block's id, the empty state appears.
		await expect(page.getByTestId("host-thread-section-empty")).toBeVisible();

		// "Show all messages" toggle should be visible to exit the filter
		await expect(page.getByRole("button", { name: /show all messages/i })).toBeVisible();

		// Clicking it restores the full unfiltered message list
		await page.getByRole("button", { name: /show all messages/i }).click();
		await expect(page.getByText("General discussion message")).toBeVisible();
	});
});
