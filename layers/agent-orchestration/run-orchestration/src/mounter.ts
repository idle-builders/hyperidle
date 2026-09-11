/**
 * The filesystem mount engine — `RegistryFilesystemMounter`, its adapters,
 * and the sandbox-root git bookkeeping around them.
 *
 * @lore AU26 F1 (§D-I): relocated VERBATIM from
 * `layers/core-api/filesystems/src/mounter-registry.ts`. The relocation is a
 * package move, not a rewrite: `SANDBOX_SCAFFOLDING_PATHS` and the
 * capture-root containment check moved with it (history only — see BA5 §5
 * below for the current shape).
 *
 * @lore BA5 §5: the two prior adapters (`GitCloneAdapter`, one clone per
 * session; `GitWorktreeAdapter`, a worktree off the person's own local repo)
 * are replaced by ONE `GitRepositoryAdapter` that handles both a local repo
 * and a remote URL uniformly: a remote gets ONE kept copy (cloned once,
 * fetched after), a local repo's kept copy IS the person's own repository,
 * and every session gets its own worktree off either. `captureBack` (a
 * declared no-op since AU43) is gone with them — a git filesystem's work
 * leaves through the agent's own `git push`, never a HyperIdle-side capture.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { gitCredentialEnv } from "./git-credential-env.js";
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
	state: string;
	createdAt: string;
}

const CLOUD_SOURCES = new Set(["gdrive", "dropbox", "s3"]);

export interface AdapterDeps {
	readonly gitRunnerFactory: MountingGitRunnerFactory;
	/** Where remote git filesystems keep their one clone (§5.2). Absent → a remote git filesystem cannot mount. */
	readonly keptCopiesRoot?: string;
}

/** BA5 §2.5 — what the mount engine needs to place ONE filesystem for ONE session. */
export interface MountInput {
	readonly filesystem: Filesystem;
	readonly workspacePath: string;
	readonly sessionId: string;
	/** The subfolder name this filesystem gets inside the workspace (§5.3) — computed by the caller so two filesystems never collide. */
	readonly folderName: string;
	/** The PAT resolved as the connection's owner, or null. Never falls back to another identity. */
	readonly credential: string | null;
}

/** BA5 §2.5 — a placed filesystem: what the agent sees, and what codex must trust. */
export interface MountedFilesystem {
	readonly filesystem: Filesystem;
	/** absolute: `<workspace>/<folderName>` */
	readonly folder: string;
	/** the kept copy (git) or the real folder (folder) — feeds codex's trust declaration */
	readonly trustedPath: string;
	readonly git?: {
		readonly keptCopy: string;
		readonly branch: string;
		readonly base: string;
		readonly remote: boolean;
	};
	/** Env the agent's OWN process needs (e.g. `GH_TOKEN`) to push this filesystem itself. Never persisted. */
	readonly agentEnv: Readonly<Record<string, string>>;
	/** True when an existing workspace directory was recognised rather than freshly placed (a resume). */
	readonly adopted: boolean;
}

export type MountResult = { ok: true; mounted: MountedFilesystem } | { ok: false; reason: string };

interface MountAdapter {
	mount(input: MountInput): Promise<MountResult>;
	unmount(mounted: MountedFilesystem): Promise<void>;
}

class CloudNotBuiltAdapter implements MountAdapter {
	constructor(private readonly source: string) {}
	mount(): Promise<MountResult> {
		return Promise.resolve({
			ok: false,
			reason: `mount adapter not built for source '${this.source}' (built in its connector WP)`,
		});
	}
	unmount(): Promise<void> {
		return Promise.resolve();
	}
}

