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
 *
 * @lore BC3: repointed at `POST /api/actions/{open_thread,send_message}` —
 * never `GET/POST /api/threads*`. Both tests here are already on
 * `known-pre-existing-failures.ts` (AM1 removed RichMessageCard/inline-verdict
 * from the conversation surface) — this is a mechanical mock migration only.
 */

import { expect, test } from "./fixtures";

const THREAD_ID = "demo-thread-1";

const THREAD = {
	id: THREAD_ID,
	hostKind: "team",
	hostId: "task-1",
	initiatorId: "agent-1",
	members: ["u-founder", "agent-1"],
	title: null,
	computedTitle: "Pricing overhaul",
	pinned: false,
	resolvedAt: null,
	deletedAt: null,
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
	},
};

test.describe("L7 — thread response loop (error → retry → success)", () => {
	test("error then retry: 500 surfaces the error row, retry succeeds and bar unmounts", async ({
		page,
	}) => {
		let postAttempt = 0;
		await page.route("**/api/actions/open_thread", async (route) => {
			const resolvedAt = postAttempt >= 2 ? "2026-04-29T12:01:00.000Z" : null;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						thread: { ...THREAD, resolvedAt },
						members: [],
						messages: [resolvedAt ? { ...REVIEW_MESSAGE, resolvedAt } : REVIEW_MESSAGE],
						headMessageId: resolvedAt ? null : REVIEW_MESSAGE.id,
						hostTitle: null,
					},
				}),
			});
		});

		await page.route("**/api/actions/send_message", async (route) => {
			postAttempt += 1;
			if (postAttempt === 1) {
				await route.fulfill({ status: 500, body: "boom" });
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						message: { ...REVIEW_MESSAGE, id: "m-verdict", type: "verdict" },
						thread: { ...THREAD, resolvedAt: "2026-04-29T12:01:00.000Z" },
					},
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
		await page.route("**/api/actions/open_thread", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						thread: THREAD,
						members: [],
						messages: [REVIEW_MESSAGE],
						headMessageId: REVIEW_MESSAGE.id,
						hostTitle: null,
					},
				}),
			});
		});

		await page.route("**/api/actions/send_message", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						message: { id: "m-plain", type: "plain" },
						thread: { ...THREAD, resolvedAt: null },
					},
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
