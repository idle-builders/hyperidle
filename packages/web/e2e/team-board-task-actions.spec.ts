/**
 * L15 — e2e: drag is gone, kebab + state-request menu posts a message to the
 * task thread. The card does not move on request.
 */
import { expect, test } from "@playwright/test";

test.describe("L15 Team Board — task actions menu replaces drag", () => {
	test.beforeEach(async ({ page }) => {
		// Stub thread lookup so ensureTaskThread resolves without a real backend.
		await page.route("**/api/threads?**host_kind=task**", async (route) => {
			const url = new URL(route.request().url());
			const hostId = url.searchParams.get("host_id") ?? "t1";
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					threads: [
						{
							id: "thread-1",
							hostKind: "task",
							hostId,
							initiatorId: "u-founder",
							participants: ["u-founder"],
							pinned: false,
							resolvedAt: null,
							lastActiveAt: new Date().toISOString(),
							createdAt: new Date().toISOString(),
						},
					],
					nextCursor: null,
				}),
			});
		});
		// Stub message post so the toast confirms success.
		await page.route("**/api/threads/thread-1/messages", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					message: {
						id: "msg-1",
						threadId: "thread-1",
						authorId: "u-founder",
						body: "stub",
						createdAt: new Date().toISOString(),
					},
				}),
			});
		});
	});

	test("attempting drag is a no-op; kebab posts a state-change request", async ({ page }) => {
		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-page']");

		const taskCard = page
			.locator("[data-ds-component='TaskCard']", { hasText: "Implement login endpoint" })
			.first();
		await expect(taskCard).toBeVisible();

		// Attempt a drag — must NOT move the card to a different column.
		const blockedColumn = page.locator("h3", { hasText: "Blocked" }).first();
		const fromBox = await taskCard.boundingBox();
		const toBox = await blockedColumn.boundingBox();
		if (fromBox && toBox) {
			await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
			await page.mouse.down();
			await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 10 });
			await page.mouse.up();
		}

		// Card text still appears, and is still under In Progress.
		await expect(taskCard).toBeVisible();
		const inProgressColumn = page
			.locator(":scope", { has: page.locator("h3", { hasText: "In Progress" }) })
			.first();
		await expect(inProgressColumn).toContainText("Implement login endpoint");

		// Hover task to reveal kebab.
		await taskCard.hover();
		const kebab = taskCard.getByRole("button", { name: /task actions/i });
		await expect(kebab).toBeVisible();
		await kebab.click();

		await page.getByRole("menuitem", { name: /request state change/i }).click();
		await page.getByRole("menuitem", { name: /^blocked$/i }).click();

		// Toast appears.
		await expect(page.getByText(/Requested → Blocked\. Posted to thread\./i)).toBeVisible();

		// Card is still in In Progress (no optimistic move).
		await expect(inProgressColumn).toContainText("Implement login endpoint");
	});

	test("Open thread navigates to placeholder route", async ({ page }) => {
		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-page']");
		const taskCard = page
			.locator("[data-ds-component='TaskCard']", { hasText: "Implement login endpoint" })
			.first();
		await taskCard.hover();
		await taskCard.getByRole("button", { name: /task actions/i }).click();
		await page.getByRole("menuitem", { name: /open thread/i }).click();
		await expect(page).toHaveURL(/\/work\/team\/task\/t1\/thread/);
	});
});
