/**
 * Git subprocess runner for the agent-orchestration layer.
 *
 * Moved here from the deleted `@hyperidle/host-process` package (AU44-b6).
 * The framework package existed because the runner was once shared across the
 * core-api/filesystems probe AND agent-orchestration. That sharing never
 * materialised — the filesystems probe now lives entirely inside
 * `layers/agent-orchestration/filesystems/` so there is exactly one owner.
 *
 * @lore N1: `node:child_process.spawn` is the canonical subprocess API.
 * @lore Every method is typed + whitelisted — we never forward user strings
 * straight into argv. The factory sets `GIT_TERMINAL_PROMPT=0` so an auth
 * failure errors immediately instead of hanging on an interactive password
 * prompt.
 */
import { spawn } from "node:child_process";
import { createLogger, type Logger } from "@hyperidle/diagnostics";
import { redactSecrets } from "./redact-secrets.js";

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
	 * Probe a remote. With no `branch`, a plain reachability check (any ref):
	 * `reachable` true/false, `reason` set on failure — the AO1 v2 shape,
	 * kept for the reachability probe.
	 * With `branch`, `git ls-remote --exit-code -- <url> refs/heads/<branch>`:
	 * `found: true` when the branch resolves, `branchMissing: true` on git's
	 * exit code 2 (the branch does not exist — the remote IS reachable), and
	 * on any other failure `authRequested: true` when stderr says git needed
	 * a login it did not have (`checkFilesystem` reads this to phrase its reason).
	 * Credential env goes in `opts.env` (GIT_CONFIG_ / GH_TOKEN) — never in the
	 * URL or argv. Never throws — always returns a result object.
	 *
	 * @lore BA5 §6.3: this is the REAL reachability gate. The non-zero exit is
	 * DATA (unreachable / branch missing), not an exception. Every reason
	 * string is redacted before it leaves the runner.
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
	/**
	 * `git fetch --prune origin` against the runner's cwd (a kept copy's
	 * `origin`). Credential env only — never a URL with userinfo.
	 */
	fetch(opts?: { env?: Record<string, string> }): Promise<void>;
	/** `git worktree prune` against the runner's cwd (a kept copy). */
	worktreePrune(): Promise<void>;
	/**
	 * `git rev-parse --verify --quiet <ref>^{commit}` against the runner's
	 * cwd. True when the ref resolves to a commit; never throws.
	 */
	verifyCommit(ref: string): Promise<boolean>;
	/**
	 * Full clone of a remote URL into `destination` (an absolute path,
	 * independent of the runner's own cwd — the destination does not exist yet,
	 * so it cannot be the bound cwd). `--no-checkout`: the kept copy backs
	 * worktrees, never a checkout of its own. Credential env only — never a
	 * URL with userinfo or a header in argv.
	 *
	 * @lore BA5 §6.3/§5.2: rewritten from the AO2 single-session shallow clone
	 * (branch + depth, into the runner's own cwd) — a kept copy is cloned once,
	 * full history so a pushed branch has one, and every session after the
	 * first only `fetch`es it.
	 */
	clone(url: string, destination: string, opts?: { env?: Record<string, string> }): Promise<void>;
	/**
	 * Bundle a named ref to a file path (shallow-safe named-ref bundle).
	 *
	 * @lore AO2: Named-ref bundles are shallow-safe (git ≥2.2). The ref must be
	 * a full refspec for unambiguous unbundling.
	 */
	bundle(bundlePath: string, ref: string): Promise<void>;
	/**
	 * Add a worktree at `worktreePath`, on a NEW branch `newBranch`, starting
	 * from `startPoint`. Runs against the kept copy (runner cwd = kept copy
	 * path). Always creates the branch — a mounted worktree is always a new
	 * branch off the filesystem's configured branch, never a checkout
	 * of an existing one.
	 *
	 * @lore BA5 §6.3: rewritten from the AO2 shape (optional `createBranch`,
	 * branching off HEAD) — the new shape always creates `newBranch` and always
	 * names its own `startPoint` explicitly, rather than defaulting to HEAD.
	 */
	worktreeAdd(worktreePath: string, newBranch: string, startPoint: string): Promise<void>;
	/**
	 * Remove a worktree from the host repo's worktree list.
	 *
	 * @lore AO2: force=true removes even if the worktree has untracked/modified files.
	 */
	worktreeRemove(worktreePath: string, opts?: { force?: boolean }): Promise<void>;
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

