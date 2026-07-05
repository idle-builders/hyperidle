/**
 * L15 — Playwright e2e: strip-drag + request-state + open-thread.
 * L13 amendment: re-routed from /work/team to /work/bet/:id.
 *
 * Strategy: hermetic page.route() mocks for all /api/ calls.
 * No DB seeding required — the dev server only serves the SPA bundle.
 *
 * Flow:
 * 1. Navigate to /work/bet/b1 (bet detail page)
 * 2. Positive drag-absence guards (structural assertions, not behavior)
 * 3. Click a task row [data-testid="task-row"] → task detail page opens
 *
 * @lore W3: WorkBet task rows no longer open TaskSheet. Rows are flat buttons
 * with data-testid="task-row" and navigate to /work/bet/:betId/task/:taskId.
 * TaskSheet request-thread behavior remains covered by component tests.
 */
import { expect, test } from "./fixtures";

const TASK_THREAD_ID = "thread-task-abc-001";
const TASK_ID = "t1";
const BET_ID = "b1";

const NOW = new Date().toISOString();

function makeBetDetailResponse() {
	return {
		id: BET_ID,
		title: "User auth flow",
		product: "HyperIdle Core",
		team: "Core Team",
		status: "in_progress",
		costAppetite: { minor: 100000, currency: "USD" },
		costActual: { minor: 6000, currency: "USD" },
		tokensActual: null,
		progress: { done: 1, total: 2 },
		description: "# Problem\n\nAuth needs work.\n",
		tasks: [
			{
				id: TASK_ID,
				betId: BET_ID,
				title: "Implement login endpoint",
				ownerAgentId: "agent-dev-1",
				state: "in_progress",
				costActual: { minor: 4200, currency: "USD" },
				costCap: null,
				latestSessionOutcome: null,
				latestSessionCost: null,
				latestSessionTokensInput: null,
				latestSessionTokensOutput: null,
				latestSessionHarnessUrl: null,
			},
			{
				id: "t2",
				betId: BET_ID,
				title: "Design signup form",
				ownerAgentId: "agent-dev-2",
				state: "accepted",
				costActual: { minor: 1800, currency: "USD" },
				costCap: null,
				latestSessionOutcome: null,
				latestSessionCost: null,
				latestSessionTokensInput: null,
				latestSessionTokensOutput: null,
				latestSessionHarnessUrl: null,
			},
		],
	};
}

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
		await page.route(`**/api/bets/${BET_ID}`, async (route) => {
			const req = route.request();
			if (req.method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeBetDetailResponse()),
				});
			} else {
				await route.fallback();
			}
		});

		// Mock /api/bets/:id/artifact-thread-summary
		await page.route(`**/api/bets/${BET_ID}/artifact-thread-summary`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ summaries: [], truncated: false, totalCount: 0 }),
			});
		});

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
				await route.fallback();
			}
		});
	});

	test("(step 2) drag affordances are structurally absent from the bet task table", async ({
		page,
	}) => {
		await page.goto(`/work/bet/${BET_ID}`);
		await page.waitForSelector("[data-testid='work-bet-page']");

		// On the Bet detail page, there is no Kanban with drag affordances
		await expect(page.locator("[data-droppable-column]")).toHaveCount(0);
		await expect(page.locator('[data-testid^="draggable-task-"]')).toHaveCount(0);
		await expect(page.locator('[aria-roledescription="draggable"]')).toHaveCount(0);
	});

	test("(step 3) clicking a task row navigates to task detail", async ({ page }) => {
		await page.goto(`/work/bet/${BET_ID}`);
		await page.waitForSelector("[data-testid='work-bet-page']");

		const taskRow = page.getByTestId("task-row").first();
		await expect(taskRow).toBeVisible();
		await taskRow.click();

		await expect(page).toHaveURL(new RegExp(`/work/bet/${BET_ID}/task/${TASK_ID}`));
	});

	test.skip("(steps 4–5) select BLOCKED intent → Send request → Sent. → sheet closes → message in thread", async ({
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
				await route.fallback();
			}
		});

		await page.goto(`/work/bet/${BET_ID}`);
		await page.waitForSelector("[data-testid='work-bet-page']");

		// Open the sheet via task row click
		await page.getByTestId("task-row").first().click();
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
	test.skip("(step 6) Open thread navigates to /conversations/:threadId (L9)", async ({ page }) => {
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
				await route.fallback();
			}
		});

		await page.goto(`/work/bet/${BET_ID}`);
		await page.waitForSelector("[data-testid='work-bet-page']");

		// Open the sheet via task row click
		await page.getByTestId("task-row").first().click();
		await expect(page.getByRole("dialog")).toBeVisible();

		// Click Open thread
		await page.getByRole("button", { name: /open thread/i }).click();

		// URL should navigate to canonical /conversations/:threadId (L9)
		await expect(page).toHaveURL(new RegExp(`/conversations/${TASK_THREAD_ID}`), { timeout: 3000 });
	});
});
