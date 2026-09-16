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
 *
 * @lore BA5 (no-teardown, 2026-09-16): nothing is unmounted at session end
 * any more. A git worktree moved out of the session directory entirely —
 * its home is now `<keptCopiesRoot>/worktrees/<taskKey>/<folderName>`,
 * symlinked into the workspace — so it survives every session of the same
 * task and is only ever removed by `releaseForTask` once the task is done.
 * `MountAdapter.unmount` and `recognizeAdoptedWorktree`'s gitdir-pointer
 * forensics are both gone: recognition is now a plain "does the task's
 * worktree directory already exist" check. `adopted` is renamed `reused` —
 * it now means "this place already held earlier work of this task", which
 * the agent is told about (`filesystem-instructions.ts`).
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { type HyperIdleDb, sessions } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import { driveReason } from "./drive-reason.js";
import { gitCredentialEnv } from "./git-credential-env.js";
import type { MountingGitRunnerFactory, RcloneRunner } from "./mounter-ports.js";

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
	resourceRef:
		| { kind: "code"; repo: string; branch: string }
		| { kind: "doc_set"; folder: string }
		| { kind: "drive"; remote: string; path: string };
	state: string;
	createdAt: string;
}

export interface AdapterDeps {
	readonly gitRunnerFactory: MountingGitRunnerFactory;
	/** Where remote git filesystems and Drive filesystems keep their one kept copy. Absent → neither can mount. */
	readonly keptCopiesRoot?: string;
	/** Absent → a Drive filesystem cannot be placed and says so. */
	readonly rclone?: RcloneRunner;
}

/** What the mount engine needs to place ONE filesystem for ONE session. */
export interface MountInput {
	readonly filesystem: Filesystem;
	readonly workspacePath: string;
	readonly sessionId: string;
	/**
	 * The session's task, when it has one. Keys a git worktree's long-lived
	 * home (`task-<taskId>`); a taskless session falls back to
	 * `session-<sessionId>` — its worktree is its own and nothing removes it
	 * automatically.
	 */
	readonly taskId: string | null;
	/** The subfolder name this filesystem gets inside the workspace — computed by the caller so two filesystems never collide. */
	readonly folderName: string;
	/** The PAT resolved as the connection's owner, or null. Never falls back to another identity. */
	readonly credential: string | null;
}

/** A placed filesystem: what the agent sees, and what codex must trust. */
export interface MountedFilesystem {
	readonly filesystem: Filesystem;
	/** absolute: `<workspace>/<folderName>` */
	readonly folder: string;
	/**
	 * Every real path codex must trust: the kept copy AND the worktree
	 * itself for a git mount (two real paths now that the worktree lives
	 * outside the sandbox); one element (the real folder) for a folder or
	 * Drive mount.
	 */
	readonly trustedPaths: readonly string[];
	readonly git?: {
		readonly keptCopy: string;
		readonly branch: string;
		readonly base: string;
		readonly remote: boolean;
	};
	/** Env the agent's OWN process needs (e.g. `GH_TOKEN`) to push this filesystem itself. Never persisted. */
	readonly agentEnv: Readonly<Record<string, string>>;
	/**
	 * True when this place already held earlier work — a folder/Drive kept
	 * copy that already existed, or a task's git worktree that a previous
	 * session (or an earlier session of the same task) already cut. Told to
	 * the agent (`filesystem-instructions.ts`) so it checks before it starts.
	 */
	readonly reused: boolean;
}

export type MountResult = { ok: true; mounted: MountedFilesystem } | { ok: false; reason: string };

interface MountAdapter {
	mount(input: MountInput): Promise<MountResult>;
}

/**
 * The fallback for a `resourceRef` whose `kind` is none of the three this
 * engine knows how to place — a corrupt row, or one written by a version of
 * HyperIdle newer than this one. Selection now runs on `resourceRef.kind`
 * (§2.1), so this is never reached by a valid `code`/`doc_set`/`drive` row.
 */
class UnsupportedFilesystemAdapter implements MountAdapter {
	constructor(private readonly resourceRefKind: unknown) {}
	mount(): Promise<MountResult> {
		return Promise.resolve({
			ok: false,
			reason: `cannot place a filesystem whose resourceRef.kind is '${String(this.resourceRefKind)}' — expected code, doc_set, or drive`,
		});
	}
}