interface SpawnResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	/** Set when `spawn` itself failed with ENOENT — git is not on PATH. */
	spawnErrorCode?: string;
}

const DEFAULT_LOCAL_MS = 5_000;
const DEFAULT_PUSH_MS = 30_000;
const DEFAULT_WORKTREE_MS = 120_000;
/** @lore BA5 §5.2: a kept copy's first clone is full history, not shallow — give it room. */
const DEFAULT_CLONE_MS = 600_000;
/** @lore BA5 §5.2: every mount after the first only fetches — longer than a local op, shorter than a fresh clone. */
const DEFAULT_FETCH_MS = 120_000;

/** The `GH_TOKEN` value of a call's env, if any — the one secret the runner ever carries. */
function secretsFromEnv(env: Record<string, string> | undefined): string[] {
	return env?.GH_TOKEN ? [env.GH_TOKEN] : [];
}

function redactArgsForLog(args: readonly string[], secrets: readonly string[]): string[] {
	return args.map((arg) => redactSecrets(arg, secrets));
}

/**
 * True when git's own stderr says the remote wanted a login it did not get —
 * "no credential at all" and "a credential that was rejected" both count, the
 * two shapes this was verified against a real github.com-shaped
 * server (git 2.39.5): `could not read Username` (no helper answered) and
 * `Authentication failed` (the helper's answer was wrong).
 */
function looksLikeAuthRequested(stderr: string): boolean {
	return /could not read username|authentication failed/i.test(stderr);
}

/**
 * Minimal env allow-list. Intentionally drops `HYPERIDLE_API_KEY` and other secrets.
 *
 * @lore Security review [high] `git-export-runner.ts:64` — inheriting
 * `process.env` exposed credential.helper, http.proxy, and HYPERIDLE_API_KEY to child git.
 * Now we compose a minimal env from PATH + HOME + a small allow-list plus hardening vars.
 *
 * @lore BA5 §6.3: `GIT_CONFIG_NOSYSTEM`/`GIT_CONFIG_GLOBAL=/dev/null` are gone —
 * the plan relies on the person's OWN git setup (private GitLab, their
 * credential helpers, a corporate proxy or CA). Apple's git ships
 * `credential.helper=osxkeychain` in the system config; nulling both configs
 * silently broke every one of those for filesystems that need them.
 * `GIT_TERMINAL_PROMPT=0` / `GIT_ASKPASS=/bin/false` stay — a missing
 * credential must fail fast, never hang on an interactive prompt.
 */
function buildGitEnv(): Record<string, string> {
	const allowed = [
		"PATH",
		"HOME",
		"USER",
		"LOGNAME",
		"LANG",
		"LC_ALL",
		"LC_CTYPE",
		"TZ",
		"TMPDIR",
		"SSH_AUTH_SOCK",
		"SSH_AGENT_PID",
	];
	const env: Record<string, string> = {};
	for (const k of allowed) {
		const v = process.env[k];
		if (typeof v === "string" && v.length > 0) env[k] = v;
	}
	env.GIT_TERMINAL_PROMPT = "0";
	env.GIT_ASKPASS = "/bin/false";
	env.GIT_OPTIONAL_LOCKS = "0";
	return env;
}

