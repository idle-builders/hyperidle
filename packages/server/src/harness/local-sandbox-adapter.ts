/**
 * Local sandbox adapter — creates directories on the host file system (D3).
 * @lore AK1: Renamed from local-workspace-adapter.ts. LocalSandboxAdapter → LocalSandboxAdapter.
 * Error messages retain "DockerSandboxAdapter" to remain grep-able; lore updated below.
 */

import { spawn as spawnProcess } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { ExecResult, SandboxAdapter, SandboxHandle } from "./sandbox-adapter.js";

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

export class LocalSandboxAdapter implements SandboxAdapter {
	private readonly sandboxes = new Map<string, SandboxHandle>();

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
				"LocalSandboxAdapter is not allowed in server environments. Use DockerSandboxAdapter for isolated sandbox execution.",
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

	// @lore I2 review: kept async to honour the SandboxAdapter contract
	// — callers always `await` exec() and the "unknown sandbox" branch
	// must surface as a rejected promise (not a synchronous throw) so test
	// expectations like `await expect(adapter.exec(fake, "ls")).rejects.toThrow(...)`
	// hold. The runShell call also returns a Promise, so the function body
	// is genuinely asynchronous even without an explicit `await` keyword.
	// biome-ignore lint/suspicious/useAwait: see @lore above
	async exec(handle: SandboxHandle, command: string): Promise<ExecResult> {
		if (!this.sandboxes.has(handle.sandboxId)) {
			throw new Error(`Unknown sandbox: ${handle.sandboxId}`);
		}
		return runShell(command, handle.path);
	}

	async destroy(handle: SandboxHandle): Promise<void> {
		if (!this.sandboxes.has(handle.sandboxId)) {
			throw new Error(`Unknown sandbox: ${handle.sandboxId}`);
		}

		await rm(handle.path, { recursive: true, force: true });
		this.sandboxes.delete(handle.sandboxId);
	}

	/** Check if a sandbox directory still exists. */
	async exists(handle: SandboxHandle): Promise<boolean> {
		try {
			await readdir(handle.path);
			return true;
		} catch {
			return false;
		}
	}
}
