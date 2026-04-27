/**
 * L8 — Rail Interactivity Playwright E2E.
 *
 * Validation scenarios from TRACK-L L8:
 *   - "Given a Rail blocker row 'Developer / Waiting for API spec / BLOCKED 47m,'
 *      when clicked, then the URL becomes /conversations/review?thread=<id> and
 *      the thread opens."
 *   - "Given the seeded fixture has 1 crashed session, when the page loads, then
 *      the system-stability strip renders '1 crashed session' as a red row."
 *   - "Given all stability counts are 0, when the page loads, then the strip is
 *      not rendered at all."
 */

import { expect, type Page, test } from "@playwright/test";

async function installBaseMocks(page: Page): Promise<void> {
	await page.route("**/api/me", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				id: "actor:ceo",
				role: "CEO",
				domain_tags: ["auth"],
			}),
		});
	});
	await page.route("**/api/conversations**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				threads: [],
				pagination: { page: 1, limit: 200, total: 0 },
			}),
		});
	});
}

async function mockStability(
	page: Page,
	body: { crashed_sessions: number; cap_reached: number; api_degraded: number },
): Promise<void> {
	await page.route("**/api/system/stability", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(body),
		});
	});
}

test.describe("L8 — Rail Interactivity", () => {
	test("clicking a blocker row deep-links to /conversations/review?thread=<id>", async ({
		page,
	}) => {
		await installBaseMocks(page);
		await mockStability(page, { crashed_sessions: 0, cap_reached: 0, api_degraded: 0 });

		await page.goto("/conversations/review");
		// Wait for the Rail to render with at least one blocker row.
		const blocker = page.getByRole("button", { name: /developer.*waiting for api spec/i });
		await blocker.waitFor({ state: "visible" });

		await blocker.click();
		await expect(page).toHaveURL(/\/conversations\/review\?thread=.+/);
	});

	test("system-stability strip renders '1 crashed session' when fixture has one", async ({
		page,
	}) => {
		await installBaseMocks(page);
		await mockStability(page, { crashed_sessions: 1, cap_reached: 0, api_degraded: 0 });

		await page.goto("/conversations/review");

		// Strip header is visible.
		await expect(page.getByText(/system stability/i)).toBeVisible();
		// Crashed-sessions row text.
		await expect(page.getByText(/1 crashed session/i)).toBeVisible();
	});

	test("system-stability strip is hidden when all counts are zero", async ({ page }) => {
		await installBaseMocks(page);
		await mockStability(page, { crashed_sessions: 0, cap_reached: 0, api_degraded: 0 });

		await page.goto("/conversations/review");
		// Wait briefly for Rail to render.
		await page.waitForSelector("[data-ds-shell='Rail']");
		await expect(page.getByText(/system stability/i)).toHaveCount(0);
	});
});
