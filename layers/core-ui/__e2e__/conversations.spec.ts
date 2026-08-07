/**
 * E2E tests for the Conversations section.
 *
 * L9: ConversationsReview and ConversationsChat are replaced by the single
 * Conversations page. Legacy routes redirect to the canonical surface.
 * Detailed coverage lives in L9-single-detail.spec.ts and threads.spec.ts.
 */
import { expect, test } from "./fixtures";

test.describe("Conversations — canonical routes (L9)", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/threads?**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: [], nextCursor: null }),
			});
		});
	});

	test("/conversations renders the queue empty state", async ({ page }) => {
		await page.goto("/conversations");
		await expect(page.getByTestId("conversations-page")).toBeVisible();
		await expect(page.getByTestId("conversations-empty")).toBeVisible();
	});

	test("/conversations/review redirects to /conversations (AC-1)", async ({ page }) => {
		await page.goto("/conversations/review");
		await expect(page).toHaveURL(/\/conversations$/);
		await expect(page.getByTestId("conversations-page")).toBeVisible();
	});

	test("/conversations/chat redirects to /conversations (AC-1)", async ({ page }) => {
		await page.goto("/conversations/chat");
		await expect(page).toHaveURL(/\/conversations$/);
		await expect(page.getByTestId("conversations-page")).toBeVisible();
	});
});
