/**
 * L18 — Task thread Playwright e2e tests.
 *
 * AC coverage:
 *  - open task detail → thread renders inline → post → message appears
 */

import { expect, test } from "./fixtures";

const NOW = "2026-05-05T09:00:00.000Z";
const LATER = "2026-05-05T09:05:00.000Z";
const FOUNDER_ID = "u-founder";
const THREAD_ID = "t-task-001";
const TASK_ID = "task-kanban-001";

function makeThreadListResponse() {
	return {
		threads: [
			{
				id: THREAD_ID,
				hostKind: "task",
				hostId: TASK_ID,
				initiatorId: FOUNDER_ID,
				participants: [FOUNDER_ID],
				pinned: false,
				resolvedAt: null,
				lastActiveAt: NOW,
				createdAt: NOW,
				hasUnresolvedReview: false,
			},
		],
		nextCursor: null,
	};
}

function makeThreadDetailResponse(messages: Array<Record<string, unknown>>) {
	return {
		thread: {
			id: THREAD_ID,
			hostKind: "task",
			hostId: TASK_ID,
			initiatorId: FOUNDER_ID,
			participants: [FOUNDER_ID],
			pinned: false,
			resolvedAt: null,
			lastActiveAt: messages.length > 0 ? LATER : NOW,
			createdAt: NOW,
		},
		messages,
		headMessageId: null,
		nextMessagesCursor: null,
	};
}

test.describe("L18 — Task detail thread surface", () => {
	test("task detail renders inline thread and posts a message", async ({ page }) => {
		const postedMessages: Array<Record<string, unknown>> = [];
		let postObserved = false;
		const composedText = "Task thread comment posted inline.";

		await page.route(`**/api/threads?**host_kind=task**`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeThreadListResponse()),
			});
		});

		await page.route(`**/api/threads/${THREAD_ID}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeThreadDetailResponse(postObserved ? postedMessages : [])),
				});
			} else {
				await route.continue();
			}
		});

		await page.route(`**/api/threads/${THREAD_ID}/messages`, async (route) => {
			if (route.request().method() === "POST") {
				const msg = {
					id: "msg-task-001",
					threadId: THREAD_ID,
					senderId: FOUNDER_ID,
					type: "plain",
					payload: { text: composedText },
					clientKey: "ck-task-001",
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: LATER,
				};
				postedMessages.push(msg);
				postObserved = true;
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({
						message: msg,
						thread: makeThreadDetailResponse(postedMessages).thread,
					}),
				});
			} else {
				await route.continue();
			}
		});

		await page.route("**/api/bets/b1", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					id: "b1",
					title: "User auth flow",
					product: "Alpha",
					team: "Alpha Core",
					status: "committed",
					costAppetite: { minor: 100000, currency: "USD" },
					costActual: null,
					tokensActual: null,
					progress: { done: 1, total: 3 },
					description: "# Problem\n\nAuth is broken.\n",
					tasks: [
						{
							id: TASK_ID,
							betId: "b1",
							title: "Implement login endpoint",
							ownerAgentId: "agent-dev-1",
							state: "in_progress",
							costActual: { minor: 100, currency: "USD" },
							costCap: null,
							latestSessionOutcome: null,
							latestSessionCost: null,
							latestSessionTokensInput: null,
							latestSessionTokensOutput: null,
							latestSessionHarnessUrl: null,
						},
					],
				}),
			}),
		);

		await page.route(`**/api/tasks/${TASK_ID}/sessions`, (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ sessions: [] }),
			}),
		);

		await page.goto(`/work/bet/b1/task/${TASK_ID}`);
		await expect(page.getByTestId("task-detail-page")).toBeVisible();

		await expect(page.getByTestId("host-thread-section")).toBeVisible();

		const composer = page.getByPlaceholder(/reply to thread|write a message|start a discussion/i);
		await composer.fill(composedText);
		await page.getByRole("button", { name: /^send$/i }).click();

		await expect(page.getByText(composedText)).toBeVisible();
	});
});
