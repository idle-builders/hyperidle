/**
 * The git subprocess runner.
 *
 * @lore AU26 A2: moved out of `packages/core-api/git-export` and published as the
 * NODE-ONLY subpath `@hyperidle/shared/git` — deliberately absent from the main
 * barrel (it imports `node:child_process`, which would break the browser bundle).
 * Same idiom as the shipped `@hyperidle/shared/net`.
 *
 * Why it had to leave: `git-export` is two things in one package — a dead exporter
 * (deleted in C1) and this live runner, whose consumers end up on BOTH sides of the
 * Layer boundary after this WP. The mount engine moves to `agent-orchestration`
 * while the reachability/branch probe stays in `core-api/filesystems`, and neither
 * may import the other's Layer. `shared` is the one package both may import.
 */
import { spawn } from "node:child_process";
import { createLogger, type Logger } from "../logger.js";

/**
 * Narrow interface over the git subcommands the export and filesystem products need.
 * Production wires `createGitRunner()` which spawns native `git`.
 *
 * @lore Every method is typed + whitelisted — we never forward user strings
 * straight into argv. The factory sets `GIT_TERMINAL_PROMPT=0` so an auth
 * failure errors immediately instead of hanging on an interactive password
 * prompt (see docs/plans/H1-plan.md §7).
 *
 * @lore N1: `node:child_process.spawn` is the canonical subprocess API.
 * Both Bun and Node execute the same code path — Bun provides the
 * Node compatibility shim. No runtime-specific branching needed.
 */
/**
 * Optional per-request git config injected via environment variables.
 * Token never goes in argv or URL — only in the child env via GIT_CONFIG_*
 * (verified mechanism; see plans/AO1/architecture.md §v2·2).
 *
 * @lore AO1 v2: GIT_CONFIG_COUNT/KEY_n/VALUE_n is the ONLY safe token path.
 * Putting tokens in the URL or `-c http.extraHeader=…` in argv leaks to ps/logs.
 * The env-var path is invisible to ps and is stripped from child env inheritance.
 */
export interface GitConfigInjection {
	/** git config key, e.g. `http.https://github.com/.extraHeader` */
	key: string;
	/** git config value, e.g. `Authorization: Basic <base64>` */
	value: string;
}

