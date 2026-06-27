/**
 * AO2 §4 + §5 — SandboxFilesystemMounter: materialize filesystems into the session sandbox.
 *
 * Implements the FilesystemMounter seam (packages/shared/src/filesystem.ts) AO1 shipped.
 * Wired into admitSession (Phase 5.5) and runSession teardown (before each workspace.destroy).
 *
 * mount():
 *   1. Clone the repo (shallow, --depth=1) via GitRunner.clone().
 *   2. Write .git/info/exclude with SANDBOX_SCAFFOLDING_PATHS (anchored) — §5b·2.
 *   3. Compute tracked-collision set (git ls-files ∩ SANDBOX_SCAFFOLDING_PATHS) — §5b·3.
 *   4. If auth.connectionId present: resolve token via authResolver.resolveToken(),
 *      write host-scoped local git config (http.<host>/.extraHeader) via runner.configSet() — §4.
 *      Token NEVER in argv or URL. Dies with the sandbox (workspace.destroy rm-rf).
 *
 * captureBack():
 *   1. git writeback: scoped stage (exclude scaffolding + collision set) → commit → bundle
 *      to <captureBasePath>/<sessionId>/<filesystemId>.bundle — §5, §5b.
 *   2. file writeback: snapshot changed folder to <captureBasePath>/<sessionId>/<filesystemId>/.
 *   3. none writeback: no-op, CaptureResult{captured:false}.
 *   Write filesystem_captures row if db + sessionId provided.
 *
 * @lore AO2 §5b: Scoped capture is a SECURITY CONTROL, not a cleanliness nicety.
 * On the codex path, provisionReturnHook writes .codex-home/auth.json — a REAL HOST CREDENTIAL
 * (@lore AL6). Naive `git add -A` would bundle it into the durable capture artifact.
 * The scaffolding exclusion (SANDBOX_SCAFFOLDING_PATHS constant, .git/info/exclude,
 * derived tracked-collision pathspec) prevents this. Lane A's codex-path variant proves it.
 *
 * @lore AO2 §4 disposability: the forge-auth projection lives in <sandbox>/.git/config
 * (--local config, host-scoped http.<host>/.extraHeader). workspace.destroy rm-rf's the
 * sandbox, removing the token. The bundle contains commits/objects only — no .git/config —
 * so the token never reaches the durable artifact. Disposability is structural, not a cleanup step.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { type HyperIdleDb, filesystemCaptures } from "@hyperidle/db";
import {
	SANDBOX_SCAFFOLDING_PATHS,
	type CaptureResult,
	type Filesystem,
	type FilesystemAuth,
	type FilesystemAuthResolver,
	type FilesystemMounter,
	type MountResult,
} from "@hyperidle/shared";
import { createGitRunner } from "@hyperidle/fabric";
import { repoToUrl } from "./filesystem-reachability.js";

// ─── Deps ─────────────────────────────────────────────────────────────────────

export interface SandboxFilesystemMounterDeps {
	authResolver: FilesystemAuthResolver;
	captureBasePath: string;
	/** Optional: if provided, captureBack writes a filesystem_captures row. */
	db?: HyperIdleDb;
	/** Optional: paired with db — the session ID for the captures row. */
	sessionId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the host-scoped git config key for token injection.
 * Mirrors filesystem-reachability.ts:probeGitRemote's token config.
 *
 * @lore AO2 §4: Shape is `http.${protocol}//${host}/.extraHeader` — host-scoped,
 * restricts the Authorization header to the specific origin. Must match the exact
 * form used by probeGitRemote so both injection paths stay in sync.
 */
function buildHostScopedHeaderConfig(
	url: string,
	token: string,
): { key: string; value: string } | null {
	try {
		const parsed = new URL(url);
		const hostPrefix = `${parsed.protocol}//${parsed.host}`;
		const key = `http.${hostPrefix}/.extraHeader`;
		const b64 = Buffer.from(`x-access-token:${token}`).toString("base64");
		const value = `Authorization: Basic ${b64}`;
		return { key, value };
	} catch {
		return null;
	}
}

/**
 * Determine if a file or directory path matches any entry in SANDBOX_SCAFFOLDING_PATHS.
 * Matching rules:
 *   - Exact match: "AGENTS.md" matches "AGENTS.md"
 *   - Directory prefix: ".claude/" matches ".claude/settings.json"
 */
