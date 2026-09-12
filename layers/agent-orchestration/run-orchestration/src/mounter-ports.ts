/**
 * `filesystem-mounting` Service (agent-orchestration) — outbound
 * composition-boundary (Mechanism C) DI port.
 *
 * @lore AU26 F1 (§D-I): the mount engine relocated here from
 * `@hyperidle/filesystems` (a core-api Service). The git-runner port is
 * re-declared STRUCTURALLY rather than imported from the package it came from
 * — a Service never imports another Service's type, and the two now sit on
 * opposite sides of the Layer boundary. The concrete implementation both sides
 * use is the same one: `createGitRunner` from the layer root's own
 * `git-runner.ts`, injected by the Application.
 *
 * @lore BA5 §6.3: narrowed to exactly the verbs `GitRepositoryAdapter`
 * (`mounter.ts`) calls — `add`/`commit`/`diffCached`/`lsFiles`/`restoreStaged`
 * were never called by anything in this package (a relic from when this port
 * mirrored the FULL real `GitRunner` shape) and are dropped rather than
 * carried forward unused. `clone`/`worktreeAdd` are reshaped to match the real
 * runner's post-§6.3 signatures (env-based credentials, an explicit new
 * branch + start point).
 *
 * @lore BA5 §2.5/§14.2 (L4): `revParseIsInsideWorkTree` and `lsRemote`
 * re-added — `checkFilesystem` (`filesystem-check.ts`) needs both (a local
 * git check and the remote reachability gate, §7.2) and is the first caller
 * in this package that does. `bundle`/`restoreStaged` still have no caller
 * here at all and stay dropped.
 */

interface MountingGitRunner {
	/** True when the runner's cwd is inside a git work tree. Never throws. */
	revParseIsInsideWorkTree(): Promise<boolean>;
	/** Full clone into `destination` — see the real `GitRunner.clone`'s doc comment. */
	clone(url: string, destination: string, opts?: { env?: Record<string, string> }): Promise<void>;
	/** `git fetch --prune origin` against the runner's cwd (a kept copy). */
	fetch(opts?: { env?: Record<string, string> }): Promise<void>;
	/** `git worktree prune` against the runner's cwd (a kept copy). */
	worktreePrune(): Promise<void>;
	/** New worktree at `worktreePath`, on new branch `newBranch`, off `startPoint`. */
	worktreeAdd(worktreePath: string, newBranch: string, startPoint: string): Promise<void>;
	worktreeRemove(worktreePath: string, opts?: { force?: boolean }): Promise<void>;
	/** `git rev-parse --verify --quiet <ref>^{commit}` against the runner's cwd. Never throws. */
	verifyCommit(ref: string): Promise<boolean>;
	/** The currently checked-out branch name, or `null` when it cannot be resolved. Never throws. */
	currentBranch(): Promise<string | null>;
	/**
	 * `git ls-remote --exit-code -- <url> refs/heads/<branch>` — see the real
	 * `GitRunner.lsRemote`'s doc comment for the full result shape. Never
	 * throws.
	 */
	lsRemote(
		url: string,
		opts?: { env?: Record<string, string>; branch?: string },
	): Promise<{
		reachable: boolean;
		reason?: string;
		found?: boolean;
		branchMissing?: boolean;
		authRequested?: boolean;
	}>;
}

export type MountingGitRunnerFactory = (cwd: string) => MountingGitRunner;
