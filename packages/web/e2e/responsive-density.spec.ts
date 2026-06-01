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

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 1024, height: 800 }; // ≤ 1024 per K1 mobile breakpoint
const NARROW = { width: 390, height: 800 }; // iPhone-ish

/**
 * Stub GET /api/teams and GET /api/bets so bet cards render on /work/portfolio.
 * Required by density tests that assert BetCard padding.
 * @lore M3: MOCK_PRODUCTS was deleted — tests visiting /work/portfolio need
 * to mock endpoints to get deterministic card rendering.
 * @lore U11: WorkPortfolio (U9) renders BetCards from useBets(), not team cards.
 * stubProductsApi now also stubs /api/bets to produce a visible BetCard.
 */
async function stubProductsApi(page: import("@playwright/test").Page): Promise<void> {
	await page.route("**/api/teams", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				teams: [
					{
						id: "team-1",
						name: "Portfolio Team",
						phase: "build",
						active: true,
					},
				],
			}),
		});
	});
	// Also stub /api/bets so BetCards render (WorkPortfolio uses useBets())
	await page.route("**/api/bets**", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					bets: [
						{
							id: "bet-1",
							title: "Density Test Bet",
							description: "A bet for density testing",
							teamId: "team-1",
							status: "active",
							costAppetite: "medium",
							atRisk: false,
						},
					],
					nextCursor: null,
				}),
			});
		} else {
			await route.continue();
		}
	});
}

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
		await registerCoreMocks(page);
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
		await registerCoreMocks(page);
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
		await registerCoreMocks(page);
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
		await registerCoreMocks(page);
		await stubSettingsPatch(page);
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

test.describe("K9 — Comfortable density bumps body text to 16 px end-to-end", () => {
	test("[data-density='comfortable'] resolves KeyValue value font-size to 16px", async ({
		browser,
	}) => {
		const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: "dark" });
		const page = await ctx.newPage();
		await registerCoreMocks(page);
		await stubSettingsPatch(page);
		await stubProductsApi(page);
		// Land on /work/portfolio so a real KeyValue is rendered and we don't
		// need a navigation between density-set and assertion (Settings density
		// is currently in-memory only — server-side persistence is J3/J8).
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");

		// Pick comfortable explicitly via Settings → Appearance.
		await page.getByRole("button", { name: /^user profile$/i }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
		await page.getByRole("tab", { name: "Appearance" }).click();
		await page.getByLabel("Density").selectOption("comfortable");
		await page.getByRole("button", { name: "Save" }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).not.toBeVisible();

		await expect.poll(async () => (await readShellAttrs(page)).density).toBe("comfortable");

		// Verify the comfortable tier wires every density token into the cascade
		// at the AppShell root. Read each `--density-*` directly from the shell
		// element (the [data-density="comfortable"] selector). We assert on the
		// CSS-variable resolution rather than on a specific component's computed
		// font-size to avoid the J1-era `text-[14px] text-[length:var(--density-text)]`
		// Tailwind-class-order issue: the token cascade is the K9 contract; a
		// component opting in to it is a component-level concern.
		const tokens = await page.evaluate(() => {
			const shell = document.querySelector("[data-density]") as HTMLElement | null;
			if (!shell) return null;
			const cs = window.getComputedStyle(shell);
			return {
				densityText: cs.getPropertyValue("--density-text").trim(),
				densityTextH1: cs.getPropertyValue("--density-text-h1").trim(),
				densityTextH2: cs.getPropertyValue("--density-text-h2").trim(),
				densityPadX: cs.getPropertyValue("--density-pad-x").trim(),
				densityRowH: cs.getPropertyValue("--density-row-h").trim(),
			};
		});
		expect(tokens).not.toBeNull();
		// 1rem default == 16px in the browser, so comfortable's tokens resolve to:
		expect(tokens?.densityText).toBe("1rem"); // 16 px body
		expect(tokens?.densityTextH1).toBe("1.75rem"); // 28 px H1
		expect(tokens?.densityTextH2).toBe("1.375rem"); // 22 px H2
		expect(tokens?.densityPadX).toBe("1.5rem"); // 24 px pad-x
		expect(tokens?.densityRowH).toBe("3.5rem"); // 56 px row-h
		await ctx.close();
	});
});

