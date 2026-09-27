/**
 * Journey: legacy conversation URLs redirect to the canonical queue, and the
 * queue shows an honest empty state with nothing seeded.
 *
 * @lore The thread door is `POST /api/actions/search_threads` — never `GET /api/threads*`.
 */
import { expect, mockSearchThreads, test } from "./fixtures";

test.describe("Conversations canonical routes", () => {
	test.beforeEach(async ({ page }) => {
		await mockSearchThreads(page, { rows: [] });
	});

	test("/conversations renders the queue empty state", async ({ page }) => {
		await page.goto("/conversations");
		await expect(page.getByTestId("conversations-page")).toBeVisible();
		await expect(page.getByTestId("thread-sections-empty")).toBeVisible();
	});

	test("/conversations/review redirects to /conversations", async ({ page }) => {
		await page.goto("/conversations/review");
		await expect(page).toHaveURL(/\/conversations$/);
		await expect(page.getByTestId("conversations-page")).toBeVisible();
	});

	test("/conversations/chat redirects to /conversations", async ({ page }) => {
		await page.goto("/conversations/chat");
		await expect(page).toHaveURL(/\/conversations$/);
		await expect(page.getByTestId("conversations-page")).toBeVisible();
	});
});
