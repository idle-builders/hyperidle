/**
 * E2E tests for Global Search (Cmd+K): opening, typing, filtering, closing.
 */
import { expect, test } from "./fixtures";

test.describe("Global Search", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
	});

	test("Cmd+K opens the search panel", async ({ page }) => {
		await page.keyboard.press("Meta+k");
		await expect(page.getByRole("dialog")).toBeVisible();
		// Search input should be auto-focused
		const input = page.getByRole("textbox");
		await expect(input).toBeFocused();
	});

	test("Escape closes the search panel", async ({ page }) => {
		await page.keyboard.press("Meta+k");
		await expect(page.getByRole("dialog")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).not.toBeVisible();
	});

	test("typing in search shows results or empty state", async ({ page }) => {
		// Mock empty results so the assertion is deterministic regardless
		// of the dev-server seed data.
		await page.route("**/api/search*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ conversations: [], work: [], knowledge: [] }),
			});
		});
		await page.keyboard.press("Meta+k");
		const input = page.getByRole("textbox");
		await input.fill("nonexistent-search-term-xyz");
		// EmptyState's data-testid is decoupled from copy; matches GlobalSearchPanel.tsx.
		await expect(page.getByTestId("search-empty")).toBeVisible();
	});

	test("clicking a work result navigates to /work/bet/{id} (I4 N3)", async ({ page }) => {
		// Mock the search API to return a predictable work result.
		await page.route("**/api/search*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					conversations: [],
					work: [
						{
							id: "b99",
							title: "E2E Work Result",
							product: "HyperIdle",
							status: "committed",
							appetite: "2 weeks",
						},
					],
					knowledge: [],
				}),
			});
		});

		await page.keyboard.press("Meta+k");
		const input = page.getByRole("textbox");
		await input.fill("e2e");
		await expect(page.getByText("E2E Work Result")).toBeVisible();
		await page.getByText("E2E Work Result").click();
		await expect(page).toHaveURL(/\/work\/bet\/b99$/);
	});

	test("clearing the query clears the results (I4 N2)", async ({ page }) => {
		await page.route("**/api/search*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					conversations: [],
					work: [
						{
							id: "bx",
							title: "Some Bet Result",
							product: "HyperIdle",
							status: "committed",
							appetite: "1 week",
						},
					],
					knowledge: [],
				}),
			});
		});

		await page.keyboard.press("Meta+k");
		const input = page.getByRole("textbox");
		await input.fill("bet");
		await expect(page.getByText("Some Bet Result")).toBeVisible();
		await input.fill("");
		await expect(page.getByText("Some Bet Result")).not.toBeVisible();
	});
});
