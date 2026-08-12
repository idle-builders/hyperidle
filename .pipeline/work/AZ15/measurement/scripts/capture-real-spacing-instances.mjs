#!/usr/bin/env node

/** Capture real seeded-app spacing instances for AZ15 review. */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const repo = process.cwd();
const outputDir = path.join(repo, ".pipeline/work/AZ15/measurement/instances");
const baseUrl = process.env.AZ15_APP_URL ?? "http://localhost:5173";
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const evidence = [];
try {
	for (const item of [
		{ id: "global-search-desktop", width: 1280, height: 720 },
		{ id: "global-search-narrow", width: 760, height: 900 },
	]) {
		const page = await browser.newPage({ viewport: { width: item.width, height: item.height } });
		await page.goto(`${baseUrl}/conversations`, { waitUntil: "domcontentloaded" });
		await page.getByTestId("main-content").waitFor({ state: "visible" });
		if (item.width > 900) await page.getByTestId("sidebar-search-hint").click();
		else await page.keyboard.press("Meta+k");
		const panel = page.locator('[data-dialog-layer="dialog"][aria-label="Global search"]');
		await panel.waitFor({ state: "visible" });
		const measurement = await panel.evaluate((element) => {
			const style = getComputedStyle(element);
			const rect = element.getBoundingClientRect();
			return {
				width: Math.round(rect.width),
				height: Math.round(rect.height),
				gap: style.gap,
				padding: style.padding,
				boxShadow: style.boxShadow,
			};
		});
		await page.screenshot({ path: path.join(outputDir, `${item.id}.png`), fullPage: true });
		evidence.push({ ...item, route: "/conversations", component: "GlobalSearchPanel", measurement });
		await page.close();
	}
} finally {
	await browser.close();
}
fs.writeFileSync(path.join(outputDir, "runtime.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, evidence }, null, 2)}\n`);
console.log(JSON.stringify({ captured: evidence.length, outputDir }, null, 2));
