/**
 * AJ4 — capture-evidence: orchestrate change detection → render → upload → PR embed.
 *
 * NON-BLOCKING: exits 0 + degraded note at every I/O seam. A capture failure
 * must not red a green ship (AC4 — artifact, not gate).
 *
 * Three independent failure seams, each degrading gracefully:
 *   1. renderStory throws   → skip imaging; emit link-only block
 *   2. uploadShots throws   → keep local PNGs referenced; emit link-only with note
 *   3. git worktree add (base) fails → skip before-shots; emit after-only with note
 *
 * Injectable seams for testing (skipWorktree / renderStoryFn / uploadShotsFn).
 *
 * @lore AJ4: The EVIDENCE_MODULE_CAP=12 caps imaged modules to bound ship latency.
 * Overflow modules are link-only; the cap is logged (never silently dropped).
 */

import { changedStories } from "./changed-stories.js";
import { buildEvidenceReport, EVIDENCE_MODULE_CAP } from "./evidence-report.js";
import type { RenderedShot, RenderTarget } from "./render-story.js";
import type { HostedShot } from "./upload-assets.js";

export interface CaptureEvidenceOptions {
	/** PR number on GitHub */
	prNumber: number;
	/** Content of the .snap file on the current branch */
	branchSnap: string;
	/** Content of the .snap file on origin/main */
	baseSnap: string;
	/**
	 * Injectable: render one story to a PNG.
	 * Defaults to the real renderStory() implementation.
	 */
	renderStoryFn?: (
		viewerOrigin: string,
		target: RenderTarget,
		outDir: string,
	) => Promise<RenderedShot>;
	/**
	 * Injectable: upload PNG shots to the orphan evidence branch.
	 * Defaults to the real uploadShots() implementation.
	 */
	uploadShotsFn?: (
		prNumber: number,
		shots: { side: "before" | "after"; shot: RenderedShot }[],
	) => Promise<HostedShot[]>;
	/**
	 * When true, skip the real worktree add/remove and viewer boot steps.
	 * Used in unit tests to avoid spawning processes.
	 */
	skipWorktree?: boolean;
}

export interface CaptureEvidenceResult {
	exitCode: 0;
	/** Present when a failure was degraded (capture/upload/worktree failure). */
	degradedNote?: string;
	/** PR markdown section produced (empty string if changed set is empty). */
	prMarkdown: string;
	/**
	 * Hosted shots from the upload step — present so callers can persist the
	 * full artifact (with real URLs) rather than an empty-hosted placeholder.
	 * Empty array when no shots were captured or upload failed.
	 */
	hostedShots: import("./upload-assets.js").HostedShot[];
}

/**
 * Main orchestration entry point for the design-evidence capture pipeline.
 *
 * Always resolves (never rejects). Exits 0 even on I/O failure — degraded mode.
 */
