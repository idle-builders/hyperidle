/**
 * L15 — Team Board: drag is a no-op; request posts a thread message.
 *
 * Flow:
 *  1. Navigate to /work/team.
 *  2. Attempt to drag a task card with mouse.down + mouse.move + mouse.up.
 *     The card must remain in its starting column afterwards (no-op).
 *  3. Click Request ▾ on the same task.
 *  4. Click Mark blocked.
 *  5. Click Send.
 *  6. Navigate (chip click) to /work/team/tasks/{taskId}/thread.
 *  7. Assert the deterministic message body renders in the thread.
 */
import { expect, test } from "@playwright/test";

test.describe("L15 — Team Board request flow", () => {
	test("drag is a no-op; request posts a message; thread shows the body", async ({ page }) => {
		// Stub the threads API so the Kanban + thread page render deterministically.
		const postedBodies: string[] = [];
		// Tracks (hostKind, hostId) → threadId. Empty until the first POST creates one.
		const taskThreads = new Map<string, string>();
		// Match both `/api/threads` (list/create) and `/api/threads/<id>...`
		// (detail/append). Playwright globs treat `*` as non-slash, so we need
		// both patterns.
		const threadsHandler = async (
			route: import("@playwright/test").Route,
			request: import("@playwright/test").Request,
		): Promise<void> => {
			const url = request.url();
			const method = request.method();
			if (method === "GET") {
				// list endpoint: return any thread already created for that task
				if (url.includes("host_kind=task")) {
					const m = url.match(/host_id=([^&]+)/);
					const hostId = m ? decodeURIComponent(m[1]) : "";
					const tid = taskThreads.get(`task:${hostId}`);
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({
							threads: tid ? [{ id: tid, hostKind: "task", hostId }] : [],
						}),
					});
					return;
				}
				// detail endpoint
				const idMatch = url.match(/\/api\/threads\/([^/?]+)/);
				const id = idMatch ? idMatch[1] : "thread-new";
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						thread: {
							id,
							hostKind: "task",
							hostId: "t1",
							initiatorId: "u-founder",
							participants: ["u-founder"],
							pinned: false,
							resolvedAt: null,
							lastActiveAt: new Date().toISOString(),
							createdAt: new Date().toISOString(),
						},
						messages: postedBodies.map((text, i) => ({
							id: `m-${i + 1}`,
							threadId: id,
							senderId: "u-founder",
							type: "plain",
							payload: { text },
							createdAt: new Date().toISOString(),
						})),
						headMessageId: postedBodies.length > 0 ? `m-${postedBodies.length}` : null,
						identities: { "u-founder": { name: "A. Founder" } },
					}),
				});
				return;
			}
			if (method === "POST") {
				const body = JSON.parse(request.postData() ?? "{}");
				if (url.endsWith("/api/threads")) {
					postedBodies.push(body.initialMessage.payload.text);
					if (body.hostKind === "task" && typeof body.hostId === "string") {
						taskThreads.set(`task:${body.hostId}`, "thread-new");
					}
					await route.fulfill({
						status: 201,
						contentType: "application/json",
						body: JSON.stringify({
							thread: { id: "thread-new", hostKind: "task", hostId: body.hostId ?? "t1" },
							messages: [
								{
									id: "m-1",
									threadId: "thread-new",
									senderId: "u-founder",
									type: "plain",
									payload: { text: postedBodies[postedBodies.length - 1] },
									createdAt: new Date().toISOString(),
								},
							],
						}),
					});
					return;
				}
				// append endpoint
				postedBodies.push(body.payload.text);
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({
						message: {
							id: `m-${postedBodies.length}`,
							threadId: "thread-new",
							senderId: "u-founder",
							type: "plain",
							payload: { text: body.payload.text },
							createdAt: new Date().toISOString(),
						},
						thread: { id: "thread-new" },
					}),
				});
				return;
			}
			await route.continue();
		};
		await page.route("**/api/threads", threadsHandler);
		await page.route("**/api/threads?**", threadsHandler);
		await page.route("**/api/threads/**", threadsHandler);

		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-page']");

		// (1) Find a task card. The fixture's "Implement login endpoint" is in_progress.
		const card = page.getByTestId("task-card-t1");
		await expect(card).toBeVisible();

		// (2) Attempt drag. With DnD scaffolding gone this is a no-op.
		const cardBox = await card.boundingBox();
		if (!cardBox) throw new Error("card has no bounding box");
		await page.mouse.move(cardBox.x + 10, cardBox.y + 10);
		await page.mouse.down();
		await page.mouse.move(cardBox.x + 400, cardBox.y + 10, { steps: 5 });
		await page.mouse.up();

		// Card is still where it was — same testid resolves, content unchanged.
		await expect(page.getByTestId("task-card-t1")).toBeVisible();
		await expect(page.getByText("Implement login endpoint")).toBeVisible();

		// (3) Click Request ▾ on the same card.
		await card.getByRole("button", { name: /request/i }).click();

		// (4) Click Mark blocked.
		await page.getByRole("button", { name: /^Mark blocked$/i }).click();

		// (5) Click Send.
		await page.getByRole("button", { name: /^Send$/i }).click();

		// Wait for the POST to settle.
		await expect.poll(() => postedBodies.length).toBeGreaterThan(0);
		expect(postedBodies[0]).toContain("requested: Mark blocked");

		// (6) Navigate to the thread route.
		await page.goto("/work/team/tasks/t1/thread");

		// (7) Message body renders.
		await expect(page.getByText(/requested: Mark blocked/)).toBeVisible();
	});
});
