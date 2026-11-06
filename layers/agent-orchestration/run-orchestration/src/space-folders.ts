/**
 * Agent space folders — the top-level entries in an agent's space directory.
 *
 * Every top-level symlink or real directory under `<space>/` (except reserved
 * names, dot-entries that are not symlinks, and plain files) is one of the
 * agent's folders. A folder can point at a git repo (gets a worktree at
 * session time) or any other directory (symlinked into the working folder).
 * Only symlinks can be removed — real directories are never deleted by this
 * module.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { mountGitWorktree, normalizeLocalPath } from "./mounter.js";
import type { MountingGitRunnerFactory } from "./mounter-ports.js";

/**
 * Top-level names that are always reserved in an agent's space directory.
 * None of these names may be used for a folder link.
 */
export const RESERVED_SPACE_NAMES = new Set([
	"conversations",
	"tasks",
	"subscriptions",
	".claude",
	".codex",
	".codex-owner",
]);

/** Wire view of one folder in an agent's space. */
export interface SpaceFolderView {
	readonly name: string;
	/** The resolved real path the symlink points at. */
	readonly path: string;
	/** Whether the target has a `.git` directory. */
	readonly isGit: boolean;
	/** Whether the symlink target no longer exists (dangling link). */
	readonly isMissing: boolean;
}

export type SpaceFolderAddCode =
	| "RESERVED_NAME"
	| "INVALID_NAME"
	| "CONFLICT"
	| "SOURCE_NOT_FOUND"
	| "SOURCE_NOT_DIRECTORY"
	| "SPACE_NOT_SET";

export type SpaceFolderRemoveCode = "NOT_FOUND" | "NOT_A_SYMLINK";

export type SpaceFolderAddResult = { ok: true } | { ok: false; code: SpaceFolderAddCode };
export type SpaceFolderRemoveResult = { ok: true } | { ok: false; code: SpaceFolderRemoveCode };

/** Reject a folder name that would be unsafe or reserved. */
function validateName(name: string): SpaceFolderAddCode | null {
	if (!name || name === "." || name === "..") return "INVALID_NAME";
	if (name.includes("/") || name.includes("\\")) return "INVALID_NAME";
	if (RESERVED_SPACE_NAMES.has(name)) return "RESERVED_NAME";
	return null;
}

/**
 * List all folders in `spacePath`.
 *
 * Returns every top-level entry that is a symlink (whether or not the target
 * exists) or a real directory, whose name is not in RESERVED_SPACE_NAMES and
 * does not start with `.` (unless it is a symlink). Regular files are skipped.
 */
export function listSpaceFolders(spacePath: string): SpaceFolderView[] {
	if (!fs.existsSync(spacePath)) return [];
	const entries = fs.readdirSync(spacePath, { withFileTypes: true });
	const result: SpaceFolderView[] = [];
	for (const entry of entries) {
		if (RESERVED_SPACE_NAMES.has(entry.name)) continue;
		// Hidden non-symlink entries (e.g. .DS_Store) are not folders.
		if (entry.name.startsWith(".") && !entry.isSymbolicLink()) continue;
		// Regular files are not folders — only symlinks and directories.
		if (!(entry.isSymbolicLink() || entry.isDirectory())) continue;
		const linkPath = path.join(spacePath, entry.name);
		let resolvedPath: string;
		let isMissing = false;
		let isGit = false;
		if (entry.isSymbolicLink()) {
			try {
				resolvedPath = fs.realpathSync(linkPath);
				isGit = fs.existsSync(path.join(resolvedPath, ".git"));
			} catch {
				// Dangling symlink — target no longer exists.
				resolvedPath = fs.readlinkSync(linkPath);
				// Expand ~ so the path is at least human-readable.
				if (resolvedPath.startsWith("~/")) {
					resolvedPath = path.join(os.homedir(), resolvedPath.slice(1));
				}
				isMissing = true;
			}
		} else {
			// Real directory — always present (readdirSync just saw it).
			resolvedPath = path.join(spacePath, entry.name);
			isGit = fs.existsSync(path.join(resolvedPath, ".git"));
		}
		result.push({ name: entry.name, path: resolvedPath, isGit, isMissing });
	}
	return result;
}

/**
 * Add a folder symlink to `spacePath`.
 *
 * Creates `<spacePath>/<name>` → `realFolderPath` (after expanding `~` and
 * resolving to an absolute path). If `name` is omitted, the basename of
 * `folderPath` is used.
 *
 * Refuses with a typed code for every expected failure; throws only on
 * truly unexpected I/O errors.
 */
