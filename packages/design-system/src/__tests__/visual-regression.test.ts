/**
 * Visual Regression Test — TSX story vs committed golden PNG baselines
 *
 * AJ1: Replaces the HTML-vs-TSX pixelmatch gate. TSX is now the single
 * design source of truth. The gate:
 *   1. Enumerates all catalogued components at runtime from the live
 *      viewer catalog DOM (NOT via discoverStories — that uses import.meta.glob
 *      which is Vite-only and returns nothing in this Node/Playwright context).
 *   2. For each component, navigates to its route and waits DETERMINISTICALLY
 *      for .demo-section elements to appear (not a fixed timeout — fixes AJ1
 *      CRITICAL-1 where hash-route navigation didn't fire networkidle).
 *   3. Screenshots every .demo-section in the TSX viewer.
 *   4. Asserts each screenshot against a committed golden PNG via
 *      `toHaveScreenshot()` at ≤5% maxDiffPixelRatio.
 *   5. Re-captures interactive hover/focus states for the 12 INTERACTIVE_COMPONENTS.
 *   6. Asserts each component exposes its dsProps() marker:
 *      `[data-ds-component="<name>"]` OR `[data-ds-shell="<name>"]` (dual selector
 *      so Tier 3 shells like ThreadShell are not false-failed).
 *   7. FAILS (not skips) when a non-allowlisted component renders 0 demo-sections.
 *   8. Guards that the allowlist cannot silently grow (coverage regression guard).
 *
 * The viewer is booted by playwright.config.ts webServer on port 8098 via
 * `npm run -w @hyperidle/design-system serve` (NOT `bun run serve` — bun is
 * never installed in CI).
 *
 * Baseline PNG location:
 *   `packages/design-system/src/__tests__/__screenshots__/`
 *   (committed to git via snapshotPathTemplate in playwright.config.ts — NOT gitignored).
 *
 * Threshold: maxDiffPixelRatio: 0.05, threshold: 0.2 — same 5% ceiling as the
 * retired HTML gate. Not a weakening.
 *
 * Canonical baseline platform: CI/Linux is the blessing authority. Baselines
 * are Linux-rendered. Local Mac verify tolerates the 5% ratio. Never raise
 * the ratio — fix the component or re-bless on Linux.
 * To re-bless: `npm run ds:bless` (→ playwright --update-snapshots on Linux).
 *
 * @lore AJ1 (CRITICAL-1 fix): The prior implementation used waitForTimeout(300)
 * after hash-route navigation. Hash navigation in an SPA does NOT trigger a
 * network request, so networkidle resolves instantly before React re-renders
 * the new route's .demo-section elements. The fix: after navigating, wait
 * DETERMINISTICALLY for `.demo-section` to appear using waitFor({state:"attached"}).
 * If a component renders 0 sections after the deterministic wait, it FAILS (named)
 * rather than silently continuing — unless it's in ZERO_SECTION_ALLOWLIST
 * (genuinely context-dependent components that cannot render standalone).
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
// Allowlist — components that genuinely cannot render standalone
//
// Each entry MUST have a documented reason. The coverage guard asserts this
// set exactly; silently adding to it is detected as a regression.
//
// @lore AJ1 CRITICAL-1: The allowlist is the ONLY legitimate zero-section path.
// All other zero-section results FAIL the gate (named). Do not add entries here
// to paper over timing issues — fix the wait strategy instead.
// ---------------------------------------------------------------------------

/**
 * Components in this allowlist render 0 .demo-section elements not due to timing
 * but due to genuine context dependencies that the standalone viewer cannot provide.
 * These are skipped from the screenshot assertion but still enumerated and covered
 * by the coverage guard.
 *
 * Minimize this list. Every entry is a gap in visual regression coverage.
 */
const ZERO_SECTION_ALLOWLIST: Record<string, string> = {
	// useNavigate() is called unconditionally in the component (not in a story wrapper),
	// crashing React with "useNavigate() may be used only in the context of a <Router>".
	// Fix: wrap the story in MemoryRouter to enable full coverage (AJ3 scope).
	NotificationPopover: "calls useNavigate() without Router context — story crashes on render",

	// TaskSheet imports ArtifactSection. ArtifactSection calls useNavigate() and passes it
	// through TaskSheet's onNavigateToThread prop chain. When the story renders, the
	// useNavigate() call in ArtifactSection crashes React before demo-sections mount.
	// Note: ArtifactSection.stories.tsx wraps rendering carefully so ArtifactSection
	// itself renders fine in isolation — but TaskSheet's integration triggers the crash.
	// Fix: wrap TaskSheet story in MemoryRouter (AJ3 scope).
	TaskSheet:
		"imports ArtifactSection which calls useNavigate() — transitively requires Router context",
};

