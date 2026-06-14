/**
 * Visual Regression Test — TSX story vs committed golden PNG baselines
 *
 * AJ1: Replaces the HTML-vs-TSX pixelmatch gate. TSX is now the single
 * design source of truth. The gate:
 *   1. Enumerates all catalogued components at runtime from the live
 *      viewer catalog DOM (NOT via discoverStories — that uses import.meta.glob
 *      which is Vite-only and returns nothing in this Node/Playwright context).
 *   2. For each component, screenshots every .demo-section in the TSX viewer.
 *   3. Asserts each screenshot against a committed golden PNG via
 *      `toHaveScreenshot()` at ≤5% maxDiffPixelRatio.
 *   4. Re-captures interactive hover/focus states for the 12 INTERACTIVE_COMPONENTS.
 *   5. Asserts each component exposes its dsProps() marker:
 *      `[data-ds-component="<name>"]` OR `[data-ds-shell="<name>"]` (dual selector
 *      so Tier 3 shells like ThreadShell are not false-failed).
 *
 * The viewer is booted by playwright.config.ts webServer on port 8098 via
 * `npm run -w @hyperidle/design-system serve` (NOT `bun run serve` — bun is
 * never installed in CI).
 *
 * Baseline PNG location:
 *   `packages/design-system/src/__tests__/visual-regression.test.ts-snapshots/`
 *   (Playwright default — committed to git, NOT gitignored).
 *
 * Threshold: maxDiffPixelRatio: 0.05, threshold: 0.2 — same 5% ceiling as the
 * retired HTML gate. Not a weakening.
 *
 * Canonical baseline platform: CI/Linux is the blessing authority. Baselines
 * are Linux-rendered. Local Mac verify tolerates the 5% ratio. Never raise
 * the ratio — fix the component or re-bless on Linux.
 * To re-bless: `npm run ds:bless` (→ playwright --update-snapshots on Linux).
 *
 * @lore AJ1: The prior gate (HTML vs TSX pixelmatch) was replaced because HTML
 * files were deleted — TSX is now the single source of truth. Runtime catalog-DOM
 * enumeration (not discoverStories) is used because Vite's import.meta.glob is
 * unavailable in the Playwright/Node context. snapshotPathTemplate omits the
 * {platform} token so one baseline set serves Linux CI + local Mac (the 5%
 * tolerance absorbs cross-platform AA jitter).
 */

import { expect, type Page, test } from "@playwright/test";

const PORT = Number(process.env.DS_PORT) || 8098;
const BASE = `http://localhost:${PORT}`;
const VIEWPORT = { width: 1024, height: 900 };

/** Freeze animations + hide toolbar chrome so screenshots are deterministic. */
const FREEZE_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
`;
const HIDE_TOOLBAR_CSS = `.toolbar, #__theme-switcher { display: none !important; }`;

// ---------------------------------------------------------------------------
// Runtime catalog enumeration
// ---------------------------------------------------------------------------

/**
 * Navigate to the catalog root and collect all component names from the
 * rendered catalog DOM. Returns them in catalog order.
 *
 * @lore AJ1: We read the catalog DOM at runtime rather than calling
 * discoverStories() because discoverStories uses import.meta.glob (Vite-only).
 * In the Playwright/Node runtime the glob returns nothing. The catalog renders
 * one `button.component-link` per StoryModule with the title in `.component-name`
 * (verified viewer/main.tsx:213-217). This approach auto-covers new stories
 * with no hand-maintained array update required.
 */
async function enumerateCatalogComponents(page: Page): Promise<string[]> {
	await page.goto(`${BASE}/#`, { waitUntil: "networkidle" });
	await page.waitForSelector("button.component-link .component-name", { timeout: 10_000 });
	const names = await page.locator("button.component-link .component-name").allTextContents();
	// Filter empty strings, trim whitespace
	return names.map((n) => n.trim()).filter((n) => n.length > 0);
}

// ---------------------------------------------------------------------------
// Screenshot helper
// ---------------------------------------------------------------------------

interface SectionShot {
	title: string;
	index: number;
}

/**
 * Return metadata about every .demo-section on the current page.
 * Applies FREEZE_CSS + HIDE_TOOLBAR_CSS before measuring.
 */