function isScaffoldingPath(filePath: string): boolean {
	for (const entry of SANDBOX_SCAFFOLDING_PATHS) {
		if (entry.endsWith("/")) {
			// Directory entry: matches if filePath starts with the dir name (without trailing slash)
			const dirName = entry.slice(0, -1);
			if (filePath === dirName || filePath.startsWith(dirName + "/") || filePath.startsWith(entry)) {
				return true;
			}
		} else {
			// File entry: exact match
			if (filePath === entry) return true;
		}
	}
	return false;
}

/**
 * Write .git/info/exclude with all SANDBOX_SCAFFOLDING_PATHS anchored at root.
 * Anchoring with `/` prefix ensures git treats them as root-relative patterns.
 *
 * @lore AO2 §5b·2: Written BEFORE Phase 6/8b run (provisioning scaffolding writes).
 * .git/info/exclude is local-only — never alters the repo's committed .gitignore.
 * Keeps scaffolding paths UNTRACKED even after assembly writes them, so scoped
 * `git add` never picks them up.
 */
function writeGitInfoExclude(sandboxPath: string): void {
	const infoDir = path.join(sandboxPath, ".git", "info");
	fs.mkdirSync(infoDir, { recursive: true });
	const excludePath = path.join(infoDir, "exclude");

	const lines = [
		"# AO2: HyperIdle session-provisioning scaffolding paths (auto-generated).",
		"# These are excluded from git tracking in this sandbox only — do not commit.",
		"# Source: packages/shared/src/filesystem.ts SANDBOX_SCAFFOLDING_PATHS",
		...SANDBOX_SCAFFOLDING_PATHS.map((p) => `/${p}`),
	];

	// Append to existing exclude rather than overwrite — the repo may have had one.
	const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, "utf-8") : "";
	const header = "# --- AO2 scaffolding exclusions ---";
	if (!existing.includes(header)) {
		const sep = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
		fs.writeFileSync(excludePath, existing + sep + lines.join("\n") + "\n");
	}
}

/**
 * Extract the branch from a Filesystem's resourceRef.
 * Returns "main" as the fallback.
 */
function getBranch(filesystem: Filesystem): string {
	if (filesystem.resourceRef.kind === "code") {
		return filesystem.resourceRef.branch;
	}
	return "main";
}

// ─── SandboxFilesystemMounter ────────────────────────────────────────────────

export class SandboxFilesystemMounter implements FilesystemMounter {
	constructor(private readonly deps: SandboxFilesystemMounterDeps) {}

