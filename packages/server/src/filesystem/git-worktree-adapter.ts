/**
 * AO2 — Adapter 1: GitWorktreeAdapter.
 *
 * Local code filesystem: mount via `git worktree add`; capture via commit + bundle
 * + `git worktree remove`. Instant, shares the host repo's object store, no network.
 *
 * Selection rule (W4·2): code fs + null connectionId + isLocalRepoPath → this adapter.
 *
 * @lore AO2 §5 adapter-1: Each session gets its OWN branch (`agent/<sessionId>`)
 * to avoid the "two worktrees on the same branch" git rejection. Branch name
 * sanitized (no leading `-`). The commit lives in the shared object store;
 * the bundle is the AO3-portable artifact.
 *
 * @lore AO2 §8 scaffolding-exclusion: Before `git add`, write the worktree's
 * git/info/exclude with SANDBOX_SCAFFOLDING_PATHS entries. In a git worktree
 * `<sandboxPath>/.git` is a FILE (not a dir) containing `gitdir: <realGitDir>`.
 * We parse it to find the real admin dir and write exclude there. Non-fatal if
 * we can't — scaffolding files may show as untracked but won't commit unless staged.
 * Also exclude tracked-collision paths (files the host repo tracks that assembly
 * overwrites — CLAUDE.md/AGENTS.md/.mcp.json) by restore-from-HEAD before commit.
 *
 * @lore AO2 W-ENV: restoreIndexToHead previously used execSync(..., {env:{...process.env,...}})
 * which re-inherited the full process.env that buildGitEnv exists to strip. Replaced
 * with GitRunner.restoreStaged() which uses spawn + buildGitEnv (allowlist env only).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { MountResult } from "@hyperidle/shared";
import type {
	AdapterCaptureResult,
	CaptureContext,
	MountAdapter,
	MountContext,
} from "./mount-adapter.js";
import type { AdapterDeps } from "./mounter-registry.js";
import { SANDBOX_SCAFFOLDING_PATHS } from "./scaffolding-paths.js";

export class GitWorktreeAdapter implements MountAdapter {
	readonly id = "git-worktree";

	constructor(private readonly deps: AdapterDeps) {}

	async mount(ctx: MountContext): Promise<MountResult> {
		const { filesystem, sandboxPath } = ctx;

		if (filesystem.resourceRef.kind !== "code") {
			return {
				success: false,
				sandboxPath,
				error: `GitWorktreeAdapter: expected code resourceRef, got '${filesystem.resourceRef.kind}'`,
			};
		}

		const repoPath = filesystem.resourceRef.repo;
		// Use a random-enough identifier from sandboxPath basename for branch uniqueness at mount time.
		// captureBack gets the REAL sessionId which takes precedence.
		const sessionId = path.basename(sandboxPath);
		const branch = sanitizeBranch(`agent/${sessionId}`);

		try {
			// cwd = HOST REPO (repoPath). Worktree target = sandboxPath.
			const hostRunner = this.deps.gitRunnerFactory(repoPath);
			await hostRunner.worktreeAdd(sandboxPath, branch, { createBranch: true });

			// Write scaffolding exclusion into the worktree's real git admin dir.
			writeGitExclude(sandboxPath);

			return { success: true, sandboxPath };
		} catch (err) {
			return {
				success: false,
				sandboxPath,
				error: `GitWorktreeAdapter.mount failed: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
	}

	async captureBack(ctx: CaptureContext): Promise<AdapterCaptureResult> {
		const { filesystem, sandboxPath, sessionId } = ctx;

		if (filesystem.resourceRef.kind !== "code") {
			return {
				success: false,
				captured: false,
				error: "GitWorktreeAdapter: expected code resourceRef",
			};
		}

		const repoPath = filesystem.resourceRef.repo;
		// Derive the branch name from the sandboxPath basename (matches what mount created).
		const mountedBranch = sanitizeBranch(`agent/${path.basename(sandboxPath)}`);
		const bundlePath = path.join(this.deps.capturesDir, `${sessionId}.bundle`);

		try {
			// Ensure captures dir exists.
			fs.mkdirSync(this.deps.capturesDir, { recursive: true });

			// Runner cwd = the worktree (sandboxPath) for add/commit/bundle.
			const wtRunner = this.deps.gitRunnerFactory(sandboxPath);

			// Stage all authored changes (git add -A stages everything: modified + new).
			await wtRunner.add([]);

			// @lore AO2 scaffolding-exclusion-fix: git info/exclude prevents scaffolding
			// from showing as untracked in `git status`, but does NOT prevent `git add -A`
			// from staging NEWLY-CREATED scaffolding files (e.g. in a fresh repo where
			// CLAUDE.md / .mcp.json / .fabric were not previously tracked). We must
			// explicitly unstage any staged files that are in SANDBOX_SCAFFOLDING_PATHS.
			// This covers BOTH cases:
			// (a) Tracked-collision: the self-host repo tracks CLAUDE.md — assembly
			//     overwrites it; restore to HEAD so the authored commit carries origin's version.
			// (b) New-staged: a fresh repo does not track scaffolding — git add -A stages
			//     the new files; restore to "not staged" so they are excluded entirely.
			//
			// Get the staged list AFTER git add -A: lsFiles() returns the full index.
			const staged = await wtRunner.lsFiles();
			const scaffoldingToUnstage = staged.filter((f) =>
				SANDBOX_SCAFFOLDING_PATHS.some((sp) => f === sp || f.startsWith(`${sp}/`)),
			);

			if (scaffoldingToUnstage.length > 0) {
				try {
					await wtRunner.restoreStaged(scaffoldingToUnstage);
				} catch {
					// Non-fatal: if restore fails, scaffolding files may appear in the commit.
					// Best-effort exclusion — still better than no exclusion.
				}
			}

			// Check if there are actually staged changes after collision exclusion.
			const clean = await wtRunner.diffCached();
			if (clean) {
				// Nothing to commit. Still remove the worktree.
				const hostRunner = this.deps.gitRunnerFactory(repoPath);
				await hostRunner.worktreeRemove(sandboxPath, { force: true });
				return { success: true, captured: false };
			}

			const sha = await wtRunner.commit(
				`agent capture (session ${sessionId})`,
				"HyperIdle Agent",
				"agent@hyperidle.local",
			);

			// Bundle the session branch for AO3.
			await wtRunner.bundle(bundlePath, `refs/heads/${mountedBranch}`);

			// Remove the worktree from the host repo.
			const hostRunner = this.deps.gitRunnerFactory(repoPath);
			await hostRunner.worktreeRemove(sandboxPath, { force: true });

			return { success: true, captured: true, capturePath: bundlePath, commitSha: sha };
		} catch (err) {
			return {
				success: false,
				captured: false,
				error: `GitWorktreeAdapter.captureBack failed: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
	}
}

/** Sanitize a branch name: no leading `-`, replace invalid chars. */
function sanitizeBranch(name: string): string {
	return name.replace(/^-+/, "").replace(/[^a-zA-Z0-9/_.-]/g, "-");
}

