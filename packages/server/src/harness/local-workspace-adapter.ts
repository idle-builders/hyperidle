/** Local workspace adapter — creates directories on the host file system (D3). */

import { spawn as spawnProcess } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { ExecResult, WorkspaceAdapter, WorkspaceHandle } from "./workspace-adapter.js";

let nextId = 1;

/**
 * Run a shell command line via `sh -c`, returning stdout/stderr/exitCode.
 *
 * @lore I2 review MEDIUM-3: the local adapter is intentionally dev-only
 * (gated to non-production by the constructor) and runs commands through
 * the host shell so developers can hand it the same shell snippets they'd
 * type at the prompt. The Docker adapter is the production path and runs
 * argv-form `docker exec` to keep agent payloads out of any host shell.
 */
function runShell(
	command: string,
	cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	return new Promise((resolve) => {
		const child = spawnProcess("sh", ["-c", command], { cwd });
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (b: Buffer) => {
			stdout += b.toString();
		});
		child.stderr?.on("data", (b: Buffer) => {
			stderr += b.toString();
		});
		child.on("close", (code) => {
			resolve({
				stdout: stdout.trim(),
				stderr: stderr.trim(),
				exitCode: code ?? 1,
			});
		});
		child.on("error", (err) => {
			resolve({
				stdout: stdout.trim(),
				stderr: (stderr + (err instanceof Error ? err.message : String(err))).trim(),
				exitCode: 1,
			});
		});
	});
}

export class LocalWorkspaceAdapter implements WorkspaceAdapter {
	private readonly workspaces = new Map<string, WorkspaceHandle>();

	constructor() {
		// @lore I2 review A3 / S4: refuse to operate on server deployments.
		// The local adapter executes commands directly on the host filesystem
		// with no isolation; allowing it on vps/cloud would let an agent
		// escape the intended Docker boundary. The laptop profile (desktop
		// app) is inherently local and must be allowed even in production
		// (packaged Electron). The gate uses HYPERIDLE_PROFILE rather than
		// NODE_ENV so the desktop app (laptop profile, NODE_ENV=production)
		// is not blocked.
		const profile = process.env.HYPERIDLE_PROFILE ?? "laptop";
		if (process.env.NODE_ENV === "production" && profile !== "laptop") {
			throw new Error(
				"LocalWorkspaceAdapter is not allowed in server environments. Use DockerWorkspaceAdapter for isolated workspace execution.",
			);
		}
	}

	async spawn(baseDir: string): Promise<WorkspaceHandle> {
		const workspaceId = `local-ws-${nextId++}-${Date.now()}`;
		const path = join(baseDir, workspaceId);
		await mkdir(path, { recursive: true });
		const handle: WorkspaceHandle = { workspaceId, path };
		this.workspaces.set(workspaceId, handle);
		return handle;
	}

	// @lore I2 review: kept async to honour the WorkspaceAdapter contract
	// — callers always `await` exec() and the "unknown workspace" branch
	// must surface as a rejected promise (not a synchronous throw) so test
	// expectations like `await expect(adapter.exec(fake, "ls")).rejects.toThrow(...)`
	// hold. The runShell call also returns a Promise, so the function body
	// is genuinely asynchronous even without an explicit `await` keyword.
	// biome-ignore lint/suspicious/useAwait: see @lore above
	async exec(handle: WorkspaceHandle, command: string): Promise<ExecResult> {
		if (!this.workspaces.has(handle.workspaceId)) {
			throw new Error(`Unknown workspace: ${handle.workspaceId}`);
		}
		return runShell(command, handle.path);
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