export async function runCaptureEvidence(
	options: CaptureEvidenceOptions,
): Promise<CaptureEvidenceResult> {
	const {
		prNumber,
		branchSnap,
		baseSnap,
		skipWorktree = false,
		renderStoryFn,
		uploadShotsFn,
	} = options;

	// 1. Detect changed stories
	const changed = changedStories(branchSnap, baseSnap);

	// AC3: empty changed-set → no output
	if (changed.length === 0) {
		return { exitCode: 0, prMarkdown: "", hostedShots: [] };
	}

	// Cap the imaged modules
	const imagedModules = changed.slice(0, EVIDENCE_MODULE_CAP);
	const overflowCount = changed.length - imagedModules.length;

	if (overflowCount > 0) {
		// @lore AJ4: Log the cap — never silently drop changed modules
		console.warn(
			`design evidence: ${changed.length} modules changed; imaged first ${EVIDENCE_MODULE_CAP}, ` +
				`remaining ${overflowCount} link-only — see story links`,
		);
	}

	// 2. Attempt to render before/after shots — non-blocking at each seam
	let hostedShots: HostedShot[] = [];
	let degradedNote: string | undefined;

	if (skipWorktree) {
		// Test/dry-run mode: use injectable seams without real worktree/viewer ops
		// Seam 1: renderStory — degrades on throw
		let renderedShots: { side: "before" | "after"; shot: RenderedShot }[] = [];

		if (renderStoryFn !== undefined) {
			try {
				renderedShots = await renderModulesWithFn(imagedModules, renderStoryFn);
			} catch (err) {
				degradedNote = `screenshot capture unavailable: ${err instanceof Error ? err.message : String(err)}`;
			}
		}

		// Seam 2: uploadShots — degrades on throw (only if render succeeded)
		if (renderedShots.length > 0 && uploadShotsFn !== undefined) {
			try {
				hostedShots = await uploadShotsFn(prNumber, renderedShots);
			} catch (err) {
				degradedNote =
					degradedNote ??
					`could not publish to the evidence branch: ${err instanceof Error ? err.message : String(err)}`;
			}
		} else if (renderedShots.length === 0 && !degradedNote && uploadShotsFn !== undefined) {
			// renderStoryFn not provided or produced no shots — try upload with empty set
			try {
				hostedShots = await uploadShotsFn(prNumber, []);
			} catch (err) {
				degradedNote =
					degradedNote ??
					`could not publish to the evidence branch: ${err instanceof Error ? err.message : String(err)}`;
			}
		}
	} else {
		// Real mode: start viewers, capture screenshots, upload
		try {
			const shots = await captureRealShots(imagedModules, prNumber, renderStoryFn, uploadShotsFn);
			hostedShots = shots.hosted;
			degradedNote = shots.degradedNote;
		} catch (err) {
			degradedNote = `screenshot capture unavailable: ${err instanceof Error ? err.message : String(err)}`;
		}
	}

	// 3. Build PR markdown
	const report = buildEvidenceReport(changed, hostedShots);

	return {
		exitCode: 0,
		degradedNote,
		prMarkdown: report.prMarkdown,
		hostedShots,
	};
}

/**
 * Render modules using the injectable seam.
 * Throws on failure — caller catches and degrades.
 */
async function renderModulesWithFn(
	modules: ReturnType<typeof changedStories>,
	renderStoryFn: NonNullable<CaptureEvidenceOptions["renderStoryFn"]>,
): Promise<{ side: "before" | "after"; shot: RenderedShot }[]> {
	const shots: { side: "before" | "after"; shot: RenderedShot }[] = [];

	for (const story of modules) {
		for (const variant of story.variants) {
			const target: RenderTarget = { title: story.title, variant };
			const shot = await renderStoryFn("http://localhost:8098", target, "/tmp/aj4-evidence/after");
			shots.push({ side: "after", shot });
		}
	}

	return shots;
}

/**
 * Real capture flow: worktree setup, viewer boot, screenshot, upload.
 * Degrades at each seam independently.
 */
