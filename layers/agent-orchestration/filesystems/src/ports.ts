/** Minimal git-runner port: only the 3 verbs this package actually calls. */
interface FilesystemsGitRunner {
	revParseIsInsideWorkTree(): Promise<boolean>;
	lsRemote(
		url: string,
		opts?: { env?: Record<string, string> },
	): Promise<{ reachable: boolean; reason?: string }>;
	currentBranch(): Promise<string | null>;
}

export type FilesystemsGitRunnerFactory = (cwd: string) => FilesystemsGitRunner;

/** The live auth token hook used by the reachability probe.
 *  Replaces the deleted FilesystemAuthResolver seam — only resolveToken was ever called. */
export interface FilesystemTokenResolver {
	resolveToken(connectionId: string): Promise<string | null>;
}
