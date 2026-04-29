/**
 * E2E tests for the Conversations section: Review page, Chat page,
 * thread selection, and ReviewHeader verdicts.
 */
import { expect, test } from "@playwright/test";

test.describe("Conversations Review", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/conversations/review");
		await page.waitForSelector("[data-testid='conversations-review-page']");
	});

	// L1: ConversationsReview was rewritten to mount <ThreadShell>; the legacy ReviewHeader/ReasoningBlockView/PREFILL_KEYS flow this case asserts no longer exists. New contract covered by packages/web/e2e/threads.spec.ts. J-track / L1b can rewrite or delete.
	test.skip("Review page loads with review header and verdict toolbar", async ({ page }) => {
		await expect(page.getByRole("toolbar", { name: /verdict/i })).toBeVisible();
	});

	// L1: ConversationsReview was rewritten to mount <ThreadShell>; the legacy ReviewHeader/ReasoningBlockView/PREFILL_KEYS flow this case asserts no longer exists. New contract covered by packages/web/e2e/threads.spec.ts. J-track / L1b can rewrite or delete.
	test.skip("review page shows the selected review's proposer and artifact", async ({ page }) => {
		// The review page renders the first mock review (Auth flow) by default.
		await expect(page.getByText("Developer Agent")).toBeVisible();
		// The diff artifact is visible in the main content.
		await expect(page.getByText("import { jwt } from 'hono/jwt';")).toBeVisible();
	});

	// L1: ConversationsReview was rewritten to mount <ThreadShell>; the legacy ReviewHeader/ReasoningBlockView/PREFILL_KEYS flow this case asserts no longer exists. New contract covered by packages/web/e2e/threads.spec.ts. J-track / L1b can rewrite or delete.
	test.skip("reasoning block is rendered for the review", async ({ page }) => {
		// ReasoningBlockView toggle is visible.
		await expect(page.getByRole("button", { name: /reasoning/i })).toBeVisible();
	});

	// L1: ConversationsReview was rewritten to mount <ThreadShell>; the legacy ReviewHeader/ReasoningBlockView/PREFILL_KEYS flow this case asserts no longer exists. New contract covered by packages/web/e2e/threads.spec.ts. J-track / L1b can rewrite or delete.
	test.skip("ReviewHeader verdict buttons are visible", async ({ page }) => {
		await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Request changes" })).toBeVisible();
	});
});

test.describe("Conversations Chat", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/conversations/chat");
		await page.waitForSelector("[data-testid='conversations-chat-page']");
	});

	test("Chat page loads with selected thread title", async ({ page }) => {
		// The chat page shows the first thread's title as a heading.
		await expect(page.getByText("Sprint planning")).toBeVisible();
	});

	test("Chat page shows messages for selected thread", async ({ page }) => {
		await expect(page.getByText("I've shaped three bets for the next cycle.")).toBeVisible();
	});

	test("messages are visible in the chat thread", async ({ page }) => {
		// The first thread "Sprint planning" is selected by default.
		await expect(page.getByText("I've shaped three bets for the next cycle.")).toBeVisible();
		// The "You" reply is also visible.
		await expect(page.getByText("Can you walk me through the auth bet?")).toBeVisible();
	});

	test("chat message input is visible", async ({ page }) => {
		await expect(page.getByLabel("Chat message input")).toBeVisible();
	});
});