class LocalFolderAdapter implements MountAdapter {
	mount(input: MountInput): Promise<MountResult> {
		const ref = input.filesystem.resourceRef;
		if (ref.kind !== "doc_set") return Promise.resolve({ ok: false, reason: "Expected doc_set resourceRef" });
		try {
			const real = normalizeLocalPath(ref.folder);
			if (!fs.existsSync(real)) throw new Error(`folder does not exist: '${ref.folder}'`);
			const link = path.join(input.workspacePath, input.folderName);
			let adopted = false;
			if (fs.existsSync(link)) {
				if (fs.lstatSync(link).isSymbolicLink() && fs.realpathSync(link) === fs.realpathSync(real)) {
					adopted = true;
				} else {
					throw new Error(`folder '${input.folderName}' already exists in the workspace`);
				}
			} else {
				fs.symlinkSync(real, link);
			}
			return Promise.resolve({
				ok: true,
				mounted: {
					filesystem: input.filesystem,
					folder: link,
					trustedPath: real,
					agentEnv: {},
					adopted,
				},
			});
		} catch (error) {
			return Promise.resolve({ ok: false, reason: error instanceof Error ? error.message : String(error) });
		}
	}
	/** @lore BA5 §5.5: nothing to do — the symlink goes with the workspace itself. */
	unmount(): Promise<void> {
		return Promise.resolve();
	}
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

/** `git -C <repoPath> rev-parse --git-common-dir`, realpath'd. Spawns git directly — a fully local, no-network read, same precedent as `ensureSandboxGitRepo`. */
function resolveCommonGitDir(repoPath: string): string {
	const raw = execFileSync("git", ["-C", repoPath, "rev-parse", "--git-common-dir"], {
		encoding: "utf8",
	}).trim();
	return fs.realpathSync(path.resolve(repoPath, raw));
}

/**
 * BA5 §5.4 — recognise an already-placed worktree on a resumed workspace:
 * `<worktreePath>/.git` is a FILE whose `gitdir:` pointer resolves under
 * `<keptCopy>/.git/worktrees/`, and that worktree directory still exists.
 * Returns the worktree's current branch when recognised, `undefined` otherwise.
 */
function recognizeAdoptedWorktree(worktreePath: string, keptCopy: string): string | undefined {
	const gitFile = path.join(worktreePath, ".git");
	if (!fs.existsSync(gitFile) || fs.lstatSync(gitFile).isDirectory()) return undefined;
	const pointer = fs.readFileSync(gitFile, "utf8").trim().match(/^gitdir:\s*(.+)$/)?.[1];
	if (!pointer) return undefined;
	let gitDir: string;
	let commonDir: string;
	try {
		gitDir = fs.realpathSync(path.resolve(worktreePath, pointer));
		commonDir = resolveCommonGitDir(keptCopy);
	} catch {
		return undefined;
	}
	const worktreesRoot = `${path.join(commonDir, "worktrees")}${path.sep}`;
	if (!gitDir.startsWith(worktreesRoot) || !fs.existsSync(gitDir)) return undefined;
	try {
		return execFileSync("git", ["-C", worktreePath, "rev-parse", "--abbrev-ref", "HEAD"], {
			encoding: "utf8",
		}).trim();
	} catch {
		return undefined;
	}
}

class GitRepositoryAdapter implements MountAdapter {
	constructor(private readonly deps: AdapterDeps) {}

	async mount(input: MountInput): Promise<MountResult> {
		const ref = input.filesystem.resourceRef;
		if (ref.kind !== "code") return { ok: false, reason: "Expected code resourceRef" };
		const local = isLocalRepoPath(ref);
		const worktreePath = path.join(input.workspacePath, input.folderName);
		const keptCopy = local
			? normalizeLocalPath(ref.repo)
			: this.deps.keptCopiesRoot
				? path.join(this.deps.keptCopiesRoot, input.filesystem.id)
				: undefined;

		// BA5 §5.4: recognise an already-placed worktree on a resumed workspace.
		if (fs.existsSync(worktreePath)) {
			const branch = keptCopy ? recognizeAdoptedWorktree(worktreePath, keptCopy) : undefined;
			if (branch) {
				return {
					ok: true,
					mounted: {
						filesystem: input.filesystem,
						folder: worktreePath,
						trustedPath: keptCopy as string,
						git: { keptCopy: keptCopy as string, branch, base: ref.branch, remote: !local },
						agentEnv: local ? {} : gitCredentialEnv(ref.repo, input.credential),
						adopted: true,
					},
				};
			}
			return { ok: false, reason: `folder '${input.folderName}' already exists in the workspace` };
		}

		try {
			const env = local ? {} : gitCredentialEnv(ref.repo, input.credential);
			let base: string;
			let resolvedKeptCopy: string;
			let remote: boolean;
			if (local) {
				resolvedKeptCopy = keptCopy as string;
				remote = false;
				const ok = await this.deps.gitRunnerFactory(resolvedKeptCopy).verifyCommit(ref.branch);
				if (!ok) return { ok: false, reason: `branch '${ref.branch}' not found in '${ref.repo}'` };
				base = ref.branch;
			} else {
				remote = true;
				if (!this.deps.keptCopiesRoot) {
					return { ok: false, reason: "this server has no folder to keep repository copies in" };
				}
				resolvedKeptCopy = keptCopy as string;
				if (!fs.existsSync(resolvedKeptCopy)) {
					fs.mkdirSync(this.deps.keptCopiesRoot, { recursive: true });
					await this.deps.gitRunnerFactory(this.deps.keptCopiesRoot).clone(ref.repo, resolvedKeptCopy, { env });
				} else {
					await this.deps.gitRunnerFactory(resolvedKeptCopy).fetch({ env });
				}
				base = `origin/${ref.branch}`;
			}

			const runner = this.deps.gitRunnerFactory(resolvedKeptCopy);
			await runner.worktreePrune();
			const branch = `hyperidle/${input.sessionId}`;
			await runner.worktreeAdd(worktreePath, branch, base);

			return {
				ok: true,
				mounted: {
					filesystem: input.filesystem,
					folder: worktreePath,
					trustedPath: resolvedKeptCopy,
					git: { keptCopy: resolvedKeptCopy, branch, base, remote },
					agentEnv: env,
					adopted: false,
				},
			};
		} catch (error) {
			return { ok: false, reason: error instanceof Error ? error.message : String(error) };
		}
	}

