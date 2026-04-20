/**
 * Visual Design Comparison Tool
 *
 * Screenshots a reference HTML mockup and the live app at the same viewport,
 * then runs pixelmatch to produce a diff image and fidelity score.
 *
 * Usage:
 *   bun run scripts/visual-compare.ts [reference-name|all]
 *   bun run scripts/visual-compare.ts app_shell_systems_nominal
 *   bun run scripts/visual-compare.ts all
 *
 * Output (per reference):
 *   packages/web/visual-reports/<name>/reference.png
 *   packages/web/visual-reports/<name>/implementation.png
 *   packages/web/visual-reports/<name>/diff.png
 *   packages/web/visual-reports/<name>/report.json
 *
 * @lore Uses file:// to render reference HTML — avoids needing a second server.
 * Disables animations via injected CSS for deterministic captures.
 * Waits for networkidle + fonts before screenshotting.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { REFERENCE_MAP, type ReferenceEntry } from "./visual-compare-map.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const REFERENCES_DIR = resolve(ROOT, "docs/design-references");
const REPORTS_DIR = resolve(import.meta.dirname, "../visual-reports");

const VIEWPORT = { width: 1280, height: 800 };
const BASE_URL = process.env.BASE_URL ?? "http://localhost:5173";

/** CSS injected before screenshot to disable animations and transitions */
const FREEZE_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
`;

interface CompareResult {
	name: string;
	referenceFile: string;
	route: string;
	viewport: { width: number; height: number };
	totalPixels: number;
	diffPixels: number;
	matchPercent: number;
	diffPercent: number;
	reportDir: string;
	timestamp: string;
}

async function captureReference(
	page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
	entry: ReferenceEntry,
): Promise<Buffer> {
	const htmlPath = resolve(REFERENCES_DIR, entry.name, "code.html");
	if (!existsSync(htmlPath)) {
		throw new Error(`Reference HTML not found: ${htmlPath}`);
	}

	await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle", timeout: 15_000 });
	// Wait for fonts to load
	await page.waitForFunction(() => document.fonts.ready.then(() => true), null, {
		timeout: 10_000,
	});
	// Inject freeze CSS
	await page.addStyleTag({ content: FREEZE_CSS });
	await page.waitForTimeout(200);

	return (await page.screenshot({ type: "png" })) as Buffer;
}

async function captureImplementation(
	page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
	entry: ReferenceEntry,
): Promise<Buffer> {
	const url = `${BASE_URL}${entry.route}`;
	await page.goto(url, { waitUntil: "networkidle", timeout: 15_000 });

	// Execute any setup actions (e.g., open a modal, click a tab)
	if (entry.setup) {
		await entry.setup(page);
	}

	// Wait for fonts to load
	await page.waitForFunction(() => document.fonts.ready.then(() => true), null, {
		timeout: 10_000,
	});
	// Inject freeze CSS
	await page.addStyleTag({ content: FREEZE_CSS });
	await page.waitForTimeout(200);

	return (await page.screenshot({ type: "png" })) as Buffer;
}

function runPixelmatch(
	refBuffer: Buffer,
	implBuffer: Buffer,
): { diffPng: Buffer; diffPixels: number; totalPixels: number } {
	const refImg = PNG.sync.read(refBuffer);
	const implImg = PNG.sync.read(implBuffer);

	// Resize if dimensions don't match — use the smaller of the two
	const width = Math.min(refImg.width, implImg.width);
	const height = Math.min(refImg.height, implImg.height);

	// Crop both to same dimensions if needed
	const refData = cropImageData(refImg, width, height);
	const implData = cropImageData(implImg, width, height);

	const diff = new PNG({ width, height });
	const diffPixels = pixelmatch(refData, implData, diff.data, width, height, {
		threshold: 0.1,
		includeAA: false,
		diffColor: [255, 0, 255], // magenta for differences
	});

	return {
		diffPng: PNG.sync.write(diff) as Buffer,
		diffPixels,
		totalPixels: width * height,
	};
}

function cropImageData(img: PNG, targetWidth: number, targetHeight: number): Uint8Array {
	if (img.width === targetWidth && img.height === targetHeight) {
		return img.data;
	}
	const cropped = new Uint8Array(targetWidth * targetHeight * 4);
	for (let y = 0; y < targetHeight; y++) {
		const srcOffset = y * img.width * 4;
		const dstOffset = y * targetWidth * 4;
		cropped.set(img.data.slice(srcOffset, srcOffset + targetWidth * 4), dstOffset);
	}
	return cropped;
}

async function compareOne(
	browser: Awaited<ReturnType<typeof chromium.launch>>,
	entry: ReferenceEntry,
): Promise<CompareResult> {
	const reportDir = resolve(REPORTS_DIR, entry.name);
	mkdirSync(reportDir, { recursive: true });

	// Create two separate pages with same viewport
	const refPage = await browser.newPage({ viewport: VIEWPORT });
	const implPage = await browser.newPage({ viewport: VIEWPORT });

	try {
		const [refBuffer, implBuffer] = await Promise.all([
			captureReference(refPage, entry),
			captureImplementation(implPage, entry),
		]);

		// Save screenshots
		writeFileSync(resolve(reportDir, "reference.png"), refBuffer);
		writeFileSync(resolve(reportDir, "implementation.png"), implBuffer);

		// Run pixel comparison
		const { diffPng, diffPixels, totalPixels } = runPixelmatch(refBuffer, implBuffer);
		writeFileSync(resolve(reportDir, "diff.png"), diffPng);

		const matchPercent = ((totalPixels - diffPixels) / totalPixels) * 100;
		const result: CompareResult = {
			name: entry.name,
			referenceFile: resolve(REFERENCES_DIR, entry.name, "code.html"),
			route: entry.route,
			viewport: VIEWPORT,
			totalPixels,
			diffPixels,
			matchPercent: Math.round(matchPercent * 100) / 100,
			diffPercent: Math.round((diffPixels / totalPixels) * 10000) / 100,
			reportDir,
			timestamp: new Date().toISOString(),
		};

		writeFileSync(resolve(reportDir, "report.json"), JSON.stringify(result, null, 2));
		return result;
	} finally {
		await refPage.close();
		await implPage.close();
	}
}

// --- Main ---
async function main(): Promise<void> {
	const arg = process.argv[2] ?? "all";
	const entries = arg === "all" ? REFERENCE_MAP : REFERENCE_MAP.filter((e) => e.name === arg);

	if (entries.length === 0) {
		console.error(`No reference found for: ${arg}`);
		console.error(`Available: ${REFERENCE_MAP.map((e) => e.name).join(", ")}`);
		process.exit(1);
	}

	mkdirSync(REPORTS_DIR, { recursive: true });

	const browser = await chromium.launch();
	const results: CompareResult[] = [];

	console.log(`\nVisual Comparison — ${entries.length} reference(s)\n${"─".repeat(60)}`);

	for (const entry of entries) {
		try {
			const result = await compareOne(browser, entry);
			results.push(result);

			const icon = result.matchPercent >= 95 ? "✓" : result.matchPercent >= 80 ? "△" : "✗";
			console.log(`${icon} ${entry.name.padEnd(45)} ${result.matchPercent.toFixed(1)}% match`);
		} catch (err) {
			console.log(`✗ ${entry.name.padEnd(45)} ERROR: ${(err as Error).message}`);
		}
	}

	await browser.close();

	// Summary
	console.log(`\n${"─".repeat(60)}`);
	if (results.length > 0) {
		const avg = results.reduce((sum, r) => sum + r.matchPercent, 0) / results.length;
		console.log(`Average fidelity: ${avg.toFixed(1)}%`);
		console.log(`Reports: ${REPORTS_DIR}/`);
	}

	// Write summary report
	writeFileSync(
		resolve(REPORTS_DIR, "summary.json"),
		JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2),
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