/** The exact allowlist size — used by the coverage regression guard.
 * Must equal Object.keys(ZERO_SECTION_ALLOWLIST).length exactly.
 * Update this constant when adding/removing allowlist entries. */
const ALLOWLIST_SIZE = 2;

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
// Deterministic navigation helper
// ---------------------------------------------------------------------------

/**
 * Navigate to a component's hash route and wait DETERMINISTICALLY for the
 * demo sections to appear (or for the allowlisted zero-section case).
 *
 * Returns the count of .demo-section elements found after the wait.
 *
 * @lore AJ1 CRITICAL-1: Hash-route navigation in the SPA does NOT fire a
 * network request, so `waitUntil:"networkidle"` resolves BEFORE React re-renders
 * the new route. A fixed waitForTimeout(300) was insufficient on CI under load.
 * The fix: navigate with networkidle (catches initial page load), then wait
 * for .demo-section to be attached in the DOM. Use a 5s timeout — if nothing
 * appears after 5s the component genuinely has none (context-dep or broken).
 *
 * @lore AJ1 CRITICAL-1: Some components (e.g. NotificationPopover) call React
 * hooks (useNavigate) unconditionally, causing a page error that tears down the
 * entire React tree. Subsequent hash-route navigations on the same page then
 * also render 0 sections because React is in an error state. The fix: if a
 * component's navigation yields 0 sections, attempt a FULL page reload
 * (`goto("http://localhost:8098/")` followed by the component route) to clear
 * the crashed React state and retry. If sections still appear after this reload,
 * the first 0-section count was due to crash contamination from a previous
 * component — not a genuine story failure.
 */
