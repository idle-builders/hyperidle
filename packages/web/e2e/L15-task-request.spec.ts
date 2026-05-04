/**
 * L15 — Playwright e2e (AC-5).
 *
 * Spec lines 522-523: drag a task → no-op → request a state change → message
 * appears in the task's thread → URL navigates to /conversations?id=...
 *
 * Strategy: hermetic page.route() mocks for the L15 endpoints, identical
 * to the convention in `threads.spec.ts`. The dev server only serves the
 * SPA bundle.
 *
 * Red phase: the request menu does not exist yet; the trigger is missing
 * and every step beyond "page loads" fails on a missing locator.
 */

import { expect, test } from "@playwright/test";

const TASK_ID = "t1"; // matches WorkTeam.tsx INITIAL_TASKS[0]
const TASK_TITLE = "Implement login endpoint";
const THREAD_ID = "thread-task-1";

interface PostedMessage {
	type: string;
	payload: { text: string; refs?: Array<{ kind: string; requestedState?: string }> };
	clientKey: string;
}

test.describe("L15 — Team Board task request flow", () => {
	let posted: PostedMessage[] = [];

	test.beforeEach(async ({ page }) => {
		posted = [];

		await page.route(`**/api/tasks/${TASK_ID}/thread`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					thread: {
						id: THREAD_ID,
						hostKind: "task",
						hostId: TASK_ID,
						initiatorId: "u-founder",
						participants: ["u-founder"],
						pinned: false,
						resolvedAt: null,
						lastActiveAt: new Date().toISOString(),
						createdAt: new Date().toISOString(),
					},
					messages: posted.map((m, i) => ({
						id: `m-${i}`,
						threadId: THREAD_ID,
						senderId: "u-founder",
						type: m.type,
						payload: m.payload,
						clientKey: m.clientKey,
						deletedAt: null,
						redactedAt: null,
						resolvedAt: null,
						createdAt: new Date().toISOString(),
					})),
					headMessageId: null,
					nextMessagesCursor: null,
				}),
			});
		});

		await page.route(`**/api/tasks/${TASK_ID}/thread/messages`, async (route, request) => {
			if (request.method() !== "POST") {
				await route.continue();
				return;
			}
			const body = JSON.parse(request.postData() ?? "{}") as PostedMessage;
			posted.push(body);
			await route.fulfill({
				status: 201,
				contentType: "application/json",
				body: JSON.stringify({
					thread: {
						id: THREAD_ID,
						hostKind: "task",
						hostId: TASK_ID,
						initiatorId: "u-founder",
						participants: ["u-founder"],
						pinned: false,
						resolvedAt: null,
						lastActiveAt: new Date().toISOString(),
						createdAt: new Date().toISOString(),
					},
					message: {
						id: `m-${posted.length - 1}`,
						threadId: THREAD_ID,
						senderId: "u-founder",
						type: body.type,
						payload: body.payload,
						clientKey: body.clientKey,
						deletedAt: null,
						redactedAt: null,
						resolvedAt: null,
						createdAt: new Date().toISOString(),
					},
				}),
			});
		});

		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-page']");
	});

	test("dragging a task is a no-op (card stays in original column)", async ({ page }) => {
		const card = page.getByText(TASK_TITLE).first();
		await expect(card).toBeVisible();

		// Locate the source column (In Progress) and a different target column (Done).
		const inProgressCol = page.getByRole("heading", { name: /^In Progress$/ }).locator("..");
		const doneCol = page.getByRole("heading", { name: /^Done$/ }).locator("..");

		// Attempt drag: with drag stripped this is a no-op.
		await card.dragTo(doneCol);

		// The card MUST still appear inside the "In Progress" column container.
		await expect(inProgressCol.getByText(TASK_TITLE)).toBeVisible();
		await expect(doneCol.getByText(TASK_TITLE)).toHaveCount(0);
	});

	test("opens the request menu, posts a state-change request, message appears in the thread", async ({
		page,
	}) => {
		const card = page.getByText(TASK_TITLE).first().locator("..");
		const trigger = card.locator("button[aria-label*='Request a change']").first();
		await expect(trigger).toBeVisible();
		await trigger.click();

		const menu = page.getByRole("menu");
		await expect(menu).toBeVisible();
		await expect(trigger).toHaveAttribute("aria-expanded", "true");

		await menu.getByRole("menuitem", { name: /^Block/ }).click();

		// Server received the POST.
		await expect.poll(() => posted.length).toBeGreaterThan(0);
		expect(posted[0].type).toBe("plain");
		expect(posted[0].payload.text).toMatch(/Please move .* to Block/);
		const stateRef = posted[0].payload.refs?.find((r) => r.kind === "request_state_change");
		expect(stateRef?.requestedState).toBe("blocked");

		// L15 architecture review C2: read-after-write feedback. The menu must
		// briefly show an inline confirmation before auto-closing.
		const confirmation = page.getByTestId("task-request-confirmation");
		await expect(confirmation).toBeVisible();
		await expect(confirmation).toHaveText(/Sent — agent will decide\./);
	});

	test("clicking 'Open thread' navigates to /conversations?id=<threadId>", async ({ page }) => {
		const card = page.getByText(TASK_TITLE).first().locator("..");
		const trigger = card.locator("button[aria-label*='Request a change']").first();
		await trigger.click();
		await page.getByRole("menuitem", { name: /Open thread/i }).click();
		await page.waitForURL(new RegExp(`/conversations\\?.*id=${THREAD_ID}`));
		expect(page.url()).toMatch(new RegExp(`id=${THREAD_ID}`));
	});

	test("typing a note + clicking Block appends the note to the request text", async ({ page }) => {
		const card = page.getByText(TASK_TITLE).first().locator("..");
		const trigger = card.locator("button[aria-label*='Request a change']").first();
		await trigger.click();
		const note = page.getByLabel(/Note for the agent/i);
		await note.fill("waiting on staging");
		await page.getByRole("menuitem", { name: /^Block/ }).click();
		await expect.poll(() => posted.length).toBeGreaterThan(0);
		expect(posted[0].payload.text).toMatch(/waiting on staging/);
	});
});
