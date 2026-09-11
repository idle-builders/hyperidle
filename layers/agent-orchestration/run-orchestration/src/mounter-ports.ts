/**
 * `filesystem-mounting` Service (agent-orchestration) — outbound
 * composition-boundary (Mechanism C) DI port.
 *
 * @lore AU26 F1 (§D-I): the mount engine relocated here from
 * `@hyperidle/filesystems` (a core-api Service). The git-runner port is
 * re-declared STRUCTURALLY rather than imported from the package it came from
 * — a Service never imports another Service's type, and the two now sit on
 * opposite sides of the Layer boundary. The concrete implementation both sides
 * use is the same one: `createGitRunner` from `@hyperidle/host-process` (AU26
 * A2), injected by the Application.
 */

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
	// @lore BA5 §6.3: `lsRemote` dropped from this mirror — this package never
	// calls it (only `clone`/`worktreeAdd`), and the real `GitRunner.lsRemote`
	// moved to a `{env, branch}` shape for Check (§7.2), which shares no
	// property with this port's still-`tokenConfig`-shaped `clone`. Re-add it
	// here, matching the real shape, the day this package needs it.
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
	currentBranch(): Promise<string | null>;
}

export type MountingGitRunnerFactory = (cwd: string) => MountingGitRunner;
