/**
 * AJ4 — upload-assets: orphan pr-evidence/<id> branch upload mechanic.
 *
 * PRIMARY mechanic: base64 PUT each PNG to an orphan `pr-evidence/<id>` branch
 * via `gh api repos/{owner}/{repo}/contents`. Returns openable blob-viewer links
 * (private-repo-safe — the blob page renders the PNG to any authenticated viewer).
 *
 * @lore AJ4: ambrovia/hyperidle is PRIVATE. raw.githubusercontent.com and
 * blob?raw=true URLs are JWT-gated; GitHub's camo proxy only proxies public URLs
 * → they do NOT render inline in a PR. The user-attachments upload endpoint
 * requires a browser session cookie — not a token. The orphan-branch + blob-viewer
 * link is the only guaranteed-workable path for a private repo from a gh token.
 */

import type { RenderedShot, RenderTarget } from "./render-story.js";

export interface HostedShot {
	target: RenderTarget;
	side: "before" | "after";
	/** PRIMARY: blob-viewer page URL (openable, private-safe). SPIKE: user-attachments inline URL. */
	url: string;
	/** How evidence-report should embed it; default "link" (private-repo guaranteed path). */
	render: "link" | "inline";
}

/**
 * Upload local PNGs to the orphan pr-evidence/<id> branch via gh api.
 * Returns openable evidence URLs (blob-viewer pages).
 *
 * The orphan branch is created (or reused) entirely via `gh api` — the ship
 * worktree is never touched. PNGs land in a per-PR subfolder.
 *
 * @param prNumber - PR number, used as the subfolder name and branch suffix
 * @param shots    - Array of {side, shot} pairs to upload
 * @returns        - Array of HostedShot with openable blob-viewer URLs
 */
export async function uploadShots(
	prNumber: number,
	shots: { side: "before" | "after"; shot: RenderedShot }[],
): Promise<HostedShot[]> {
	// @lore AJ4: This is the real implementation that calls `gh api` to push PNGs
	// to an orphan branch. In tests, this function is replaced via the injectable
	// `uploadShotsFn` seam in capture-evidence.ts so no real gh calls are made.
	const { execFile } = await import("node:child_process");
	const { promisify } = await import("node:util");
	const fs = await import("node:fs/promises");
	const execFileAsync = promisify(execFile);

	// Get repo info
	const repoResult = await execFileAsync("gh", [
		"repo",
		"view",
		"--json",
		"nameWithOwner",
		"-q",
		".nameWithOwner",
	]);
	const repoWithOwner = repoResult.stdout.trim();

	const branchName = `pr-evidence/${prNumber}`;
	const hostedShots: HostedShot[] = [];

	// Ensure the orphan branch exists (create from empty tree if absent)
	try {
		await execFileAsync("gh", [
			"api",
			"--method",
			"GET",
			`repos/${repoWithOwner}/git/ref/heads/${branchName}`,
		]);
		// Branch exists — no-op
	} catch {
		// Branch doesn't exist — create orphan from empty tree
		// 1. Create empty tree
		const treeResult = await execFileAsync("gh", [
			"api",
			"--method",
			"POST",
			`repos/${repoWithOwner}/git/trees`,
			"-f",
			"tree=[]",
			"--jq",
			".sha",
		]);
		const treeSha = treeResult.stdout.trim();

		// 2. Create commit with no parents
		const commitResult = await execFileAsync("gh", [
			"api",
			"--method",
			"POST",
			`repos/${repoWithOwner}/git/commits`,
			"-f",
			`message=init pr-evidence/${prNumber}`,
			"-f",
			`tree=${treeSha}`,
			"--jq",
			".sha",
		]);
		const commitSha = commitResult.stdout.trim();

		// 3. Create the ref
		await execFileAsync("gh", [
			"api",
			"--method",
			"POST",
			`repos/${repoWithOwner}/git/refs`,
			"-f",
			`ref=refs/heads/${branchName}`,
			"-f",
			`sha=${commitSha}`,
		]);
	}

	// Upload each PNG
	for (const { side, shot } of shots) {
		const { title, variant } = shot.target;
		const safeTitle = title.replace(/\//g, "__");
		const fileName = `${prNumber}/${safeTitle}__${variant}__${side}.png`;
		const pngBuffer = await fs.readFile(shot.pngPath);
		const content = pngBuffer.toString("base64");

		const result = await execFileAsync("gh", [
			"api",
			"--method",
			"PUT",
			`repos/${repoWithOwner}/contents/${fileName}`,
			"-f",
			`message=aj4 evidence ${prNumber}`,
			"-f",
			`branch=${branchName}`,
			"-f",
			`content=${content}`,
			"--jq",
			".content.html_url",
		]);

		const htmlUrl = result.stdout.trim();

		hostedShots.push({
			target: shot.target,
			side,
			url: htmlUrl,
			render: "link",
		});
	}

	return hostedShots;
}
