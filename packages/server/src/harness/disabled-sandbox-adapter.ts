/**
 * @lore AK1: Renamed from disabled-workspace-adapter.ts.
 * DisabledSandboxAdapter → DisabledSandboxAdapter.
 */
import type { ExecResult, SandboxAdapter, SandboxHandle } from "./sandbox-adapter.js";

// @lore deploy: the shared backend runs NO agents in-cluster (no Anthropic
// creds, no isolated execution). LocalSandboxAdapter is forbidden on server
// profiles (it executes on the host with no isolation) and DockerSandboxAdapter
// isn't provisioned. This no-op adapter lets the server boot; any attempt to
// actually provision an agent sandbox rejects loudly rather than mis-executing.
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

	exec(_handle: SandboxHandle, _command: string): Promise<ExecResult> {
		return this.fail();
	}

	destroy(_handle: SandboxHandle): Promise<void> {
		return this.fail();
	}
}
