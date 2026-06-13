/**
 * AI6 — TabBar hover vs selected two-tone E2E.
 *
 * AC: "Hovered vs selected are visually distinct in components with both states independent."
 * Proof surface: TabBar (slash-menu's selection follows hover by design — excluded per §4).
 *
 * TabBar implements the distinction via:
 *   - Selected:       bg-[var(--accent-primary-dim)] + text-[var(--accent-primary)] + accent border
 *   - Hovered-inactive: transparent bg + hover:text-[var(--text-secondary)]
 *
 * The discriminator is bg-PRESENCE (non-transparent) on selected vs NO bg on hovered-inactive.
 *
 * These tests FAIL until the TabBar focus + hover assertions are verified against
 * the actual rendered classes (the test probes class attributes, not computed styles,
 * since jsdom-level Tailwind doesn't compute CSS variables).
 *
 * Strategy: render a TabBar with tab B selected, hover tab A (index 0), take a
 * screenshot, and assert:
 *   - Selected B has `accent-primary-dim` in its class list (bg token).
 *   - Hovered-inactive A does NOT have `accent-primary-dim` in its class list.
 *   - Selected B has `accent-primary` in its text-color class.
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures";

const PROOF_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../plans/AI6/screenshots",
);

import * as fs from "node:fs";

test.beforeAll(() => {
	fs.mkdirSync(PROOF_DIR, { recursive: true });
});

test.describe("AI6 — TabBar hover vs selected two-tone", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/designsystem", { waitUntil: "domcontentloaded" });
		await page.waitForTimeout(1500);
	});

	test("selected TabBar tab has accent-primary-dim background class", async ({ page }) => {
		// The TabBar is rendered in the design system catalog.
		// The 'underline' variant uses selected state directly.
		const tabBar = page.locator("[data-ds-component='TabBar']").first();
		await expect(tabBar).toBeVisible();

		// Selected tab button (aria-selected="true")
		const selectedTab = tabBar.locator("button[aria-selected='true']").first();
		await expect(selectedTab).toBeVisible();

		// Selected tab must carry the accent-primary-dim background class.
		const className = await selectedTab.getAttribute("class");
		expect(className).toContain("accent-primary-dim");
	});

	test("hovered-inactive TabBar tab does NOT have accent-primary-dim background", async ({
		page,
	}) => {
		const tabBar = page.locator("[data-ds-component='TabBar']").first();
		await expect(tabBar).toBeVisible();

		// Inactive tab (not selected)
		const inactiveTabs = tabBar.locator("button[aria-selected='false']");
		const inactiveCount = await inactiveTabs.count();
		// Need at least one inactive tab to prove the two-tone.
		expect(inactiveCount).toBeGreaterThan(0);

		// Hover the first inactive tab.
		await inactiveTabs.first().hover();
		await page.waitForTimeout(100); // allow hover state to settle

		// Hovered-inactive tab must NOT have accent-primary-dim background.
		const className = await inactiveTabs.first().getAttribute("class");
		expect(className).not.toContain("accent-primary-dim");
	});

	test("selected tab has accent-primary text class; inactive does not", async ({ page }) => {
		const tabBar = page.locator("[data-ds-component='TabBar']").first();
		await expect(tabBar).toBeVisible();

		const selectedTab = tabBar.locator("button[aria-selected='true']").first();
		const inactiveTab = tabBar.locator("button[aria-selected='false']").first();
		await expect(selectedTab).toBeVisible();
		await expect(inactiveTab).toBeVisible();

		const selectedClass = await selectedTab.getAttribute("class");
		const inactiveClass = await inactiveTab.getAttribute("class");

		// Selected: accent-primary text.
		expect(selectedClass).toContain("accent-primary");
		// Inactive: text-secondary (or text-tertiary at rest) — no accent.
		expect(inactiveClass).not.toContain("accent-primary");
	});

	test("side-by-side screenshot: selected + hovered inactive TabBar tabs", async ({ page }) => {
		const tabBar = page.locator("[data-ds-component='TabBar']").first();
		await expect(tabBar).toBeVisible();

		// Hover an inactive tab for the screenshot.
		const inactiveTabs = tabBar.locator("button[aria-selected='false']");
		if ((await inactiveTabs.count()) > 0) {
			await inactiveTabs.first().hover();
		}

		await tabBar.screenshot({
			path: path.join(PROOF_DIR, "AI6-tabbar-hover-selected.png"),
		});
		expect(fs.existsSync(path.join(PROOF_DIR, "AI6-tabbar-hover-selected.png"))).toBe(true);
	});
});
