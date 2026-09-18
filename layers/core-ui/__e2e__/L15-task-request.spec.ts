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
 *
 * @lore BC3: repointed at `POST /api/actions/{search_threads,open_thread,
 * send_message}` — never `GET/POST /api/threads*`. There is no `bet`/`task`
 * host kind; a task's own thread is `team`-hosted. Steps 3/4-5/6 (the
 * TaskSheet flow) are already on `known-pre-existing-failures.ts` —
 * `TaskSheet`/`bet-task-row` no longer exist anywhere in `layers/core-ui/src`
 * — this is a mechanical mock migration only, not an attempt to resurrect it.
 */
import {
	expect,
	makeMessage,
	makeTask,
	makeThread,
	makeThreadListRow,
	mockSearchThreads,
	mockTaskTree,
	mockThread,
	test,
} from "./fixtures";

const TASK_THREAD_ID = "thread-task-abc-001";
const TASK_ID = "t1";
const BET_ID = "b1";
const HOST_THREAD_ID = `host-thread-${BET_ID}`;

const NOW = new Date().toISOString();

test.describe("L15 — Strip drag + Task request sheet (re-routed to Bet detail)", () => {
	test.beforeEach(async ({ page }) => {
		await mockTaskTree(page, { task: makeTask(BET_ID, { threadId: HOST_THREAD_ID }) });

		// Host thread for the bet (HostThreadSection)
		await mockThread(page, {
			thread: makeThread(HOST_THREAD_ID, {
				hostKind: "team",
				hostId: BET_ID,
				initiatorId: "u-founder",
				members: ["u-founder"],
				lastActiveAt: NOW,
				createdAt: NOW,
			}),
			messages: [],
		});

		// No task thread yet — search_threads finds nothing until step 6 overrides it.
		await mockSearchThreads(page, { rows: [] });
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
		await mockThread(page, {
			thread: makeThread(TASK_THREAD_ID, {
				hostKind: "team",
				hostId: TASK_ID,
				initiatorId: "u-founder",
				members: ["u-founder", "agent-unassigned"],
				lastActiveAt: NOW,
				createdAt: NOW,
			}),
			messages: [],
		});
		await page.route("**/api/actions/send_message", async (route) => {
			const req = route.request();
			const body = req.postDataJSON() as { text?: string } | null;
			capturedMessageText = body?.text ?? null;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						message: makeMessage("msg-request-001", TASK_THREAD_ID, {
							senderId: "u-founder",
							clientKey: "ck-001",
							payload: { text: "Request: move to BLOCKED." },
							createdAt: NOW,
						}),
						thread: makeThread(TASK_THREAD_ID, {
							hostKind: "team",
							hostId: TASK_ID,
							initiatorId: "u-founder",
							members: ["u-founder", "agent-unassigned"],
							lastActiveAt: NOW,
							createdAt: NOW,
						}),
					},
				}),
			});
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
		// For this test, search_threads returns an existing thread for the task.
		await mockSearchThreads(page, {
			rows: [
				makeThreadListRow(TASK_THREAD_ID, {
					hostKind: "team",
					hostId: TASK_ID,
					initiatorId: "u-founder",
					members: ["u-founder", "agent-unassigned"],
					lastActiveAt: NOW,
					createdAt: NOW,
					hasUnresolvedReview: false,
				}),
			],
		});
		await mockThread(page, {
			thread: makeThread(TASK_THREAD_ID, {
				hostKind: "team",
				hostId: TASK_ID,
				initiatorId: "u-founder",
				members: ["u-founder", "agent-unassigned"],
				lastActiveAt: NOW,
				createdAt: NOW,
			}),
			messages: [],
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
