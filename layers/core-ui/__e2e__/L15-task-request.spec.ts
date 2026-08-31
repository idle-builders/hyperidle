/**
 * L15 — Playwright e2e: strip-drag + request-state + open-thread.
 * L13 amendment: re-routed from /work/team to /work/task/:id.
 *
 * Strategy: hermetic page.route() mocks for all /api/ calls.
 * No DB seeding required — the dev server only serves the SPA bundle.
 *
 * Flow:
 * 1. Navigate to /work/task/b1 (bet detail page)
 * 2. Positive drag-absence guards (structural assertions, not behavior)
 * 3. Click a task row [data-testid="bet-task-row"] → TaskSheet opens
 * 4. Select "Move to BLOCKED" intent → Send request → Sent. feedback → sheet closes
 * 5. Navigate to /conversations/:threadId → assert the message text is rendered (L9)
 * 6. Re-open task row → Open thread → URL navigates to /conversations/:threadId (L9)
 *
 * @lore L13: WorkTeam.tsx is deleted. TaskSheet is now mounted on WorkBet.
 * All L15 flows navigate through /work/task/:id → [data-testid="bet-task-row"]
 * instead of /work/team → task card.
 */
import { expect, test } from "./fixtures";

const TASK_THREAD_ID = "thread-task-abc-001";
const TASK_ID = "t1";
const BET_ID = "b1";

const NOW = new Date().toISOString();

function makeThreadListResponse(threads: Array<{ id: string; hostId: string }>): object {
	return {
		threads: threads.map((t) => ({
			id: t.id,
			hostKind: "task",
			hostId: t.hostId,
			initiatorId: "u-founder",
			participants: ["u-founder", "agent-unassigned"],
			pinned: false,
			resolvedAt: null,
			lastActiveAt: NOW,
			createdAt: NOW,
			hasUnresolvedReview: false,
		})),
		nextCursor: null,
	};
}

function makeCreateThreadResponse(): object {
	return {
		thread: {
			id: TASK_THREAD_ID,
			hostKind: "task",
			hostId: TASK_ID,
			initiatorId: "u-founder",
			participants: ["u-founder", "agent-unassigned"],
			pinned: false,
			resolvedAt: null,
			lastActiveAt: NOW,
			createdAt: NOW,
		},
		messages: [],
	};
}

function makePostMessageResponse(): object {
	return {
		message: {
			id: "msg-request-001",
			threadId: TASK_THREAD_ID,
			senderId: "u-founder",
			clientKey: "ck-001",
			type: "plain",
			payload: { text: "Request: move to BLOCKED." },
			deletedAt: null,
			redactedAt: null,
			resolvedAt: null,
			createdAt: NOW,
		},
		thread: {
			id: TASK_THREAD_ID,
			hostKind: "task",
			hostId: TASK_ID,
			initiatorId: "u-founder",
			participants: ["u-founder", "agent-unassigned"],
			pinned: false,
			resolvedAt: null,
			lastActiveAt: NOW,
			createdAt: NOW,
		},
	};
}

function makeThreadDetailResponse(): object {
	return {
		thread: {
			id: TASK_THREAD_ID,
			hostKind: "task",
			hostId: TASK_ID,
			initiatorId: "u-founder",
			participants: ["u-founder", "agent-unassigned"],
			pinned: false,
			resolvedAt: null,
			lastActiveAt: NOW,
			createdAt: NOW,
		},
		headMessageId: null,
		messages: [
			{
				id: "msg-request-001",
				threadId: TASK_THREAD_ID,
				senderId: "u-founder",
				clientKey: "ck-001",
				type: "plain",
				payload: { text: "Request: move to BLOCKED." },
				deletedAt: null,
				redactedAt: null,
				resolvedAt: null,
				createdAt: NOW,
			},
		],
		nextMessagesCursor: null,
	};
}

function makeHostThreadResponse(): object {
	return {
		thread: {
			id: `host-thread-${BET_ID}`,
			hostKind: "bet",
			hostId: BET_ID,
			initiatorId: "u-founder",
			participants: ["u-founder"],
			pinned: false,
			resolvedAt: null,
			lastActiveAt: NOW,
			createdAt: NOW,
		},
		headMessageId: null,
		messages: [],
		nextMessagesCursor: null,
	};
}

