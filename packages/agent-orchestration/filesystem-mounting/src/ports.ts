/**
 * `filesystem-mounting` Service (agent-orchestration) — outbound
 * composition-boundary (Mechanism C) DI port.
 *
 * @lore AU26 F1 (§D-I): the mount engine relocated here from
 * `@hyperidle/filesystems` (a core-api Service). The git-runner port is
 * re-declared STRUCTURALLY rather than imported from the package it came from
 * — a Service never imports another Service's type, and the two now sit on
 * opposite sides of the Layer boundary. The concrete implementation both sides
 * use is the same one: `createGitRunner` from `@hyperidle/shared/git` (AU26
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
	currentBranch(): Promise<string | null>;
}

export type MountingGitRunnerFactory = (cwd: string) => MountingGitRunner;
