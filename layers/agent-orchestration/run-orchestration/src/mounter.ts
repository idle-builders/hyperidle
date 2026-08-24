/**
 * The filesystem mount engine — `RegistryFilesystemMounter` and its four
 * adapters.
 *
 * @lore AU26 F1 (§D-I): relocated VERBATIM from
 * `layers/core-api/filesystems/src/mounter-registry.ts`. The relocation is a
 * package move, not a rewrite: the four adapters, `SANDBOX_SCAFFOLDING_PATHS`
 * and the capture-root containment check are unchanged, and their tests moved
 * with them. `captureBack` is a declared no-op — the capture write code and
 * its table (`filesystem_captures`) were removed in AU43.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
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

interface AdapterCaptureResult {
	readonly success: boolean;
	readonly captured: boolean;
	readonly error?: string;
	readonly capturePath?: string;
	readonly commitSha?: string;
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
	constructor() {}
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

	async mount(input: { filesystem: Filesystem; sandboxPath: string }): Promise<MountResult> {
		const adapter = selectMountAdapter(input.filesystem, this.deps);
		const ctx: MountContext = {
			filesystem: input.filesystem,
			sandboxPath: input.sandboxPath,
		};
		return adapter.mount(ctx);
	}

	async captureBack(_input: {
		filesystem: Filesystem;
		sandboxPath: string;
		sessionId: string;
	}): Promise<AdapterCaptureResult> {
		return { success: true, captured: false };
	}
}
