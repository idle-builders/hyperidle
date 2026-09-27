/**
 * Journey: opening a global-search result navigates there, and Back returns
 * to where the search started — a real router/history concern.
 *
 * @lore component tests cover the panel itself — this spec proves the one thing that needs a real browser: temporal history across navigation.
 */
import { expect, test } from "./fixtures";

test.describe("Global Search", () => {
	test("search result closes the utility, navigates, and retains temporal Back", async ({
		page,
	}) => {
		await page.route("**/api/search*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					conversations: [],
					work: [
						{
							id: "t99",
							title: "E2E Work Result",
							team: "HyperIdle",
							state: "in_progress",
						},
					],
					documents: [],
				}),
			});
		});

		await page.goto("/");
		const originUrl = await page.waitForURL(/\/work\/team\//).then(() => page.url());
		await page.keyboard.press("Meta+k");
		const input = page.getByRole("dialog").getByRole("textbox");
		await input.evaluate((element) => {
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
				element,
				"e2e",
			);
			element.dispatchEvent(new Event("input", { bubbles: true }));
		});
		await expect(page.getByText("E2E Work Result")).toBeVisible();
		await page.getByRole("button", { name: /E2E Work Result/ }).dispatchEvent("click");
		await expect(page).toHaveURL(/\/work\/task\/t99$/);
		await expect(page.getByRole("dialog")).toHaveCount(0);
		await page.goBack();
		await expect(page).toHaveURL(originUrl);
	});
});
