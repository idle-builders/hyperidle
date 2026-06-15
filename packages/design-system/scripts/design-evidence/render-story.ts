/**
 * AJ4 — render-story: drive a running viewer to capture a PNG screenshot.
 *
 * Uses the existing web Playwright CLI to screenshot one story-variant
 * from an already-running viewer origin. Per-module images (B1 approach):
 * screenshots the whole module page once (all variants visible), not per-variant.
 * Variant-level detection still drives the changed-set; only the image is per-module.
 *
 * @lore AJ4: Per-variant capture (B2) would require a `?variant=` viewer route
 * change. Deferred as a follow-up — B1 (per-module) requires zero viewer changes
 * and is the simplest correct approach.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import { storyViewerUrl } from "./story-url.js";

const execFileAsync = promisify(execFile);

export interface RenderTarget {
	title: string;
	variant: string;
}

export interface RenderedShot {
	target: RenderTarget;
	pngPath: string;
}

/**
 * Local-only. Screenshot one story-variant from an already-running viewer origin.
 *
 * Uses npx playwright screenshot from the web package (Playwright is installed there).
 * The output filename encodes both title and variant; the actual screenshot is
 * per-module (all variants on one page) since the viewer renders a module page.
 *
 * @param viewerOrigin - e.g. "http://localhost:9001" (must be already running)
 * @param target       - { title, variant } — title drives the route; variant names the file
 * @param outDir       - directory to write the PNG into (created if absent)
 */
export async function renderStory(
	viewerOrigin: string,
	target: RenderTarget,
	outDir: string,
): Promise<RenderedShot> {
	const { title, variant } = target;
	const safeTitle = title.replace(/\//g, "__");
	const pngPath = path.join(outDir, `${safeTitle}__${variant}.png`);

	await fs.mkdir(outDir, { recursive: true });

	const storyUrl = storyViewerUrl(title, viewerOrigin);

	// @lore AJ4: Using --prefix to target the web package's Playwright install.
	// The web package has Playwright as a devDependency and has the browsers installed.
	// ⚠️ UNVERIFIED: the exact npx --prefix path and CLI flags — verified against
	// the architecture plan's specified command form.
	await execFileAsync(
		"npx",
		[
			"--prefix",
			"packages/web",
			"playwright",
			"screenshot",
			"--browser=chromium",
			"--wait-for-timeout=400",
			storyUrl,
			pngPath,
		],
		{
			// Run from repo root so --prefix packages/web resolves correctly
			cwd: process.cwd(),
		},
	);

	return { target, pngPath };
}
