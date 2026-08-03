/**
 * L18 — Artifact permalink thread Playwright e2e tests.
 *
 * AC coverage:
 *  - open /artifacts/:id → thread renders → post a message → reload → message persists
 */

import { expect, test } from "./fixtures";

const NOW = "2026-05-05T09:00:00.000Z";
const LATER = "2026-05-05T09:05:00.000Z";
const FOUNDER_ID = "u-founder";
const THREAD_ID = "t-artifact-001";
const ARTIFACT_ID = "art-e2e-001";

function makeArtifactResponse() {
	return {
		id: ARTIFACT_ID,
		producingTaskId: "task-001",
		producingTaskTitle: "auth-service.ts",
		kind: "code_diff",
		preview: {
			kind: "code_diff",
			file: "auth-service.ts",
			hunks: [],
		},
		threadCount: 0,
		createdAt: NOW,
	};
}

function makeThreadListResponse() {
	return {
		threads: [
			{
				id: THREAD_ID,
				hostKind: "artifact",
				hostId: ARTIFACT_ID,
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
			hostKind: "artifact",
			hostId: ARTIFACT_ID,
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

test.describe("L18 — Artifact permalink thread surface", () => {
	test("thread renders on artifact detail; post a message; reload; message persists", async ({
		page,
	}) => {
		const postedMessages: Array<Record<string, unknown>> = [];
		let postObserved = false;
		const composedText = "This is a test comment on the artifact thread.";

		await page.route("**/api/threads?**participant_id=**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: [], nextCursor: null }),
			});
		});
		await page.route("**/api/teams**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ teams: [] }),
			});
		});

		// Mock /api/artifacts/:id
		await page.route(`**/api/artifacts/${ARTIFACT_ID}`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeArtifactResponse()),
			});
		});

		// Mock GET /api/threads?host_kind=artifact&host_id=...
		await page.route(`**/api/threads?**host_kind=artifact**`, async (route) => {
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
					id: "msg-art-001",
					threadId: THREAD_ID,
					senderId: FOUNDER_ID,
					type: "plain",
					payload: { text: composedText },
					clientKey: "ck-art-001",
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

		await page.goto(`/artifacts/${ARTIFACT_ID}`);

		// Thread section should be visible below the artifact preview
		await expect(page.getByTestId("host-thread-section")).toBeVisible();

		// Post a comment
		const composer = page.getByPlaceholder(/reply to thread|write a message|start a discussion/i);
		await composer.fill(composedText);
		await page.getByRole("button", { name: /^send$/i }).click();

		// Message should appear after posting
		await expect(page.getByText(composedText)).toBeVisible();

		// Reload and verify persistence
		await page.reload();

		await expect(page.getByText(composedText)).toBeVisible();
	});
});
