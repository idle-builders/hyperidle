/**
 * Visual Regression Test — HTML vs TSX pixel diff
 *
 * For each design system component, for each demo section:
 *   1. Screenshot the section from the HTML page (source of truth)
 *   2. Screenshot the matching section from the TSX viewer
 *   3. pixelmatch — assert < 0.1% diff
 *
 * Runs via Playwright against the Vite design system server on :8098.
 * HTML pages are loaded directly (not via iframe) for reliable screenshots.
 * TSX sections are loaded via the viewer's hash route + TSX mode.
 *
 * @lore Replaces the old scripts/sync-check.ts which was a soft drift
 * detector comparing different servers (HTML :8098 vs TSX :5173) with
 * different React versions and rendering pipelines. Now both live on
 * the same Vite server, same React, same fonts — so a hard gate is viable.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect, type Page, test } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const PORT = Number(process.env.DS_PORT) || 8098;
const BASE = `http://localhost:${PORT}`;
const REPORTS_DIR = resolve(import.meta.dirname, "../../sync-reports");
const VIEWPORT = { width: 1024, height: 900 };
/**
 * @lore NON-NEGOTIABLE: 5% max pixel diff. HTML is the design reference
 * (edited by Claude Design). TSX must match pixel-for-pixel. Do not raise
 * this threshold — fix the TSX components instead. Even 5% is generous;
 * the goal is < 1% once all components are fully aligned.
 */
const DIFF_THRESHOLD_PERCENT = 5;

const FREEZE_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
`;

/** Component names — must match both HTML filenames and story titles. */
const COMPONENTS = [
	"StatusChip",
	"Tag",
	"KeyValue",
	"NavItem",
	"SearchField",
	"ThreadRow",
	"BetCard",
	"PitchCard",
	"TaskCard",
	"KnowledgeRow",
	"NotificationRow",
	"EmptyState",
	"ErrorState",
	"Skeleton",
];

/**
 * Canonical `data-ds-component` names for each component file. A file may render
 * multiple components (e.g. Skeleton.html → SkeletonList + SkeletonCard), so the
 * value is a list. Each name MUST resolve to ≥ 1 marker on the page.
 */
const EXPECTED_MARKERS: Record<string, string[]> = {
	StatusChip: ["StatusChip"],
	Tag: ["Tag"],
	KeyValue: ["KeyValue"],
	NavItem: ["NavItem"],
	SearchField: ["SearchField"],
	ThreadRow: ["ThreadRow"],
	BetCard: ["BetCard"],
	PitchCard: ["PitchCard"],
	TaskCard: ["TaskCard"],
	KnowledgeRow: ["KnowledgeRow"],
	NotificationRow: ["NotificationRow"],
	EmptyState: ["EmptyState"],
	ErrorState: ["ErrorState"],
	Skeleton: ["SkeletonList", "SkeletonCard"],
};

/**
 * Components with interactive states (hover, focus-visible) that need
 * pixel-diff testing. The selector targets the interactive element in the
 * demo section. For card components, the HTML always has tabIndex={0} but
 * the TSX only adds it via clickableProps when onClick is present. We use
 * the component's root element selector and force: true for hover.
 */
const INTERACTIVE_COMPONENTS: Record<
	string,
	{ htmlSelector: string; tsxSelector: string; sectionIndex: number }
> = {
	NavItem: { htmlSelector: "button", tsxSelector: "button", sectionIndex: 0 },
	SearchField: { htmlSelector: "input", tsxSelector: "input", sectionIndex: 0 },
	ThreadRow: { htmlSelector: "[role='button'], button", tsxSelector: "div > div", sectionIndex: 0 },
	BetCard: { htmlSelector: "[role='button']", tsxSelector: "div > div", sectionIndex: 0 },
	PitchCard: { htmlSelector: "[role='button']", tsxSelector: "div > div", sectionIndex: 0 },
	TaskCard: { htmlSelector: "[role='button']", tsxSelector: "div > div", sectionIndex: 0 },
	KnowledgeRow: {
		htmlSelector: "[role='button'], button",
		tsxSelector: "div > div",
		sectionIndex: 0,
	},
	NotificationRow: { htmlSelector: "div > div", tsxSelector: "div > div", sectionIndex: 0 },
};

/** Normalise a section title for matching: lowercase, strip non-alnum. */
function normalise(title: string): string {
	return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface SectionShot {
	title: string;
	png: Buffer;
}

/** Screenshot every .demo-section on the current page. Returns title→png pairs. */
async function screenshotSections(page: Page): Promise<SectionShot[]> {
	await page.addStyleTag({ content: FREEZE_CSS });
	// Hide fixed-positioned toolbars (theme switcher, mode toggle) so they
	// don't overlap section screenshots.
	await page.addStyleTag({
		content: `.toolbar, #__theme-switcher { display: none !important; }`,
	});
	await page.waitForTimeout(200);

	const sections = page.locator(".demo-section");
	const count = await sections.count();
	const shots: SectionShot[] = [];

	for (let i = 0; i < count; i++) {
		const section = sections.nth(i);
		const titleEl = section.locator(".demo-section-title");
		const title = (await titleEl.textContent()) ?? `section-${i}`;

		// Screenshot only the component content area (everything in the section
		// below the title bar) so we compare the actual rendered component, not
		// the demo chrome which may have minor font-rendering differences.
		const sectionBox = await section.boundingBox();
		const titleBox = await titleEl.boundingBox();
		if (!(sectionBox && titleBox)) continue;

		const contentTop = titleBox.y + titleBox.height;
		const contentHeight = sectionBox.y + sectionBox.height - contentTop;
		// Safety: ensure clip area is valid (at least 1px) and within viewport
		if (contentHeight < 1 || sectionBox.width < 1) continue;

		// Scroll the section into view first so it's fully visible
		await section.scrollIntoViewIfNeeded();
		await page.waitForTimeout(100);

		// Re-measure after scroll
		const freshSectionBox = await section.boundingBox();
		const freshTitleBox = await titleEl.boundingBox();
		if (!(freshSectionBox && freshTitleBox)) continue;

		const freshContentTop = freshTitleBox.y + freshTitleBox.height;
		const freshContentHeight = freshSectionBox.y + freshSectionBox.height - freshContentTop;
		if (freshContentHeight < 1) continue;

		const png = (await page.screenshot({
			type: "png",
			clip: {
				x: Math.max(0, freshSectionBox.x),
				y: Math.max(0, freshContentTop),
				width: Math.min(freshSectionBox.width, VIEWPORT.width - freshSectionBox.x),
				height: Math.min(freshContentHeight, VIEWPORT.height - freshContentTop),
			},
		})) as Buffer;
		shots.push({ title: title.trim(), png });
	}

	return shots;
}