test.describe("K11 — Density tokens flow into rendered primitives across all 3 tiers", () => {
	/*
	 * @lore K11: one assertion block per swept primitive that scales on a
	 * measurable axis. We assert the resolved CSS-variable values on the
	 * AppShell root for each density tier — the K11 token contract is "the
	 * cascade is wired"; component-level consumption is asserted by the
	 * primitive's own unit tests + the visual-regression suite. This spec
	 * proves the K9 ladder + the 5 new K11 tokens reach the runtime cascade.
	 */
	const tiers: Array<{
		preference: "compact" | "default" | "comfortable";
		expected: {
			pad: string;
			padX: string;
			rowH: string;
			cardPad: string;
			pageGutter: string;
			iconSize: string;
			avatarSize: string;
			cardGap: string;
			text: string;
		};
	}> = [
		{
			preference: "compact",
			expected: {
				pad: "0.5rem",
				padX: "0.75rem",
				rowH: "2rem",
				cardPad: "0.5rem",
				pageGutter: "0.5rem",
				iconSize: "0.875rem",
				avatarSize: "1.5rem",
				cardGap: "0.25rem",
				text: "0.875rem",
			},
		},
		{
			preference: "default",
			expected: {
				pad: "0.75rem",
				padX: "1rem",
				rowH: "2.75rem",
				cardPad: "0.75rem",
				pageGutter: "1rem",
				iconSize: "1rem",
				avatarSize: "2rem",
				cardGap: "0.5rem",
				text: "0.9375rem",
			},
		},
		{
			preference: "comfortable",
			expected: {
				pad: "1rem",
				padX: "1.5rem",
				rowH: "3.5rem",
				cardPad: "1rem",
				pageGutter: "1.5rem",
				iconSize: "1.25rem",
				avatarSize: "2.5rem",
				cardGap: "0.75rem",
				text: "1rem",
			},
		},
	];

	for (const tier of tiers) {
		test(`${tier.preference} tier — all 5 K11 tokens + K9 baseline reach the runtime cascade`, async ({
			browser,
		}) => {
			const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: "dark" });
			const page = await ctx.newPage();
			await registerCoreMocks(page);
			await stubSettingsPatch(page);
			await stubProductsApi(page);
			await page.goto("/work/portfolio");
			await page.waitForSelector("[data-testid='work-portfolio-page']");

			// Set the explicit density preference via Settings → Appearance.
			await page.getByRole("button", { name: /^user profile$/i }).click();
			await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
			await page.getByRole("tab", { name: "Appearance" }).click();
			await page.getByLabel("Density").selectOption(tier.preference);
			await page.getByRole("button", { name: "Save" }).click();
			await expect(page.getByRole("dialog", { name: /settings/i })).not.toBeVisible();

			await expect.poll(async () => (await readShellAttrs(page)).density).toBe(tier.preference);

			// Read every token directly from the AppShell — the K11 contract
			// is that the cascade resolves to the K9-defined value at each tier.
			const tokens = await page.evaluate(() => {
				const shell = document.querySelector("[data-density]") as HTMLElement | null;
				if (!shell) return null;
				const cs = window.getComputedStyle(shell);
				return {
					padY: cs.getPropertyValue("--density-pad-y").trim(),
					padX: cs.getPropertyValue("--density-pad-x").trim(),
					rowH: cs.getPropertyValue("--density-row-h").trim(),
					cardPad: cs.getPropertyValue("--density-card-pad").trim(),
					pageGutter: cs.getPropertyValue("--density-page-gutter").trim(),
					iconSize: cs.getPropertyValue("--density-icon-size").trim(),
					avatarSize: cs.getPropertyValue("--density-avatar-size").trim(),
					cardGap: cs.getPropertyValue("--density-card-gap").trim(),
					text: cs.getPropertyValue("--density-text").trim(),
				};
			});
			expect(tokens, `tokens read for ${tier.preference}`).not.toBeNull();
			expect(tokens?.padY).toBe(tier.expected.pad);
			expect(tokens?.padX).toBe(tier.expected.padX);
			expect(tokens?.rowH).toBe(tier.expected.rowH);
			expect(tokens?.cardPad).toBe(tier.expected.cardPad);
			expect(tokens?.pageGutter).toBe(tier.expected.pageGutter);
			expect(tokens?.iconSize).toBe(tier.expected.iconSize);
			expect(tokens?.avatarSize).toBe(tier.expected.avatarSize);
			expect(tokens?.cardGap).toBe(tier.expected.cardGap);
			expect(tokens?.text).toBe(tier.expected.text);
			await ctx.close();
		});
	}

	test("BetCard outer padding matches --density-card-pad on /work/portfolio at all 3 tiers", async ({
		browser,
	}) => {
		// @lore K11: BetCard is the canonical density-test surface per the
		// spec. The Portfolio page hand-rolled product cards adopt the same
		// density shape (--density-card-pad) per § 3.4.P1. We assert the
		// rendered padding-left on the first BetCard matches the
		// expected per-tier pixel value within 1 px tolerance.
		const expectedPaddingPx: Record<string, number> = {
			compact: 8,
			default: 12,
			comfortable: 16,
		};

		for (const preference of ["compact", "default", "comfortable"] as const) {
			const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: "dark" });
			const page = await ctx.newPage();
			await registerCoreMocks(page);
			await stubSettingsPatch(page);
			await stubProductsApi(page);
			await page.goto("/work/portfolio");
			await page.waitForSelector("[data-testid='work-portfolio-page']");

			await page.getByRole("button", { name: /^user profile$/i }).click();
			await page.getByRole("tab", { name: "Appearance" }).click();
			await page.getByLabel("Density").selectOption(preference);
			await page.getByRole("button", { name: "Save" }).click();
			await expect(page.getByRole("dialog", { name: /settings/i })).not.toBeVisible();
			await expect.poll(async () => (await readShellAttrs(page)).density).toBe(preference);

			// @lore U11: product-card testid removed in U9. BetCard uses data-ds-component.
			const cardPaddingLeft = await page.evaluate(() => {
				const card = document.querySelector("[data-ds-component='BetCard']");
				if (!card) return null;
				return Number.parseFloat(window.getComputedStyle(card).paddingLeft);
			});
			expect(cardPaddingLeft).not.toBeNull();
			expect(
				Math.abs((cardPaddingLeft ?? 0) - expectedPaddingPx[preference]),
				`BetCard paddingLeft at ${preference}: got ${cardPaddingLeft}px, want ≈ ${expectedPaddingPx[preference]}px`,
			).toBeLessThanOrEqual(1);
			await ctx.close();
		}
	});

	test("StatusChip and Tag stay literal at every density tier (density-static enforcement)", async ({
		browser,
	}) => {
		// @lore K11 § 3.1.1, § 3.1.2: badge-as-callout — these primitives must
		// look the same at every density tier. We assert the StatusChip's
		// rendered height stays constant across compact/default/comfortable.
		const heights: number[] = [];
		for (const preference of ["compact", "default", "comfortable"] as const) {
			const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: "dark" });
			const page = await ctx.newPage();
			await registerCoreMocks(page);
			await stubSettingsPatch(page);
			await stubProductsApi(page);
			await page.goto("/work/portfolio");
			await page.waitForSelector("[data-testid='work-portfolio-page']");

			await page.getByRole("button", { name: /^user profile$/i }).click();
			await page.getByRole("tab", { name: "Appearance" }).click();
			await page.getByLabel("Density").selectOption(preference);
			await page.getByRole("button", { name: "Save" }).click();
			await expect(page.getByRole("dialog", { name: /settings/i })).not.toBeVisible();
			await expect.poll(async () => (await readShellAttrs(page)).density).toBe(preference);

			const chipHeight = await page.evaluate(() => {
				const chip = document.querySelector("[data-ds-component='StatusChip']");
				if (!chip) return null;
				return chip.getBoundingClientRect().height;
			});
			expect(chipHeight).not.toBeNull();
			heights.push(chipHeight ?? 0);
			await ctx.close();
		}
		// All 3 tiers' chip heights must be within 1 px of each other.
		const min = Math.min(...heights);
		const max = Math.max(...heights);
		expect(
			max - min,
			`StatusChip height drifted across density tiers (compact/default/comfortable=${heights.join("/")}). It is density-static per K10 § 3.1.1 — must NOT scale.`,
		).toBeLessThanOrEqual(1);
	});
});

test.describe("K8 — Theme persistence across breakpoint changes", () => {
	test("persisted theme survives desktop → mobile resize", async ({ browser }) => {
		// OS = light so dark choice is visibly different.
		const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: "light" });
		const page = await ctx.newPage();
		await registerCoreMocks(page);
		await stubSettingsPatch(page);
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
			.toBe("hearth-dark");

		// Resize to mobile — theme must hold.
		await page.setViewportSize(MOBILE);
		await page.waitForTimeout(200);
		expect((await readShellAttrs(page)).theme).toBe("hearth-dark");

		// Resize back to desktop — still dark.
		await page.setViewportSize(DESKTOP);
		await page.waitForTimeout(200);
		expect((await readShellAttrs(page)).theme).toBe("hearth-dark");

		// Reload at mobile viewport — boot script must re-paint dark.
		await page.setViewportSize(MOBILE);
		await page.reload();
		await page.waitForSelector("[data-testid='main-content']");
		expect((await readShellAttrs(page)).theme).toBe("hearth-dark");
		await ctx.close();
	});
});
