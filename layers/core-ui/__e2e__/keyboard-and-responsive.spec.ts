/**
 * Real-browser checks: keyboard reachability on the conversations page, and
 * that the shell's layout (Sidebar + Main) survives across viewport widths
 * from mobile to desktop.
 */
import { expect, test } from "./fixtures";

test.describe("Keyboard Navigation", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/conversations");
		await page.waitForSelector("[data-testid='conversations-page']");
	});

	test("Tab key moves focus through interactive elements", async ({ page }) => {
		await page.keyboard.press("Tab");
		const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
		expect(["BUTTON", "A", "INPUT", "SELECT"]).toContain(focusedTag);
	});

	test("pressing 'a' on the conversations page does not trigger any shortcut", async ({ page }) => {
		// The verdict-keyboard shortcuts (A/R/X/S/C/I/E) were removed alongside
		// the deleted top toolbar. The page must remain stable after a stray
		// 'a' keypress and not focus an INPUT.
		await page.click("[data-testid='main-content']");
		await page.keyboard.press("a");
		await expect(page.getByTestId("conversations-page")).toBeVisible();
		const activeTag = await page.evaluate(() => document.activeElement?.tagName);
		expect(activeTag).not.toBe("INPUT");
	});
});

test.describe("Responsive Layout", () => {
	for (const viewport of [
		{ width: 1920, height: 1080 },
		{ width: 1280, height: 720 },
		{ width: 1024, height: 768 },
	] as const) {
		test(`Sidebar and Main content stay visible at ${viewport.width}x${viewport.height}`, async ({
			page,
		}) => {
			await page.setViewportSize(viewport);
			await page.goto("/conversations");
			await page.waitForSelector("[data-testid='main-content']");

			await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
			await expect(page.getByTestId("main-content")).toBeVisible();
		});
	}

	// At the 768px mobile cut (useViewportBreakpoint.ts), the shell swaps to
	// its mobile chrome — Main content staying visible is the contract that
	// survives the swap.
	test("Main content stays visible at the 768px mobile breakpoint", async ({ page }) => {
		await page.setViewportSize({ width: 768, height: 800 });
		await page.goto("/conversations");
		await page.waitForSelector("[data-testid='main-content']");

		await expect(page.getByTestId("main-content")).toBeVisible();
	});
});
