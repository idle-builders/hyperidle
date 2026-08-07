/**
 * L7 — Thread response E2E (plan §6 T10, approved.md §10).
 *
 * Full loop:
 *   1. Load thread with a review HEAD.
 *   2. Click a verdict button.
 *   3. First commit returns 500 → error row + Retry visible.
 *   4. Click Retry; second commit returns 201 → bar unmounts (head resolves).
 *
 * The agent-event side of the contract is asserted in the unit tests
 * (`AgentResponseRouter.test.ts` + `await-thread-response.test.ts`); the
 * Playwright spec only proves the user-facing loop end-to-end.
 */

import { expect, test } from "./fixtures";

const THREAD_ID = "demo-thread-1";

const THREAD = {
	id: THREAD_ID,
	hostKind: "task",
	hostId: "task-1",
	initiatorId: "agent-1",
	participants: ["u-founder", "agent-1"],
	pinned: false,
	resolvedAt: null,
	lastActiveAt: "2026-04-29T12:00:00.000Z",
	createdAt: "2026-04-29T12:00:00.000Z",
};

const REVIEW_MESSAGE = {
	id: "m-rev",
	threadId: THREAD_ID,
	senderId: "agent-1",
	clientKey: "k-rev",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-29T12:00:00.000Z",
	type: "review",
	payload: {
		title: "Pricing overhaul",
		reasoning: ["Reduces churn"],
		artifactRef: { id: "art-1", kind: "text_diff" },
	},
};

test.describe("L7 — thread response loop (error → retry → success)", () => {
	test("error then retry: 500 surfaces the error row, retry succeeds and bar unmounts", async ({
		page,
	}) => {
		let postAttempt = 0;
		await page.route(`**/api/threads/${THREAD_ID}`, async (route) => {
			if (route.request().method() !== "GET") {
				await route.fallback();
				return;
			}
			const resolvedAt = postAttempt >= 2 ? "2026-04-29T12:01:00.000Z" : null;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					thread: { ...THREAD, resolvedAt },
					messages: [resolvedAt ? { ...REVIEW_MESSAGE, resolvedAt } : REVIEW_MESSAGE],
					headMessageId: resolvedAt ? null : REVIEW_MESSAGE.id,
					nextMessagesCursor: null,
				}),
			});
		});

		await page.route(`**/api/threads/${THREAD_ID}/messages`, async (route) => {
			postAttempt += 1;
			if (postAttempt === 1) {
				await route.fulfill({ status: 500, body: "boom" });
				return;
			}
			await route.fulfill({
				status: 201,
				contentType: "application/json",
				body: JSON.stringify({
					message: { ...REVIEW_MESSAGE, id: "m-verdict", type: "verdict" },
					thread: { ...THREAD, resolvedAt: "2026-04-29T12:01:00.000Z" },
				}),
			});
		});

		await page.goto(`/conversations/${THREAD_ID}`);
		await page.waitForSelector("[data-testid='conversations-page']");

		// Click Approve.
		await page.getByRole("button", { name: "Approve", exact: true }).click();

		// Error row appears with the 5xx copy + Retry control.
		await expect(page.getByText(/Server couldn't record this response/i)).toBeVisible();
		// Click the card-level Retry (inside RichMessageCard), not the page-level error state retry.
		await page.getByTestId("rich-message-card").getByRole("button", { name: "Retry" }).click();

		// On success the verdict bar unmounts (the head is resolved).
		await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
	});

	test("async ack toast appears on a non-resolving commit", async ({ page }) => {
		await page.route(`**/api/threads/${THREAD_ID}`, async (route) => {
			if (route.request().method() !== "GET") {
				await route.fallback();
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					thread: THREAD,
					messages: [REVIEW_MESSAGE],
					headMessageId: REVIEW_MESSAGE.id,
					nextMessagesCursor: null,
				}),
			});
		});

		await page.route(`**/api/threads/${THREAD_ID}/messages`, async (route) => {
			await route.fulfill({
				status: 201,
				contentType: "application/json",
				body: JSON.stringify({
					message: { id: "m-plain", type: "plain" },
					thread: { ...THREAD, resolvedAt: null },
				}),
			});
		});

		await page.goto(`/conversations/${THREAD_ID}`);
		await page.waitForSelector("[data-testid='conversations-page']");
		await page.getByRole("button", { name: "Approve", exact: true }).click();
		await expect(
			page.getByText(/Response recorded — agent will pick it up on next session\./i),
		).toBeVisible();
	});
});
