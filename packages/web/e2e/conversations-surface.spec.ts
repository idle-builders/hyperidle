/**
 * J4 — Conversations Surface E2E.
 *
 * Covers the user-visible acceptance criteria that the unit tests already
 * validate per component, but stitched together through the actual routes.
 */
import { expect, test } from "@playwright/test";

test.describe("J4 Conversations Surface — Review page", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/conversations/review");
		await page.waitForSelector("[data-testid='conversations-review-page']");
	});

	// L1: ConversationsReview was rewritten to mount <ThreadShell>; the legacy ReviewHeader/ReasoningBlockView/PREFILL_KEYS flow this case asserts no longer exists. New contract covered by packages/web/e2e/threads.spec.ts. J-track / L1b can rewrite or delete.
	test.skip("reasoning block is present, collapsed by default, and expands on click", async ({
		page,
	}) => {
		const trigger = page.getByRole("button", { name: /reasoning/i }).first();
		await expect(trigger).toBeVisible();
		await expect(trigger).toHaveAttribute("aria-expanded", "false");
		// Steps hidden initially
		await expect(page.getByRole("list", { name: /reasoning steps/i })).toHaveCount(0);
		await trigger.click();
		await expect(trigger).toHaveAttribute("aria-expanded", "true");
		const list = page.getByRole("list", { name: /reasoning steps/i });
		await expect(list).toBeVisible();
		const items = list.getByRole("listitem");
		// The default review mock has 5 reasoning steps
		await expect(items).toHaveCount(5);
	});

	// L1: ConversationsReview was rewritten to mount <ThreadShell>; the legacy ReviewHeader/ReasoningBlockView/PREFILL_KEYS flow this case asserts no longer exists. New contract covered by packages/web/e2e/threads.spec.ts. J-track / L1b can rewrite or delete.
	test.skip("artifact metadata strip renders the kind badge and status", async ({ page }) => {
		const strip = page.getByTestId("artifact-metadata-strip");
		await expect(strip).toBeVisible();
		await expect(strip).toContainText("text_diff");
		await expect(strip).toContainText("pending");
	});

	// L1: ConversationsReview was rewritten to mount <ThreadShell>; the legacy ReviewHeader/ReasoningBlockView/PREFILL_KEYS flow this case asserts no longer exists. New contract covered by packages/web/e2e/threads.spec.ts. J-track / L1b can rewrite or delete.
	test.skip("Pause button is visible because the default review is blocking", async ({ page }) => {
		const toolbar = page.getByRole("toolbar", { name: /verdict/i });
		await expect(toolbar.getByRole("button", { name: /^pause$/i })).toBeVisible();
		// Required verdicts always visible
		await expect(toolbar.getByRole("button", { name: "Approve" })).toBeVisible();
		await expect(toolbar.getByRole("button", { name: "Request changes" })).toBeVisible();
		await expect(toolbar.getByRole("button", { name: "Reject" })).toBeVisible();
	});
});

test.describe("J4 Conversations Surface — Chat page", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/conversations/chat");
		await page.waitForSelector("[data-testid='conversations-chat-page']");
	});

	test("chat mode does not render a verdict toolbar", async ({ page }) => {
		await expect(page.getByRole("toolbar", { name: /verdict/i })).toHaveCount(0);
	});

	test("chat mode shows inline artifact preview for messages that carry one", async ({ page }) => {
		await expect(page.getByTestId("chat-artifact-preview").first()).toBeVisible();
	});
});
