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

	test("Review page loads with review header and verdict toolbar", async ({ page }) => {
		await expect(page.getByRole("toolbar", { name: /verdict/i })).toBeVisible();
	});

	test("thread list shows review items", async ({ page }) => {
		await expect(page.getByText("Auth flow implementation")).toBeVisible();
		await expect(page.getByText("Dashboard metrics update")).toBeVisible();
	});

	test("clicking a different review thread switches the artifact view", async ({ page }) => {
		await page.getByText("Dashboard metrics update").click();
		// Should show data metrics artifact
		await expect(page.locator("[aria-label='Data metrics']")).toBeVisible();
	});

	test("ReviewHeader verdict buttons are visible", async ({ page }) => {
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

	test("Chat page loads with thread list", async ({ page }) => {
		await expect(page.getByLabel("Thread: Sprint planning")).toBeVisible();
	});

	test("Chat page shows messages for selected thread", async ({ page }) => {
		await expect(page.getByText("I've shaped three bets for the next cycle.")).toBeVisible();
	});

	test("switching threads shows different messages", async ({ page }) => {
		await page.getByLabel("Thread: Bug report: cost tracking").click();
		await expect(page.getByText("The weekly spend is miscalculated.")).toBeVisible();
	});

	test("chat message input is visible", async ({ page }) => {
		await expect(page.getByLabel("Chat message input")).toBeVisible();
	});
});