	async unmount(mounted: MountedFilesystem): Promise<void> {
		if (!mounted.git) return;
		await this.deps.gitRunnerFactory(mounted.git.keptCopy).worktreeRemove(mounted.folder, { force: true });
	}
}

function selectMountAdapter(fs: Filesystem, deps: AdapterDeps): MountAdapter {
	if (fs.kind === "code") return new GitRepositoryAdapter(deps);
	if (fs.kind === "doc_set") {
		if (CLOUD_SOURCES.has(fs.source)) return new CloudNotBuiltAdapter(fs.source);
		return new LocalFolderAdapter();
	}
	return new CloudNotBuiltAdapter(`${fs.kind}:${fs.source}`);
}

export class RegistryFilesystemMounter {
	constructor(private readonly deps: AdapterDeps) {}

	async mount(input: MountInput): Promise<MountResult> {
		return selectMountAdapter(input.filesystem, this.deps).mount(input);
	}

	async unmount(mounted: MountedFilesystem): Promise<void> {
		return selectMountAdapter(mounted.filesystem, this.deps).unmount(mounted);
	}
}

/**
 * BA5 §5.2/§12 — remove a remote filesystem's kept copy (its ONE clone,
 * outside every session's own worktree). Never for a local repo — the kept
 * copy there IS the person's own repository, and HyperIdle must never delete
 * it. Absent `keptCopiesRoot` is a no-op: nothing was ever cloned.
 */
export async function forgetKeptCopy(
	keptCopiesRoot: string | undefined,
	filesystem: Filesystem,
): Promise<void> {
	const ref = filesystem.resourceRef;
	if (ref.kind !== "code" || isLocalRepoPath(ref) || !keptCopiesRoot) return;
	await fs.promises.rm(path.join(keptCopiesRoot, filesystem.id), { recursive: true, force: true });
}

/**
 * BA5 §5.4 — the workspace root repository never shows a mounted filesystem's
 * folder (a worktree or a symlink) as untracked. Idempotent: appends only the
 * folder names not already present. `workspacePath` must already be a git
 * repository (`ensureSandboxGitRepo`, called first).
 */
export function excludeMountedFolders(workspacePath: string, folderNames: readonly string[]): void {
	if (folderNames.length === 0) return;
	const destination = path.join(workspacePath, ".git", "info", "exclude");
	fs.mkdirSync(path.dirname(destination), { recursive: true });
	const existing = fs.existsSync(destination) ? fs.readFileSync(destination, "utf8") : "";
	const existingLines = new Set(existing.split("\n"));
	const toAdd = folderNames.map((name) => `/${name}`).filter((line) => !existingLines.has(line));
	if (toAdd.length === 0) return;
	fs.appendFileSync(destination, `${toAdd.join("\n")}\n`);
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
 * @lore BA5 §5.4: the "must run after mount" ordering this comment used to
 * insist on no longer holds — a mounted filesystem now lives in its own
 * `<folderName>` subfolder, never directly at `workspacePath` (that was true
 * of the old `GitCloneAdapter`, which cloned straight into the sandbox root
 * and would collide with an `.git` this call created first). This still runs
 * after mounting in `provisioner.ts` — harmless ordering, not a requirement —
 * because `excludeMountedFolders` needs the `.git` this call creates.
 */
export function ensureSandboxGitRepo(sandboxPath: string): void {
	if (fs.existsSync(path.join(sandboxPath, ".git"))) return;
	execFileSync("git", ["init", "--quiet"], { cwd: sandboxPath });
}
