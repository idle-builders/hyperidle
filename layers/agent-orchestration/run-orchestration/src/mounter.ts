import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { MountingGitRunnerFactory } from "./mounter-ports.js";
import { SANDBOX_SCAFFOLDING_PATHS } from "./scaffolding-paths.js";

/** Outcome of a mount call. */
export interface MountResult {
	success: boolean;
	error?: string;
}

export function sanitizeBranch(name: string): string {
	return name.replace(/^-+/, "").replace(/[^a-zA-Z0-9/_.-]/g, "-");
}

function writeExclude(gitDir: string): void {
	const destination = path.join(gitDir, "info", "exclude");
	fs.mkdirSync(path.dirname(destination), { recursive: true });
	const marker = "# HyperIdle scaffolding exclusion";
	const existing = fs.existsSync(destination) ? fs.readFileSync(destination, "utf8") : "";
	if (!existing.includes(marker))
		fs.writeFileSync(
			destination,
			`${existing}\n${marker}\n${SANDBOX_SCAFFOLDING_PATHS.map((p) => `/${p}`).join("\n")}\n`,
		);
}

function resolveCommonGitDir(repoPath: string): string {
	const raw = execFileSync("git", ["-C", repoPath, "rev-parse", "--git-common-dir"], {
		encoding: "utf8",
	}).trim();
	return fs.realpathSync(path.resolve(repoPath, raw));
}

/**
 * Returns true when mountAt is already a live git worktree that belongs to
 * the given sourceRepo. Detects the `.git` file pointer and verifies the
 * gitdir falls under sourceRepo's own worktrees directory.
 */
function isExistingWorktree(mountAt: string, sourceRepo: string): boolean {
	const gitFile = path.join(mountAt, ".git");
	if (!fs.existsSync(gitFile) || fs.statSync(gitFile).isDirectory()) return false;
	const content = fs.readFileSync(gitFile, "utf8").trim();
	const match = content.match(/^gitdir:\s*(.+)$/);
	if (!match?.[1]) return false;
	try {
		const gitDir = fs.realpathSync(path.resolve(mountAt, match[1]));
		const common = resolveCommonGitDir(sourceRepo);
		return gitDir.startsWith(`${path.join(common, "worktrees")}${path.sep}`);
	} catch {
		return false;
	}
}

/**
 * Returns true when a local branch with the given name exists in the repo.
 * Used to decide whether to pass `-b` (create) or not (reattach) to `git worktree add`.
 */
function branchExistsInRepo(repo: string, branch: string): boolean {
	try {
		execFileSync("git", ["-C", repo, "show-ref", "--verify", `refs/heads/${branch}`], {
			encoding: "utf8",
			stdio: "pipe",
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * `isLocalRepoPath` accepts `~/`, `./`, `../` and
 * `file://` spellings (a repo ref is user-configured, not machine-generated),
 * but a harness's trust config wants a real filesystem path — `[projects."~/repo"]`
 * is not a path codex's own trust store resolves against `~`. Expand `~`,
 * resolve relative segments against cwd, strip a `file://` scheme, and
 * canonicalize through `realpathSync` so a symlinked spelling of the same repo
 * declares the same trusted path codex will actually see as its cwd. Falls
 * back to the resolved (non-realpath'd) form if the path does not exist yet —
 * by the time this runs the mount phase has already created it, but a defensive
 * fallback beats throwing out of a trust-declaration helper.
 */
export function normalizeLocalPath(raw: string): string {
	let resolved = raw;
	if (resolved.startsWith("file://")) {
		resolved = fileURLToPath(resolved);
	} else if (resolved === "~" || resolved.startsWith("~/")) {
		resolved = path.join(os.homedir(), resolved.slice(1));
	}
	resolved = path.resolve(resolved);
	try {
		return fs.realpathSync(resolved);
	} catch {
		return resolved;
	}
}

/**
 * Mount a local git repo into a working folder as a git worktree.
 *
 * - Case 1: mountAt is already a registered worktree — reuse it.
 * - Case 2: branch exists but its worktree was removed — re-attach without -b.
 * - Case 3: neither exists — create a new branch and worktree.
 *
 * @lore: mountGitWorktree — reuse-then-reattach-then-create; createBranch=false re-attaches detached branch without duplicating it
 */
export async function mountGitWorktree(
	repoPath: string,
	mountAt: string,
	workBranch: string,
	deps: { gitRunnerFactory: MountingGitRunnerFactory },
): Promise<MountResult> {
	const repo = normalizeLocalPath(repoPath);
	fs.mkdirSync(mountAt, { recursive: true });
	const branch = sanitizeBranch(workBranch);
	try {
		// Case 1: mountAt is already a registered worktree for this repo — reuse it.
		if (isExistingWorktree(mountAt, repo)) {
			return { success: true };
		}
		// Case 2: branch exists but its worktree was removed — re-attach without -b.
		// Case 3: neither exists — create a new branch and worktree.
		const branchExists = branchExistsInRepo(repo, branch);
		await deps.gitRunnerFactory(repo).worktreeAdd(mountAt, branch, {
			createBranch: !branchExists,
		});
		const pointer = fs
			.readFileSync(path.join(mountAt, ".git"), "utf8")
			.trim()
			.match(/^gitdir:\s*(.+)$/)?.[1];
		if (pointer) {
			const gitDir = fs.realpathSync(path.resolve(mountAt, pointer));
			const common = resolveCommonGitDir(repo);
			if (gitDir.startsWith(`${path.join(common, "worktrees")}${path.sep}`)) writeExclude(gitDir);
		}
		return { success: true };
	} catch (error) {
		return { success: false, error: String(error) };
	}
}

/**
 * Every session sandbox is a git repository — codex-cli
 * refuses to run outside a directory it recognizes as one ("Not inside a
 * trusted directory"), a SEPARATE precondition from the `trust_level =
 * "trusted"` declaration (cli-mcp-config.ts) — and a versioned scratch
 * directory is plausibly useful beyond codex (an agent can diff/revert its
 * own work). A bare `git init` with no commits is sufficient for codex's
 * check — verified against codex-cli 0.150.1; no initial commit is required.
 *
 * Called AFTER Phase 4.5 folder mounting: git folder mounts go into
 * `<sandbox>/<name>/` subdirectories, never the sandbox root, so the init
 * runs for every session — the no-folder, plain-folder, and git-folder cases.
 */
export function ensureSandboxGitRepo(sandboxPath: string): void {
	if (fs.existsSync(path.join(sandboxPath, ".git"))) return;
	execFileSync("git", ["init", "--quiet"], { cwd: sandboxPath });
}
