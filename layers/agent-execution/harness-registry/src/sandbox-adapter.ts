/** Sandbox adapter interface — sandboxed file system for agent sessions. */

export interface SandboxHandle {
	readonly sandboxId: string;
	readonly path: string;
}

export interface SandboxAdapter {
	spawn(baseDir: string): Promise<SandboxHandle>;
	/**
	 * Take ownership of an existing directory so it can be destroyed later like a spawned sandbox.
	 * @lore: adopt — resumed session must use original directory; fresh spawn loses work and hangs if dir gone; one session owns the delete
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
