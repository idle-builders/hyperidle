// @lore: LocalSandboxAdapter — host process, no container isolation; refused on server profiles (HYPERIDLE_PROFILE != laptop even in NODE_ENV=production)
// @lore: spawn() does NOT git-init — ensureSandboxGitRepo (mounter.ts) runs AFTER mounting; git clone/worktree add refuse to write into an existing .git

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { SandboxAdapter, SandboxHandle } from "./sandbox-adapter.js";

let nextId = 1;

export class LocalSandboxAdapter implements SandboxAdapter {
	private readonly sandboxes = new Map<string, SandboxHandle>();

	constructor() {
		// Gate uses HYPERIDLE_PROFILE (not NODE_ENV) so desktop app (laptop, NODE_ENV=production) is not blocked.
		const profile = process.env.HYPERIDLE_PROFILE ?? "laptop";
		if (process.env.NODE_ENV === "production" && profile !== "laptop") {
			throw new Error(
				"LocalSandboxAdapter is not allowed on a server profile; the shared backend runs no agents (set HYPERIDLE_PROFILE=laptop to run host-local).",
			);
		}
	}

	async spawn(baseDir: string): Promise<SandboxHandle> {
		const sandboxId = `local-sb-${nextId++}-${Date.now()}`;
		const path = join(baseDir, sandboxId);
		await mkdir(path, { recursive: true });
		const handle: SandboxHandle = { sandboxId, path };
		this.sandboxes.set(sandboxId, handle);
		return handle;
	}

	/** Per-process registry — resumed sessions must adopt their directory so destroy() can find it. */
	async adopt(path: string): Promise<SandboxHandle> {
		await mkdir(path, { recursive: true });
		const sandboxId = `local-sb-adopted-${nextId++}-${Date.now()}`;
		const handle: SandboxHandle = { sandboxId, path };
		this.sandboxes.set(sandboxId, handle);
		return handle;
	}

	async destroy(handle: SandboxHandle): Promise<void> {
		if (!this.sandboxes.has(handle.sandboxId)) {
			throw new Error(`Unknown sandbox: ${handle.sandboxId}`);
		}

		await rm(handle.path, { recursive: true, force: true });
		this.sandboxes.delete(handle.sandboxId);
	}
}