async function captureRealShots(
	modules: ReturnType<typeof changedStories>,
	prNumber: number,
	renderStoryFn?: CaptureEvidenceOptions["renderStoryFn"],
	uploadShotsFn?: CaptureEvidenceOptions["uploadShotsFn"],
): Promise<{ hosted: HostedShot[]; degradedNote?: string }> {
	const { execFile, spawn } = await import("node:child_process");
	const { promisify } = await import("node:util");
	const http = await import("node:http");
	const execFileAsync = promisify(execFile);

	let degradedNote: string | undefined;
	const allShots: { side: "before" | "after"; shot: RenderedShot }[] = [];

	// Probe a free port helper
	async function probeFreePort(): Promise<number> {
		const net = await import("node:net");
		return new Promise((resolve, reject) => {
			const srv = net.createServer();
			srv.listen(0, () => {
				const addr = srv.address();
				if (!addr || typeof addr === "string") {
					srv.close(() => reject(new Error("Could not probe free port")));
					return;
				}
				const port = addr.port;
				srv.close(() => resolve(port));
			});
		});
	}

	// Start a viewer and wait for it to answer
	async function startViewer(port: number, cwd: string): Promise<{ kill: () => void }> {
		const child = spawn("npm", ["run", "ds:serve", "--", "--port", String(port)], {
			cwd,
			stdio: "pipe",
			detached: false,
		});

		const viewerOrigin = `http://localhost:${port}`;
		const deadline = Date.now() + 30_000;

		await new Promise<void>((resolve, reject) => {
			function probe() {
				if (Date.now() > deadline) {
					reject(new Error(`Viewer on port ${port} did not answer within 30s`));
					return;
				}
				const req = http.get(viewerOrigin, (res) => {
					res.resume();
					resolve();
				});
				req.on("error", () => {
					setTimeout(probe, 500);
				});
				req.setTimeout(1000, () => {
					req.destroy();
					setTimeout(probe, 500);
				});
			}
			probe();
		});

		return {
			kill: () => {
				try {
					child.kill();
				} catch {
					// Ignore
				}
			},
		};
	}

	// Render with seam or real function
	const render = renderStoryFn ?? (await import("./render-story.js")).renderStory;
	const upload = uploadShotsFn ?? (await import("./upload-assets.js")).uploadShots;

	// Base worktree management
	const baseWorktreePath = ".worktrees/_aj4-evidence-base";

	// Force-remove any stale base worktree (idempotent — recovers from crashed prior ship)
	try {
		await execFileAsync("git", ["worktree", "remove", "--force", baseWorktreePath]);
	} catch {
		// Ignore — not registered or already gone
	}
	try {
		await execFileAsync("git", ["worktree", "prune"]);
	} catch {
		// Ignore
	}

	let baseWorktreeAdded = false;

	try {
		await execFileAsync("git", ["worktree", "add", "--detach", baseWorktreePath, "origin/main"]);
		baseWorktreeAdded = true;
	} catch (err) {
		degradedNote = `origin/main render unavailable; showing after only (worktree add failed: ${err instanceof Error ? err.message : String(err)})`;
	}

	const afterPort = await probeFreePort();
	const beforePort = baseWorktreeAdded ? await probeFreePort() : 0;

	// Track viewers for cleanup — stored here so the finally block can kill them
	// regardless of where in the render pipeline we are.
	const viewers: Array<{ kill: () => void }> = [];

	/**
	 * Render all module variants from a running viewer and push into allShots.
	 * Registers the viewer handle in `viewers` for cleanup. Throws on failure —
	 * caller catches and degrades.
	 */
	async function renderSide(
		side: "before" | "after",
		port: number,
		cwd: string,
	): Promise<void> {
		const viewer = await startViewer(port, cwd);
		viewers.push(viewer);
		for (const story of modules) {
			for (const variant of story.variants) {
				const target: RenderTarget = { title: story.title, variant };
				const shot = await render(
					`http://localhost:${port}`,
					target,
					`/tmp/aj4-evidence/${prNumber}/${side}`,
				);
				allShots.push({ side, shot });
			}
		}
	}

	try {
		// After shots (branch)
		try {
			await renderSide("after", afterPort, process.cwd());
		} catch (err) {
			degradedNote =
				degradedNote ??
				`screenshot capture unavailable: ${err instanceof Error ? err.message : String(err)}`;
		}

		// Before shots (base worktree)
		if (baseWorktreeAdded) {
			try {
				await renderSide("before", beforePort, baseWorktreePath);
			} catch (err) {
				degradedNote =
					degradedNote ??
					`origin/main render unavailable; showing after only (before-viewer failed: ${err instanceof Error ? err.message : String(err)})`;
			}
		}

		// Upload shots
		if (allShots.length > 0) {
			try {
				const hosted = await upload(prNumber, allShots);
				return { hosted, degradedNote };
			} catch (err) {
				degradedNote =
					degradedNote ??
					`captured ${allShots.length} renders; could not publish to the evidence branch: ${err instanceof Error ? err.message : String(err)}`;
			}
		}
	} finally {
		// Teardown all viewers that were started
		for (const v of viewers) v.kill();

		// Force-remove base worktree (idempotent)
		if (baseWorktreeAdded) {
			try {
				await execFileAsync("git", ["worktree", "remove", "--force", baseWorktreePath]);
			} catch {
				// Ignore cleanup errors
			}
			try {
				await execFileAsync("git", ["worktree", "prune"]);
			} catch {
				// Ignore
			}
		}
	}

	return { hosted: [], degradedNote };
}