async function listSections(page: Page): Promise<SectionShot[]> {
	await page.addStyleTag({ content: FREEZE_CSS });
	await page.addStyleTag({ content: HIDE_TOOLBAR_CSS });
	// Wait for fonts to be ready and for any post-mount effects
	await page.waitForFunction(() => document.fonts.ready.then(() => true));
	await page.waitForTimeout(200);

	const sections = page.locator(".demo-section");
	const count = await sections.count();
	const result: SectionShot[] = [];

	for (let i = 0; i < count; i++) {
		const section = sections.nth(i);
		const titleEl = section.locator(".demo-section-title");
		const title = ((await titleEl.textContent()) ?? `section-${i}`).trim();
		result.push({ title, index: i });
	}
	return result;
}

/** Sanitise a string for use as a snapshot filename fragment. */
function sanitise(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

// ---------------------------------------------------------------------------
// INTERACTIVE_COMPONENTS (12 entries — ported from the retired HTML gate)
//
// The htmlSelector half is dropped (HTML mode is gone). tsxSelector targets
// the interactive element inside the TSX story's .demo-section.
// sectionIndex = which .demo-section contains the interactive element (0-based).
// ---------------------------------------------------------------------------

const INTERACTIVE_COMPONENTS: Record<string, { tsxSelector: string; sectionIndex: number }> = {
	NavItem: { tsxSelector: "button", sectionIndex: 0 },
	SearchField: { tsxSelector: "input", sectionIndex: 0 },
	ThreadRow: { tsxSelector: "div > div", sectionIndex: 0 },
	BetCard: { tsxSelector: "div > div", sectionIndex: 0 },
	TaskCard: { tsxSelector: "div > div", sectionIndex: 0 },
	KnowledgeRow: { tsxSelector: "div > div", sectionIndex: 0 },
	NotificationRow: { tsxSelector: "div > div", sectionIndex: 0 },
	// W2: Button is the primary form primitive with interactive states
	Button: { tsxSelector: "button", sectionIndex: 0 },
	// W2 review D2: remaining Tier 0 form primitives with interactive states
	Input: { tsxSelector: "input", sectionIndex: 0 },
	Select: { tsxSelector: "select", sectionIndex: 0 },
	Toggle: { tsxSelector: "[data-ds-component='Toggle']", sectionIndex: 0 },
	Checkbox: { tsxSelector: "[data-ds-component='Checkbox']", sectionIndex: 0 },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Design System Visual Regression — TSX vs golden baselines", () => {
	/**
	 * Shared component list populated in beforeAll.
	 * Populated once from the live catalog DOM; shared by all tests in this suite.
	 */
	let catalogComponents: string[] = [];

	test.beforeAll(async ({ browser }) => {
		const page = await browser.newPage({ viewport: VIEWPORT });
		try {
			catalogComponents = await enumerateCatalogComponents(page);
		} finally {
			await page.close();
		}
	});

	// ── AC2: TSX-story-vs-golden-baseline screenshot assertion ──────────────

	test("catalog enumerates at least 25 components", async () => {
		expect(
			catalogComponents.length,
			`Expected ≥25 catalogued components; got ${catalogComponents.length}. ` +
				`Catalog enumeration may have failed — check viewer is running on :${PORT}.`,
		).toBeGreaterThanOrEqual(25);
	});

	test("every catalogued component renders demo sections with golden baselines", async ({
		page,
	}) => {
		// This test iterates over the runtime catalog so it auto-covers new stories.
		// Each section is compared against a committed golden PNG via toHaveScreenshot.
		// RED PHASE: will fail with "A snapshot doesn't exist" for every component
		// until the green phase blesses Linux baselines via `npm run ds:bless`.

		for (const component of catalogComponents) {
			await page.goto(`${BASE}/#${component}`, { waitUntil: "networkidle" });
			await page.waitForTimeout(300);

			const sections = await listSections(page);

			expect(
				sections.length,
				`${component}: expected at least 1 .demo-section but found 0. ` +
					`The component may not have loaded.`,
			).toBeGreaterThan(0);

			for (const { title, index } of sections) {
				const sectionLocator = page.locator(".demo-section").nth(index);
				await sectionLocator.scrollIntoViewIfNeeded();
				await page.waitForTimeout(100);

				const snapshotName = `${sanitise(component)}-${sanitise(title)}.png`;

				// toHaveScreenshot diffs against the committed golden PNG.
				// maxDiffPixelRatio: 0.05 = 5% ceiling (same as the retired HTML gate).
				// threshold: 0.2 = per-pixel colour tolerance.
				// RED: fails with "snapshot doesn't exist" until ds:bless generates baselines.
				await expect(sectionLocator).toHaveScreenshot(snapshotName, {
					maxDiffPixelRatio: 0.05,
					threshold: 0.2,
				});
			}
		}
	});

	// ── AC2: Interactive hover/focus state baselines ────────────────────────

	for (const [component, config] of Object.entries(INTERACTIVE_COMPONENTS)) {
		for (const state of ["hover", "focus"] as const) {
			test(`${component} — ${state} state matches golden baseline`, async ({ page }) => {
				await page.goto(`${BASE}/#${component}`, { waitUntil: "networkidle" });
				await page.waitForTimeout(300);
				await page.addStyleTag({ content: FREEZE_CSS });
				await page.addStyleTag({ content: HIDE_TOOLBAR_CSS });
				await page.waitForFunction(() => document.fonts.ready.then(() => true));

				const section = page.locator(".demo-section").nth(config.sectionIndex);
				const target = section.locator(config.tsxSelector).first();

				if ((await target.count()) === 0) {
					// No interactive element in this story — skip gracefully (same
					// behaviour as the retired gate's count()===0 skip).
					test.skip();
					return;
				}

				if (state === "hover") {
					await target.hover({ force: true });
				} else {
					await target.focus();
				}
				await page.waitForTimeout(200);

				const snapshotName = `${sanitise(component)}-${state}.png`;

				// RED: fails with "snapshot doesn't exist" until ds:bless generates baselines.
				await expect(section).toHaveScreenshot(snapshotName, {
					maxDiffPixelRatio: 0.05,
					threshold: 0.2,
				});
			});
		}
	}

	// ── AC2/AC3: Marker presence (dual selector — handles Tier 3 shells) ───

	test("every catalogued component exposes its dsProps() marker", async ({ page }) => {
		// Dual selector: Tier 1/2 emit data-ds-component; Tier 3 shells emit data-ds-shell.
		// Using either-or so shells (e.g. ThreadShell) are not false-failed.
		// @lore AJ1: thread-components.spec.ts:46 verified shells emit data-ds-shell, not
		// data-ds-component. Single-selector check would false-fail on all shells.

		for (const component of catalogComponents) {
			await page.goto(`${BASE}/#${component}`, { waitUntil: "networkidle" });
			await page.waitForTimeout(300);

			const markerLocator = page
				.locator(`[data-ds-component="${component}"], [data-ds-shell="${component}"]`)
				.first();

			await expect(
				markerLocator,
				`${component}: expected [data-ds-component="${component}"] or ` +
					`[data-ds-shell="${component}"] to be present in the TSX viewer, ` +
					`but neither was found. Check that the component calls dsProps().`,
			).toBeVisible();
		}
	});

	// ── AC3: No HTML toggle present on component pages in the TSX-only viewer ──

	test("viewer has no HTML mode toggle button on any component page", async ({ page }) => {
		// After the AJ1 inversion the viewer is TSX-only — no HTML/TSX pill on any page.
		// The catalog root (/#) never shows the toggle (it's only shown when
		// isComponentPage && htmlAvailable), so we must test on a component page.
		//
		// RED: currently FAILS because the HTML toggle appears when an HTML file
		// exists for the component. The viewer currently shows HTML|TSX pills for
		// components that have an .html reference file. After AJ1 (html/ deleted +
		// viewer simplified), the toggle must not exist anywhere.
		//
		// Use "StatusChip" — it is in the catalogued set and has an HTML reference
		// file in the current (pre-inversion) tree, so the toggle IS visible now.

		// Wait until the catalog has loaded before navigating to a component
		await page.goto(`${BASE}/#StatusChip`, { waitUntil: "networkidle" });
		await page.waitForTimeout(500);

		const htmlToggle = page.locator(".toolbar-btn", { hasText: /^HTML$/ });
		await expect(
			htmlToggle,
			'Expected no ".toolbar-btn" with text "HTML" on the StatusChip component page. ' +
				"The HTML/TSX mode toggle must be removed in the green phase (AJ1 viewer simplification). " +
				"Currently the toggle is visible because the HTML reference file still exists.",
		).toHaveCount(0);
	});
});
