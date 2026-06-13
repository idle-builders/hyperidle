/**
 * AI6 — Renderer container parity E2E.
 *
 * AC: "Same content kind via block payload vs artifact kind-renderer shares
 * container treatment."
 *
 * Canon: block/ family is the reference. kinds/ renderers must converge to:
 *   - rounded-[var(--r-default)] (16px border-radius)
 *   - border border-[var(--border-subtle)] (visible border)
 *   - overflow-hidden (where applicable)
 *
 * C2 fix: catalog defaults to modules[0] — navigate to each component section
 * (/designsystem#Block for block/ImagePayload, /designsystem#Kinds/ImageRenderer
 * for kinds/ImageRenderer) before asserting.
 * data-component markers added to image-renderer.tsx and block/ImagePayload.tsx
 * as test-support hooks (no behavior change).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures";

const PROOF_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../plans/AI6/screenshots",
);

test.beforeAll(() => {
	fs.mkdirSync(PROOF_DIR, { recursive: true });
});

test.describe("AI6 — renderer container parity (block/ vs kinds/)", () => {
	// ── image-renderer: kinds/ must use r-default ─────────────────────────────

	test("kinds/image-renderer has r-default (16px) border-radius class", async ({ page }) => {
		// Navigate to the Kinds/ImageRenderer section in the design-system catalog.
		await page.goto("/designsystem#Kinds%2FImageRenderer", { waitUntil: "domcontentloaded" });
		await page.waitForTimeout(1500);

		// image-renderer.tsx has data-component="image-renderer" on the <section> element.
		// The <figure> inside carries the rounded-[var(--r-default)] class.
		const imageRendererSection = page.locator('[data-component="image-renderer"]').first();
		await expect(imageRendererSection).toBeVisible();

		// The figure inside the section must have r-default class.
		const figure = imageRendererSection.locator("figure").first();
		await expect(figure).toBeVisible();
		const classAttr = await figure.getAttribute("class");
		expect(classAttr).toContain("r-default");
	});

	test("kinds/image-renderer figure has border-subtle class", async ({ page }) => {
		await page.goto("/designsystem#Kinds%2FImageRenderer", { waitUntil: "domcontentloaded" });
		await page.waitForTimeout(1500);

		const imageRendererSection = page.locator('[data-component="image-renderer"]').first();
		await expect(imageRendererSection).toBeVisible();

		const figure = imageRendererSection.locator("figure").first();
		const classAttr = await figure.getAttribute("class");
		// Must have border-subtle treatment to match block/ImagePayload.
		expect(classAttr).toContain("border-subtle");
	});

	// ── block/ImagePayload: has same r-default treatment ──────────────────────

	test("block/ImagePayload has r-default border-radius class", async ({ page }) => {
		// Navigate to Block → Image variant.
		await page.goto("/designsystem#Block", { waitUntil: "domcontentloaded" });
		await page.waitForTimeout(1500);

		// block/ImagePayload.tsx has data-component="ImagePayload" on the <figure>.
		const imageFigure = page.locator('[data-component="ImagePayload"]').first();
		await expect(imageFigure).toBeVisible();

		const classAttr = await imageFigure.getAttribute("class");
		expect(classAttr).toContain("r-default");
	});

	// ── Border-radius parity between kinds/ and block/ ────────────────────────

	test("kinds/image-renderer and block/ImagePayload border-radius are equal (16px)", async ({
		page,
	}) => {
		// Check kinds/ renderer.
		await page.goto("/designsystem#Kinds%2FImageRenderer", { waitUntil: "domcontentloaded" });
		await page.waitForTimeout(1500);
		const imageRendererSection = page.locator('[data-component="image-renderer"]').first();
		await expect(imageRendererSection).toBeVisible();
		const kindFigure = imageRendererSection.locator("figure").first();
		const kindRadius = await kindFigure.evaluate((el) => getComputedStyle(el).borderRadius);

		// Check block/ payload.
		await page.goto("/designsystem#Block", { waitUntil: "domcontentloaded" });
		await page.waitForTimeout(1500);
		const blockFigure = page.locator('[data-component="ImagePayload"]').first();
		await expect(blockFigure).toBeVisible();
		const blockRadius = await blockFigure.evaluate((el) => getComputedStyle(el).borderRadius);

		// Both must resolve to 16px (var(--r-default)).
		expect(kindRadius).toBe("16px");
		expect(blockRadius).toBe("16px");
		expect(kindRadius).toBe(blockRadius);
	});

	// ── Screenshot: side-by-side renderer capture ─────────────────────────────

	test("screenshot: renderer families side-by-side for reviewer inspection", async ({ page }) => {
		// Capture kinds/ImageRenderer.
		await page.goto("/designsystem#Kinds%2FImageRenderer", { waitUntil: "domcontentloaded" });
		await page.waitForTimeout(1500);
		await page.screenshot({
			path: path.join(PROOF_DIR, "AI6-renderer-parity-kinds.png"),
			fullPage: false,
		});

		// Capture block/ImagePayload (Block → Image variant).
		await page.goto("/designsystem#Block", { waitUntil: "domcontentloaded" });
		await page.waitForTimeout(1500);
		await page.screenshot({
			path: path.join(PROOF_DIR, "AI6-renderer-parity-block.png"),
			fullPage: false,
		});

		// Side-by-side full screenshot.
		await page.screenshot({
			path: path.join(PROOF_DIR, "AI6-renderer-parity-full.png"),
			fullPage: false,
		});

		expect(fs.existsSync(path.join(PROOF_DIR, "AI6-renderer-parity-full.png"))).toBe(true);
	});

	// ── code-renderer: no bg-success/10 (undefined class) ────────────────────

	test("code-renderer does not use undefined bg-success/10 class in rendered output", async ({
		page,
	}) => {
		// Navigate to the code renderer section.
		await page.goto("/designsystem#Kinds%2FCodeRenderer", { waitUntil: "domcontentloaded" });
		await page.waitForTimeout(1500);

		// After migration, kinds/code-renderer must NOT contain the broken class.
		const brokenElement = page.locator('[class*="bg-success/10"], [class*="bg-error/10"]');
		const count = await brokenElement.count();
		expect(
			count,
			"Found elements with undefined bg-success/10 or bg-error/10 classes — these must be replaced with color-mix() equivalents",
		).toBe(0);
	});

	// ── Border assertions: kinds/ must have border-subtle ────────────────────

	test("kinds/ image-renderer: container has no r-subtle-only (old) radius class", async ({
		page,
	}) => {
		// After migration, kinds/image-renderer no longer uses rounded-[var(--r-subtle)].
		await page.goto("/designsystem#Kinds%2FImageRenderer", { waitUntil: "domcontentloaded" });
		await page.waitForTimeout(1500);

		const imageRendererSection = page.locator('[data-component="image-renderer"]').first();
		await expect(imageRendererSection).toBeVisible();

		// The outer container (figure) must not carry rounded-[var(--r-subtle)] (the old 10px radius).
		// Note: the class DOES carry border-[var(--border-subtle)] which is correct, but
		// we check for the rounded- class specifically (NOT border-).
		const figure = imageRendererSection.locator("figure").first();
		const classAttr = await figure.getAttribute("class");
		// Must use r-default (16px), not r-subtle (10px).
		expect(classAttr).toContain("r-default");
		expect(classAttr).not.toContain("rounded-[var(--r-subtle)]");
	});
});
