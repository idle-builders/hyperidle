/**
 * E2E tests for keyboard navigation and responsive layout.
 */
import { expect, test } from "./fixtures";

test.describe("Keyboard Navigation", () => {
	// L9: /conversations/review redirects to /conversations; use canonical URL.
	test.beforeEach(async ({ page }) => {
		await page.goto("/conversations");
		await page.waitForSelector("[data-testid='conversations-page']");
	});

	test("Tab key moves focus through interactive elements", async ({ page }) => {
		// Start by pressing Tab — focus should land on an interactive element
		await page.keyboard.press("Tab");
		const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
		expect(["BUTTON", "A", "INPUT", "SELECT"]).toContain(focusedTag);
	});

	test("L11: pressing 'a' on the conversations page does NOT trigger any verdict shortcut", async ({
		page,
	}) => {
		// L11 plan §6.3 + AC-3 — verdict-keyboard shortcuts (A/R/X/S/C/I/E)
		// were removed alongside the deleted top toolbar. The page must
		// remain stable after a stray 'a' keypress and not focus an INPUT.
		await page.click("[data-testid='main-content']");
		await page.keyboard.press("a");
		await expect(page.getByTestId("conversations-page")).toBeVisible();
		const activeTag = await page.evaluate(() => document.activeElement?.tagName);
		expect(activeTag).not.toBe("INPUT");
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
		await expect(page.getByText("Active Bets").first()).toBeVisible();
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

	// @lore U6: Submenu and Rail were deleted. The Sidebar is always visible as a
	// fixed 200px column on desktop. At mobile viewports (<=768px) the Sidebar
	// may be hidden — but the current implementation does not collapse it.
	// These responsive tests verify the core layout remains functional.
	test("Sidebar is present in the layout at 768px viewport", async ({ page }) => {
		await page.setViewportSize({ width: 768, height: 800 });
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
		// The Sidebar should be present in the DOM (may or may not be visible
		// depending on mobile layout handling).
		await expect(page.locator("[data-ds-shell='Sidebar']")).toBeAttached();
	});

	test("main content area is visible at 1200px viewport", async ({ page }) => {
		await page.setViewportSize({ width: 1200, height: 800 });
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
		await expect(page.getByTestId("main-content")).toBeVisible();
	});
});

// @lore L15: The "Kanban keyboard drag (I4 KB4)" test.describe block that
// previously tested KeyboardSensor activation and keyboard-column-move was
// deleted here. L15 removed drag entirely from Kanban task cards
// (architecture §A — "Strip drag from Kanban.tsx"). The corresponding unit
// tests (Kanban.keyboard-drag.test.tsx) were also retired in the same
// workpackage. These e2e tests referenced draggable-task-* testids and
// data-droppable-column attributes that no longer exist in production DOM.
