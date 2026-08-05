/**
 * L18 — Knowledge entry thread Playwright e2e tests.
 *
 * AC coverage:
 *  - open a knowledge entry → thread renders (replacing observation log) → post → reload → persists
 */

import { expect, test } from "./fixtures";

const NOW = "2026-05-05T09:00:00.000Z";
const LATER = "2026-05-05T09:05:00.000Z";
const FOUNDER_ID = "u-founder";
const THREAD_ID = "t-knowledge-001";
const KNOWLEDGE_ID = "k3"; // known fixture id with content

function makeThreadListResponse() {
	return {
		threads: [
			{
				id: THREAD_ID,
				hostKind: "knowledge_item",
				hostId: KNOWLEDGE_ID,
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
			hostKind: "knowledge_item",
			hostId: KNOWLEDGE_ID,
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

test.describe("L18 — Knowledge entry thread surface", () => {
	test("thread renders (replacing observation log); post; reload; persists", async ({ page }) => {
		const postedMessages: Array<Record<string, unknown>> = [];
		let postObserved = false;
		const composedText = "Insight from reviewing this knowledge entry.";

		await page.route(`**/api/threads?**host_kind=knowledge_item**`, async (route) => {
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
					id: "msg-know-001",
					threadId: THREAD_ID,
					senderId: FOUNDER_ID,
					type: "plain",
					payload: { text: composedText },
					clientKey: "ck-know-001",
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

		await page.goto(`/knowledge/${KNOWLEDGE_ID}`);

		// Knowledge page should be visible
		await expect(page.getByTestId("knowledge-detail-page")).toBeVisible();

		// Thread section replaces observation log
		await expect(page.getByTestId("host-thread-section")).toBeVisible();
		await expect(page.getByTestId("knowledge-observation-log")).not.toBeVisible();

		// Post a comment
		const composer = page.getByPlaceholder(/reply to thread|write a message|start a discussion/i);
		await composer.fill(composedText);
		await page.getByRole("button", { name: /^send$/i }).click();

		await expect(page.getByText(composedText)).toBeVisible();

		// Reload and verify persistence
		await page.reload();
		await expect(page.getByText(composedText)).toBeVisible();
	});
});
