/**
 * K13 — Tier-by-tier critique screenshot capture.
 *
 * For each surface × tier (compact / default / comfortable) take one PNG via
 * either the K12 workbench (component primitives) or the running web app
 * (full pages). Output goes to `research/before-after-K13/<tier>/<surface>.png`.
 *
 * Used by: density-critique-K13.md (Phase 1), density-skill-audit-K13.md
 * (Phase 8 evidence), and Phase 7 before/after grids.
 *
 * Pre-reqs:
 *   - workbench at WORKBENCH_PORT (default 8198)
 *   - web app at WEB_PORT (default 5174)
 *
 * Run via:
 *   bun packages/design-system/scripts/k13-capture.ts
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "@playwright/test";

const WORKBENCH_PORT = process.env.WORKBENCH_PORT ?? "8198";
const WEB_PORT = process.env.WEB_PORT ?? "5174";
const ROOT = "/Users/tobiasgrundmann/Development/hyperidle/.worktrees/K13";
const OUT_DIR = join(ROOT, "packages/design-system/research/before-after-K13");

const TIERS = ["compact", "default", "comfortable"] as const;
type Tier = (typeof TIERS)[number];

// Tier 1+2 primitives — captured via the K12 workbench.
// Title ↔ workbench hash slug lookup. Hash is the story title.
const PRIMITIVES = [
	"BetCard",
	"EmptyState",
	"ErrorState",
	"KeyValue",
	"KnowledgeRow",
	"NavItem",
	"NotificationRow",
	"PitchCard",
	"SearchField",
	"Skeleton",
	"StatusChip",
	"Tag",
	"TaskCard",
	"ThreadRow",
];

// Main pages — captured via the running web app at full viewport.
const PAGES: { route: string; slug: string }[] = [
	{ route: "/work/portfolio", slug: "work-portfolio" },
	{ route: "/work/team", slug: "work-team" },
	{ route: "/work/bet/b1", slug: "work-bet" },
	{ route: "/conversations/review", slug: "conversations-review" },
	{ route: "/conversations/chat", slug: "conversations-chat" },
	{ route: "/knowledge", slug: "knowledge-list" },
	{ route: "/knowledge/k1", slug: "knowledge-detail" },
	{ route: "/settings", slug: "settings" },
];

function ensureDir(p: string): void {
	if (!existsSync(p)) {
		mkdirSync(p, { recursive: true });
	}
}

async function setDensity(page: Page, tier: Tier): Promise<void> {
	await page.evaluate((t) => {
		// AppShell sets data-density on its own root, not <html>. Target ANY
		// element carrying the attribute (which includes the AppShell root
		// in the web app), then also set <html> as a fallback for surfaces
		// like the K12 workbench where the toolbar writes to documentElement.
		const targets = Array.from(document.querySelectorAll("[data-density]"));
		for (const el of targets) (el as HTMLElement).setAttribute("data-density", t);
		document.documentElement.setAttribute("data-density", t);
		try {
			localStorage.setItem("ds-density", t);
		} catch {}
	}, tier);
	// allow density to repaint
	await page.waitForTimeout(250);
}

async function capturePrimitive(browser: Browser, name: string, tier: Tier): Promise<void> {
	const dir = join(OUT_DIR, tier);
	ensureDir(dir);
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	try {
		await page.goto(`http://localhost:${WORKBENCH_PORT}/#${name}`, {
			waitUntil: "networkidle",
		});
		// Force TSX mode if available so density tokens take effect on rendered components
		const tsxBtn = page.locator(".toolbar-btn", { hasText: /^TSX$/ });
		if ((await tsxBtn.count()) > 0) {
			await tsxBtn.first().click();
		}
		await setDensity(page, tier);
		await page.waitForTimeout(250);
		// Screenshot only the demo grid area for tighter component framing
		const demoArea = page.locator(".demo-grid").first();
		const target = (await demoArea.count()) > 0 ? demoArea : page;
		await target.screenshot({
			path: join(dir, `primitive-${name}.png`),
		});
	} finally {
		await page.close();
	}
}

async function capturePage(
	browser: Browser,
	route: string,
	slug: string,
	tier: Tier,
): Promise<void> {
	const dir = join(OUT_DIR, tier);
	ensureDir(dir);
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	try {
		await page.goto(`http://localhost:${WEB_PORT}${route}`, {
			waitUntil: "networkidle",
			timeout: 15000,
		});
		await setDensity(page, tier);
		await page.waitForTimeout(400);
		await page.screenshot({
			path: join(dir, `page-${slug}.png`),
			fullPage: false,
		});
	} catch (err) {
		console.error(`Failed page capture ${slug} @ ${tier}: ${(err as Error).message}`);
	} finally {
		await page.close();
	}
}

async function main(): Promise<void> {
	ensureDir(OUT_DIR);
	for (const t of TIERS) ensureDir(join(OUT_DIR, t));

	const browser = await chromium.launch();
	try {
		for (const tier of TIERS) {
			console.log(`\n=== Tier: ${tier} ===`);
			for (const name of PRIMITIVES) {
				console.log(`  primitive: ${name}`);
				await capturePrimitive(browser, name, tier);
			}
			for (const p of PAGES) {
				console.log(`  page: ${p.slug}`);
				await capturePage(browser, p.route, p.slug, tier);
			}
		}
	} finally {
		await browser.close();
	}
	console.log(`\nDone. Output: ${OUT_DIR}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
