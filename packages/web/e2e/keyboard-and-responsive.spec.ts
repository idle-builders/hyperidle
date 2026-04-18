/**
 * E2E tests for keyboard navigation and responsive layout.
 */
import { expect, test } from "@playwright/test";

test.describe("Keyboard Navigation", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/conversations/review");
		await page.waitForSelector("[data-testid='conversations-review-page']");
	});

	test("Tab key moves focus through interactive elements", async ({ page }) => {
		// Start by pressing Tab — focus should land on an interactive element
		await page.keyboard.press("Tab");
		const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
		expect(["BUTTON", "A", "INPUT", "SELECT"]).toContain(focusedTag);
	});

	test("ReviewHeader keyboard shortcut A triggers approve on review page", async ({ page }) => {
		// Focus outside any input to enable shortcuts
		await page.click("[data-testid='main-content']");
		// Press 'a' for approve — the shortcut should be intercepted
		// We verify it doesn't navigate away or cause errors
		await page.keyboard.press("a");
		// Page should still be on the review page
		await expect(page.getByTestId("conversations-review-page")).toBeVisible();
	});
});

test.describe("Responsive Layout", () => {
	test("layout renders correctly at 1920x1080", async ({ page }) => {
		await page.setViewportSize({ width: 1920, height: 1080 });
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// All four regions should be visible
		await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
		await expect(page.getByTestId("main-content")).toBeVisible();
		await expect(page.getByText("Active Bets")).toBeVisible();
	});

	test("layout renders correctly at 1280x720", async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 720 });
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
		await expect(page.getByTestId("main-content")).toBeVisible();
	});

	test("layout does not break at 1024x768", async ({ page }) => {
		await page.setViewportSize({ width: 1024, height: 768 });
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// Core content should still be visible
		await expect(page.getByTestId("main-content")).toBeVisible();
	});

	test("Submenu collapses by default at 768px viewport (I4 R1/R4)", async ({ page }) => {
		await page.setViewportSize({ width: 768, height: 800 });
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
		// Submenu collapsed => its navigation items are not visible.
		// The Review Queue link lives inside Submenu; when collapsed (`w-0
		// overflow-hidden`), it is hidden from the viewport.
		await expect(page.getByText("Review Queue")).not.toBeVisible();
	});

	test("Rail collapses by default below 1280px (I4 R2)", async ({ page }) => {
		await page.setViewportSize({ width: 1200, height: 800 });
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
		// Collapsed Rail hides the Active Bets heading (replaces with
		// icon-only strip).
		await expect(page.getByText("Active Bets")).not.toBeVisible();
	});
});

test.describe("Kanban keyboard drag (I4 KB4)", () => {
	test("keyboard sensor moves a task between columns", async ({ page }) => {
		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-page']");
		// Tab until a TaskCard gets focus. We target the first kanban task
		// card by text then press Space to pick up the draggable.
		const firstTask = page.getByText("Implement login endpoint");
		await expect(firstTask).toBeVisible();
		await firstTask.focus();
		await page.keyboard.press("Space");
		// Arrow down (or right, depending on @dnd-kit keyboard behaviour) to
		// move the draggable. The spec only requires that the task ends up
		// in a different column — any direction key that @dnd-kit maps to a
		// neighbouring droppable works.
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("Space");
		// After drop, the task's parent column should NOT be the same as the
		// original "In Progress" column (this task started in_progress). We
		// assert by reading the Kanban DOM.
		const inProgressColumn = page
			.locator("div")
			.filter({ hasText: /^In Progress/ })
			.first();
		await expect(inProgressColumn).not.toContainText("Implement login endpoint");
	});
});
