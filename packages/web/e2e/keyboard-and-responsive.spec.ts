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

	test("L11: pressing 'a' on the review page does NOT trigger any verdict shortcut", async ({
		page,
	}) => {
		// L11 plan §6.3 + AC-3 — verdict-keyboard shortcuts (A/R/X/S/C/I/E)
		// were removed alongside the deleted top toolbar. The page must
		// remain stable after a stray 'a' keypress and not focus an INPUT.
		await page.click("[data-testid='main-content']");
		await page.keyboard.press("a");
		await expect(page.getByTestId("conversations-review-page")).toBeVisible();
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

// @lore L15: the previous "Kanban keyboard drag (I4 KB4)" describe block
// was deleted alongside L15's removal of @dnd-kit drag from the Kanban —
// tasks are agent-team-owned, humans request via the kebab + thread.
// Drag-as-no-op is asserted by `kanban-drag-noop.spec.ts`.
