/**
 * Design System Sync Check
 *
 * Compares HTML component files (served on :8098) against their TSX
 * story rendering (served on :5173/designsystem). Uses Playwright
 * for screenshots and pixelmatch for pixel-level diff.
 *
 * Usage:
 *   bun run scripts/sync-check.ts [component-name|all]
 *   bun run scripts/sync-check.ts StatusChip
 *   bun run scripts/sync-check.ts all
 *
 * Prerequisites:
 *   - Dev server running (bun dev)
 *   - Display server running (bun run ds:serve) or auto-started
 *
 * Output (per component):
 *   packages/design-system/sync-reports/<name>/html.png
 *   packages/design-system/sync-reports/<name>/tsx.png
 *   packages/design-system/sync-reports/<name>/diff.png
 *   packages/design-system/sync-reports/<name>/report.json
 *
 * @lore Reuses the Playwright + pixelmatch pattern from
 * packages/web/scripts/visual-compare.ts. The HTML and TSX versions
 * will never be pixel-identical (different rendering approaches),
 * so the sync check is a drift detector, not a pass/fail gate.
 */

import { exec } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { SYNC_MAP, type SyncEntry } from "./sync-map.js";

const REPORTS_DIR = resolve(import.meta.dirname, "../sync-reports");
const VIEWPORT = { width: 1280, height: 900 };

const DS_PORT = 8098;
const DS_URL = `http://localhost:${DS_PORT}`;
const APP_URL = process.env.BASE_URL ?? "http://localhost:5173";

const FREEZE_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
`;

interface SyncResult {
	name: string;
	tier: number;
	htmlUrl: string;
	tsxUrl: string;
	viewport: { width: number; height: number };
	totalPixels: number;
	diffPixels: number;
	matchPercent: number;
	diffPercent: number;
	reportDir: string;
	timestamp: string;
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

/** Start the DS display server if not already running */
function startDsServer(): { kill: () => void } | null {
	const proc = exec("bun run scripts/serve.ts", {
		cwd: resolve(import.meta.dirname, ".."),
	});
	return {
		kill: () => {
			proc.kill();
		},
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

async function compareOne(
	browser: Awaited<ReturnType<typeof chromium.launch>>,
	entry: SyncEntry,
): Promise<SyncResult> {
	const reportDir = resolve(REPORTS_DIR, entry.name);
	mkdirSync(reportDir, { recursive: true });

	const htmlPage = await browser.newPage({ viewport: VIEWPORT });
	const tsxPage = await browser.newPage({ viewport: VIEWPORT });

	try {
		// Screenshot HTML version
		const htmlUrl = `${DS_URL}${entry.htmlPath}`;
		await htmlPage.goto(htmlUrl, { waitUntil: "networkidle", timeout: 30_000 });
		// Wait for React+Babel to render
		await htmlPage.waitForTimeout(3000);
		await htmlPage.waitForFunction(
			() => {
				const root = document.getElementById("root");
				return root && root.children.length > 0;
			},
			null,
			{ timeout: 10_000 },
		);
		await htmlPage.addStyleTag({ content: FREEZE_CSS });
		await htmlPage.waitForTimeout(200);
		const htmlBuffer = (await htmlPage.screenshot({ type: "png" })) as Buffer;

		// Screenshot TSX story version
		const tsxUrl = `${APP_URL}/designsystem#${entry.storyHash}`;
		await tsxPage.goto(tsxUrl, { waitUntil: "networkidle", timeout: 15_000 });
		await tsxPage.waitForFunction(() => document.fonts.ready.then(() => true), null, {
			timeout: 10_000,
		});
		await tsxPage.addStyleTag({ content: FREEZE_CSS });
		await tsxPage.waitForTimeout(200);
		const tsxBuffer = (await tsxPage.screenshot({ type: "png" })) as Buffer;

		writeFileSync(resolve(reportDir, "html.png"), htmlBuffer);
		writeFileSync(resolve(reportDir, "tsx.png"), tsxBuffer);

		const { diffPng, diffPixels, totalPixels } = runPixelmatch(htmlBuffer, tsxBuffer);
		writeFileSync(resolve(reportDir, "diff.png"), diffPng);

		const matchPercent = ((totalPixels - diffPixels) / totalPixels) * 100;
		const result: SyncResult = {
			name: entry.name,
			tier: entry.tier,
			htmlUrl,
			tsxUrl,
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
		await htmlPage.close();
		await tsxPage.close();
	}
}

async function main(): Promise<void> {
	const arg = process.argv[2] ?? "all";
	const entries = arg === "all" ? SYNC_MAP : SYNC_MAP.filter((e) => e.name === arg);

	if (entries.length === 0) {
		console.error(`No component found for: ${arg}`);
		console.error(`Available: ${SYNC_MAP.map((e) => e.name).join(", ")}`);
		process.exit(1);
	}

	mkdirSync(REPORTS_DIR, { recursive: true });

	// Check if DS server is already running, start if not
	let dsServer: { kill: () => void } | null = null;
	const dsReady = await waitForServer(`${DS_URL}/_catalog.html`, 2_000);
	if (!dsReady) {
		console.log("Starting design system server...");
		dsServer = startDsServer();
		const started = await waitForServer(`${DS_URL}/_catalog.html`);
		if (!started) {
			console.error("Failed to start design system server on port 8098");
			dsServer?.kill();
			process.exit(1);
		}
	}

	// Verify app server
	try {
		await fetch(APP_URL);
	} catch {
		console.error(`App server not running at ${APP_URL}. Start with: bun dev`);
		dsServer?.kill();
		process.exit(1);
	}

	const browser = await chromium.launch();
	const results: SyncResult[] = [];

	console.log(`\nSync Check — ${entries.length} component(s)\n${"─".repeat(60)}`);

	for (const entry of entries) {
		try {
			const result = await compareOne(browser, entry);
			results.push(result);

			const icon = result.matchPercent >= 90 ? "✓" : result.matchPercent >= 70 ? "△" : "✗";
			console.log(
				`${icon} ${entry.name.padEnd(30)} ${result.matchPercent.toFixed(1)}% match  (T${entry.tier})`,
			);
		} catch (err) {
			console.log(`✗ ${entry.name.padEnd(30)} ERROR: ${(err as Error).message.slice(0, 80)}`);
		}
	}

	await browser.close();
	dsServer?.kill();

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
