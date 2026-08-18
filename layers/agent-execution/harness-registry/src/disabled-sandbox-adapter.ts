/**
 * @lore AK1: Renamed from disabled-workspace-adapter.ts.
 * DisabledSandboxAdapter → DisabledSandboxAdapter.
 */
import type { SandboxAdapter, SandboxHandle } from "./sandbox-adapter.js";

// @lore deploy / AQ1: the shared backend runs NO agents in-cluster (no Anthropic
// creds, server profile guard). LocalSandboxAdapter executes host-local with the
// user's environment and is forbidden on server profiles. This no-op adapter lets
// the server boot; any attempt to provision an agent sandbox rejects loudly rather
// than mis-executing. (AQ2 adds opt-in isolation as a per-agent property.)
export class DisabledSandboxAdapter implements SandboxAdapter {
	private fail(): Promise<never> {
		return Promise.reject(
			new Error(
				"Agent sandbox execution is disabled on this deployment — the shared backend runs no agents.",
			),
		);
	}

	spawn(_baseDir: string): Promise<SandboxHandle> {
		return this.fail();
	}

	destroy(_handle: SandboxHandle): Promise<void> {
		return this.fail();
	}
}
