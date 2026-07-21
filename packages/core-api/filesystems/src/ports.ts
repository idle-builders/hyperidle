/**
 * `filesystems` Service (core-api) — outbound composition-boundary (Mechanism C)
 * DI ports.
 *
 * @lore AU19 Increment 2b — original port wiring documented in this file's
 * prior version. `FilesystemsGitRunner` / `FilesystemsGitConfigInjection` are
 * now INTERNAL (unexported) — callers pass structurally-compatible objects
 * without importing the named interfaces. `FilesystemsGitRunnerFactory` and
 * `FilesystemsServiceConnectionResolver` remain public: they are the wiring
 * seams that the composition root closes over.
 *
 * @lore AU20 R-filesystems: `FilesystemsGitRunner` and
 * `FilesystemsGitConfigInjection` removed from public surface. Intra-package
 * consumers (git-clone-adapter.ts, inspect-local-path.ts) obtain the runner
 * shape structurally via `ReturnType<FilesystemsGitRunnerFactory>` or inline
 * type literals. The export reduction is deliberate (census target).
 */

// ---------------------------------------------------------------------------
// git-export — internal runner types + public factory (Mechanism C)
// ---------------------------------------------------------------------------

/**
 * Token config for git's `GIT_CONFIG_COUNT`/`KEY_n`/`VALUE_n` env-injection
 * path — never argv/URL. Internal type used within this package only.
 */
interface FilesystemsGitConfigInjection {
	readonly key: string;
	readonly value: string;
}

/**
 * Narrower structural mirror of `git-export-runner.ts`'s `GitRunner` —
 * exactly the 12 verbs `filesystems`' adapters/probes call today. Internal
 * to this package; the public seam is `FilesystemsGitRunnerFactory`.
 */
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

/** Factory for a `FilesystemsGitRunner` bound to a specific cwd (Mechanism C). */
export type FilesystemsGitRunnerFactory = (cwd: string) => FilesystemsGitRunner;

// ---------------------------------------------------------------------------
// connections — FilesystemsServiceConnectionResolver (Mechanism C)
// ---------------------------------------------------------------------------

/**
 * Port for `connections`' per-user held-token resolver.
 * Narrowed to the one method the adapter/probe uses.
 */
export interface FilesystemsServiceConnectionResolver {
	resolve(userId: string, connectionId: string): Promise<string | null>;
}
