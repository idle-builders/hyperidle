/**
 * Visual Design Comparison Tool
 *
 * Compares Claude Design reference prototypes against the live app.
 * References are interactive React apps in docs/design-synthesis/,
 * served via a local HTTP server. The live app runs on localhost:5173.
 *
 * Usage:
 *   bun run scripts/visual-compare.ts [reference-name|all]
 *   bun run scripts/visual-compare.ts shell_conversations
 *   bun run scripts/visual-compare.ts all
 *
 * Prerequisites:
 *   - Dev server running (bun dev)
 *   - Reference server started automatically (python3 -m http.server)
 *
 * Output (per reference):
 *   packages/web/visual-reports/<name>/reference.png
 *   packages/web/visual-reports/<name>/implementation.png
 *   packages/web/visual-reports/<name>/diff.png
 *   packages/web/visual-reports/<name>/report.json
 *
 * @lore References use React 18 via CDN + Babel in-browser transpilation.
 * They MUST be served via HTTP (not file://) due to cross-origin script loading.
 * The script auto-starts a python HTTP server on :8099 and kills it on exit.
 */

import { exec } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { REFERENCE_MAP, type ReferenceEntry } from "./visual-compare-map.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const DESIGN_DIR = resolve(ROOT, "docs/design-synthesis");
const REPORTS_DIR = resolve(import.meta.dirname, "../visual-reports");

const VIEWPORT = { width: 1280, height: 800 };
const APP_URL = process.env.BASE_URL ?? "http://localhost:5173";
const REF_PORT = 8099;
const REF_URL = `http://localhost:${REF_PORT}`;

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
	referenceUrl: string;
	route: string;
	viewport: { width: number; height: number };
	totalPixels: number;
	diffPixels: number;
	matchPercent: number;
	diffPercent: number;
	reportDir: string;
	timestamp: string;
}

/** Start a python HTTP server for the design references */
function startRefServer(): { kill: () => void } {
	const proc = exec(`python3 -m http.server ${REF_PORT}`, { cwd: DESIGN_DIR });
	return {
		kill: () => {
			proc.kill();
		},
	};
}

/** Check if a server is responding */
async function waitForServer(url: string, timeoutMs = 10_000): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(url);
			if (res.ok) return true;
		} catch {
			// not ready yet
		}
		await new Promise((r) => setTimeout(r, 200));
	}
	return false;
}

async function captureReference(
	page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
	entry: ReferenceEntry,
): Promise<Buffer> {
	const url = `${REF_URL}${entry.referenceUrl}`;
	await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });

	if (entry.referenceSetup) {
		await entry.referenceSetup(page);
	}

	await page.addStyleTag({ content: FREEZE_CSS });
	await page.waitForTimeout(200);

	return (await page.screenshot({ type: "png" })) as Buffer;
}

async function captureImplementation(
	page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
	entry: ReferenceEntry,
): Promise<Buffer> {
	const url = `${APP_URL}${entry.route}`;
	await page.goto(url, { waitUntil: "networkidle", timeout: 15_000 });

	if (entry.implSetup) {
		await entry.implSetup(page);
	}

	await page.waitForFunction(() => document.fonts.ready.then(() => true), null, {
		timeout: 10_000,
	});
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

	const width = Math.min(refImg.width, implImg.width);
	const height = Math.min(refImg.height, implImg.height);

	const refData = cropImageData(refImg, width, height);
	const implData = cropImageData(implImg, width, height);

	const diff = new PNG({ width, height });
	const diffPixels = pixelmatch(refData, implData, diff.data, width, height, {
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

	const refPage = await browser.newPage({ viewport: VIEWPORT });
	const implPage = await browser.newPage({ viewport: VIEWPORT });

	try {
		const refBuffer = await captureReference(refPage, entry);
		const implBuffer = await captureImplementation(implPage, entry);

		writeFileSync(resolve(reportDir, "reference.png"), refBuffer);
		writeFileSync(resolve(reportDir, "implementation.png"), implBuffer);

		const { diffPng, diffPixels, totalPixels } = runPixelmatch(refBuffer, implBuffer);
		writeFileSync(resolve(reportDir, "diff.png"), diffPng);

		const matchPercent = ((totalPixels - diffPixels) / totalPixels) * 100;
		const result: CompareResult = {
			name: entry.name,
			referenceUrl: `${REF_URL}${entry.referenceUrl}`,
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

	// Start reference server
	const refServer = startRefServer();
	const refReady = await waitForServer(`${REF_URL}/HyperIdle.html`);
	if (!refReady) {
		console.error("Failed to start reference server on port 8099");
		refServer.kill();
		process.exit(1);
	}

	// Verify app server
	try {
		await fetch(APP_URL);
	} catch {
		console.error(`App server not running at ${APP_URL}. Start with: bun dev`);
		refServer.kill();
		process.exit(1);
	}

	const browser = await chromium.launch();
	const results: CompareResult[] = [];

	console.log(`\nVisual Comparison — ${entries.length} reference(s)\n${"─".repeat(60)}`);

	for (const entry of entries) {
		try {
			const result = await compareOne(browser, entry);
			results.push(result);

			const icon = result.matchPercent >= 95 ? "✓" : result.matchPercent >= 80 ? "△" : "✗";
			console.log(`${icon} ${entry.name.padEnd(40)} ${result.matchPercent.toFixed(1)}% match`);
		} catch (err) {
			console.log(`✗ ${entry.name.padEnd(40)} ERROR: ${(err as Error).message.slice(0, 80)}`);
		}
	}

	await browser.close();
	refServer.kill();

	// Summary
	console.log(`\n${"─".repeat(60)}`);
	if (results.length > 0) {
		const avg = results.reduce((sum, r) => sum + r.matchPercent, 0) / results.length;
		console.log(`Average fidelity: ${avg.toFixed(1)}%`);
		console.log(`Reports: ${REPORTS_DIR}/`);
	}

	writeFileSync(
		resolve(REPORTS_DIR, "summary.json"),
		JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2),
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