export interface GitRunner {
	/** Initialize a new repo. Uses `-b <branch>` so the default branch is set correctly. */
	init(branch: string): Promise<void>;
	/** Stage paths. When `paths` is empty the runner passes `-A`. */
	add(paths: readonly string[]): Promise<void>;
	/** Commit with an explicit author identity. Returns the new HEAD sha. */
	commit(message: string, authorName: string, authorEmail: string): Promise<string>;
	/** Push to a named remote and branch. Sets upstream on first push. */
	push(remote: string, branch: string): Promise<void>;
	/** True when index == HEAD (equivalent to `git diff --cached --quiet HEAD`). */
	diffCached(): Promise<boolean>;
	/** True when `cwd` is inside a git worktree. Never throws. */
	revParseIsInsideWorkTree(): Promise<boolean>;
	/** `git config --local <key> <value>`. */
	configSet(key: string, value: string): Promise<void>;
	/** `git remote add <name> <url>`. */
	remoteAdd(name: string, url: string): Promise<void>;
	/** List tracked files as relative paths (`git ls-files`). */
	lsFiles(): Promise<readonly string[]>;
	/**
	 * Probe a remote's refs WITHOUT cloning. Reachability check.
	 * exit 0 → { reachable: true }; non-zero → { reachable: false, reason }.
	 * Token injected via GIT_CONFIG_COUNT/KEY_n/VALUE_n env — NEVER in URL or argv.
	 * Uses the push timeout class (30s default) for the network round-trip.
	 *
	 * @lore AO1 v2: This is the REAL reachability gate. The non-zero exit is
	 * DATA (unreachable), not an exception. Never throws — always returns a result object.
	 * Token-shape stderr is redacted before it enters the reason string.
	 */
	lsRemote(
		url: string,
		opts?: { tokenConfig?: GitConfigInjection },
	): Promise<{ reachable: boolean; reason?: string }>;
	// ── AO2 inbound-git verbs ─────────────────────────────────────────────────
	/**
	 * Shallow clone a remote URL into the runner's cwd (the session dir).
	 * `git clone --depth N --single-branch --branch <branch> -- <url> .`
	 * Token is injected via GIT_CONFIG_COUNT/KEY_n/VALUE_n env — never in URL or argv.
	 *
	 * @lore AO2: cwd = sandboxPath (the session working directory). Clone INTO `.`,
	 * not into a subdirectory, so the agent sees the repo root at sandboxPath.
	 * Token path: opts.tokenConfig → GIT_CONFIG_KEY_n/VALUE_n (same as lsRemote).
	 */
	clone(
		url: string,
		branch: string,
		opts?: { depth?: number; tokenConfig?: GitConfigInjection },
	): Promise<void>;
	/**
	 * Bundle a named ref to a file path (shallow-safe named-ref bundle).
	 * `git bundle create <bundlePath> <ref>`
	 * The bundle is the AO3-portable artifact for a captured session.
	 *
	 * @lore AO2: Named-ref bundles are shallow-safe (git ≥2.2). The ref must be
	 * a full refspec (e.g. "refs/heads/agent/sess-123") for unambiguous unbundling.
	 */
	bundle(bundlePath: string, ref: string): Promise<void>;
	/**
	 * Add a worktree at worktreePath on the given branch.
	 * Runs against the HOST REPO (runner cwd = host repo path).
	 * `git worktree add [-b <branch>] -- <worktreePath> [HEAD]`
	 *
	 * @lore AO2: createBranch=true creates a NEW branch from HEAD (use for fresh
	 * agent sessions). Without createBranch, the branch must already exist in the
	 * repo. Git refuses two worktrees on the same branch — always use unique branch
	 * names (e.g. `agent/<sessionId>`).
	 */
	worktreeAdd(
		worktreePath: string,
		branch: string,
		opts?: { createBranch?: boolean },
	): Promise<void>;
	/**
	 * Remove a worktree from the host repo's worktree list.
	 * `git worktree remove [--force] -- <worktreePath>`
	 *
	 * @lore AO2: Runs after bundle (capture-back) to clean up the dangling worktree.
	 * force=true removes even if the worktree has untracked/modified files (the
	 * bundle already captured authored changes).
	 */
	worktreeRemove(worktreePath: string, opts?: { force?: boolean }): Promise<void>;
	/**
	 * Restore tracked files to their HEAD state in the INDEX (unstage modifications).
	 * `git restore --staged -- <paths...>`
	 *
	 * Equivalent to the old `execSync("git restore --staged -- ...")` in git-worktree-adapter.ts
	 * but uses spawn + buildGitEnv so the full process.env (including HYPERIDLE_API_KEY and
	 * credential helpers) is NOT inherited. Requires git ≥2.23.
	 *
	 * @lore AO2 W-ENV: The old execSync path re-inherited process.env which buildGitEnv
	 * exists to strip. This verb uses the same spawn + allowlist env as every other runner
	 * verb, eliminating the env leak and the JSON.stringify shell-quoting fragility.
	 */
	restoreStaged(paths: readonly string[]): Promise<void>;
	/**
	 * Return the name of the currently checked-out branch, or `null` when the branch
	 * cannot be resolved (detached HEAD, repo with no commits, or any git error).
	 * `git rev-parse --abbrev-ref HEAD` — exits 0 with "HEAD" on detached HEAD.
	 * Never throws.
	 *
	 * @lore AV1: Added for onboarding branch detection. Reuses the existing
	 * audited spawn/env path (no parallel execFile). Returns null for detached /
	 * no-commits so callers can fall back to doc_set instead of 400'ing on empty branch.
	 */
	currentBranch(): Promise<string | null>;
}

export interface CreateGitRunnerOptions {
	/** Override process timeouts in milliseconds. */
	timeouts?: {
		localMs?: number;
		pushMs?: number;
	};
	/** Inject a logger — defaults to the @hyperidle/shared logger. */
	logger?: Logger;
}