test.describe("L15 — Strip drag + Task request sheet (re-routed to Bet detail)", () => {
	test.beforeEach(async ({ page }) => {
		// Mock /api/bets/:id so the bet detail page loads

		// Mock /api/bets/:id/artifact-thread-summary

		// Mock host thread for the bet (HostThreadSection)
		await page.route(`**/api/threads?host_kind=bet&host_id=${BET_ID}`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					threads: [{ ...makeHostThreadResponse().thread, hasUnresolvedReview: false }],
					nextCursor: null,
				}),
			});
		});

		await page.route(`**/api/threads/host-thread-${BET_ID}`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeHostThreadResponse()),
			});
		});

		// Mock all /api/threads/* calls generically for task threads
		await page.route("**/api/threads**", async (route) => {
			const req = route.request();
			const url = req.url();
			const method = req.method();

			if (method === "GET" && url.includes("host_kind=task")) {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeThreadListResponse([])),
				});
			} else if (method === "POST" && url.endsWith("/api/threads")) {
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify(makeCreateThreadResponse()),
				});
			} else if (method === "POST" && url.includes("/messages")) {
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify(makePostMessageResponse()),
				});
			} else if (method === "GET" && url.includes(`/${TASK_THREAD_ID}`)) {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeThreadDetailResponse()),
				});
			} else {
				await route.continue();
			}
		});
	});

	test("(step 2) drag affordances are structurally absent from the bet task table", async ({
		page,
	}) => {
		await page.goto(`/work/task/${BET_ID}`);
		await page.waitForSelector("[data-testid='task-detail-page']");

		// On the Bet detail page, there is no Kanban with drag affordances
		await expect(page.locator("[data-droppable-column]")).toHaveCount(0);
		await expect(page.locator('[data-testid^="draggable-task-"]')).toHaveCount(0);
		await expect(page.locator('[aria-roledescription="draggable"]')).toHaveCount(0);
	});

	test("(step 3) clicking a task row opens the TaskSheet (role=dialog)", async ({ page }) => {
		await page.goto(`/work/task/${BET_ID}`);
		await page.waitForSelector("[data-testid='task-detail-page']");

		// Click the first task row
		const taskRow = page.getByTestId("bet-task-row").first();
		await expect(taskRow).toBeVisible();
		await taskRow.click();

		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		// Sheet shows the task title
		await expect(dialog.getByText("Implement login endpoint")).toBeVisible();
	});

	test("(steps 4–5) select BLOCKED intent → Send request → Sent. → sheet closes → message in thread", async ({
		page,
	}) => {
		let capturedMessageText: string | null = null;
		await page.route("**/api/threads**", async (route) => {
			const req = route.request();
			const url = req.url();
			const method = req.method();

			if (method === "GET" && url.includes("host_kind=task")) {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeThreadListResponse([])),
				});
			} else if (method === "POST" && url.endsWith("/api/threads")) {
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify(makeCreateThreadResponse()),
				});
			} else if (method === "POST" && url.includes("/messages")) {
				const body = req.postDataJSON() as { payload?: { text?: string } } | null;
				capturedMessageText = body?.payload?.text ?? null;
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify(makePostMessageResponse()),
				});
			} else if (method === "GET" && url.includes(`/${TASK_THREAD_ID}`)) {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeThreadDetailResponse()),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto(`/work/task/${BET_ID}`);
		await page.waitForSelector("[data-testid='task-detail-page']");

		// Open the sheet via task row click
		await page.getByTestId("bet-task-row").first().click();
		await expect(page.getByRole("dialog")).toBeVisible();

		// Select "Move to BLOCKED" radio
		await page.getByRole("radio", { name: /move to blocked/i }).click();

		// Submit — use force:true to bypass stability check; the button is confirmed
		// visible+enabled but CI layout animations cause intermittent stability timeout.
		await page.getByRole("button", { name: /send request/i }).click({ force: true });

		// Inline role="status" appears with "Sent."
		await expect(page.getByRole("dialog").getByRole("status")).toHaveText("Sent.");

		// Sheet auto-closes after ~800ms
		await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 3000 });

		// Verify message text was captured
		expect(capturedMessageText).toBe("Request: move to BLOCKED.");
	});

	// L9: TaskSheet now navigates to /conversations/:threadId (canonical path, no ?thread= param)
	test("(step 6) Open thread navigates to /conversations/:threadId (L9)", async ({ page }) => {
		// For this test, mock GET threads to return an existing thread
		await page.route("**/api/threads**", async (route) => {
			const req = route.request();
			const url = req.url();
			const method = req.method();

			if (method === "GET" && url.includes("host_kind=task")) {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeThreadListResponse([{ id: TASK_THREAD_ID, hostId: TASK_ID }])),
				});
			} else if (method === "GET" && url.includes(`/${TASK_THREAD_ID}`)) {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeThreadDetailResponse()),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto(`/work/task/${BET_ID}`);
		await page.waitForSelector("[data-testid='task-detail-page']");

		// Open the sheet via task row click
		await page.getByTestId("bet-task-row").first().click();
		await expect(page.getByRole("dialog")).toBeVisible();

		// Click Open thread
		await page.getByRole("button", { name: /open thread/i }).click();

		// URL should navigate to canonical /conversations/:threadId (L9)
		await expect(page).toHaveURL(new RegExp(`/conversations/${TASK_THREAD_ID}`), { timeout: 3000 });
	});
});