	async mount(input: {
		filesystem: Filesystem;
		sandboxPath: string;
		auth: FilesystemAuth | null;
	}): Promise<MountResult> {
		const { filesystem, sandboxPath } = input;
		const { authResolver } = this.deps;

		try {
			// Only code filesystems with a repo URL are cloneable.
			if (filesystem.resourceRef.kind !== "code") {
				return {
					success: false,
					sandboxPath,
					error: `mount only supports kind:code; got ${filesystem.kind}`,
				};
			}

			const repoRef = filesystem.resourceRef;
			const url = repoToUrl(repoRef.repo);
			const branch = repoRef.branch;

			// Step 1: resolve auth token if the filesystem has a connectionId.
			// The seam resolveToken() is the single plaintext path — never in argv/URL.
			let tokenConfig: { key: string; value: string } | undefined;
			if (filesystem.connectionId) {
				const token = await authResolver.resolveToken(filesystem.connectionId);
				if (token) {
					const config = buildHostScopedHeaderConfig(url, token);
					if (config) {
						// Pass token via GIT_CONFIG_COUNT/KEY_n/VALUE_n for the clone step
						// so it's never in argv or URL during the network round-trip.
						tokenConfig = config;
					}
				}
			}

			// Step 2: clone into the sandbox (cwd = sandboxPath, target = ".").
			const runner = createGitRunner(sandboxPath, {
				timeouts: { pushMs: 60_000 }, // network clone needs longer than local ops
			});
			await runner.clone(url, branch, {
				depth: 1,
				tokenConfig,
			});

			// Step 3: write .git/info/exclude with SANDBOX_SCAFFOLDING_PATHS — §5b·2.
			// Written BEFORE provisioning scaffolding paths are created (Phase 6/8b).
			writeGitInfoExclude(sandboxPath);

			// Step 4: if the filesystem has auth, write the disposable host-scoped
			// local git config so the agent's own `git` commands authenticate ambiently.
			// Token lives in <sandbox>/.git/config (--local), never in argv. Removed by workspace.destroy.
			if (filesystem.connectionId && tokenConfig) {
				// Use runner.configSet (--local) — token never in argv or URL.
				await runner.configSet(tokenConfig.key, tokenConfig.value);
			}

			return { success: true, sandboxPath };
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err);
			return { success: false, sandboxPath, error };
		}
	}

	async captureBack(input: {
		filesystem: Filesystem;
		sandboxPath: string;
	}): Promise<CaptureResult & { capturePath?: string }> {
		const { filesystem, sandboxPath } = input;
		const writeback = filesystem.writeback;

		// none writeback — no-op.
		if (writeback === "none") {
			return { success: true, captured: false };
		}

		try {
			if (writeback === "git") {
				return await this._captureGit(filesystem, sandboxPath);
			}
			if (writeback === "file") {
				return await this._captureFile(filesystem, sandboxPath);
			}
			return { success: false, captured: false, error: `unknown writeback: ${writeback}` };
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err);
			// captureBack must never throw into teardown.
			return { success: false, captured: false, error };
		}
	}

	private async _captureGit(
		filesystem: Filesystem,
		sandboxPath: string,
	): Promise<CaptureResult & { capturePath?: string }> {
		const runner = createGitRunner(sandboxPath);
		const branch = getBranch(filesystem);

		// §5b·3: Compute tracked-collision set = git ls-files ∩ SANDBOX_SCAFFOLDING_PATHS.
		// Files the repo itself tracks that collide with a scaffolding path (self-hosting case:
		// HyperIdle tracks AGENTS.md, CLAUDE.md, .mcp.json, .claude/ — assembly overwrites them).
		// The derived pathspec subtracts them from the scoped add.
		let trackedFiles: readonly string[] = [];
		try {
			trackedFiles = await runner.lsFiles();
		} catch {
			// If lsFiles fails (empty repo, no HEAD), proceed with empty collision set.
		}
		const collisionSet = trackedFiles.filter(isScaffoldingPath);

		// §5b: Scoped stage — NOT `add -A`.
		// Stage: `git add -- .` (all untracked + modified) with explicit exclude pathspecs
		// for each scaffolding path and collision-set entry. This ensures:
		//   - Untracked scaffolding paths (e.g. .codex-home/) are excluded via .git/info/exclude.
		//   - Tracked scaffolding files that assembly overwrote (collision set) are excluded here.
		//
		// @lore AO2 §5b·3: We use `git add -- . :(exclude)<path>...` (pathspec magic, not --)
		// to stage everything except the scaffolding. This works even on older git versions.
		// An alternative is `git add --all -- <positive-pathspecs>` but that requires listing
		// every file explicitly (breaks on new files). The exclude-pathspec form is minimal.
		//
		// Check if there are any changes to stage first.
		const status = await runner.statusPorcelain();
		// Filter out status lines that are ONLY for scaffolding paths (performance).
		const nonScaffoldingChanges = status.filter((line) => {
			// Status line format: "XY filename" or "XY old -> new" for renames
			const filePart = line.slice(3); // skip XY + space
			const fileName = filePart.split(" -> ")[0] ?? filePart;
			return !isScaffoldingPath(fileName.trim());
		});

		if (nonScaffoldingChanges.length === 0 && collisionSet.length === 0) {
			// Nothing to capture (no agent edits).
			return { success: true, captured: false };
		}

		// Build the exclude pathspecs for the scoped add.
		// CRITICAL: :(exclude) pathspecs only work for TRACKED files (collision set).
		// UNTRACKED scaffolding files are already excluded by .git/info/exclude written at mount —
		// attempting to add them with :(exclude) after they're ignore-excluded causes `git add` to fail
		// with "pathspec ignored by .gitignore" error.
		//
		// So: we do `git add -- .` (stages all tracked changes + new untracked non-excluded files),
		// then use :(exclude) ONLY for the tracked collision set (tracked files that assembly overwrote).
		//
		// @lore AO2 §5b·3: .git/info/exclude handles untracked scaffolding (AGENTS.md, .codex-home/, etc.)
		// :(exclude) handles tracked scaffolding that got overwritten (self-hosting: AGENTS.md in HyperIdle repo).
		const excludeSpecs: string[] = [];
		for (const f of collisionSet) {
			// Only tracked files that are in the scaffolding collision set.
			// These need explicit :(exclude) because .git/info/exclude doesn't suppress tracked files.
			excludeSpecs.push(`:(exclude)${f}`);
		}

		// Stage: git add -- . [:(exclude)<collision-file>...]
		// `git add -- .` stages: all tracked modifications + new untracked files NOT in info/exclude.
		// The :(exclude) specs further exclude tracked-collision files from staging.
		await runner.add([".", ...excludeSpecs]);

		// Check if anything was actually staged (could be all scaffolding changes).
		const isClean = await runner.diffCached();
		if (isClean) {
			// All staged changes were scaffolding — nothing for the agent authored.
			return { success: true, captured: false };
		}

		// Commit with the bot's identity.
		// @lore AO2 §5: author = the bot (the session's agent). In v1 we use a generic
		// identity; session-provisioning Phase 5.5 could pass the agent name+email for v2.
		const commitMsg = `[AO2] Capture: session ${Date.now()}`;
		const commitSha = await runner.commit(commitMsg, "HyperIdle Agent", "agent@hyperidle.local");

		// Bundle to durable path outside the sandbox.
		// @lore AO2 §2: bundle refs/heads/<branch> — named ref, NOT HEAD, NOT range.
		// Self-describing: `git clone <bundle>` restores the branch + bot commit.
		const capturePath = this._bundlePath(filesystem);
		fs.mkdirSync(path.dirname(capturePath), { recursive: true });
		await runner.bundle(capturePath, `refs/heads/${branch}`);

		// Assert capturePath is under captureBasePath (no path traversal).
		if (!capturePath.startsWith(this.deps.captureBasePath)) {
			throw new Error(`capturePath ${capturePath} is not under captureBasePath ${this.deps.captureBasePath}`);
		}

		// Write filesystem_captures row if db + sessionId provided.
		if (this.deps.db && this.deps.sessionId) {
			await this.deps.db.insert(filesystemCaptures).values({
				id: randomUUID(),
				sessionId: this.deps.sessionId,
				filesystemId: filesystem.id,
				writeback: "git",
				capturePath,
				commitSha,
				createdAt: new Date().toISOString(),
			});
		}

		return { success: true, captured: true, capturePath };
	}

	private async _captureFile(
		filesystem: Filesystem,
		sandboxPath: string,
	): Promise<CaptureResult & { capturePath?: string }> {
		const capturePath = this._snapshotPath(filesystem);
		fs.mkdirSync(capturePath, { recursive: true });

		// Snapshot: copy changed folder tree, excluding scaffolding paths.
		// Simple recursive copy using fs — last-write-wins snapshot per concept.
		this._copyDirExcluding(sandboxPath, capturePath);

		// Assert capturePath is under captureBasePath (no path traversal).
		if (!capturePath.startsWith(this.deps.captureBasePath)) {
			throw new Error(`capturePath ${capturePath} is not under captureBasePath ${this.deps.captureBasePath}`);
		}

		if (this.deps.db && this.deps.sessionId) {
			await this.deps.db.insert(filesystemCaptures).values({
				id: randomUUID(),
				sessionId: this.deps.sessionId,
				filesystemId: filesystem.id,
				writeback: "file",
				capturePath,
				commitSha: null,
				createdAt: new Date().toISOString(),
			});
		}

		return { success: true, captured: true, capturePath };
	}

	private _copyDirExcluding(src: string, dest: string): void {
		const entries = fs.readdirSync(src, { withFileTypes: true });
		for (const entry of entries) {
			// Exclude scaffolding paths (both files and dirs).
			if (isScaffoldingPath(entry.name) || isScaffoldingPath(entry.name + "/")) continue;
			// Exclude .git itself — never copy the git metadata.
			if (entry.name === ".git") continue;

			const srcPath = path.join(src, entry.name);
			const destPath = path.join(dest, entry.name);
			if (entry.isDirectory()) {
				fs.mkdirSync(destPath, { recursive: true });
				this._copyDirExcluding(srcPath, destPath);
			} else if (entry.isFile()) {
				fs.copyFileSync(srcPath, destPath);
			}
		}
	}

	/** Durable bundle path: <captureBasePath>/<sessionId>/<filesystemId>.bundle */
	private _bundlePath(filesystem: Filesystem): string {
		const sessionId = this.deps.sessionId ?? "no-session";
		return path.join(this.deps.captureBasePath, sessionId, `${filesystem.id}.bundle`);
	}

	/** Durable snapshot path: <captureBasePath>/<sessionId>/<filesystemId>/ */
	private _snapshotPath(filesystem: Filesystem): string {
		const sessionId = this.deps.sessionId ?? "no-session";
		return path.join(this.deps.captureBasePath, sessionId, filesystem.id);
	}
}