/**
 * Resolve the real git admin directory for a worktree.
 *
 * In a git worktree `<sandboxPath>/.git` is a FILE containing:
 *   `gitdir: /path/to/main/.git/worktrees/name`
 * Parse it to get the real gitdir, then use its `info/exclude`.
 *
 * @lore AO2: This is necessary because `fs.mkdirSync(<sandboxPath>/.git/info)` would
 * fail with ENOTDIR when `.git` is a file (worktree). We resolve the real path first.
 */
function resolveWorktreeGitDir(sandboxPath: string): string | null {
	const dotGit = path.join(sandboxPath, ".git");
	try {
		const stat = fs.statSync(dotGit);
		if (stat.isDirectory()) {
			// Regular repo (non-worktree).
			return dotGit;
		}
		// Worktree: .git is a file with content like `gitdir: /real/path\n`.
		const content = fs.readFileSync(dotGit, "utf-8").trim();
		const match = content.match(/^gitdir:\s*(.+)$/);
		if (!match?.[1]) return null;
		return path.resolve(sandboxPath, match[1].trim());
	} catch {
		return null;
	}
}

/**
 * Write .git/info/exclude with SANDBOX_SCAFFOLDING_PATHS entries.
 * Works for both regular repos and git worktrees.
 *
 * @lore AO2: Non-fatal if the gitdir cannot be resolved — the adapters still work;
 * scaffolding files may appear as untracked but won't be committed unless staged.
 */
function writeGitExclude(sandboxPath: string): void {
	const gitDir = resolveWorktreeGitDir(sandboxPath);
	if (!gitDir) return;

	const excludePath = path.join(gitDir, "info", "exclude");
	const excludeDir = path.dirname(excludePath);
	try {
		fs.mkdirSync(excludeDir, { recursive: true });
		const entries = SANDBOX_SCAFFOLDING_PATHS.map((p) => `/${p}`).join("\n");
		const content = `# AO2 scaffolding exclusion — auto-generated, do not edit.\n${entries}\n`;
		// Append to existing content (don't clobber git's own default excludes).
		const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, "utf-8") : "";
		if (!existing.includes("AO2 scaffolding exclusion")) {
			fs.writeFileSync(excludePath, `${existing}\n${content}`, "utf-8");
		}
	} catch {
		// Non-fatal.
	}
}
