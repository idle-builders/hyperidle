import type { ExecResult, WorkspaceAdapter, WorkspaceHandle } from "./workspace-adapter.js";

// @lore deploy: the shared backend runs NO agents in-cluster (no Anthropic
// creds, no isolated execution). LocalWorkspaceAdapter is forbidden on server
// profiles (it executes on the host with no isolation) and DockerWorkspaceAdapter
// isn't provisioned. This no-op adapter lets the server boot; any attempt to
// actually provision an agent workspace rejects loudly rather than mis-executing.
export class DisabledWorkspaceAdapter implements WorkspaceAdapter {
	private fail(): Promise<never> {
		return Promise.reject(
			new Error(
				"Agent workspace execution is disabled on this deployment — the shared backend runs no agents.",
			),
		);
	}

	spawn(_baseDir: string): Promise<WorkspaceHandle> {
		return this.fail();
	}

	exec(_handle: WorkspaceHandle, _command: string): Promise<ExecResult> {
		return this.fail();
	}

	destroy(_handle: WorkspaceHandle): Promise<void> {
		return this.fail();
	}
}
