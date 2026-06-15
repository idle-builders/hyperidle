/**
 * Docker sandbox adapter — creates containers for agent sessions (D3).
 * @lore AK1: Renamed from docker-workspace-adapter.ts. DockerSandboxAdapter → DockerSandboxAdapter.
 */

import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { ExecResult, SandboxAdapter, SandboxHandle } from "./sandbox-adapter.js";

let nextId = 1;

interface DockerOptions {
	readonly image?: string;
	readonly mountPath?: string;
}

interface SpawnResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

/**
 * Run a command via `child_process.spawn` and resolve with captured
 * stdout/stderr + exit code.
 *
 * @lore I2 S5/S6: this MUST stay argv-based — no shell wrapping. The previous
 * implementation built a shell string with template interpolation, which let
 * any caller-controlled string in `command`, `mountPath`, or container id
 * inject host-shell metacharacters. With argv, the host shell never sees the
 * payload; the only shell evaluation happens inside the container's `sh -c`
 * (which is the intended semantics).
 */
function runDocker(file: string, args: readonly string[]): Promise<SpawnResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(file, args);
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (chunk: Buffer | string) => {
			stdout += typeof chunk === "string" ? chunk : chunk.toString();
		});
		child.stderr?.on("data", (chunk: Buffer | string) => {
			stderr += typeof chunk === "string" ? chunk : chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (code) => {
			resolve({ stdout, stderr, exitCode: code ?? 0 });
		});
	});
}

export class DockerSandboxAdapter implements SandboxAdapter {
	private readonly image: string;
	private readonly mountPath: string;
	private readonly containers = new Map<string, { containerId: string; hostPath: string }>();

	/**
	 * @lore I2 S6: `image` and `mountPath` flow into the docker argv as-is,
	 * so they MUST be operator-controlled (process env, config file). Never
	 * accept these from agent input — argv form contains the value to a single
	 * argv element but a malicious mountPath could still e.g. mount a sensitive
	 * host directory. Defence at the input boundary, not at the spawn boundary.
	 */
	constructor(options?: DockerOptions) {
		this.image = options?.image ?? "node:20-slim";
		this.mountPath = options?.mountPath ?? "/workspace";
	}

	async spawn(baseDir: string): Promise<SandboxHandle> {
		const workspaceId = `docker-ws-${nextId++}-${Date.now()}`;
		const hostPath = join(baseDir, workspaceId);
		await mkdir(hostPath, { recursive: true });

		const args = [
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
		];

		try {
			const { stdout, exitCode } = await runDocker("docker", args);
			if (exitCode !== 0) {
				throw new Error(`docker run exited with code ${exitCode}`);
			}
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

	async exec(handle: SandboxHandle, command: string): Promise<ExecResult> {
		const container = this.containers.get(handle.workspaceId);
		if (!container) {
			throw new Error(`Unknown sandbox: ${handle.workspaceId}`);
		}

		// I2 S5: pass `command` as a single argv element. The host shell
		// never expands it; only the container's `sh -c` does, which is the
		// intended semantics for agent-issued shell commands.
		const { stdout, stderr, exitCode } = await runDocker("docker", [
			"exec",
			container.containerId,
			"sh",
			"-c",
			command,
		]);
		return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
	}

	async destroy(handle: SandboxHandle): Promise<void> {
		const container = this.containers.get(handle.workspaceId);
		if (!container) {
			throw new Error(`Unknown sandbox: ${handle.workspaceId}`);
		}

		try {
			await runDocker("docker", ["stop", container.containerId]);
		} catch {
			// Container may already be stopped — ignore.
		}

		await rm(container.hostPath, { recursive: true, force: true });
		this.containers.delete(handle.workspaceId);
	}
}