class LocalFolderAdapter implements MountAdapter {
	mount(input: MountInput): Promise<MountResult> {
		const ref = input.filesystem.resourceRef;
		if (ref.kind !== "doc_set")
			return Promise.resolve({ ok: false, reason: "Expected doc_set resourceRef" });
		try {
			const real = normalizeLocalPath(ref.folder);
			if (!fs.existsSync(real)) throw new Error(`folder does not exist: '${ref.folder}'`);
			const link = path.join(input.workspacePath, input.folderName);
			let reused = false;
			if (fs.existsSync(link)) {
				if (
					fs.lstatSync(link).isSymbolicLink() &&
					fs.realpathSync(link) === fs.realpathSync(real)
				) {
					reused = true;
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
					trustedPaths: [real],
					agentEnv: {},
					reused,
				},
			});
		} catch (error) {
			return Promise.resolve({
				ok: false,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

/**
 * @lore BA5 §7.2 (L4): exported — `checkFilesystem` (`filesystem-check.ts`,
 * same package) needs the SAME local-vs-remote decision `mount` uses, so
 * Check and placement never disagree about what a `code` filesystem's `repo`
 * string means.
 */
export function isLocalRepoPath(
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
 * A git worktree's long-lived home, keyed by the session's task (or, absent
 * one, by the session itself — a taskless session's worktree is its own and
 * nothing removes it automatically).
 */
function taskKeyFor(input: Pick<MountInput, "taskId" | "sessionId">): string {
	return input.taskId ? `task-${input.taskId}` : `session-${input.sessionId}`;
}

class GitRepositoryAdapter implements MountAdapter {
	constructor(private readonly deps: AdapterDeps) {}

	async mount(input: MountInput): Promise<MountResult> {
		const ref = input.filesystem.resourceRef;
		if (ref.kind !== "code") return { ok: false, reason: "Expected code resourceRef" };
		if (!this.deps.keptCopiesRoot) {
			return { ok: false, reason: "this server has no folder to keep repository copies in" };
		}
		const local = isLocalRepoPath(ref);
		const taskKey = taskKeyFor(input);
		const home = path.join(this.deps.keptCopiesRoot, "worktrees", taskKey, input.folderName);
		const link = path.join(input.workspacePath, input.folderName);

		try {
			const env = local ? {} : gitCredentialEnv(ref.repo, input.credential);
			const keptCopy = local
				? normalizeLocalPath(ref.repo)
				: path.join(this.deps.keptCopiesRoot, input.filesystem.id);
			const remote = !local;

			const reused = fs.existsSync(home);
			let branch: string;
			let base: string;
			if (!reused) {
				if (local) {
					const ok = await this.deps.gitRunnerFactory(keptCopy).verifyCommit(ref.branch);
					if (!ok)
						return { ok: false, reason: `branch '${ref.branch}' not found in '${ref.repo}'` };
					base = ref.branch;
				} else {
					if (!fs.existsSync(keptCopy)) {
						fs.mkdirSync(this.deps.keptCopiesRoot, { recursive: true });
						await this.deps
							.gitRunnerFactory(this.deps.keptCopiesRoot)
							.clone(ref.repo, keptCopy, { env });
					} else {
						await this.deps.gitRunnerFactory(keptCopy).fetch({ env });
					}
					base = `origin/${ref.branch}`;
				}
				const runner = this.deps.gitRunnerFactory(keptCopy);
				await runner.worktreePrune();
				branch = `hyperidle/${input.taskId ?? input.sessionId}`;
				await runner.worktreeAdd(home, branch, base);
			} else {
				// A plain existence check replaces the old gitdir-pointer
				// forensics: the task's worktree home either exists (this IS it,
				// cut by an earlier session of the same task) or it does not.
				// `base` is reported the same way the old adopted case did — the
				// configured branch verbatim, never the `origin/`-prefixed form,
				// since it is display-only once the worktree already exists.
				base = ref.branch;
				const resolvedBranch = await this.deps.gitRunnerFactory(home).currentBranch();
				if (!resolvedBranch) {
					return {
						ok: false,
						reason: `worktree at '${home}' exists but its checked-out branch could not be resolved`,
					};
				}
				branch = resolvedBranch;
			}

			if (fs.existsSync(link)) {
				if (
					!(fs.lstatSync(link).isSymbolicLink() && fs.realpathSync(link) === fs.realpathSync(home))
				) {
					return {
						ok: false,
						reason: `folder '${input.folderName}' already exists in the workspace`,
					};
				}
			} else {
				fs.symlinkSync(home, link);
			}

			return {
				ok: true,
				mounted: {
					filesystem: input.filesystem,
					folder: link,
					trustedPaths: [keptCopy, home],
					git: { keptCopy, branch, base, remote },
					agentEnv: env,
					reused,
				},
			};
		} catch (error) {
			return { ok: false, reason: error instanceof Error ? error.message : String(error) };
		}
	}
}

/**
 * A Google Drive folder's one kept copy, in the same long-lived place a
 * remote repository's clone lives (`<keptCopiesRoot>/<filesystemId>`),
 * refreshed with `rclone copy` remote → local on every mount — first use AND
 * before every session — and symlinked into the workspace. No `unmount`: the
 * copy lives until `DELETE /api/filesystems/:id` (`forgetKeptCopy`).
 */
class DriveFolderAdapter implements MountAdapter {
	constructor(private readonly deps: AdapterDeps) {}

	async mount(input: MountInput): Promise<MountResult> {
		const ref = input.filesystem.resourceRef;
		if (ref.kind !== "drive") return { ok: false, reason: "Expected drive resourceRef" };
		if (!this.deps.rclone) {
			return { ok: false, reason: "this server cannot reach Google Drive" };
		}
		if (!this.deps.keptCopiesRoot) {
			return { ok: false, reason: "this server has no folder to keep copies in" };
		}

		const copy = path.join(this.deps.keptCopiesRoot, input.filesystem.id);
		const link = path.join(input.workspacePath, input.folderName);

		try {
			// An EMPTY Drive folder must still give the agent a folder — rclone
			// creates the destination only when it has something to copy into it.
			fs.mkdirSync(copy, { recursive: true });

			const outcome = await this.deps.rclone.copyDown(ref.remote, ref.path, copy);
			if (!outcome.ok) {
				return { ok: false, reason: driveReason(outcome.code, ref, outcome.reason) };
			}

			let reused = false;
			if (fs.existsSync(link)) {
				if (
					fs.lstatSync(link).isSymbolicLink() &&
					fs.realpathSync(link) === fs.realpathSync(copy)
				) {
					reused = true;
				} else {
					return {
						ok: false,
						reason: `folder '${input.folderName}' already exists in the workspace`,
					};
				}
			} else {
				fs.symlinkSync(copy, link);
			}

			return {
				ok: true,
				mounted: {
					filesystem: input.filesystem,
					folder: link,
					trustedPaths: [copy],
					agentEnv: {},
					reused,
				},
			};
		} catch (error) {
			return { ok: false, reason: error instanceof Error ? error.message : String(error) };
		}
	}
}

/**
 * @lore Google Drive phase §2.1: selection moves onto `resourceRef.kind` —
 * the ref is what actually decides how a filesystem is placed; `kind` and
 * `source` are registry facts for display only. This is the last reader of
 * the old `CLOUD_SOURCES`/`CloudNotBuiltAdapter`-by-source branch, now gone:
 * a `gdrive`-sourced filesystem is placed by its resourceRef, not detected by
 * its source string.
 */
function selectMountAdapter(filesystem: Filesystem, deps: AdapterDeps): MountAdapter {
	const ref = filesystem.resourceRef;
	if (ref.kind === "code") return new GitRepositoryAdapter(deps);
	if (ref.kind === "drive") return new DriveFolderAdapter(deps);
	if (ref.kind === "doc_set") return new LocalFolderAdapter();
	return new UnsupportedFilesystemAdapter((ref as { kind: unknown }).kind);
}

export class RegistryFilesystemMounter {
	constructor(private readonly deps: AdapterDeps) {}

	async mount(input: MountInput): Promise<MountResult> {
		return selectMountAdapter(input.filesystem, this.deps).mount(input);
	}

	/**
	 * Release a task's git worktrees once the task is `done` and no session
	 * of it is still running. Guarded by orchestration's OWN `sessions` table
	 * (never while a session of the task is active, the same shape
	 * `request-run-stop-for-tasks.ts` already queries) — core decides the
	 * task is done, orchestration decides nothing is running.
	 *
	 * Removal is a doesn't-matter op: `worktreeRemove` runs WITHOUT `force`,
	 * so a worktree with uncommitted or untracked changes is refused and
	 * stays — logged as a skip, never destroyed — and the branch is never
	 * touched either way. A missing kept copy, a missing task directory or a
	 * failing git call all end the same way: a log line, not a throw.
	 */
	async releaseForTask(db: HyperIdleDb, taskId: string): Promise<void> {
		const [active] = await db
			.select({ id: sessions.id })
			.from(sessions)
			.where(and(eq(sessions.taskId, taskId), eq(sessions.state, "active")))
			.limit(1);
		if (active) return;

		if (!this.deps.keptCopiesRoot) return;
		const taskDir = path.join(this.deps.keptCopiesRoot, "worktrees", `task-${taskId}`);
		if (!fs.existsSync(taskDir)) return;

		let children: string[];
		try {
			children = await fs.promises.readdir(taskDir);
		} catch (err) {
			logReleaseSkip(`could not read '${taskDir}'`, err);
			return;
		}

		for (const child of children) {
			const worktreePath = path.join(taskDir, child);
			try {
				const keptCopy = keptCopyForWorktree(worktreePath);
				if (!keptCopy) continue;
				await this.deps.gitRunnerFactory(keptCopy).worktreeRemove(worktreePath);
			} catch (err) {
				logReleaseSkip(`could not remove worktree '${worktreePath}'`, err);
			}
		}

		try {
			await fs.promises.rmdir(taskDir);
		} catch {
			// Not empty (a worktree was refused above) or already gone — a
			// doesn't-matter op, exactly like the worktree removal itself.
		}
	}
}

/**
 * The repository a worktree belongs to, read off its `.git` FILE
 * (`gitdir: <repo>/.git/worktrees/<name>`): the segment before
 * `/worktrees/` is the repo's own `.git` directory, so its parent is the
 * repository `worktreeRemove` must run against. `undefined` when the
 * worktree is not (or no longer) a real git worktree — the caller logs and
 * moves on, never throws.
 */
function keptCopyForWorktree(worktreePath: string): string | undefined {
	const gitFile = path.join(worktreePath, ".git");
	if (!fs.existsSync(gitFile) || fs.lstatSync(gitFile).isDirectory()) return undefined;
	const pointer = fs
		.readFileSync(gitFile, "utf8")
		.trim()
		.match(/^gitdir:\s*(.+)$/)?.[1];
	if (!pointer) return undefined;
	const marker = `${path.sep}worktrees${path.sep}`;
	const idx = pointer.indexOf(marker);
	if (idx === -1) return undefined;
	return path.dirname(path.resolve(worktreePath, pointer.slice(0, idx)));
}

/**
 * Every failure along `releaseForTask` is a log line, never a throw: a
 * refused (dirty) worktree, a missing directory or a
 * deleted kept copy are all "nothing to do right now", not an error a
 * caller (a core reaction, best-effort by its own contract) should surface.
 */
function logReleaseSkip(message: string, err: unknown): void {
	// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
	console.warn(
		`[filesystem-release] ${message}: ${err instanceof Error ? err.message : String(err)}`,
	);
}

/**
 * Remove a remote filesystem's or a Drive filesystem's kept copy (its ONE
 * clone/copy, outside every session's own worktree). Never for a local
 * repo — the kept copy there IS the person's own repository, and never for
 * a person's own folder — HyperIdle must never delete either. Absent
 * `keptCopiesRoot` is a no-op: nothing was ever cloned or copied.
 */
export async function forgetKeptCopy(
	keptCopiesRoot: string | undefined,
	filesystem: Filesystem,
): Promise<void> {
	const ref = filesystem.resourceRef;
	const isRemoteGit = ref.kind === "code" && !isLocalRepoPath(ref);
	if ((!isRemoteGit && ref.kind !== "drive") || !keptCopiesRoot) return;
	await fs.promises.rm(path.join(keptCopiesRoot, filesystem.id), { recursive: true, force: true });
}

/**
 * The workspace root repository never shows a mounted filesystem's folder (a
 * worktree or a symlink) as untracked. Idempotent: appends only the folder
 * names not already present. `workspacePath` must already be a git
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
