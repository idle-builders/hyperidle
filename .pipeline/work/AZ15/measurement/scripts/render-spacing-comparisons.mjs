#!/usr/bin/env node

/** Render the AZ15 isolated real-surface comparisons with repository Playwright. */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const repo = process.cwd();
const comparisonDir = path.join(repo, ".pipeline/work/AZ15/measurement/comparisons");
const htmlUrl = pathToFileURL(path.join(comparisonDir, "index.html")).href;
const cases = [
	{ id: "section-dense-desktop", surface: "dense", relation: "section", width: 1440, height: 1000 },
	{ id: "section-sparse-desktop", surface: "sparse", relation: "section", width: 1440, height: 1000 },
	{ id: "group-dense-desktop", surface: "dense", relation: "group", width: 1440, height: 1000 },
	{ id: "group-sparse-narrow", surface: "sparse", relation: "group", width: 760, height: 1000 },
	{ id: "close-dense-narrow", surface: "dense", relation: "close", width: 760, height: 1000 },
	{ id: "close-sparse-desktop", surface: "sparse", relation: "close", width: 1440, height: 1000 },
];

fs.mkdirSync(comparisonDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const metrics = [];
try {
	for (const item of cases) {
		const page = await browser.newPage({ viewport: { width: item.width, height: item.height }, deviceScaleFactor: 1 });
		await page.goto(`${htmlUrl}?surface=${item.surface}&relation=${item.relation}`, { waitUntil: "load" });
		const values = await page.locator(".variant").evaluateAll((variants) => variants.map((variant) => {
			const surface = variant.querySelector(".surface");
			const pageBody = variant.querySelector(".page-body");
			const sections = [...variant.querySelectorAll(".section")];
			const style = getComputedStyle(variant);
			return {
				variant: variant.getAttribute("data-variant"),
				sectionGap: style.getPropertyValue("--section-gap").trim(),
				groupGap: style.getPropertyValue("--group-gap").trim(),
				closeGap: style.getPropertyValue("--close-gap").trim(),
				surfaceHeight: Math.round(surface.getBoundingClientRect().height),
				bodyScrollHeight: surface.scrollHeight,
				pageBodyHeight: Math.round(pageBody.getBoundingClientRect().height),
				sectionContentSpan: sections.length < 2 ? 0 : Math.round(sections.at(-1).getBoundingClientRect().bottom - sections[0].getBoundingClientRect().top),
			};
		}));
		await page.screenshot({ path: path.join(comparisonDir, `${item.id}.png`), fullPage: true });
		metrics.push({ ...item, variants: values });
		await page.close();
	}
} finally {
	await browser.close();
}
fs.writeFileSync(path.join(comparisonDir, "metrics.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), cases: metrics }, null, 2)}\n`);
console.log(JSON.stringify({ rendered: cases.length, comparisonDir }, null, 2));
