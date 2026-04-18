/** Docker workspace adapter — creates containers for agent sessions (D3). */

import { exec as execCb } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExecResult, WorkspaceAdapter, WorkspaceHandle } from "./workspace-adapter.js";

const execAsync = promisify(execCb);

let nextId = 1;

interface DockerOptions {
	readonly image?: string;
	readonly mountPath?: string;
}

export class DockerWorkspaceAdapter implements WorkspaceAdapter {
	private readonly image: string;
	private readonly mountPath: string;
	private readonly containers = new Map<string, { containerId: string; hostPath: string }>();

	constructor(options?: DockerOptions) {
		this.image = options?.image ?? "node:20-slim";
		this.mountPath = options?.mountPath ?? "/workspace";
	}

	async spawn(baseDir: string): Promise<WorkspaceHandle> {
		const workspaceId = `docker-ws-${nextId++}-${Date.now()}`;
		const hostPath = join(baseDir, workspaceId);
		await mkdir(hostPath, { recursive: true });

		const cmd = [
			"docker",
			"run",
			"-d",
			"--rm",
			"-v",
			`${hostPath}:${this.mountPath}`,
			"-w",
			this.mountPath,
			this.image,
			"sleep",
			"infinity",
		].join(" ");

		try {
			const { stdout } = await execAsync(cmd);
			const containerId = stdout.trim();
			if (!containerId) {
				throw new Error("Docker returned empty container ID");
			}
			this.containers.set(workspaceId, { containerId, hostPath });
			return { workspaceId, path: hostPath };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			throw new Error(`Failed to start Docker container: ${message}`);
		}
	}

	async exec(handle: WorkspaceHandle, command: string): Promise<ExecResult> {
		const container = this.containers.get(handle.workspaceId);
		if (!container) {
			throw new Error(`Unknown workspace: ${handle.workspaceId}`);
		}

		try {
			const { stdout, stderr } = await execAsync(
				`docker exec ${container.containerId} sh -c "${command.replace(/"/g, '\\"')}"`,
			);
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
		const container = this.containers.get(handle.workspaceId);
		if (!container) {
			throw new Error(`Unknown workspace: ${handle.workspaceId}`);
		}

		try {
			await execAsync(`docker stop ${container.containerId}`);
		} catch {
			// Container may already be stopped
		}

		await rm(container.hostPath, { recursive: true, force: true });
		this.containers.delete(handle.workspaceId);
	}
}