interface SpawnResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

const DEFAULT_LOCAL_MS = 5_000;
const DEFAULT_PUSH_MS = 30_000;

/**
 * Strip credentials from a URL-like argv value before logging.
 * - `https://user:token@host/repo.git` -> `https://host/repo.git`
 * - SSH/SCP-style values with `user@host:path` are returned unchanged.
 */
function redactArg(arg: string): string {
	if (/^(https?|ssh|git|file):\/\//i.test(arg)) {
		try {
			const u = new URL(arg);
			if (u.username || u.password) {
				u.username = "";
				u.password = "";
				return u.toString();
			}
		} catch {
			// fall through to token-shape scrub below
		}
	}
	// Token-shape scrub: 20+ char hex or ghp_/gho_ tokens.
	return arg.replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, "[REDACTED]");
}

function redactArgs(args: readonly string[]): string[] {
	return args.map(redactArg);
}

/**
 * Minimal env allow-list. We intentionally drop `HYPERIDLE_API_KEY` and
 * any other secrets that leaked into the server process env. `GIT_CONFIG_NOSYSTEM`
 * prevents `/etc/gitconfig` from pulling in operator-surprising helpers;
 * `GIT_ASKPASS=/bin/false` fails closed on a credential prompt.
 *
 * When `extraConfigs` are provided, injects GIT_CONFIG_COUNT/KEY_n/VALUE_n
 * so a token reaches git without touching argv or URL (AO1 v2·2 verified path).
 *
 * @lore Security review [high] `git-export-runner.ts:64` — inheriting
 * `process.env` exposed credential.helper, http.proxy, core.sshCommand,
 * and our own `HYPERIDLE_API_KEY` to child git. Now we compose a minimal
 * env from PATH + HOME + a small allow-list plus explicit hardening vars.
 *
 * @lore AO1 v2: GIT_CONFIG_COUNT/KEY_n/VALUE_n is the safe env-injection
 * path for auth tokens. Token never in argv; never leaks to ps or logs.
 */
function buildGitEnv(extraConfigs?: readonly GitConfigInjection[]): Record<string, string> {
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
	env.GIT_CONFIG_NOSYSTEM = "1";
	env.GIT_CONFIG_GLOBAL = "/dev/null";

	// Inject extra git config entries via env (token-safe path — never in argv).
	if (extraConfigs && extraConfigs.length > 0) {
		env.GIT_CONFIG_COUNT = String(extraConfigs.length);
		for (let i = 0; i < extraConfigs.length; i++) {
			const cfg = extraConfigs[i];
			if (cfg) {
				env[`GIT_CONFIG_KEY_${i}`] = cfg.key;
				env[`GIT_CONFIG_VALUE_${i}`] = cfg.value;
			}
		}
	}

	return env;
}

/**
 * Spawn `git` with a fixed cwd and deterministic env. Non-zero exit is caller's
 * responsibility — the wrapper just reports what happened.
 */
async function spawnGit(
	args: readonly string[],
	cwd: string,
	timeoutMs: number,
	logger: Logger,
	extraEnv?: Record<string, string>,
): Promise<SpawnResult> {
	logger.debug("git spawn", { args: redactArgs(args), cwd, timeoutMs });
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
			// Escalate if SIGTERM is ignored.
			setTimeout(() => {
				try {
					proc.kill("SIGKILL");
				} catch {
					// process is already gone
				}
			}, 500);
		}, timeoutMs);

		proc.on("error", (err) => {
			clearTimeout(timer);
			resolve({ stdout, stderr: stderr + String(err), exitCode: -1 });
		});
		proc.on("close", (code) => {
			clearTimeout(timer);
			const exit = typeof code === "number" ? code : killed ? -2 : -1;
			resolve({ stdout, stderr, exitCode: exit });
		});
	});
}

/**
 * Build a production GitRunner bound to `repoPath`. Non-zero exits throw with
 * the captured stderr so the orchestrator can classify the failure. Errors
 * have credentials redacted so we never leak tokens to the route response.
 */
