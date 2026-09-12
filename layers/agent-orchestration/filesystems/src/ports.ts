/**
 * Minimal git-runner port: only the 2 verbs this package actually calls
 * (`inspect-local-path.ts`).
 *
 * @lore BA5 §2.2/§12: `lsRemote` deleted with the reachability probe —
 * `checkFilesystem` (`@hyperidle/run-orchestration`) replaces it, against the
 * layer root's own full `GitRunner`, not this package's minimal port.
 */
interface FilesystemsGitRunner {
	revParseIsInsideWorkTree(): Promise<boolean>;
	currentBranch(): Promise<string | null>;
}

export type FilesystemsGitRunnerFactory = (cwd: string) => FilesystemsGitRunner;
