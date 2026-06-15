/**
 * Sandbox adapter interface — sandboxed file system for agent sessions (D3).
 * @lore AK1: Renamed from workspace-adapter.ts. SandboxHandle (AK1 rename),
 * SandboxAdapter → SandboxAdapter.
 */

export interface SandboxHandle {
	readonly workspaceId: string;
	readonly path: string;
}

export interface ExecResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
}

export interface SandboxAdapter {
	spawn(baseDir: string): Promise<SandboxHandle>;
	exec(handle: SandboxHandle, command: string): Promise<ExecResult>;
	destroy(handle: SandboxHandle): Promise<void>;
}