export function createGitRunner(repoPath: string, opts?: CreateGitRunnerOptions): GitRunner {
	const logger = opts?.logger ?? createLogger({ pkg: "git-export" });
	const localMs = opts?.timeouts?.localMs ?? DEFAULT_LOCAL_MS;
	const pushMs = opts?.timeouts?.pushMs ?? DEFAULT_PUSH_MS;

	function run(
		args: readonly string[],
		timeoutMs: number,
		extraEnv?: Record<string, string>,
	): Promise<SpawnResult> {
		return spawnGit(args, repoPath, timeoutMs, logger, extraEnv);
	}

	async function runExpectOk(args: readonly string[], timeoutMs: number): Promise<SpawnResult> {
		const result = await run(args, timeoutMs);
		if (result.exitCode !== 0) {
			const redactedArgs = redactArgs(args).join(" ");
			const tail = result.stderr.trim() || result.stdout.trim();
			throw new Error(`git ${redactedArgs} failed (${result.exitCode}): ${redactArg(tail)}`);
		}
		return result;
	}

	return {
		async init(branch: string): Promise<void> {
			await runExpectOk(["init", "-b", branch], localMs);
		},
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
		async push(remote: string, branch: string): Promise<void> {
			// `--` forces git to treat `branch` as a refspec even if it starts
			// oddly. `sanitizeBranch` already rejects leading `-`, but this is
			// defense-in-depth against a future sanitizer regression.
			await runExpectOk(["push", "--set-upstream", remote, "--", branch], pushMs);
		},
		async diffCached(): Promise<boolean> {
			// @lore `git diff --cached --quiet HEAD` compares the index to
			// HEAD (ignoring the worktree). We run this AFTER `git add -A`
			// so new/changed files are in the index — that's the only check
			// that's consistent across first-run, subsequent-run, and
			// newly-tracked files. Exit 0 = clean, 1 = changes present.
			const hasHead = await run(["rev-parse", "--verify", "HEAD"], localMs);
			if (hasHead.exitCode !== 0) {
				// No HEAD yet. If the index is empty too, clean; otherwise dirty.
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
		async configSet(key: string, value: string): Promise<void> {
			await runExpectOk(["config", "--local", "--", key, value], localMs);
		},
		async remoteAdd(name: string, url: string): Promise<void> {
			await runExpectOk(["remote", "add", "--", name, url], localMs);
		},
		async lsFiles(): Promise<readonly string[]> {
			const r = await runExpectOk(["ls-files", "-z"], localMs);
			if (r.stdout.length === 0) return [];
			const parts = r.stdout.split("\0").filter((p) => p.length > 0);
			return parts;
		},
		async lsRemote(
			url: string,
			opts?: { tokenConfig?: GitConfigInjection },
		): Promise<{ reachable: boolean; reason?: string }> {
			// Build env: start from base hardened env, inject token config if present.
			// Token NEVER in argv or URL — only in GIT_CONFIG_COUNT/KEY_n/VALUE_n env vars.
			// @lore AO1 v2: Non-zero exit is DATA (unreachable), not an exception.
			// The args array only contains the URL (already credential-free).
			const extraEnv: Record<string, string> = {};
			if (opts?.tokenConfig) {
				extraEnv.GIT_CONFIG_COUNT = "1";
				extraEnv.GIT_CONFIG_KEY_0 = opts.tokenConfig.key;
				extraEnv.GIT_CONFIG_VALUE_0 = opts.tokenConfig.value;
			}
			try {
				// "--" prevents url from being treated as an option if it starts oddly.
				// "--quiet" suppresses non-fatal warnings that clutter stderr.
				const result = await run(["ls-remote", "--quiet", "--", url], pushMs, extraEnv);
				if (result.exitCode === 0) {
					return { reachable: true };
				}
				// Redact token-shaped strings from stderr before surfacing as reason.
				const raw = (result.stderr.trim() || result.stdout.trim()).slice(0, 300);
				const reason = redactArg(raw);
				return { reachable: false, reason };
			} catch (err) {
				// Spawn errors (git not on PATH, etc.) — never throw, return unreachable.
				const reason = err instanceof Error ? err.message : String(err);
				return { reachable: false, reason: redactArg(reason) };
			}
		},
		// ── AO2 inbound-git verbs ────────────────────────────────────────────
		async clone(
			url: string,
			branch: string,
			opts?: { depth?: number; tokenConfig?: GitConfigInjection },
		): Promise<void> {
			// Token via env only — never in argv or URL.
			// @lore AO2: `git clone ... . ` clones into the current directory (cwd=sandboxPath).
			// The trailing `.` arg is critical — without it git creates a subdirectory.
			const args: string[] = ["clone"];
			if (opts?.depth != null) {
				args.push("--depth", String(opts.depth));
			}
			args.push("--single-branch", "--branch", branch, "--", url, ".");
			const extraEnv: Record<string, string> = {};
			if (opts?.tokenConfig) {
				extraEnv.GIT_CONFIG_COUNT = "1";
				extraEnv.GIT_CONFIG_KEY_0 = opts.tokenConfig.key;
				extraEnv.GIT_CONFIG_VALUE_0 = opts.tokenConfig.value;
			}
			const result = await run(args, pushMs, extraEnv);
			if (result.exitCode !== 0) {
				const tail = redactArg(result.stderr.trim() || result.stdout.trim());
				throw new Error(`git clone failed (${result.exitCode}): ${tail}`);
			}
		},
		async bundle(bundlePath: string, ref: string): Promise<void> {
			// Named-ref bundle — shallow-safe (git ≥2.2).
			// @lore AO2: bundlePath and ref must not start with `-` (defense-in-depth).
			if (bundlePath.startsWith("-") || ref.startsWith("-")) {
				throw new Error(`git bundle: bundlePath and ref must not start with '-'`);
			}
			await runExpectOk(["bundle", "create", bundlePath, ref], localMs);
		},
		async worktreeAdd(
			worktreePath: string,
			branch: string,
			opts?: { createBranch?: boolean },
		): Promise<void> {
			// cwd = HOST REPO path (set at construction).
			// @lore AO2: `-b` creates a new branch from HEAD. Without it, the branch
			// must already exist. Each session gets a unique `agent/<sessionId>` branch
			// to avoid the "two worktrees on the same branch" rejection.
			if (worktreePath.startsWith("-") || branch.startsWith("-")) {
				throw new Error(`git worktree add: args must not start with '-'`);
			}
			const args: string[] = ["worktree", "add"];
			if (opts?.createBranch) args.push("-b", branch);
			args.push("--", worktreePath);
			if (!opts?.createBranch) args.push(branch);
			await runExpectOk(args, localMs);
		},
		async worktreeRemove(worktreePath: string, opts?: { force?: boolean }): Promise<void> {
			// @lore AO2: --force removes even with untracked/modified files.
			// The bundle capture must run BEFORE this call.
			if (worktreePath.startsWith("-")) {
				throw new Error(`git worktree remove: path must not start with '-'`);
			}
			const args: string[] = ["worktree", "remove"];
			if (opts?.force) args.push("--force");
			args.push("--", worktreePath);
			await runExpectOk(args, localMs);
		},
		async restoreStaged(paths: readonly string[]): Promise<void> {
			if (paths.length === 0) return;
			// Defense-in-depth: reject paths that start with '-' (cannot be misinterpreted as flags).
			for (const p of paths) {
				if (p.startsWith("-")) {
					throw new Error(`git restore --staged: path must not start with '-' (got: '${p}')`);
				}
			}
			// Use '--' separator to prevent paths from being treated as options.
			await runExpectOk(["restore", "--staged", "--", ...paths], localMs);
		},
		async currentBranch(): Promise<string | null> {
			// `git rev-parse --abbrev-ref HEAD`:
			// - prints the branch name + newline on success
			// - prints "HEAD" when detached
			// - exits non-zero when there are no commits (empty repo)
			// We treat "HEAD" and any failure as null (no resolvable branch).
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
