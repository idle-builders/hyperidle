/**
 * Local sandbox adapter — creates per-session working directories on the host file system (D3).
 * @lore AK1: Renamed from local-workspace-adapter.ts.
 * @lore AQ1: The run-unit is a host working directory; the agent runs as a host process with the
 * user's environment. No container isolation is built or claimed (AQ2 adds opt-in isolation).
 * Refused on server profiles (non-laptop) — the shared backend runs no agents
 * (DisabledSandboxAdapter handles that boot guard). Laptop profile is always allowed.
 */

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { SandboxAdapter, SandboxHandle } from "./sandbox-adapter.js";

let nextId = 1;

export class LocalSandboxAdapter implements SandboxAdapter {
	private readonly sandboxes = new Map<string, SandboxHandle>();

	constructor() {
		// @lore I2 review A3 / S4 / AQ1: refuse to operate on server deployments.
		// The local adapter executes commands directly on the host filesystem;
		// it is the correct run path on laptop profiles (the agent runs host-local
		// with the user's environment). On server profiles (vps/cloud) the shared
		// backend runs no agents — DisabledSandboxAdapter is used there.
		// The gate uses HYPERIDLE_PROFILE rather than NODE_ENV so the desktop app
		// (laptop profile, NODE_ENV=production) is not blocked.
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

	async destroy(handle: SandboxHandle): Promise<void> {
		if (!this.sandboxes.has(handle.sandboxId)) {
			throw new Error(`Unknown sandbox: ${handle.sandboxId}`);
		}

		await rm(handle.path, { recursive: true, force: true });
		this.sandboxes.delete(handle.sandboxId);
	}
}
