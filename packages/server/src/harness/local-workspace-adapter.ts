/** Local workspace adapter — creates directories on the host file system (D3). */

import { exec as execCb } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExecResult, WorkspaceAdapter, WorkspaceHandle } from "./workspace-adapter.js";

const execAsync = promisify(execCb);

let nextId = 1;

export class LocalWorkspaceAdapter implements WorkspaceAdapter {
	private readonly workspaces = new Map<string, WorkspaceHandle>();

	async spawn(baseDir: string): Promise<WorkspaceHandle> {
		// @lore I2 S4: refuse to operate in production. The local adapter
		// executes commands directly on the host filesystem with no
		// isolation; allowing it in production would let an agent escape
		// the intended Docker boundary. The gate lives in spawn() (not
		// the constructor) so type-only imports in tests still work.
		if (process.env.NODE_ENV === "production") {
			throw new Error(
				"LocalWorkspaceAdapter is not allowed in production environments. Use DockerWorkspaceAdapter for isolated workspace execution.",
			);
		}

		const workspaceId = `local-ws-${nextId++}-${Date.now()}`;
		const path = join(baseDir, workspaceId);
		await mkdir(path, { recursive: true });
		const handle: WorkspaceHandle = { workspaceId, path };
		this.workspaces.set(workspaceId, handle);
		return handle;
	}

	async exec(handle: WorkspaceHandle, command: string): Promise<ExecResult> {
		if (!this.workspaces.has(handle.workspaceId)) {
			throw new Error(`Unknown workspace: ${handle.workspaceId}`);
		}

		try {
			const { stdout, stderr } = await execAsync(command, { cwd: handle.path });
			return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
		} catch (err: unknown) {
			const e = err as { stdout?: string; stderr?: string; code?: number };
			return {
				stdout: (e.stdout ?? "").trim(),
				stderr: (e.stderr ?? "").trim(),
				exitCode: e.code ?? 1,
			};
		}
	}

	async destroy(handle: WorkspaceHandle): Promise<void> {
		if (!this.workspaces.has(handle.workspaceId)) {
			throw new Error(`Unknown workspace: ${handle.workspaceId}`);
		}

		await rm(handle.path, { recursive: true, force: true });
		this.workspaces.delete(handle.workspaceId);
	}

	/** Check if a workspace directory still exists. */
	async exists(handle: WorkspaceHandle): Promise<boolean> {
		try {
			await readdir(handle.path);
			return true;
		} catch {
			return false;
		}
	}
}
