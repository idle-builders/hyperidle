/**
 * AO2 — Internal MountAdapter interface + supporting context types.
 *
 * This is a NARROWER internal interface than the public FilesystemMounter seam
 * (packages/shared/src/filesystem.ts). Adapters need a gitRunnerFactory +
 * capture-store that don't belong on the public seam. The outward seam
 * (FilesystemMounter) is unchanged — AO1 needs no type change.
 *
 * @lore AO2 §4.1: MountAdapter is NOT the same as SandboxAdapter (harness run-unit,
 * different layer) and NOT connection provisioning (AN2, held auth). Three distinct
 * adapters for three distinct layers — vocabulary locked in concept Phase 3.
 */

import type { CaptureResult, Filesystem, FilesystemAuth, MountResult } from "@hyperidle/shared";

// ── Internal context types ───────────────────────────────────────────────────

/** Input to an adapter's mount() call. */
export interface MountContext {
	readonly filesystem: Filesystem;
	readonly sandboxPath: string;
	/** Honored if present; AO2 never produces it (inherited=ambient, held=AN2). */
	readonly auth: FilesystemAuth | null;
}

/** Input to an adapter's captureBack() call. */
export interface CaptureContext {
	readonly filesystem: Filesystem;
	readonly sandboxPath: string;
	/** Used for the filesystem_captures provenance row. */
	readonly sessionId: string;
}

/** Extended CaptureResult with provenance fields for the capture-store. */
export interface AdapterCaptureResult extends CaptureResult {
	/** Durable bundle path (.bundle) | snapshot dir | undefined when not captured. */
	readonly capturePath?: string;
	/** Git commit SHA — git writeback only. */
	readonly commitSha?: string;
}

// ── MountAdapter interface ───────────────────────────────────────────────────

/**
 * Per-source mount + capture-back strategy. Selected by (kind, source) from the
 * mounter registry. All source differences live here — never in session-provisioning.
 *
 * @lore AO2 hard rule 6: The provisioning flow is source-agnostic. A switch(source)
 * in session-provisioning is a concept violation. All branching lives inside adapters.
 */
export interface MountAdapter {
	/**
	 * Stable identifier for this adapter: e.g. "git-worktree" | "git-clone" |
	 * "local-folder" | "cloud-not-built:<source>". Used in logs and tests.
	 */
	readonly id: string;

	/**
	 * Place the filesystem's working set into sandboxPath.
	 * Mount places files only — never injects auth (hard rule 1).
	 */
	mount(ctx: MountContext): Promise<MountResult>;

	/**
	 * Commit/snapshot authored changes and write a filesystem_captures row.
	 * Capture-back is NOT landing (hard rule 3): no push/PR/publish to forge.
	 * Must run BEFORE endSession's rm -rf (see plan §9).
	 */
	captureBack(ctx: CaptureContext): Promise<AdapterCaptureResult>;
}