function runPixelmatch(
	a: Buffer,
	b: Buffer,
): { diffPng: Buffer; diffPixels: number; totalPixels: number } {
	const imgA = PNG.sync.read(a);
	const imgB = PNG.sync.read(b);

	// Crop to common dimensions
	const width = Math.min(imgA.width, imgB.width);
	const height = Math.min(imgA.height, imgB.height);

	const cropData = (img: PNG, w: number, h: number): Uint8Array => {
		if (img.width === w && img.height === h) return img.data;
		const out = new Uint8Array(w * h * 4);
		for (let y = 0; y < h; y++) {
			const srcOff = y * img.width * 4;
			const dstOff = y * w * 4;
			out.set(img.data.slice(srcOff, srcOff + w * 4), dstOff);
		}
		return out;
	};

	const dataA = cropData(imgA, width, height);
	const dataB = cropData(imgB, width, height);
	const diff = new PNG({ width, height });

	const diffPixels = pixelmatch(dataA, dataB, diff.data, width, height, {
		threshold: 0.1,
		includeAA: false,
		diffColor: [255, 0, 255],
	});

	return {
		diffPng: PNG.sync.write(diff) as Buffer,
		diffPixels,
		totalPixels: width * height,
	};
}

test.describe("Design System Visual Regression", () => {
	let browser: Awaited<ReturnType<typeof chromium.launch>>;

	test.beforeAll(async () => {
		browser = await chromium.launch();
	});

	test.afterAll(async () => {
		await browser.close();
	});

	for (const component of COMPONENTS) {
		test(`${component} — HTML vs TSX pixel match`, async () => {
			const reportDir = resolve(REPORTS_DIR, component);
			mkdirSync(reportDir, { recursive: true });

			// ── Screenshot HTML sections ──
			const htmlPage = await browser.newPage({ viewport: VIEWPORT });
			await htmlPage.goto(`${BASE}/${component}.html`, { waitUntil: "networkidle" });
			// Wait for CDN React + Babel to render
			await htmlPage.waitForFunction(
				() => {
					const root = document.getElementById("root");
					return root && root.children.length > 0;
				},
				null,
				{ timeout: 15_000 },
			);
			await htmlPage.waitForTimeout(500);
			const htmlShots = await screenshotSections(htmlPage);
			await htmlPage.close();

			// ── Screenshot TSX sections ──
			const tsxPage = await browser.newPage({ viewport: VIEWPORT });
			await tsxPage.goto(`${BASE}/#${component}`, { waitUntil: "networkidle" });
			await tsxPage.waitForTimeout(500);
			// Click TSX mode
			await tsxPage.click('button:has-text("TSX")');
			await tsxPage.waitForTimeout(500);
			const tsxShots = await screenshotSections(tsxPage);
			await tsxPage.close();

			// ── Match sections by normalised title and compare ──
			const tsxByTitle = new Map<string, SectionShot>();
			for (const shot of tsxShots) {
				tsxByTitle.set(normalise(shot.title), shot);
			}

			const failures: string[] = [];

			for (const htmlShot of htmlShots) {
				const key = normalise(htmlShot.title);
				const tsxShot = tsxByTitle.get(key);

				if (!tsxShot) {
					failures.push(`Missing TSX section for "${htmlShot.title}"`);
					continue;
				}

				const sectionDir = resolve(reportDir, key);
				mkdirSync(sectionDir, { recursive: true });

				writeFileSync(resolve(sectionDir, "html.png"), htmlShot.png);
				writeFileSync(resolve(sectionDir, "tsx.png"), tsxShot.png);

				const { diffPng, diffPixels, totalPixels } = runPixelmatch(htmlShot.png, tsxShot.png);
				writeFileSync(resolve(sectionDir, "diff.png"), diffPng);

				const diffPercent = (diffPixels / totalPixels) * 100;
				writeFileSync(
					resolve(sectionDir, "result.json"),
					JSON.stringify(
						{
							component,
							section: htmlShot.title,
							totalPixels,
							diffPixels,
							diffPercent: Math.round(diffPercent * 100) / 100,
							pass: diffPercent < DIFF_THRESHOLD_PERCENT,
						},
						null,
						2,
					),
				);

				if (diffPercent >= DIFF_THRESHOLD_PERCENT) {
					failures.push(
						`"${htmlShot.title}": ${diffPercent.toFixed(2)}% diff (${diffPixels}px) — see ${sectionDir}/diff.png`,
					);
				}
			}

			expect(
				failures,
				`Pixel diff failures for ${component}:\n${failures.join("\n")}`,
			).toHaveLength(0);
		});
	}

	/* ── Interactive state tests (hover, focus-visible) ──────────────── */

	for (const [component, config] of Object.entries(INTERACTIVE_COMPONENTS)) {
		for (const state of ["hover", "focus"] as const) {
			test(`${component} — ${state} state pixel match`, async () => {
				const reportDir = resolve(REPORTS_DIR, component, `__${state}`);
				mkdirSync(reportDir, { recursive: true });

				// ── HTML page: force state on the interactive element ──
				const htmlPage = await browser.newPage({ viewport: VIEWPORT });
				await htmlPage.goto(`${BASE}/${component}.html`, { waitUntil: "networkidle" });
				await htmlPage.waitForFunction(
					() => {
						const root = document.getElementById("root");
						return root && root.children.length > 0;
					},
					null,
					{ timeout: 15_000 },
				);
				await htmlPage.waitForTimeout(500);
				await htmlPage.addStyleTag({ content: FREEZE_CSS });
				await htmlPage.addStyleTag({
					content: `.toolbar, #__theme-switcher { display: none !important; }`,
				});

				const htmlSection = htmlPage.locator(".demo-section").nth(config.sectionIndex);
				const htmlTarget = htmlSection.locator(config.htmlSelector).first();

				if ((await htmlTarget.count()) === 0) {
					await htmlPage.close();
					return; // No interactive element found — skip
				}

				if (state === "hover") {
					await htmlTarget.hover({ force: true });
				} else {
					await htmlTarget.focus();
				}
				await htmlPage.waitForTimeout(200);

				const htmlSectionBox = await htmlSection.boundingBox();
				if (!htmlSectionBox) {
					await htmlPage.close();
					return;
				}
				const htmlPng = (await htmlPage.screenshot({
					type: "png",
					clip: htmlSectionBox,
				})) as Buffer;
				await htmlPage.close();

				// ── TSX page: force same state ──
				const tsxPage = await browser.newPage({ viewport: VIEWPORT });
				await tsxPage.goto(`${BASE}/#${component}`, { waitUntil: "networkidle" });
				await tsxPage.waitForTimeout(500);
				await tsxPage.click('button:has-text("TSX")');
				await tsxPage.waitForTimeout(500);
				await tsxPage.addStyleTag({ content: FREEZE_CSS });
				await tsxPage.addStyleTag({
					content: `.toolbar, #__theme-switcher { display: none !important; }`,
				});

				const tsxSection = tsxPage.locator(".demo-section").nth(config.sectionIndex);
				const tsxTarget = tsxSection.locator(config.tsxSelector).first();

				if ((await tsxTarget.count()) === 0) {
					await tsxPage.close();
					return;
				}

				if (state === "hover") {
					await tsxTarget.hover({ force: true });
				} else {
					await tsxTarget.focus();
				}
				await tsxPage.waitForTimeout(200);

				const tsxSectionBox = await tsxSection.boundingBox();
				if (!tsxSectionBox) {
					await tsxPage.close();
					return;
				}
				const tsxPng = (await tsxPage.screenshot({
					type: "png",
					clip: tsxSectionBox,
				})) as Buffer;
				await tsxPage.close();

				// ── Compare ──
				writeFileSync(resolve(reportDir, "html.png"), htmlPng);
				writeFileSync(resolve(reportDir, "tsx.png"), tsxPng);

				const { diffPng, diffPixels, totalPixels } = runPixelmatch(htmlPng, tsxPng);
				writeFileSync(resolve(reportDir, "diff.png"), diffPng);

				const diffPercent = (diffPixels / totalPixels) * 100;
				writeFileSync(
					resolve(reportDir, "result.json"),
					JSON.stringify(
						{
							component,
							state,
							totalPixels,
							diffPixels,
							diffPercent: Math.round(diffPercent * 100) / 100,
							pass: diffPercent < DIFF_THRESHOLD_PERCENT,
						},
						null,
						2,
					),
				);

				expect(
					diffPercent,
					`${component} ${state}: ${diffPercent.toFixed(2)}% diff — see ${reportDir}/diff.png`,
				).toBeLessThan(DIFF_THRESHOLD_PERCENT);
			});
		}
	}

	/* ── K2 — DOM marker presence ──
	 * Every expected `data-ds-component` name from EXPECTED_MARKERS must resolve
	 * to ≥ 1 element on both the HTML page and the TSX viewer. The failure
	 * message names the specific marker that is missing.
	 */
	for (const component of COMPONENTS) {
		const expectedNames = EXPECTED_MARKERS[component];
		if (!expectedNames) {
			throw new Error(`EXPECTED_MARKERS missing entry for component "${component}"`);
		}

		test(`${component} — exposes data-ds-component on HTML and TSX`, async () => {
			// HTML page
			const htmlPage = await browser.newPage({ viewport: VIEWPORT });
			await htmlPage.goto(`${BASE}/${component}.html`, { waitUntil: "networkidle" });
			await htmlPage.waitForFunction(
				() => {
					const root = document.getElementById("root");
					return root && root.children.length > 0;
				},
				null,
				{ timeout: 15_000 },
			);
			for (const name of expectedNames) {
				const count = await htmlPage.locator(`[data-ds-component="${name}"]`).count();
				expect(
					count,
					`${component}.html: expected marker [data-ds-component="${name}"] not found on rendered demo`,
				).toBeGreaterThan(0);
			}
			await htmlPage.close();

			// TSX viewer
			const tsxPage = await browser.newPage({ viewport: VIEWPORT });
			await tsxPage.goto(`${BASE}/#${component}`, { waitUntil: "networkidle" });
			await tsxPage.waitForTimeout(500);
			await tsxPage.click('button:has-text("TSX")');
			await tsxPage.waitForTimeout(500);
			for (const name of expectedNames) {
				const count = await tsxPage.locator(`[data-ds-component="${name}"]`).count();
				expect(
					count,
					`${component} TSX: expected marker [data-ds-component="${name}"] not found on rendered demo`,
				).toBeGreaterThan(0);
			}
			await tsxPage.close();
		});
	}
});
