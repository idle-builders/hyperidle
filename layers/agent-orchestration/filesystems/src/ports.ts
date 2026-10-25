interface FilesystemsGitConfigInjection {
	readonly key: string;
	readonly value: string;
}

/** Minimal git-runner port: only the verb this package actually calls. */
interface FilesystemsGitRunner {
	lsRemote(
		url: string,
		opts?: { tokenConfig?: FilesystemsGitConfigInjection },
	): Promise<{ reachable: boolean; reason?: string }>;
}

export type FilesystemsGitRunnerFactory = (cwd: string) => FilesystemsGitRunner;

/** The live auth token hook used by the reachability probe. */
export interface FilesystemTokenResolver {
	resolveToken(connectionId: string): Promise<string | null>;
}
