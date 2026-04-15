/** Workspace adapter interface — sandboxed file system for agent sessions (D3). */

export interface WorkspaceHandle {
	readonly workspaceId: string;
	readonly path: string;
}

export interface ExecResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
}

export interface WorkspaceAdapter {
	spawn(baseDir: string): Promise<WorkspaceHandle>;
	exec(handle: WorkspaceHandle, command: string): Promise<ExecResult>;
	destroy(handle: WorkspaceHandle): Promise<void>;
}
