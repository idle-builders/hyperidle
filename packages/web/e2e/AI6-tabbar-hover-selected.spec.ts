/**
 * AI6 — TabBar hover vs selected two-tone E2E.
 *
 * AC: "Hovered vs selected are visually distinct in components with both states independent."
 * Proof surface: TabBar (slash-menu's selection follows hover by design — excluded per §4).
 *
 * TabBar implements the distinction via:
 *   - Underline variant selected:   bg-[var(--accent-primary-dim)] + text-[var(--accent-primary)] + accent border
 *   - Underline variant inactive:   transparent bg + hover:text-[var(--text-secondary)]
 *   - Pill variant selected:        bg-[var(--surface-elevated)] + text-[var(--accent-primary)] + shadow
 *   - Pill variant inactive:        transparent bg + hover:text-[var(--text-primary)]
 *
 * Discriminator for underline: `accent-primary-dim` on selected bg vs no bg on inactive.
 * Discriminator for both:      selected has non-transparent bg class; inactive has no bg class.
 * Text discriminator (both):   selected has `accent-primary` text; inactive does not.
 *
 * C2 fix: catalog defaults to modules[0] — navigate to #TabBar before asserting.
 * The UnderlineVariant story renders the tab with accent-primary-dim bg on selected.
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
		// Navigate directly to the TabBar section — NOT the default landing.
		// UnderlineVariant story renders the tab with accent-primary-dim on selected.
		await page.goto("/designsystem#TabBar::UnderlineVariant", {
			waitUntil: "domcontentloaded",
		});
		await page.waitForTimeout(1500);
	});

	test("underline-variant selected TabBar tab has accent-primary-dim background class", async ({
		page,
	}) => {
		// The UnderlineVariant story renders data-ds-component="TabBar" with underline variant.
		// Selected tab (aria-selected="true") must carry accent-primary-dim.
		const tabBar = page.locator("[data-ds-component='TabBar']").first();
		await expect(tabBar).toBeVisible();

		const selectedTab = tabBar.locator("button[aria-selected='true']").first();
		await expect(selectedTab).toBeVisible();

		const className = await selectedTab.getAttribute("class");
		expect(className).toContain("accent-primary-dim");
	});

	test("hovered-inactive TabBar tab does NOT have accent-primary-dim background", async ({
		page,
	}) => {
		const tabBar = page.locator("[data-ds-component='TabBar']").first();
		await expect(tabBar).toBeVisible();

		// Need at least one inactive tab.
		const inactiveTabs = tabBar.locator("button[aria-selected='false']");
		const inactiveCount = await inactiveTabs.count();
		expect(inactiveCount).toBeGreaterThan(0);

		// Hover the first inactive tab.
		await inactiveTabs.first().hover();
		await page.waitForTimeout(100);

		// Hovered-inactive tab must NOT have accent-primary-dim background.
		const className = await inactiveTabs.first().getAttribute("class");
		expect(className).not.toContain("accent-primary-dim");
	});

	test("selected tab has accent-primary text color class; inactive uses tertiary/secondary text", async ({
		page,
	}) => {
		const tabBar = page.locator("[data-ds-component='TabBar']").first();
		await expect(tabBar).toBeVisible();

		const selectedTab = tabBar.locator("button[aria-selected='true']").first();
		const inactiveTab = tabBar.locator("button[aria-selected='false']").first();
		await expect(selectedTab).toBeVisible();
		await expect(inactiveTab).toBeVisible();

		const selectedClass = await selectedTab.getAttribute("class");
		const inactiveClass = await inactiveTab.getAttribute("class");

		// Selected: must carry text-[var(--accent-primary)] (text color) and accent border.
		// This is the underline variant: "text-[var(--accent-primary)] font-semibold border-[var(--accent-primary)]"
		expect(selectedClass).toContain("text-[var(--accent-primary)]");
		// Inactive: uses text-tertiary or text-secondary (not accent text).
		// The hover class has "hover:text-[var(--text-secondary)]" — at rest it's text-tertiary.
		// Neither carries "text-[var(--accent-primary)]" as a non-hover class.
		expect(inactiveClass).not.toContain("text-[var(--accent-primary)]");
		// The inactive tab DOES have the focus-visible:outline-[var(--accent-primary)] class
		// (focus ring), but that's NOT a text color and is focus-only.
		// Asserting on "text-[var(--accent-primary)]" correctly excludes the focus ring.
		expect(inactiveClass).toContain("text-[var(--text-tertiary)]");
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
