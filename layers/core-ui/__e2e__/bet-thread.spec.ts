/**
 * L18 — Bet thread Playwright e2e tests.
 *
 * AC coverage:
 *  - open Bet detail → thread surface shows → post a comment → reload → message persists
 */

import { expect, test } from "./fixtures";

const NOW = "2026-05-05T09:00:00.000Z";
const LATER = "2026-05-05T09:05:00.000Z";
const FOUNDER_ID = "u-founder";
const THREAD_ID = "t-bet-001";
const BET_ID = "bet-thread-test";

function makeBetResponse() {
	return {
		id: BET_ID,
		title: "Auth Flow Bet",
		product: "Alpha",
		team: "Alpha Core",
		status: "in_progress",
		tokensActual: null,
		progress: { done: 2, total: 5 },
		description: "# Problem\n\nThis bet has a discussion thread.\n",
		tasks: [],
	};
}

function makeThreadListResponse() {
	return {
		threads: [
			{
				id: THREAD_ID,
				hostKind: "bet",
				hostId: BET_ID,
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
			hostKind: "bet",
			hostId: BET_ID,
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

test.describe("L18 — Bet detail thread surface", () => {
	test("thread surface shows on bet detail; post a comment; reload; message persists", async ({
		page,
	}) => {
		const postedMessages: Array<Record<string, unknown>> = [];
		let postObserved = false;
		const composedText = "This is a test comment on the bet thread.";

		// Mock /api/bets/:id

		// Mock GET /api/threads?host_kind=bet&host_id=...
		await page.route(`**/api/threads?**host_kind=bet**`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeThreadListResponse()),
			});
		});

		// Mock GET /api/threads/:id
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

		// Mock POST /api/threads/:id/messages
		await page.route(`**/api/threads/${THREAD_ID}/messages`, async (route) => {
			if (route.request().method() === "POST") {
				const msg = {
					id: "msg-bet-001",
					threadId: THREAD_ID,
					senderId: FOUNDER_ID,
					type: "plain",
					payload: { text: composedText },
					clientKey: "ck-bet-001",
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

		await page.goto(`/work/task/${BET_ID}`);

		// Thread surface should be visible
		await expect(page.getByTestId("host-thread-section")).toBeVisible();

		// Post a comment
		const composer = page.getByPlaceholder(/reply to thread|write a message|start a discussion/i);
		await composer.fill(composedText);
		await page.getByRole("button", { name: /^send$/i }).click();

		// After posting, the message appears
		await expect(page.getByText(composedText)).toBeVisible();

		// Reload the page
		await page.reload();

		// Message should persist after reload
		await expect(page.getByText(composedText)).toBeVisible();
	});
});
