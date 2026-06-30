/**
 * AO2 — Adapter 4: CloudNotBuiltAdapter.
 *
 * An EXPLICIT "not built" placeholder for deferred cloud-sync sources
 * (gdrive / dropbox / s3 / unknown kind). NOT a stub-from-memory (MEMORY rule) —
 * it is an honest, intentional signal that the adapter does not exist yet.
 *
 * mount() returns success:false with a clear "not built" error.
 * captureBack() returns success:false, captured:false with the same error.
 *
 * The provisioning hook maps a failed mount to a logged warning + optional
 * needs_attention state update — NEVER a session crash, NEVER silent.
 *
 * @lore AO2: Cloud adapters are built in their connector WPs, not in AO2.
 * AO2 ships the registry seam they plug into. The explicit "not built" throw
 * from selectMountAdapter routes here so a future adapter can replace it by
 * returning a real adapter from selectMountAdapter for that source.
 */

import type { MountResult } from "@hyperidle/shared";
import type {
	AdapterCaptureResult,
	CaptureContext,
	MountAdapter,
	MountContext,
} from "./mount-adapter.js";

export class CloudNotBuiltAdapter implements MountAdapter {
	readonly id: string;

	constructor(source: string) {
		this.id = `cloud-not-built:${source}`;
	}

	async mount(ctx: MountContext): Promise<MountResult> {
		return {
			success: false,
			sandboxPath: ctx.sandboxPath,
			error: `mount adapter not built for source '${ctx.filesystem.source}' (built in its connector WP)`,
		};
	}

	async captureBack(_ctx: CaptureContext): Promise<AdapterCaptureResult> {
		return {
			success: false,
			captured: false,
			error: `capture adapter not built for source '${_ctx.filesystem.source}' (built in its connector WP)`,
		};
	}
}
