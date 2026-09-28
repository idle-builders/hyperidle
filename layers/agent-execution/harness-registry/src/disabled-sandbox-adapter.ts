import type { SandboxAdapter, SandboxHandle } from "./sandbox-adapter.js";

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

	adopt(_path: string): Promise<SandboxHandle> {
		return this.fail();
	}

	destroy(_handle: SandboxHandle): Promise<void> {
		return this.fail();
	}
}
