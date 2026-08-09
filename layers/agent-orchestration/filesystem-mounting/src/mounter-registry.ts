/**
 * The filesystem mount engine — `RegistryFilesystemMounter` and its four
 * adapters.
 *
 * @lore AU26 F1 (§D-I): relocated VERBATIM from
 * `layers/core-api/filesystems/src/mounter-registry.ts`. The relocation is a
 * package move, not a rewrite: the four adapters, `SANDBOX_SCAFFOLDING_PATHS`
 * and the capture-root containment check are unchanged, and their tests moved
 * with them. `filesystem_captures` is now owned HERE — this class is its only
 * writer (`scripts/table-ownership-guard.ts`).
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { filesystemCaptures, type WriteExecutor } from "@hyperidle/db";
import type {
	CaptureResult,
	Filesystem,
	FilesystemAuth,
	FilesystemMounter,
	MountResult,
} from "@hyperidle/filesystem-contract";
import type { MountingGitRunnerFactory } from "./ports.js";
import { SANDBOX_SCAFFOLDING_PATHS } from "./scaffolding-paths.js";

const CLOUD_SOURCES = new Set(["gdrive", "dropbox", "s3"]);

export interface AdapterDeps {
	readonly gitRunnerFactory: MountingGitRunnerFactory;
	readonly capturesDir: string;
	readonly db: WriteExecutor;
}

interface MountContext {
	readonly filesystem: Filesystem;
	readonly sandboxPath: string;
	readonly auth: FilesystemAuth | null;
}

interface CaptureContext {
	readonly filesystem: Filesystem;
	readonly sandboxPath: string;
	readonly sessionId: string;
}

interface AdapterCaptureResult extends CaptureResult {
	readonly capturePath?: string;
	readonly commitSha?: string;
}

interface MountAdapter {
	mount(ctx: MountContext): Promise<MountResult>;
	captureBack(ctx: CaptureContext): Promise<AdapterCaptureResult>;
}

class CloudNotBuiltAdapter implements MountAdapter {
	constructor(private readonly source: string) {}
	mount(ctx: MountContext): Promise<MountResult> {
		return Promise.resolve({
			success: false,
			sandboxPath: ctx.sandboxPath,
			error: `mount adapter not built for source '${this.source}' (built in its connector WP)`,
		});
	}
	captureBack(): Promise<AdapterCaptureResult> {
		return Promise.resolve({
			success: false,
			captured: false,
			error: `capture adapter not built for source '${this.source}' (built in its connector WP)`,
		});
	}
}

class LocalFolderAdapter implements MountAdapter {
	constructor(private readonly deps: AdapterDeps) {}
	mount(ctx: MountContext): Promise<MountResult> {
		const ref = ctx.filesystem.resourceRef;
		if (ref.kind !== "doc_set")
			return Promise.resolve({
				success: false,
				sandboxPath: ctx.sandboxPath,
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
			return Promise.resolve({ success: true, sandboxPath: ctx.sandboxPath });
		} catch (error) {
			return Promise.resolve({
				success: false,
				sandboxPath: ctx.sandboxPath,
				error: String(error),
			});
		}
	}
	async captureBack(ctx: CaptureContext): Promise<AdapterCaptureResult> {
		const ref = ctx.filesystem.resourceRef;
		if (ref.kind !== "doc_set")
			return { success: false, captured: false, error: "Expected doc_set resourceRef" };
		const destination = path.join(this.deps.capturesDir, `${ctx.sessionId}-${Date.now()}-snapshot`);
		const temporary = `${destination}.tmp`;
		try {
			fs.mkdirSync(temporary, { recursive: true });
			fs.cpSync(ref.folder, temporary, { recursive: true });
			fs.renameSync(temporary, destination);
			return { success: true, captured: true, capturePath: destination };
		} catch (error) {
			fs.rmSync(temporary, { recursive: true, force: true });
			return { success: false, captured: false, error: String(error) };
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
		if (ref.kind !== "code")
			return { success: false, sandboxPath: ctx.sandboxPath, error: "Expected code resourceRef" };
		try {
			await this.deps.gitRunnerFactory(ctx.sandboxPath).clone(ref.repo, ref.branch, { depth: 1 });
			writeExclude(path.join(ctx.sandboxPath, ".git"));
			return { success: true, sandboxPath: ctx.sandboxPath };
		} catch (error) {
			return { success: false, sandboxPath: ctx.sandboxPath, error: String(error) };
		}
	}
	async captureBack(ctx: CaptureContext): Promise<AdapterCaptureResult> {
		const ref = ctx.filesystem.resourceRef;
		if (ref.kind !== "code")
			return { success: false, captured: false, error: "Expected code resourceRef" };
		const destination = path.join(this.deps.capturesDir, `${ctx.sessionId}.bundle`);
		try {
			fs.mkdirSync(this.deps.capturesDir, { recursive: true });
			const runner = this.deps.gitRunnerFactory(ctx.sandboxPath);
			await runner.add([]);
			if (await runner.diffCached()) return { success: true, captured: false };
			const sha = await runner.commit(
				`agent capture (session ${ctx.sessionId})`,
				"HyperIdle Agent",
				"agent@hyperidle.local",
			);
			await runner.bundle(destination, `refs/heads/${ref.branch}`);
			return { success: true, captured: true, capturePath: destination, commitSha: sha };
		} catch (error) {
			return { success: false, captured: false, error: String(error) };
		}
	}
}

class GitWorktreeAdapter implements MountAdapter {
	constructor(private readonly deps: AdapterDeps) {}
	async mount(ctx: MountContext): Promise<MountResult> {
		const ref = ctx.filesystem.resourceRef;
		if (ref.kind !== "code")
			return { success: false, sandboxPath: ctx.sandboxPath, error: "Expected code resourceRef" };
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
			return { success: true, sandboxPath: ctx.sandboxPath };
		} catch (error) {
			return { success: false, sandboxPath: ctx.sandboxPath, error: String(error) };
		}
	}
	async captureBack(ctx: CaptureContext): Promise<AdapterCaptureResult> {
		const ref = ctx.filesystem.resourceRef;
		if (ref.kind !== "code")
			return { success: false, captured: false, error: "Expected code resourceRef" };
		const branch = sanitizeBranch(`agent/${path.basename(ctx.sandboxPath)}`);
		const destination = path.join(this.deps.capturesDir, `${ctx.sessionId}.bundle`);
		try {
			fs.mkdirSync(this.deps.capturesDir, { recursive: true });
			const runner = this.deps.gitRunnerFactory(ctx.sandboxPath);
			await runner.add([]);
			const staged = await runner.lsFiles();
			const scaffolding = staged.filter((file) =>
				SANDBOX_SCAFFOLDING_PATHS.some((item) => file === item || file.startsWith(`${item}/`)),
			);
			if (scaffolding.length) await runner.restoreStaged(scaffolding);
			if (await runner.diffCached()) {
				await this.deps.gitRunnerFactory(ref.repo).worktreeRemove(ctx.sandboxPath, { force: true });
				return { success: true, captured: false };
			}
			const sha = await runner.commit(
				`agent capture (session ${ctx.sessionId})`,
				"HyperIdle Agent",
				"agent@hyperidle.local",
			);
			await runner.bundle(destination, `refs/heads/${branch}`);
			await this.deps.gitRunnerFactory(ref.repo).worktreeRemove(ctx.sandboxPath, { force: true });
			return { success: true, captured: true, capturePath: destination, commitSha: sha };
		} catch (error) {
			return { success: false, captured: false, error: String(error) };
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
		return new LocalFolderAdapter(deps);
	}

	return new CloudNotBuiltAdapter(`${fs.kind}:${fs.source}`);
}

export class RegistryFilesystemMounter implements FilesystemMounter {
	constructor(private readonly deps: AdapterDeps) {}

	async mount(input: {
		filesystem: Filesystem;
		sandboxPath: string;
		auth: import("@hyperidle/filesystem-contract").FilesystemAuth | null;
	}): Promise<MountResult> {
		const adapter = selectMountAdapter(input.filesystem, this.deps);
		const ctx: MountContext = {
			filesystem: input.filesystem,
			sandboxPath: input.sandboxPath,
			auth: input.auth,
		};
		return adapter.mount(ctx);
	}

	async captureBack(input: {
		filesystem: Filesystem;
		sandboxPath: string;
		sessionId: string;
	}): Promise<CaptureResult> {
		if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.sessionId)) {
			return { success: false, captured: false, error: "Invalid capture sessionId" };
		}
		const adapter = selectMountAdapter(input.filesystem, this.deps);
		const ctx: CaptureContext = {
			filesystem: input.filesystem,
			sandboxPath: input.sandboxPath,
			sessionId: input.sessionId,
		};
		const existingCaptureNames = new Set(
			pathExists(this.deps.capturesDir) ? fs.readdirSync(this.deps.capturesDir) : [],
		);
		const result = await adapter.captureBack(ctx);

		if (result.success && result.captured) {
			const capturePath = result.capturePath ?? "none";
			const captureRoot = path.resolve(this.deps.capturesDir);
			if (capturePath !== "none") {
				const resolvedCapture = path.resolve(capturePath);
				if (
					resolvedCapture !== captureRoot &&
					!resolvedCapture.startsWith(`${captureRoot}${path.sep}`)
				) {
					return { success: false, captured: false, error: "Capture escaped captures directory" };
				}
			}
			try {
				await this.deps.db.insert(filesystemCaptures).values({
					id: randomUUID(),
					sessionId: input.sessionId,
					filesystemId: input.filesystem.id,
					writeback: input.filesystem.writeback,
					capturePath,
					commitSha: result.commitSha,
					createdAt: new Date().toISOString(),
				});
			} catch (error) {
				if (capturePath !== "none" && !existingCaptureNames.has(path.basename(capturePath))) {
					fs.rmSync(capturePath, { recursive: true, force: true });
				}
				return {
					success: false,
					captured: false,
					error: `Failed to record capture: ${error instanceof Error ? error.message : String(error)}`,
				};
			}
		}

		return result;
	}
}

function pathExists(target: string): boolean {
	try {
		fs.accessSync(target);
		return true;
	} catch {
		return false;
	}
}
