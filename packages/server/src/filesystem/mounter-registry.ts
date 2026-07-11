/**
 * AO2 — Mounter registry: RegistryFilesystemMounter + selectMountAdapter.
 *
 * The ONE seam session-provisioning sees is RegistryFilesystemMounter (implements
 * FilesystemMounter). Its mount/captureBack call selectMountAdapter(fs) and delegate.
 * All source differences live inside adapters — never in the provisioning flow.
 *
 * @lore AO2 hard rule 6: no switch(source) outside the selector. selectMountAdapter
 * is the only dispatcher. The provisioning loop calls one mounter; the mounter
 * selects and delegates. This mirrors AdapterPool.select() for harnesses.
 *
 * @lore AO2 W4 — selection precedence (explicit, ordered):
 *   1. code + connectionId != null     → GitCloneAdapter (remote forge)
 *   2. code + null + isLocalRepoPath   → GitWorktreeAdapter (host-local path)
 *   3. code + null + non-path repo     → MalformedFilesystemError (LOUD, never silent)
 *   4. doc_set + CLOUD_SOURCES         → CloudNotBuiltAdapter (explicit "not built")
 *   5. doc_set + (local/obsidian/...)  → LocalFolderAdapter
 *   6. unknown kind                    → CloudNotBuiltAdapter (explicit, never silent)
 */

import { randomUUID } from "node:crypto";
import type { HyperIdleDb } from "@hyperidle/db";
import type { CaptureResult, Filesystem, FilesystemMounter, MountResult } from "@hyperidle/shared";
import type { GitRunner } from "../services/git-export-runner.js";
import { writeFilesystemCapture } from "./capture-store.js";
import { CloudNotBuiltAdapter } from "./cloud-not-built-adapter.js";
import { GitCloneAdapter } from "./git-clone-adapter.js";
import { GitWorktreeAdapter } from "./git-worktree-adapter.js";
import { LocalFolderAdapter } from "./local-folder-adapter.js";
import type { CaptureContext, MountAdapter, MountContext } from "./mount-adapter.js";

// ── Cloud sources set (deferred — explicit "not built") ──────────────────────

const CLOUD_SOURCES = new Set(["gdrive", "dropbox", "s3"]);

// ── Adapter deps (injected by session-provisioning / tests) ──────────────────

export interface AdapterDeps {
	/** Factory for a GitRunner bound to a specific cwd. Injected so tests substitute FakeGitRunner. */
	readonly gitRunnerFactory: (repoPath: string) => GitRunner;
	/** Directory for storing durable capture artifacts (bundles / snapshot dirs). */
	readonly capturesDir: string;
	/** DB handle for writing filesystem_captures rows. */
	readonly db: HyperIdleDb;
}

// ── isLocalRepoPath heuristic ────────────────────────────────────────────────

/**
 * Derive whether a resourceRef.repo is a local path (vs an owner/repo slug or URL).
 * A local path: starts with `/`, `./`, `../`, `~/`, or `file://`.
 *
 * @lore AO2 W4: connectionId==null + a local-path repo → GitWorktreeAdapter.
 * connectionId==null + an owner/repo slug or https/git@ URL → MalformedFilesystemError.
 * This heuristic is derivable from existing AO1 columns; no new column required.
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

// ── MalformedFilesystemError ─────────────────────────────────────────────────

/**
 * Thrown by selectMountAdapter when a code filesystem has no connectionId AND
 * its resourceRef.repo is not a local path (e.g., an owner/repo slug or remote URL
 * with no Connection to provide auth).
 *
 * This is a DATA defect — surfaced loud so the operator can correct the registration.
 * The provisioning hook maps this to a logged warning + needs_attention, never a crash.
 *
 * @lore AO2 W4: Explicit error, NEVER silent worktree-on-a-non-path.
 */
export class MalformedFilesystemError extends Error {
	readonly filesystem: Filesystem;

	constructor(filesystem: Filesystem, reason: string) {
		super(`MalformedFilesystem [${filesystem.id}]: ${reason}`);
		this.name = "MalformedFilesystemError";
		this.filesystem = filesystem;
	}
}

// ── selectMountAdapter ────────────────────────────────────────────────────────

/**
 * Select the appropriate MountAdapter for a Filesystem by (kind, source, connectionId).
 * W4 precedence is explicit and ordered — no silent fallthrough.
 *
 * @throws MalformedFilesystemError for a code fs with null connectionId and a non-path repo.
 */
export function selectMountAdapter(fs: Filesystem, deps: AdapterDeps): MountAdapter {
	if (fs.kind === "code") {
		if (fs.connectionId != null) {
			// W4·1: remote forge Connection present → clone adapter.
			return new GitCloneAdapter(deps);
		}
		if (isLocalRepoPath(fs.resourceRef)) {
			// W4·2: null connectionId + local path → worktree adapter.
			return new GitWorktreeAdapter(deps);
		}
		// W4·3: null connectionId + non-path repo → explicit error, never silent.
		throw new MalformedFilesystemError(
			fs,
			`code fs with no connectionId must have a local-path repo for the worktree adapter (got: '${(fs.resourceRef as { repo?: string }).repo ?? "?"}')`,
		);
	}

	if (fs.kind === "doc_set") {
		if (CLOUD_SOURCES.has(fs.source)) {
			// W4·4: cloud source — adapter not built yet; explicit "not built".
			return new CloudNotBuiltAdapter(fs.source);
		}
		// W4·5: local / obsidian / other local-style source → in-place adapter.
		return new LocalFolderAdapter(deps);
	}

	// W4·6: unknown kind → explicit "not built", never silent.
	return new CloudNotBuiltAdapter(`${fs.kind}:${fs.source}`);
}

// ── RegistryFilesystemMounter ─────────────────────────────────────────────────

/**
 * The ONE FilesystemMounter implementation session-provisioning sees.
 * Delegates mount/captureBack to the adapter selected by selectMountAdapter.
 * Writes a filesystem_captures row on successful captureBack.
 *
 * @lore AO2 hard rule 6: no source knowledge in the provisioning flow — all
 * differences are encapsulated in the adapter the registry selects.
 */
export class RegistryFilesystemMounter implements FilesystemMounter {
	constructor(private readonly deps: AdapterDeps) {}

	async mount(input: {
		filesystem: Filesystem;
		sandboxPath: string;
		auth: import("@hyperidle/shared").FilesystemAuth | null;
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
		const adapter = selectMountAdapter(input.filesystem, this.deps);
		const ctx: CaptureContext = {
			filesystem: input.filesystem,
			sandboxPath: input.sandboxPath,
			sessionId: input.sessionId,
		};
		const result = await adapter.captureBack(ctx);

		if (result.success && result.captured) {
			await writeFilesystemCapture(this.deps.db, {
				id: randomUUID(),
				sessionId: input.sessionId,
				filesystemId: input.filesystem.id,
				writeback: input.filesystem.writeback,
				capturePath: result.capturePath ?? "none",
				commitSha: result.commitSha,
				createdAt: new Date().toISOString(),
			});
		}

		return result;
	}
}