export function addSpaceFolder(
	spacePath: string,
	folderPath: string,
	name?: string,
): SpaceFolderAddResult {
	if (!spacePath) return { ok: false, code: "SPACE_NOT_SET" };
	const realTarget = normalizeLocalPath(folderPath);
	const entryName = name ?? path.basename(realTarget);
	const nameError = validateName(entryName);
	if (nameError) return { ok: false, code: nameError };
	if (!fs.existsSync(realTarget)) return { ok: false, code: "SOURCE_NOT_FOUND" };
	try {
		if (!fs.statSync(realTarget).isDirectory()) return { ok: false, code: "SOURCE_NOT_DIRECTORY" };
	} catch {
		return { ok: false, code: "SOURCE_NOT_FOUND" };
	}
	const linkPath = path.join(spacePath, entryName);
	if (fs.existsSync(linkPath) || fs.existsSync(`${linkPath}/`) || isSymlinkAt(linkPath)) {
		return { ok: false, code: "CONFLICT" };
	}
	fs.symlinkSync(realTarget, linkPath);
	return { ok: true };
}

function isSymlinkAt(p: string): boolean {
	try {
		return fs.lstatSync(p).isSymbolicLink();
	} catch {
		return false;
	}
}

/**
 * Remove a folder symlink from `spacePath`.
 *
 * Only removes symlinks — refuses with NOT_A_SYMLINK when the entry exists
 * but is a real directory (nothing real is ever deleted). An invalid or
 * reserved name refuses with NOT_FOUND (path traversal is blocked here).
 */
export function removeSpaceFolder(spacePath: string, name: string): SpaceFolderRemoveResult {
	if (validateName(name) !== null) return { ok: false, code: "NOT_FOUND" };
	const linkPath = path.join(spacePath, name);
	let stat: fs.Stats;
	try {
		stat = fs.lstatSync(linkPath);
	} catch {
		return { ok: false, code: "NOT_FOUND" };
	}
	if (!stat.isSymbolicLink()) return { ok: false, code: "NOT_A_SYMLINK" };
	fs.unlinkSync(linkPath);
	return { ok: true };
}

/** Dependencies the mount step needs. */
export interface SpaceFolderMountDeps {
	readonly gitRunnerFactory: MountingGitRunnerFactory;
	/** The work branch name for this session's git worktrees. */
	readonly workBranch: string;
}

/**
 * Mount all folder symlinks in `spacePath` into `workingFolder`.
 *
 * - Git repo targets → `git worktree add` at `<workingFolder>/<name>/`
 *   (reusing / re-attaching the existing worktree when it already exists).
 * - Plain directory targets → symlink `<workingFolder>/<name>` → target.
 * - Dangling symlinks → skipped with a log line (never fatal).
 *
 * Returns the real paths of all successfully-mounted targets, for use
 * as `trustedPaths` in the harness MCP config.
 *
 * @lore: mountSpaceFolders — git repos → worktree at <workingFolder>/<name>/, plain → symlink; dangling links skip so a missing repo never aborts a session
 */
export async function mountSpaceFolders(
	spacePath: string,
	workingFolder: string,
	deps: SpaceFolderMountDeps,
): Promise<{ trustedPaths: string[] }> {
	const folders = listSpaceFolders(spacePath);
	const trustedPaths: string[] = [];

	for (const folder of folders) {
		if (folder.isMissing) {
			// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
			console.warn(
				`[space-folders] skipping dangling link '${folder.name}' (target missing: ${folder.path})`,
			);
			continue;
		}

		const mountAt = path.join(workingFolder, folder.name);

		if (folder.isGit) {
			try {
				const result = await mountGitWorktree(folder.path, mountAt, deps.workBranch, {
					gitRunnerFactory: deps.gitRunnerFactory,
				});
				if (result.success) {
					trustedPaths.push(folder.path);
				} else {
					// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
					console.warn(
						`[space-folders] git worktree mount failed for '${folder.name}': ${result.error ?? "unknown"}`,
					);
				}
			} catch (err) {
				// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
				console.warn(
					`[space-folders] git worktree mount threw for '${folder.name}': ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		} else {
			// Plain directory: create a symlink in the working folder.
			try {
				if (!fs.existsSync(mountAt)) {
					fs.symlinkSync(folder.path, mountAt);
				}
				trustedPaths.push(folder.path);
			} catch (err) {
				// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
				console.warn(
					`[space-folders] symlink creation failed for '${folder.name}': ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	}

	return { trustedPaths };
}
