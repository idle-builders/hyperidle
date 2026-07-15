/**
 * Sandbox adapter interface — sandboxed file system for agent sessions (D3).
 * @lore AK1: Renamed from workspace-adapter.ts (AK1 vocabulary rename).
 * The run-unit type was previously named Workspace*; all identifiers now use Sandbox*.
 * workspaceId field renamed to sandboxId per AK1 plan §63.
 */

export interface SandboxHandle {
	readonly sandboxId: string;
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
