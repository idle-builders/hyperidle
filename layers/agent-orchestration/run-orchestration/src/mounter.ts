/**
 * The filesystem mount engine — `RegistryFilesystemMounter` and its four
 * adapters.
 *
 * @lore AU26 F1 (§D-I): relocated VERBATIM from
 * `layers/core-api/filesystems/src/mounter-registry.ts`. The relocation is a
 * package move, not a rewrite: the four adapters, `SANDBOX_SCAFFOLDING_PATHS`
 * and the capture-root containment check are unchanged, and their tests moved
 * with them.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { MountingGitRunnerFactory } from "./mounter-ports.js";

/**
 * Structural local type — mirrors @hyperidle/filesystems' Filesystem shape.
 * run-orchestration is a sibling service and may not import from filesystems
 * directly (Mechanism C). The two types are structurally identical and the
 * Application composes them.
 *
 * @lore AU44 b2: domain-model's Filesystem type dissolved here with its
 * auxiliary types (ResourceRef etc.) inlined.
 */
export interface Filesystem {
	id: string;
	teamId: string;
	source: string;
	kind: string;
	connectionId: string | null;
	resourceRef: { kind: "code"; repo: string; branch: string } | { kind: "doc_set"; folder: string };
	writeback: "git" | "file" | "none";
	state: string;
	createdAt: string;
}

/**
 * Outcome of a mount call.
 * @lore AU44 b2: dissolved from @hyperidle/domain-model. sandboxPath removed
 * because it is write-only — the caller already holds it before calling mount;
 * the result carries only success/failure information.
 */
export interface MountResult {
	success: boolean;
	error?: string;
}

import { SANDBOX_SCAFFOLDING_PATHS } from "./scaffolding-paths.js";

const CLOUD_SOURCES = new Set(["gdrive", "dropbox", "s3"]);

export interface AdapterDeps {
	readonly gitRunnerFactory: MountingGitRunnerFactory;
}

interface MountContext {
	readonly filesystem: Filesystem;
	readonly sandboxPath: string;
}

interface MountAdapter {
	mount(ctx: MountContext): Promise<MountResult>;
}

class CloudNotBuiltAdapter implements MountAdapter {
	constructor(private readonly source: string) {}
	mount(_ctx: MountContext): Promise<MountResult> {
		return Promise.resolve({
			success: false,
			error: `mount adapter not built for source '${this.source}' (built in its connector WP)`,
		});
	}
}

class LocalFolderAdapter implements MountAdapter {
	mount(ctx: MountContext): Promise<MountResult> {
		const ref = ctx.filesystem.resourceRef;
		if (ref.kind !== "doc_set")
			return Promise.resolve({
				success: false,
				error: "Expected doc_set resourceRef",
			});
		try {
			const link = path.join(ctx.sandboxPath, path.basename(ref.folder));
			if (!fs.existsSync(ref.folder)) throw new Error(`folder does not exist: '${ref.folder}'`);
			if (fs.existsSync(link)) {
				if (
					!fs.lstatSync(link).isSymbolicLink() ||
					fs.realpathSync(link) !== fs.realpathSync(ref.folder)
				)
					throw new Error(`mount path already exists: '${link}'`);
			} else fs.symlinkSync(ref.folder, link);
			return Promise.resolve({ success: true });
		} catch (error) {
			return Promise.resolve({
				success: false,
				error: String(error),
			});
		}
	}
}

function writeExclude(gitDir: string): void {
	const destination = path.join(gitDir, "info", "exclude");
	fs.mkdirSync(path.dirname(destination), { recursive: true });
	const marker = "# AU20 scaffolding exclusion";
	const existing = fs.existsSync(destination) ? fs.readFileSync(destination, "utf8") : "";
	if (!existing.includes(marker))
		fs.writeFileSync(
			destination,
			`${existing}\n${marker}\n${SANDBOX_SCAFFOLDING_PATHS.map((p) => `/${p}`).join("\n")}\n`,
		);
}

