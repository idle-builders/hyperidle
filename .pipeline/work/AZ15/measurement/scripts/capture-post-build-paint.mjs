#!/usr/bin/env node

/** AZ15 representative real-app painted proof after implementation. */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const repo = process.cwd();
const outputDir = path.join(repo, ".pipeline/work/AZ15/painted-proof");
const baseUrl = process.env.AZ15_APP_URL ?? "http://127.0.0.1:5185";
fs.mkdirSync(outputDir, { recursive: true });

const cases = [
	{ id: "settings-desktop", route: "/settings", width: 1280, height: 900, contract: "[data-testid='settings-section-profile']" },
	{ id: "settings-narrow", route: "/settings", width: 760, height: 1000, contract: "[data-testid='settings-section-profile']" },
	{ id: "agent-desktop", route: "/agents/demo-agent-pm", width: 1280, height: 900, contract: "[data-testid='agent-config-section']" },
	{ id: "routine-narrow", route: "/work/routine/demo-routine-daily_digest", width: 760, height: 1000, contract: "[data-testid='routine-last-run-summary']" },
	{ id: "work-team-desktop", route: "/work/team/demo-team-acme", width: 1280, height: 900 },
	{ id: "work-task-desktop", route: "/work/bet/demo-bet-pricing/task/demo-task-pricing-annual", width: 1280, height: 900 },
	{ id: "knowledge-detail-desktop", route: "/knowledge/demo-ki-annual-discount", width: 1280, height: 900 },
];

const browser = await chromium.launch({ headless: true });
const results = [];
try {
	for (const item of cases) {
		const page = await browser.newPage({ viewport: { width: item.width, height: item.height } });
		await page.goto(`${baseUrl}${item.route}`, { waitUntil: "domcontentloaded" });
		await page.getByTestId("main-content").waitFor({ state: "visible" });
		await page.waitForTimeout(400);
		const contract = item.contract ? page.locator(item.contract).first() : null;
		const contractVisible = contract ? await contract.isVisible().catch(() => false) : null;
		const contractMetrics = contractVisible
			? await contract.evaluate((element) => {
				const parent = element.parentElement;
				const own = getComputedStyle(element);
				const parentStyle = parent ? getComputedStyle(parent) : null;
				return {
					className: element.getAttribute("class"),
					gap: own.gap,
					parentClassName: parent?.getAttribute("class") ?? null,
					parentGap: parentStyle?.gap ?? null,
				};
			})
			: null;
		const pageMetrics = await page.locator("body").evaluate(() => {
			const elements = [...document.querySelectorAll("*")];
			const shadows = elements
				.map((element) => getComputedStyle(element).boxShadow)
				.filter((value) => value !== "none");
			return {
				title: document.title,
				elementCount: elements.length,
				shadowCount: shadows.length,
				uniqueShadows: [...new Set(shadows)],
			};
		});
		await page.screenshot({ path: path.join(outputDir, `${item.id}.png`), fullPage: true });
		results.push({ ...item, contractVisible, contractMetrics, pageMetrics });
		await page.close();
	}

	for (const item of [
		{ id: "global-search-narrow", route: "/conversations", width: 760, height: 1000, shortcut: "Meta+k", target: "[data-dialog-layer='dialog'][aria-label='Global search']" },
	]) {
		const page = await browser.newPage({ viewport: { width: item.width, height: item.height } });
		await page.goto(`${baseUrl}${item.route}`, { waitUntil: "domcontentloaded" });
		await page.getByTestId("main-content").waitFor({ state: "visible" });
		if (item.trigger) await page.locator(item.trigger).first().click();
		if (item.shortcut) await page.keyboard.press(item.shortcut);
		const target = page.locator(item.target);
		await target.waitFor({ state: "visible" });
		const targetMetrics = await target.evaluate((element) => {
			const style = getComputedStyle(element);
			const rect = element.getBoundingClientRect();
			return {
				className: element.getAttribute("class"),
				width: Math.round(rect.width),
				height: Math.round(rect.height),
				gap: style.gap,
				boxShadow: style.boxShadow,
			};
		});
		await page.screenshot({ path: path.join(outputDir, `${item.id}.png`), fullPage: true });
		results.push({ ...item, targetMetrics });
		await page.close();
	}
} finally {
	await browser.close();
}

fs.writeFileSync(
	path.join(outputDir, "metrics.json"),
	`${JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, results }, null, 2)}\n`,
);
console.log(JSON.stringify({ captured: results.length, outputDir }, null, 2));