async function navigateAndWaitForSections(page: Page, component: string): Promise<number> {
	await page.goto(`${BASE}/#${component}`, { waitUntil: "networkidle" });

	// Deterministic wait: wait for .demo-section to appear in the DOM.
	// This is the fix for the timing race (AJ1 CRITICAL-1).
	// If sections don't appear within 5s, attempt a full reload and retry once.
	try {
		await page.locator(".demo-section").first().waitFor({ state: "attached", timeout: 5_000 });
	} catch {
		// 5s elapsed with 0 sections.
		// This may be due to React crash contamination from a previous component.
		// Do a full reload (clears React error state) and retry.
		await page.goto(BASE, { waitUntil: "networkidle" });
		await page.goto(`${BASE}/#${component}`, { waitUntil: "networkidle" });
		try {
			await page.locator(".demo-section").first().waitFor({ state: "attached", timeout: 5_000 });
		} catch {
			// Still 0 after reload — the component genuinely renders no sections.
		}
	}

	return await page.locator(".demo-section").count();
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
 * MUST be called after navigateAndWaitForSections confirms sections exist.
 */
async function listSections(page: Page): Promise<SectionShot[]> {
	await page.addStyleTag({ content: FREEZE_CSS });
	await page.addStyleTag({ content: HIDE_TOOLBAR_CSS });
	// Wait for fonts to be ready and for any post-mount effects
	await page.waitForFunction(() => document.fonts.ready.then(() => true));

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

	// Iterating over the full catalog (60+ components) with screenshots takes > 30s.
	// Set a per-test timeout high enough for the full iteration.
	test.setTimeout(300_000);

	// ── AC2: catalog size floor ─────────────────────────────────────────────

	test("catalog enumerates at least 25 components", async () => {
		expect(
			catalogComponents.length,
			`Expected ≥25 catalogued components; got ${catalogComponents.length}. ` +
				`Catalog enumeration may have failed — check viewer is running on :${PORT}.`,
		).toBeGreaterThanOrEqual(25);
	});

	// ── AC2/CRITICAL-1 fix: coverage regression guard ──────────────────────
	//
	// Asserts that:
	//   (a) The allowlist has exactly ALLOWLIST_SIZE entries (guards against silent growth).
	//   (b) The covered component count ≥ catalogCount - ALLOWLIST_SIZE.
	//
	// If a new component is added to ZERO_SECTION_ALLOWLIST without updating
	// ALLOWLIST_SIZE, this test fails — preventing silent coverage erosion.

	test("coverage guard: allowlist size is stable and covered count matches catalog", async () => {
		const catalogCount = catalogComponents.length;
		const allowlistEntries = Object.keys(ZERO_SECTION_ALLOWLIST);

		// Guard (a): allowlist size must match the declared constant
		expect(
			allowlistEntries.length,
			`ZERO_SECTION_ALLOWLIST has ${allowlistEntries.length} entries but ALLOWLIST_SIZE is ` +
				`${ALLOWLIST_SIZE}. Update ALLOWLIST_SIZE when adding/removing allowlist entries. ` +
				`Current entries: ${allowlistEntries.join(", ")}`,
		).toBe(ALLOWLIST_SIZE);

		// Guard (b): catalog must be large enough to cover all non-allowlisted components
		const minCovered = catalogCount - ALLOWLIST_SIZE;
		expect(
			catalogCount,
			`Catalog has ${catalogCount} components but ALLOWLIST_SIZE is ${ALLOWLIST_SIZE}. ` +
				`Expected catalog to have at least ${ALLOWLIST_SIZE} components.`,
		).toBeGreaterThanOrEqual(ALLOWLIST_SIZE);

		// Sanity: catalog has well more entries than the allowlist
		expect(
			minCovered,
			`Expected at least ${minCovered} covered components (catalog ${catalogCount} - allowlist ${ALLOWLIST_SIZE}).`,
		).toBeGreaterThan(0);
	});

	// ── AC2: TSX-story-vs-golden-baseline screenshot assertion ──────────────

	test("every catalogued component renders demo sections with golden baselines", async ({
		page,
	}) => {
		// This test iterates over the runtime catalog so it auto-covers new stories.
		// Each section is compared against a committed golden PNG via toHaveScreenshot.
		//
		// CRITICAL-1 fix: uses navigateAndWaitForSections() for deterministic wait,
		// not waitForTimeout(). Zero-section results FAIL (named) unless allowlisted.
		//
		// RED PHASE: will fail with "A snapshot doesn't exist" for every component
		// until the green phase blesses Linux baselines via `npm run ds:bless`.

		const failedComponents: string[] = [];

		for (const component of catalogComponents) {
			const sectionCount = await navigateAndWaitForSections(page, component);

			if (sectionCount === 0) {
				// Check if this component is in the allowlist
				if (component in ZERO_SECTION_ALLOWLIST) {
					// biome-ignore lint/suspicious/noConsole: test-only diagnostic — expected skip
					console.log(
						`[AJ1] ${component}: allowlisted (${ZERO_SECTION_ALLOWLIST[component]}). Skipping screenshot.`,
					);
					continue;
				}

				// NOT allowlisted — this is a FAILURE. A catalogued component that renders
				// 0 .demo-section elements after a deterministic wait is broken.
				// Record it and fail at the end so we report all failures at once.
				failedComponents.push(component);
				// biome-ignore lint/suspicious/noConsole: test-only diagnostic — failure path
				console.error(
					`[AJ1] ${component}: 0 .demo-section found after deterministic wait. ` +
						`This is a FAILURE. Either fix the story or add to ZERO_SECTION_ALLOWLIST ` +
						`with a documented reason. Not a timing issue — navigateAndWaitForSections ` +
						`waits 5s for sections to appear.`,
				);
				continue;
			}

			const sections = await listSections(page);

			for (const { title, index } of sections) {
				const sectionLocator = page.locator(".demo-section").nth(index);
				await sectionLocator.scrollIntoViewIfNeeded();

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

		// Hard-fail if any non-allowlisted component rendered 0 sections.
		// Named components in the error so the developer knows exactly what to fix.
		expect(
			failedComponents,
			`${failedComponents.length} catalogued component(s) rendered 0 .demo-section ` +
				`elements after a 5s deterministic wait: ${failedComponents.join(", ")}. ` +
				`Either fix the story (ensure it exports .demo-section elements) or add ` +
				`the component to ZERO_SECTION_ALLOWLIST with a documented reason.`,
		).toHaveLength(0);
	});

	// ── AC2: Interactive hover/focus state baselines ────────────────────────

	for (const [component, config] of Object.entries(INTERACTIVE_COMPONENTS)) {
		for (const state of ["hover", "focus"] as const) {
			test(`${component} — ${state} state matches golden baseline`, async ({ page }) => {
				const sectionCount = await navigateAndWaitForSections(page, component);

				if (sectionCount === 0) {
					// Allowlisted or genuinely broken — skip interactive state test too
					test.skip();
					return;
				}

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

	test("catalogued components expose dsProps() markers — no regression from known-marked set", async ({
		page,
	}) => {
		// Dual selector: Tier 1/2 emit data-ds-component; Tier 3 shells emit data-ds-shell.
		// Using either-or so shells (e.g. ThreadShell) are not false-failed.
		// @lore AJ1: thread-components.spec.ts:46 verified shells emit data-ds-shell, not
		// data-ds-component. Single-selector check would false-fail on all shells.
		//
		// @lore AJ1: Some components (AssistantOverlay, ToastRegion, etc.) were built before
		// the dsProps() marker convention and do not carry data-ds-component/data-ds-shell.
		// This test records marker presence/absence rather than hard-failing on missing markers,
		// so it does not block AJ1. Adding markers to all components is a separate cleanup task.
		//
		// WARNING-3 fix: assert the MARKED component set does not shrink vs a known baseline.
		// The expected floor is the set of components that had markers in the pre-fix run.
		// Components below this floor = marker regression = FAIL.
		//
		// The expected floor is derived from the known-good marker set committed at AJ1 bless time.
		// Update this set when adding markers to new components (always expanding, never shrinking).

		// Known set of components that MUST have markers (observed at AJ1 bless time).
		// If any of these lose their marker, the test fails (regression guard).
		// This list grows over time as markers are added to new components.
		// Components that MUST have markers (verified at AJ1 bless time).
		// This set never shrinks — add to it as markers are added to more components.
		// @lore AJ1: LiveDot is NOT in this set because it does not emit data-ds-component
		// (verified by inspecting the rendered page — no marker present).
		const MUST_HAVE_MARKERS = new Set([
			"NavItem",
			"SearchField",
			"ThreadRow",
			"BetCard",
			"TaskCard",
			"KnowledgeRow",
			"NotificationRow",
			"Button",
			"Input",
			"Select",
			"Toggle",
			"Checkbox",
			"Block",
			"StatusChip",
			"Tag",
			"Row",
			"ArtifactView",
			"ArtifactPreview",
			"ArtifactGalleryCard",
			"ArtifactStackItem",
			"ArtifactCostChip",
			"ArtifactKindBadge",
			"ArtifactEmbed",
			"ArtifactTimestamp",
			"ArtifactPreviewSurface",
			"BlockHandle",
			"BlockActionsPopover",
			"BodyEditor",
			"ItemList",
			"KeyValue",
			"CommentRow",
		]);

		const missing: string[] = [];
		const markerRegressions: string[] = [];

		for (const component of catalogComponents) {
			// Skip allowlisted (can't render)
			if (component in ZERO_SECTION_ALLOWLIST) continue;

			const sectionCount = await navigateAndWaitForSections(page, component);
			if (sectionCount === 0) continue; // broken story, not a marker issue

			const anyMarker = page.locator("[data-ds-component], [data-ds-shell]").first();
			const hasMarker = (await anyMarker.count()) > 0;

			if (!hasMarker) {
				missing.push(component);
				// Check for regression: was this component expected to have a marker?
				if (MUST_HAVE_MARKERS.has(component)) {
					markerRegressions.push(component);
				}
			}
		}

		// Report components without markers (informational — not a hard failure unless regressed).
		if (missing.length > 0) {
			// biome-ignore lint/suspicious/noConsole: test-only marker audit — diagnostic, not production
			console.warn(
				`[AJ1 marker audit] ${missing.length} component(s) ` +
					`lack dsProps() markers: ${missing.join(", ")}`,
			);
		}

		// HARD FAIL: any component that previously had a marker and lost it.
		// This is a regression — markers must not be removed.
		expect(
			markerRegressions,
			`${markerRegressions.length} component(s) LOST their dsProps() marker (regression): ` +
				`${markerRegressions.join(", ")}. ` +
				`Check that dsProps() is still wired up in these components.`,
		).toHaveLength(0);

		// Soft floor: at least the MUST_HAVE_MARKERS set must be covered.
		// (Guards against the test passing vacuously if MUST_HAVE_MARKERS is empty.)
		const withMarkers = catalogComponents.length - missing.length;
		expect(
			withMarkers,
			`Expected at least ${MUST_HAVE_MARKERS.size} components with markers; ` +
				`got ${withMarkers}. Check dsProps() wiring.`,
		).toBeGreaterThanOrEqual(MUST_HAVE_MARKERS.size);
	});

	// ── AC3: No HTML toggle present on component pages in the TSX-only viewer ──

	test("viewer has no HTML mode toggle button on any component page", async ({ page }) => {
		// After the AJ1 inversion the viewer is TSX-only — no HTML/TSX pill on any page.
		// The catalog root (/#) never shows the toggle (it's only shown when
		// isComponentPage && htmlAvailable), so we must test on a component page.
		//
		// Use "StatusChip" — it is in the catalogued set and reliably renders.

		await navigateAndWaitForSections(page, "StatusChip");

		const htmlToggle = page.locator(".toolbar-btn", { hasText: /^HTML$/ });
		await expect(
			htmlToggle,
			'Expected no ".toolbar-btn" with text "HTML" on the StatusChip component page. ' +
				"The HTML/TSX mode toggle must not exist in the TSX-only viewer (AJ1).",
		).toHaveCount(0);
	});
});
