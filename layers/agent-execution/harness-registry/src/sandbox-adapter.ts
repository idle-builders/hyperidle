/**
 * Sandbox adapter interface — sandboxed file system for agent sessions (D3).
 * @lore AK1: Renamed from workspace-adapter.ts (AK1 vocabulary rename).
 * The run-unit type was previously named Workspace*; all identifiers now use Sandbox*.
 * workspaceId field renamed to sandboxId per AK1 plan §63.
 */

export interface SandboxHandle {
	readonly sandboxId: string;
	readonly path: string;
}

export interface SandboxAdapter {
	spawn(baseDir: string): Promise<SandboxHandle>;
	/**
	 * Take ownership of a directory that already exists, so it can be destroyed
	 * later like any spawned sandbox.
	 *
	 * @lore BA2: a session that ends by asking a human for agreement keeps its
	 * directory — the agent is resumed IN it, and a resume into a directory that
	 * no longer exists hangs the harness instead of failing. The resumed session
	 * adopts that directory rather than spawning a fresh one, so the work the
	 * agent comes back to is its own, and so exactly one session owns the delete.
	 */
	adopt(path: string): Promise<SandboxHandle>;
	destroy(handle: SandboxHandle): Promise<void>;
}

export function createSandboxAdapter(topology: "local" | "disabled"): SandboxAdapter {
	if (topology === "local") {
		return new LocalSandboxAdapter();
	}
	return new DisabledSandboxAdapter();
}

import { DisabledSandboxAdapter } from "./disabled-sandbox-adapter.js";
import { LocalSandboxAdapter } from "./local-sandbox-adapter.js";
