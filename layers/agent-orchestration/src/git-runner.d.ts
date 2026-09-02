/**
 * Optional per-request git config injected via environment variables.
 * Token never goes in argv or URL — only in the child env via GIT_CONFIG_*
 * (verified mechanism).
 *
 * @lore AO1 v2: GIT_CONFIG_COUNT/KEY_n/VALUE_n is the ONLY safe token path.
 * Putting tokens in the URL or `-c http.extraHeader=…` in argv leaks to ps/logs.
 */
interface GitConfigInjection {
    /** git config key, e.g. `http.https://github.com/.extraHeader` */
    key: string;
    /** git config value, e.g. `Authorization: Basic <base64>` */
    value: string;
}
interface GitRunner {
    /** Stage paths. When `paths` is empty the runner passes `-A`. */
    add(paths: readonly string[]): Promise<void>;
    /** Commit with an explicit author identity. Returns the new HEAD sha. */
    commit(message: string, authorName: string, authorEmail: string): Promise<string>;
    /** True when index == HEAD (equivalent to `git diff --cached --quiet HEAD`). */
    diffCached(): Promise<boolean>;
    /** True when `cwd` is inside a git worktree. Never throws. */
    revParseIsInsideWorkTree(): Promise<boolean>;
    /** List tracked files as relative paths (`git ls-files`). */
    lsFiles(): Promise<readonly string[]>;
    /**
     * Probe a remote's refs WITHOUT cloning. Reachability check.
     * exit 0 → { reachable: true }; non-zero → { reachable: false, reason }.
     * Token injected via GIT_CONFIG_COUNT/KEY_n/VALUE_n env — NEVER in URL or argv.
     *
     * @lore AO1 v2: This is the REAL reachability gate. The non-zero exit is
     * DATA (unreachable), not an exception. Never throws — always returns a result object.
     * Token-shape stderr is redacted before it enters the reason string.
     */
    lsRemote(url: string, opts?: {
        tokenConfig?: GitConfigInjection;
    }): Promise<{
        reachable: boolean;
        reason?: string;
    }>;
    /**
     * Shallow clone a remote URL into the runner's cwd (the session dir).
     * Token is injected via GIT_CONFIG_COUNT/KEY_n/VALUE_n env — never in URL or argv.
     *
     * @lore AO2: cwd = sandboxPath (the session working directory). Clone INTO `.`,
     * not into a subdirectory, so the agent sees the repo root at sandboxPath.
     */
    clone(url: string, branch: string, opts?: {
        depth?: number;
        tokenConfig?: GitConfigInjection;
    }): Promise<void>;
    /**
     * Bundle a named ref to a file path (shallow-safe named-ref bundle).
     *
     * @lore AO2: Named-ref bundles are shallow-safe (git ≥2.2). The ref must be
     * a full refspec for unambiguous unbundling.
     */
    bundle(bundlePath: string, ref: string): Promise<void>;
    /**
     * Add a worktree at worktreePath on the given branch.
     * Runs against the HOST REPO (runner cwd = host repo path).
     *
     * @lore AO2: createBranch=true creates a NEW branch from HEAD. Git refuses
     * two worktrees on the same branch — always use unique branch names.
     */
    worktreeAdd(worktreePath: string, branch: string, opts?: {
        createBranch?: boolean;
    }): Promise<void>;
    /**
     * Remove a worktree from the host repo's worktree list.
     *
     * @lore AO2: force=true removes even if the worktree has untracked/modified files.
     */
    worktreeRemove(worktreePath: string, opts?: {
        force?: boolean;
    }): Promise<void>;
    /**
     * Restore tracked files to their HEAD state in the INDEX (unstage modifications).
     * `git restore --staged -- <paths...>`
     *
     * @lore AO2 W-ENV: Uses the same spawn + allowlist env as every other runner
     * verb, eliminating env leak and shell-quoting fragility.
     */
    restoreStaged(paths: readonly string[]): Promise<void>;
    /**
     * Return the name of the currently checked-out branch, or `null` when the branch
     * cannot be resolved (detached HEAD, repo with no commits, or any git error).
     * Never throws.
     *
     * @lore AV1: Added for onboarding branch detection.
     */
    currentBranch(): Promise<string | null>;
}
export declare function createGitRunner(repoPath: string): GitRunner;
export type { GitConfigInjection, GitRunner };
//# sourceMappingURL=git-runner.d.ts.map