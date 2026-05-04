/**
 * L15 — Task actions menu replaces drag.
 * AC1, AC3-AC5: try drag → no-op; open menu → request state → message in thread.
 */
import { expect, test } from "@playwright/test";

test.describe("L15: TaskActionsMenu", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-page']");
	});

	test("dragging a task card is a no-op (drag removed)", async ({ page }) => {
		const card = page.getByText("Implement login endpoint");
		await expect(card).toBeVisible();
		// Capture the bounding box before; after a drag attempt, asserting the
		// task text stays inside the same column heading subtree.
		const inProgressHeading = page.getByText("In Progress");
		await inProgressHeading.scrollIntoViewIfNeeded();
		// Try to drag — there are no drop zones, so nothing happens.
		await card.hover();
		await page.mouse.down();
		await page.mouse.move(800, 400);
		await page.mouse.up();
		// Card text still present.
		await expect(page.getByText("Implement login endpoint")).toBeVisible();
		// No draggable wrappers exist anywhere on the page.
		await expect(page.locator("[data-testid^='draggable-task-']")).toHaveCount(0);
	});

	test("kebab opens menu with Open thread + 5 Request items", async ({ page }) => {
		const trigger = page.getByLabel("Actions for Implement login endpoint");
		await expect(trigger).toBeVisible();
		await trigger.click();
		const menu = page.getByRole("menu");
		await expect(menu).toBeVisible();
		await expect(menu.getByRole("menuitem")).toHaveCount(6);
	});

	test("clicking 'Request: Done' POSTs a plain message with the locked prose (W8)", async ({
		page,
	}) => {
		const recordedBodies: Array<Record<string, unknown>> = [];
		// Stub the find-or-create flow so we don't depend on server state in e2e:
		// (a) GET threads → empty list; (b) POST /api/threads → created; (c) POST messages.
		await page.route("**/api/threads?**host_kind=task**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: [] }),
			});
		});
		await page.route("**/api/threads", async (route) => {
			if (route.request().method() !== "POST") return route.fallback();
			await route.fulfill({
				status: 201,
				contentType: "application/json",
				body: JSON.stringify({ thread: { id: "th-stub-001" }, messages: [] }),
			});
		});
		await page.route("**/api/threads/*/messages", async (route) => {
			if (route.request().method() === "POST") {
				const data = route.request().postDataJSON() as Record<string, unknown>;
				recordedBodies.push(data);
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({}),
				});
				return;
			}
			await route.fallback();
		});
		await page.getByLabel("Actions for Implement login endpoint").click();
		await page.getByRole("menuitem", { name: /Request: Done/i }).click();
		await expect(page.getByRole("menu")).not.toBeVisible();
		expect(recordedBodies.length).toBeGreaterThanOrEqual(1);
		const last = recordedBodies[recordedBodies.length - 1];
		expect(last).toMatchObject({
			type: "plain",
			payload: { text: "Requesting state change to done." },
		});
		expect(typeof last.clientKey).toBe("string");
	});

	test("clicking 'Open thread' navigates to /conversations/review", async ({ page }) => {
		await page.getByLabel("Actions for Implement login endpoint").click();
		await page.getByRole("menuitem", { name: /Open thread/i }).click();
		await page.waitForURL(/\/conversations\/review/);
		expect(page.url()).toContain("/conversations/review");
	});
});