async function spawnGit(
	args: readonly string[],
	cwd: string,
	timeoutMs: number,
	logger: Logger,
	extraEnv?: Record<string, string>,
): Promise<SpawnResult> {
	const secrets = secretsFromEnv(extraEnv);
	logger.info("git spawn", { args: redactArgsForLog(args, secrets), cwd, timeoutMs });
	return new Promise<SpawnResult>((resolve) => {
		const proc = spawn("git", args, {
			cwd,
			env: { ...buildGitEnv(), ...extraEnv },
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		proc.stdout?.setEncoding("utf-8");
		proc.stderr?.setEncoding("utf-8");
		proc.stdout?.on("data", (chunk: string) => {
			stdout += chunk;
		});
		proc.stderr?.on("data", (chunk: string) => {
			stderr += chunk;
		});
		let killed = false;
		const timer = setTimeout(() => {
			killed = true;
			proc.kill("SIGTERM");
			setTimeout(() => {
				try {
					proc.kill("SIGKILL");
				} catch {
					/* gone */
				}
			}, 500);
		}, timeoutMs);
		proc.on("error", (err: NodeJS.ErrnoException) => {
			clearTimeout(timer);
			resolve({
				stdout,
				stderr: stderr + String(err),
				exitCode: -1,
				spawnErrorCode: err.code,
			});
		});
		proc.on("close", (code) => {
			clearTimeout(timer);
			const exit = typeof code === "number" ? code : killed ? -2 : -1;
			resolve({ stdout, stderr, exitCode: exit });
		});
	});
}

export function createGitRunner(repoPath: string): GitRunner {
	const logger = createLogger({ pkg: "git-runner" });
	const localMs = DEFAULT_LOCAL_MS;
	const longLocalMs = DEFAULT_WORKTREE_MS;
	const pushMs = DEFAULT_PUSH_MS;
	const cloneMs = DEFAULT_CLONE_MS;
	const fetchMs = DEFAULT_FETCH_MS;

	function run(
		args: readonly string[],
		timeoutMs: number,
		extraEnv?: Record<string, string>,
	): Promise<SpawnResult> {
		return spawnGit(args, repoPath, timeoutMs, logger, extraEnv);
	}

	async function runExpectOk(
		args: readonly string[],
		timeoutMs: number,
		extraEnv?: Record<string, string>,
	): Promise<SpawnResult> {
		const result = await run(args, timeoutMs, extraEnv);
		if (result.spawnErrorCode === "ENOENT") {
			throw new Error("git is not installed");
		}
		if (result.exitCode !== 0) {
			const secrets = secretsFromEnv(extraEnv);
			const tail = result.stderr.trim() || result.stdout.trim();
			throw new Error(
				`git ${redactArgsForLog(args, secrets).join(" ")} failed (${result.exitCode}): ${redactSecrets(tail, secrets)}`,
			);
		}
		return result;
	}

	return {
		async add(paths: readonly string[]): Promise<void> {
			const args = paths.length === 0 ? ["add", "-A"] : ["add", "--", ...paths];
			await runExpectOk(args, localMs);
		},
		async commit(message: string, authorName: string, authorEmail: string): Promise<string> {
			await runExpectOk(
				[
					"-c",
					`user.name=${authorName}`,
					"-c",
					`user.email=${authorEmail}`,
					"commit",
					"-m",
					message,
				],
				localMs,
			);
			const head = await runExpectOk(["rev-parse", "HEAD"], localMs);
			return head.stdout.trim();
		},
		async diffCached(): Promise<boolean> {
			const hasHead = await run(["rev-parse", "--verify", "HEAD"], localMs);
			if (hasHead.exitCode !== 0) {
				const ls = await run(["ls-files", "--cached"], localMs);
				return ls.exitCode === 0 && ls.stdout.trim().length === 0;
			}
			const result = await run(["diff", "--cached", "--quiet", "HEAD"], localMs);
			return result.exitCode === 0;
		},
		async revParseIsInsideWorkTree(): Promise<boolean> {
			const result = await run(["rev-parse", "--is-inside-work-tree"], localMs);
			return result.exitCode === 0 && result.stdout.trim() === "true";
		},
		async lsFiles(): Promise<readonly string[]> {
			const r = await runExpectOk(["ls-files", "-z"], localMs);
			if (r.stdout.length === 0) return [];
			return r.stdout.split("\0").filter((p) => p.length > 0);
		},
		async lsRemote(
			url: string,
			opts?: { env?: Record<string, string>; branch?: string },
		): Promise<{
			reachable: boolean;
			reason?: string;
			found?: boolean;
			branchMissing?: boolean;
			authRequested?: boolean;
		}> {
			const extraEnv = opts?.env ?? {};
			const secrets = secretsFromEnv(extraEnv);
			const args = opts?.branch
				? ["ls-remote", "--exit-code", "--", url, `refs/heads/${opts.branch}`]
				: ["ls-remote", "--quiet", "--", url];
			let result: SpawnResult;
			try {
				result = await run(args, pushMs, extraEnv);
			} catch (err) {
				const reason = err instanceof Error ? err.message : String(err);
				return { reachable: false, reason: redactSecrets(reason, secrets) };
			}
			if (result.spawnErrorCode === "ENOENT") {
				return { reachable: false, reason: "git is not installed" };
			}
			if (result.exitCode === 0) {
				return { reachable: true, found: true };
			}
			if (opts?.branch && result.exitCode === 2) {
				return { reachable: true, found: false, branchMissing: true };
			}
			const raw = (result.stderr.trim() || result.stdout.trim()).slice(0, 300);
			return {
				reachable: false,
				reason: redactSecrets(raw, secrets),
				authRequested: looksLikeAuthRequested(result.stderr),
			};
		},
		async clone(
			url: string,
			destination: string,
			opts?: { env?: Record<string, string> },
		): Promise<void> {
			if (destination.startsWith("-"))
				throw new Error("git clone: destination must not start with '-'");
			const args: string[] = ["clone", "--no-checkout", "--", url, destination];
			const extraEnv = opts?.env ?? {};
			const result = await run(args, cloneMs, extraEnv);
			if (result.spawnErrorCode === "ENOENT") {
				throw new Error("git is not installed");
			}
			if (result.exitCode !== 0) {
				const tail = redactSecrets(
					result.stderr.trim() || result.stdout.trim(),
					secretsFromEnv(extraEnv),
				);
				throw new Error(`git clone failed (${result.exitCode}): ${tail}`);
			}
		},
		async fetch(opts?: { env?: Record<string, string> }): Promise<void> {
			await runExpectOk(["fetch", "--prune", "origin"], fetchMs, opts?.env);
		},
		async worktreePrune(): Promise<void> {
			await runExpectOk(["worktree", "prune"], longLocalMs);
		},
		async verifyCommit(ref: string): Promise<boolean> {
			if (ref.startsWith("-")) return false;
			const result = await run(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], localMs);
			return result.exitCode === 0;
		},
		async bundle(bundlePath: string, ref: string): Promise<void> {
			if (bundlePath.startsWith("-") || ref.startsWith("-"))
				throw new Error("git bundle: bundlePath and ref must not start with '-'");
			await runExpectOk(["bundle", "create", bundlePath, ref], longLocalMs);
		},
		async worktreeAdd(worktreePath: string, newBranch: string, startPoint: string): Promise<void> {
			if (worktreePath.startsWith("-") || newBranch.startsWith("-") || startPoint.startsWith("-"))
				throw new Error("git worktree add: args must not start with '-'");
			// @lore worktree-hook-timeout: `git worktree add` runs the post-checkout hook.
			await runExpectOk(
				["worktree", "add", "-b", newBranch, "--", worktreePath, startPoint],
				longLocalMs,
			);
		},
		async worktreeRemove(worktreePath: string, opts?: { force?: boolean }): Promise<void> {
			if (worktreePath.startsWith("-"))
				throw new Error("git worktree remove: path must not start with '-'");
			const args: string[] = ["worktree", "remove"];
			if (opts?.force) args.push("--force");
			args.push("--", worktreePath);
			await runExpectOk(args, longLocalMs);
		},
		async restoreStaged(paths: readonly string[]): Promise<void> {
			if (paths.length === 0) return;
			for (const p of paths) {
				if (p.startsWith("-"))
					throw new Error(`git restore --staged: path must not start with '-' (got: '${p}')`);
			}
			await runExpectOk(["restore", "--staged", "--", ...paths], localMs);
		},
		async currentBranch(): Promise<string | null> {
			try {
				const result = await run(["rev-parse", "--abbrev-ref", "HEAD"], localMs);
				if (result.exitCode !== 0) return null;
				const branch = result.stdout.trim();
				if (branch === "" || branch === "HEAD") return null;
				return branch;
			} catch {
				return null;
			}
		},
	};
}

export type { GitRunner };
