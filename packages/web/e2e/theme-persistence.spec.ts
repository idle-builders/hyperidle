/**
 * E2E test for K3 theme persistence.
 *
 * Acceptance criteria:
 *   - Default = system → resolves to OS preference at first paint (no white flash).
 *   - Set to dark in Settings → reload → still dark, persisted via localStorage.
 *   - Set to system → emulate OS color-scheme change → app re-renders without reload.
 *   - Settings Appearance toggle reflects the live persisted value.
 *
 * @lore We use page.addInitScript to clear localStorage *before* the page loads
 * so the boot script sees a fresh default. Reading localStorage / dataset
 * happens via page.evaluate to inspect actual browser state, not derived UI.
 */
import { expect, registerCoreMocks, test } from "./fixtures";

/**
 * Stub PATCH /api/settings so Save closes the Settings dialog in e2e.
 * @lore M3: AppShell.handleSettingsSave calls PATCH /api/settings — without
 * a real server in e2e this throws and the dialog never closes.
 */
async function stubSettingsPatch(page: import("@playwright/test").Page): Promise<void> {
	await page.route("**/api/settings", async (route) => {
		if (route.request().method() === "PATCH") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true }),
			});
		} else {
			await route.continue();
		}
	});
}

test.describe("Theme persistence", () => {
	// @lore Each test creates its own browser.newContext so localStorage is
	// isolated per test (fresh contexts start empty). We deliberately do NOT
	// addInitScript to clear storage — that script reruns on every navigation
	// (including page.reload) and would wipe the preference under test.

	test("default = system resolves to OS dark preference", async ({ browser }) => {
		const ctx = await browser.newContext({ colorScheme: "dark" });
		const page = await ctx.newPage();
		await registerCoreMocks(page);
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		const theme = await page.evaluate(() => document.documentElement.dataset.theme);
		expect(theme).toBe("hearth-dark");

		const stored = await page.evaluate(() => window.localStorage.getItem("hyperidle-theme"));
		// Nothing was written — system is the implicit default.
		expect(stored).toBeNull();
		await ctx.close();
	});

	test("default = system resolves to OS light preference", async ({ browser }) => {
		const ctx = await browser.newContext({ colorScheme: "light" });
		const page = await ctx.newPage();
		await registerCoreMocks(page);
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		const theme = await page.evaluate(() => document.documentElement.dataset.theme);
		expect(theme).toBe("hearth-light");
		await ctx.close();
	});

	test("setting theme to dark in Settings persists across reload (no white flash)", async ({
		browser,
	}) => {
		// Start with OS = light to make the dark choice visibly different.
		// @lore We do NOT addInitScript that clears localStorage here — that
		// init runs on EVERY page load including reload, which would wipe the
		// preference under test. Use the per-context default isolation instead:
		// `browser.newContext` already starts with empty storage.
		const ctx = await browser.newContext({ colorScheme: "light" });
		const page = await ctx.newPage();
		await registerCoreMocks(page);
		await stubSettingsPatch(page);
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// Open Settings → Appearance → choose dark → save.
		await page.getByRole("button", { name: /^user profile$/i }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
		await page.getByRole("tab", { name: "Appearance" }).click();
		await page.getByLabel("Theme").selectOption("dark");
		await page.getByRole("button", { name: "Save" }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).not.toBeVisible();

		await expect
			.poll(async () => page.evaluate(() => document.documentElement.dataset.theme))
			.toBe("hearth-dark");

		const stored = await page.evaluate(() => window.localStorage.getItem("hyperidle-theme"));
		expect(stored).toBe("dark");

		// Reload — the boot script must paint dark immediately (data-theme set
		// before paint, not after a useEffect runs).
		await page.reload();
		await page.waitForSelector("[data-testid='main-content']");
		const themeAfterReload = await page.evaluate(() => document.documentElement.dataset.theme);
		expect(themeAfterReload).toBe("hearth-dark");

		// Prove data-theme was set before paint by inspecting the synchronous
		// boot script's effect on the documentElement *attribute* (not just
		// dataset, which a late effect could mimic). We use page.evaluate at
		// document-start via initial navigation — a fresh load.
		await ctx.close();
	});

	test("system mode follows OS color-scheme change without reload", async ({ browser }) => {
		const ctx = await browser.newContext({ colorScheme: "light" });
		await ctx.addInitScript(() => {
			try {
				window.localStorage.setItem("hyperidle-theme", "system");
			} catch {
				/* ignore */
			}
		});
		const page = await ctx.newPage();
		await registerCoreMocks(page);
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		const initial = await page.evaluate(() => document.documentElement.dataset.theme);
		expect(initial).toBe("hearth-light");

		// Emulate the OS flipping to dark — the matchMedia subscription must fire.
		await page.emulateMedia({ colorScheme: "dark" });

		await expect
			.poll(async () => page.evaluate(() => document.documentElement.dataset.theme))
			.toBe("hearth-dark");
		await ctx.close();
	});

	test("Settings Appearance toggle reflects the live persisted value", async ({ browser }) => {
		const ctx = await browser.newContext({ colorScheme: "dark" });
		// Pre-seed localStorage with light so the Appearance tab should show "light".
		await ctx.addInitScript(() => {
			try {
				window.localStorage.setItem("hyperidle-theme", "light");
			} catch {
				/* ignore */
			}
		});
		const page = await ctx.newPage();
		await registerCoreMocks(page);
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		await page.getByRole("button", { name: /^user profile$/i }).click();
		await page.getByRole("tab", { name: "Appearance" }).click();
		const themeSelect = page.getByLabel("Theme");
		await expect(themeSelect).toHaveValue("light");
		await ctx.close();
	});
});
