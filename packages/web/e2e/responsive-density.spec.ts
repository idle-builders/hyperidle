/**
 * K8 — Responsive density + theme persistence across viewport breakpoints.
 *
 * Acceptance criteria from TRACK-K.md K8:
 *  (a) At the K1-specified mobile breakpoint (≤ 1024px), default density
 *      preference (`auto`) resolves to the K1-mobile preset (`comfortable`).
 *  (b) Explicit user override in Settings (e.g. `compact`) persists across
 *      breakpoint changes — the explicit choice wins over the viewport.
 *  (c) Theme persistence (from K3) holds across breakpoint changes — flipping
 *      from desktop → mobile does not lose the persisted theme value.
 *
 * @lore We assert the resolved [data-density] attribute on the AppShell, NOT
 * the preference, because the preference is `auto` and the *resolution* is
 * what actually drives the cascade. We also assert [data-density-preference]
 * to prove the preference itself was not mutated by the viewport switch.
 */
import { expect, test } from "@playwright/test";

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 1024, height: 800 }; // ≤ 1024 per K1 mobile breakpoint
const NARROW = { width: 390, height: 800 }; // iPhone-ish

async function readShellAttrs(
	page: import("@playwright/test").Page,
): Promise<{ density: string | null; preference: string | null; theme: string | null }> {
	return page.evaluate(() => {
		const shell = document.querySelector("[data-density]");
		return {
			density: shell?.getAttribute("data-density") ?? null,
			preference: shell?.getAttribute("data-density-preference") ?? null,
			theme: document.documentElement.dataset.theme ?? null,
		};
	});
}

test.describe("K8 — Responsive density resolution", () => {
	test("auto preference + viewport ≤ 1024 → resolves to comfortable", async ({ browser }) => {
		const ctx = await browser.newContext({ viewport: MOBILE, colorScheme: "dark" });
		const page = await ctx.newPage();
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		const attrs = await readShellAttrs(page);
		expect(attrs.preference).toBe("auto");
		expect(attrs.density).toBe("comfortable");
		await ctx.close();
	});

	test("auto preference + desktop viewport → resolves to default", async ({ browser }) => {
		const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: "dark" });
		const page = await ctx.newPage();
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		const attrs = await readShellAttrs(page);
		expect(attrs.preference).toBe("auto");
		expect(attrs.density).toBe("default");
		await ctx.close();
	});

	test("auto preference flips when viewport crosses the breakpoint live", async ({ browser }) => {
		const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: "dark" });
		const page = await ctx.newPage();
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		expect((await readShellAttrs(page)).density).toBe("default");

		await page.setViewportSize(MOBILE);
		await expect.poll(async () => (await readShellAttrs(page)).density).toBe("comfortable");

		await page.setViewportSize(DESKTOP);
		await expect.poll(async () => (await readShellAttrs(page)).density).toBe("default");
		await ctx.close();
	});
});

test.describe("K8 — Explicit density override wins over viewport", () => {
	test("user picks compact in Settings; survives breakpoint change", async ({ browser }) => {
		const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: "dark" });
		const page = await ctx.newPage();
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// Open Settings → Appearance → choose compact → save.
		await page.getByRole("button", { name: /^user profile$/i }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
		await page.getByRole("tab", { name: "Appearance" }).click();
		await page.getByLabel("Density").selectOption("compact");
		await page.getByRole("button", { name: "Save" }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).not.toBeVisible();

		await expect.poll(async () => (await readShellAttrs(page)).density).toBe("compact");

		// Shrink to mobile — explicit choice must win, NOT auto-flip to comfortable.
		await page.setViewportSize(MOBILE);
		// Wait a tick for the resize listener; assert it did NOT change.
		await page.waitForTimeout(300);
		const mobileAttrs = await readShellAttrs(page);
		expect(mobileAttrs.preference).toBe("compact");
		expect(mobileAttrs.density).toBe("compact");

		// Shrink further to narrow phone — still compact.
		await page.setViewportSize(NARROW);
		await page.waitForTimeout(200);
		expect((await readShellAttrs(page)).density).toBe("compact");
		await ctx.close();
	});
});

test.describe("K8 — Theme persistence across breakpoint changes", () => {
	test("persisted theme survives desktop → mobile resize", async ({ browser }) => {
		// OS = light so dark choice is visibly different.
		const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: "light" });
		const page = await ctx.newPage();
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// Set theme = dark via Settings.
		await page.getByRole("button", { name: /^user profile$/i }).click();
		await page.getByRole("tab", { name: "Appearance" }).click();
		await page.getByLabel("Theme").selectOption("dark");
		await page.getByRole("button", { name: "Save" }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).not.toBeVisible();

		await expect
			.poll(async () => page.evaluate(() => document.documentElement.dataset.theme))
			.toBe("lucid-dark");

		// Resize to mobile — theme must hold.
		await page.setViewportSize(MOBILE);
		await page.waitForTimeout(200);
		expect((await readShellAttrs(page)).theme).toBe("lucid-dark");

		// Resize back to desktop — still dark.
		await page.setViewportSize(DESKTOP);
		await page.waitForTimeout(200);
		expect((await readShellAttrs(page)).theme).toBe("lucid-dark");

		// Reload at mobile viewport — boot script must re-paint dark.
		await page.setViewportSize(MOBILE);
		await page.reload();
		await page.waitForSelector("[data-testid='main-content']");
		expect((await readShellAttrs(page)).theme).toBe("lucid-dark");
		await ctx.close();
	});
});