// ---------------------------------------------------------------------------
// CLI entry point (when run directly as ds:evidence)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const prIdx = args.indexOf("--pr");
	const prNumber = prIdx !== -1 ? Number.parseInt(args[prIdx + 1] ?? "0", 10) : 0;

	if (!prNumber) {
		console.error("Usage: ds:evidence -- --pr <number>");
		process.exit(1);
	}

	const { execFile } = await import("node:child_process");
	const { promisify } = await import("node:util");
	const fs = await import("node:fs/promises");
	const execFileAsync = promisify(execFile);

	const snapRelPath =
		"packages/design-system/src/__tests__/__snapshots__/catalog-snapshot.test.tsx.snap";

	// Branch snap from working tree
	let branchSnap = "";
	try {
		branchSnap = await fs.readFile(snapRelPath, "utf8");
	} catch {
		branchSnap = "";
	}

	// Base snap from origin/main
	let baseSnap = "";
	try {
		const result = await execFileAsync("git", ["show", `origin/main:${snapRelPath}`]);
		baseSnap = result.stdout;
	} catch {
		// File doesn't exist on origin/main → treat all as added
		baseSnap = "";
	}

	const result = await runCaptureEvidence({ prNumber, branchSnap, baseSnap });

	if (result.degradedNote) {
		console.warn(`[design evidence] degraded: ${result.degradedNote}`);
	}

	if (result.prMarkdown) {
		// Update PR body
		try {
			const currentBodyResult = await execFileAsync("gh", [
				"pr",
				"view",
				String(prNumber),
				"--json",
				"body",
				"-q",
				".body",
			]);
			const body = currentBodyResult.stdout;

			// Strip any existing design evidence block (idempotent re-ship)
			const stripped = body
				.replace(
					/<!-- aj4-design-evidence:start -->[\s\S]*?<!-- aj4-design-evidence:end -->\n?/g,
					"",
				)
				.trim();

			const newBody = stripped ? `${stripped}\n\n${result.prMarkdown}` : result.prMarkdown;

			await execFileAsync("gh", ["pr", "edit", String(prNumber), "--body", newBody]);
			console.log(`[design evidence] updated PR #${prNumber}`);
		} catch (err) {
			console.warn(
				`[design evidence] could not update PR body: ${err instanceof Error ? err.message : String(err)}`,
			);
		}

		// Write design-evidence.json for the ship summary — use the real hostedShots
		// so the artifact carries actual blob-viewer URLs (not an empty-hosted placeholder).
		// @lore AJ4: MAJOR-2 fix: previously passed [] instead of result.hostedShots,
		// leaving shots[].before/after === undefined in the persisted artifact.
		try {
			const branchResult = await execFileAsync("git", ["branch", "--show-current"]);
			const branch = branchResult.stdout.trim();
			const wpMatch = branch.match(/([A-Z]+\d+)/);
			const wpId = wpMatch?.[1] ?? "unknown";

			const evidencePath = `plans/${wpId}/design-evidence.json`;
			const dir = evidencePath.substring(0, evidencePath.lastIndexOf("/"));
			await fs.mkdir(dir, { recursive: true });

			// Re-use the final changed set + the real hosted shots from the upload step
			const finalChanged = changedStories(branchSnap, baseSnap);
			const { buildEvidenceReport } = await import("./evidence-report.js");
			const report = buildEvidenceReport(finalChanged, result.hostedShots);
			await fs.writeFile(evidencePath, JSON.stringify(report, null, 2), "utf8");
		} catch {
			// Non-blocking — ship summary just has no design section
		}
	} else {
		// Empty changed-set: strip any stale design section from the PR body
		try {
			const currentBodyResult = await execFileAsync("gh", [
				"pr",
				"view",
				String(prNumber),
				"--json",
				"body",
				"-q",
				".body",
			]);
			const body = currentBodyResult.stdout;
			const stripped = body
				.replace(
					/<!-- aj4-design-evidence:start -->[\s\S]*?<!-- aj4-design-evidence:end -->\n?/g,
					"",
				)
				.trim();

			if (stripped !== body.trim()) {
				await execFileAsync("gh", ["pr", "edit", String(prNumber), "--body", stripped]);
				console.log(`[design evidence] stripped stale design section from PR #${prNumber}`);
			} else {
				console.log(`[design evidence] no design changes — PR #${prNumber} unchanged`);
			}
		} catch (err) {
			console.warn(
				`[design evidence] could not update PR body: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}
}

// Run as CLI if this is the entry point
const isMain =
	typeof process !== "undefined" &&
	process.argv[1] !== undefined &&
	(process.argv[1].endsWith("capture-evidence.ts") ||
		process.argv[1].endsWith("capture-evidence.js"));

if (isMain) {
	// @lore AJ4: Exit 0 on fatal — the never-block-ship contract requires this script
	// to be non-blocking end-to-end. A top-level error (e.g. bad argv) degrades
	// silently rather than failing the ship step.
	main().catch((err) => {
		console.error("[design evidence] fatal:", err);
		process.exit(0);
	});
}
