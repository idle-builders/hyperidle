interface FilesystemsGitConfigInjection {
	readonly key: string;
	readonly value: string;
}

interface FilesystemsGitRunner {
	add(paths: readonly string[]): Promise<void>;
	commit(message: string, authorName: string, authorEmail: string): Promise<string>;
	diffCached(): Promise<boolean>;
	revParseIsInsideWorkTree(): Promise<boolean>;
	lsFiles(): Promise<readonly string[]>;
	lsRemote(
		url: string,
		opts?: { tokenConfig?: FilesystemsGitConfigInjection },
	): Promise<{ reachable: boolean; reason?: string }>;
	clone(
		url: string,
		branch: string,
		opts?: { depth?: number; tokenConfig?: FilesystemsGitConfigInjection },
	): Promise<void>;
	bundle(bundlePath: string, ref: string): Promise<void>;
	worktreeAdd(
		worktreePath: string,
		branch: string,
		opts?: { createBranch?: boolean },
	): Promise<void>;
	worktreeRemove(worktreePath: string, opts?: { force?: boolean }): Promise<void>;
	restoreStaged(paths: readonly string[]): Promise<void>;
	currentBranch(): Promise<string | null>;
}

export type FilesystemsGitRunnerFactory = (cwd: string) => FilesystemsGitRunner;

/** The live auth token hook used by the reachability probe.
 *  Replaces the deleted FilesystemAuthResolver seam — only resolveToken was ever called. */
export interface FilesystemTokenResolver {
	resolveToken(connectionId: string): Promise<string | null>;
}