class GitCloneAdapter implements MountAdapter {
	constructor(private readonly deps: AdapterDeps) {}
	async mount(ctx: MountContext): Promise<MountResult> {
		const ref = ctx.filesystem.resourceRef;
		if (ref.kind !== "code") return { success: false, error: "Expected code resourceRef" };
		try {
			await this.deps.gitRunnerFactory(ctx.sandboxPath).clone(ref.repo, ref.branch, { depth: 1 });
			writeExclude(path.join(ctx.sandboxPath, ".git"));
			return { success: true };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	}
}

class GitWorktreeAdapter implements MountAdapter {
	constructor(private readonly deps: AdapterDeps) {}
	async mount(ctx: MountContext): Promise<MountResult> {
		const ref = ctx.filesystem.resourceRef;
		if (ref.kind !== "code") return { success: false, error: "Expected code resourceRef" };
		try {
			await this.deps
				.gitRunnerFactory(ref.repo)
				.worktreeAdd(ctx.sandboxPath, sanitizeBranch(`agent/${path.basename(ctx.sandboxPath)}`), {
					createBranch: true,
				});
			const pointer = fs
				.readFileSync(path.join(ctx.sandboxPath, ".git"), "utf8")
				.trim()
				.match(/^gitdir:\s*(.+)$/)?.[1];
			if (pointer) {
				const gitDir = fs.realpathSync(path.resolve(ctx.sandboxPath, pointer));
				const common = resolveCommonGitDir(ref.repo);
				if (gitDir.startsWith(`${path.join(common, "worktrees")}${path.sep}`)) writeExclude(gitDir);
			}
			return { success: true };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	}
}

function sanitizeBranch(name: string): string {
	return name.replace(/^-+/, "").replace(/[^a-zA-Z0-9/_.-]/g, "-");
}

function resolveCommonGitDir(repoPath: string): string {
	const raw = execFileSync("git", ["-C", repoPath, "rev-parse", "--git-common-dir"], {
		encoding: "utf8",
	}).trim();
	return fs.realpathSync(path.resolve(repoPath, raw));
}

function isLocalRepoPath(
	ref: { kind: "code"; repo: string } | { kind: string; folder?: string },
): boolean {
	if (ref.kind !== "code") return false;
	const r = (ref as { kind: "code"; repo: string }).repo;
	return (
		r.startsWith("/") ||
		r.startsWith("./") ||
		r.startsWith("../") ||
		r.startsWith("~/") ||
		r.startsWith("file://")
	);
}

/**
 * The real local path a mounted filesystem stands on, if any.
 *
 * `LocalFolderAdapter` symlinks `resourceRef.folder` (an absolute path
 * elsewhere on disk) INTO the sandbox rather than copying it, and
 * `GitWorktreeAdapter` backs its worktree with a local `resourceRef.repo` —
 * both are real filesystem paths outside the sandbox root that a harness with
 * a trust precondition (codex) needs told about, not just the sandbox itself.
 * A cloned repo (`GitCloneAdapter`, `connectionId != null`) has no such path —
 * it is written directly into the sandbox, already covered by the sandbox's
 * own trust declaration. Returns `undefined` when the filesystem has no local
 * path distinct from the sandbox (a remote clone, or a cloud source not yet
 * built).
 *
 * @lore Both branches run through `normalizeLocalPath` — `doc_set.folder` is
 * as user-configured as `code.repo` (a `./docs` or `~/docs` spelling emits an
 * inert `[projects."./docs"]` codex never matches against its resolved cwd
 * if left unnormalized). Do not special-case one branch to skip it.
 */
export function localTrustedPath(filesystem: Filesystem): string | undefined {
	const ref = filesystem.resourceRef;
	if (ref.kind === "doc_set") return normalizeLocalPath(ref.folder);
	if (ref.kind === "code" && filesystem.connectionId == null && isLocalRepoPath(ref)) {
		return normalizeLocalPath(ref.repo);
	}
	return undefined;
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
function normalizeLocalPath(raw: string): string {
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

class MalformedFilesystemError extends Error {
	readonly filesystem: Filesystem;

	constructor(filesystem: Filesystem, reason: string) {
		super(`MalformedFilesystem [${filesystem.id}]: ${reason}`);
		this.name = "MalformedFilesystemError";
		this.filesystem = filesystem;
	}
}

function selectMountAdapter(fs: Filesystem, deps: AdapterDeps): MountAdapter {
	if (fs.kind === "code") {
		if (fs.connectionId != null) {
			return new GitCloneAdapter(deps);
		}
		if (isLocalRepoPath(fs.resourceRef)) {
			return new GitWorktreeAdapter(deps);
		}
		throw new MalformedFilesystemError(
			fs,
			`code fs with no connectionId must have a local-path repo for the worktree adapter (got: '${(fs.resourceRef as { repo?: string }).repo ?? "?"}')`,
		);
	}

	if (fs.kind === "doc_set") {
		if (CLOUD_SOURCES.has(fs.source)) {
			return new CloudNotBuiltAdapter(fs.source);
		}
		return new LocalFolderAdapter();
	}

	return new CloudNotBuiltAdapter(`${fs.kind}:${fs.source}`);
}

export class RegistryFilesystemMounter {
	constructor(private readonly deps: AdapterDeps) {}

	// biome-ignore lint/suspicious/useAwait: selectMountAdapter throws synchronously on a malformed filesystem; async is what turns that throw into a rejected promise for callers.
	async mount(input: { filesystem: Filesystem; sandboxPath: string }): Promise<MountResult> {
		const adapter = selectMountAdapter(input.filesystem, this.deps);
		const ctx: MountContext = {
			filesystem: input.filesystem,
			sandboxPath: input.sandboxPath,
		};
		return adapter.mount(ctx);
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
 * Called AFTER Phase 4.5 filesystem mounting, never before: `GitCloneAdapter`
 * and `GitWorktreeAdapter` both write straight into `sandboxPath`, and both
 * `git clone` and `git worktree add` refuse a target directory that already
 * contains a `.git` (verified empirically — "already exists" / "not an empty
 * directory"). Mounting a code filesystem already makes the sandbox a git
 * repo as a side effect, so this only inits when `.git` is still absent —
 * the no-filesystem and doc_set-only cases, which is exactly where the
 * original bug lived.
 */
export function ensureSandboxGitRepo(sandboxPath: string): void {
	if (fs.existsSync(path.join(sandboxPath, ".git"))) return;
	execFileSync("git", ["init", "--quiet"], { cwd: sandboxPath });
}
