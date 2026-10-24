interface MountingGitConfigInjection {
	readonly key: string;
	readonly value: string;
}

interface MountingGitRunner {
	add(paths: readonly string[]): Promise<void>;
	commit(message: string, authorName: string, authorEmail: string): Promise<string>;
	diffCached(): Promise<boolean>;
	revParseIsInsideWorkTree(): Promise<boolean>;
	lsFiles(): Promise<readonly string[]>;
	lsRemote(
		url: string,
		opts?: { tokenConfig?: MountingGitConfigInjection },
	): Promise<{ reachable: boolean; reason?: string }>;
	clone(
		url: string,
		branch: string,
		opts?: { depth?: number; tokenConfig?: MountingGitConfigInjection },
	): Promise<void>;
	bundle(bundlePath: string, ref: string): Promise<void>;
	worktreeAdd(
		worktreePath: string,
		branch: string,
		opts?: { createBranch?: boolean },
	): Promise<void>;
	worktreeRemove(worktreePath: string, opts?: { force?: boolean }): Promise<void>;
	restoreStaged(paths: readonly string[]): Promise<void>;
}

export type MountingGitRunnerFactory = (cwd: string) => MountingGitRunner;
