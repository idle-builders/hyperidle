/**
 * Git subprocess runner for the agent-orchestration layer.
 *
 * Moved here from the deleted `@hyperidle/host-process` package.
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
	lsRemote(
		url: string,
		opts?: { tokenConfig?: GitConfigInjection },
	): Promise<{ reachable: boolean; reason?: string }>;
	/**
	 * Shallow clone a remote URL into the runner's cwd (the session dir).
	 * Token is injected via GIT_CONFIG_COUNT/KEY_n/VALUE_n env — never in URL or argv.
	 *
	 * @lore AO2: cwd = sandboxPath (the session working directory). Clone INTO `.`,
	 * not into a subdirectory, so the agent sees the repo root at sandboxPath.
	 */
	clone(
		url: string,
		branch: string,
		opts?: { depth?: number; tokenConfig?: GitConfigInjection },
	): Promise<void>;
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
	worktreeAdd(
		worktreePath: string,
		branch: string,
		opts?: { createBranch?: boolean },
	): Promise<void>;
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
}

const DEFAULT_LOCAL_MS = 5_000;
const DEFAULT_PUSH_MS = 30_000;
const DEFAULT_WORKTREE_MS = 120_000;

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
			// fall through
		}
	}
	return arg.replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, "[REDACTED]");
}

function redactArgs(args: readonly string[]): string[] {
	return args.map(redactArg);
}

/**
 * Minimal env allow-list. Intentionally drops `HYPERIDLE_API_KEY` and other secrets.
 *
 * @lore Security review [high] `git-export-runner.ts:64` — inheriting
 * `process.env` exposed credential.helper, http.proxy, and HYPERIDLE_API_KEY to child git.
 * Now we compose a minimal env from PATH + HOME + a small allow-list plus hardening vars.
 *
 * @lore AO1 v2: GIT_CONFIG_COUNT/KEY_n/VALUE_n is the safe env-injection path for tokens.
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

async function spawnGit(
	args: readonly string[],
	cwd: string,
	timeoutMs: number,
	logger: Logger,
	extraEnv?: Record<string, string>,
): Promise<SpawnResult> {
	logger.info("git spawn", { args: redactArgs(args), cwd, timeoutMs });
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

export function createGitRunner(repoPath: string): GitRunner {
	const logger = createLogger({ pkg: "git-runner" });
	const localMs = DEFAULT_LOCAL_MS;
	const longLocalMs = DEFAULT_WORKTREE_MS;
	const pushMs = DEFAULT_PUSH_MS;

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
			const tail = result.stderr.trim() || result.stdout.trim();
			throw new Error(
				`git ${redactArgs(args).join(" ")} failed (${result.exitCode}): ${redactArg(tail)}`,
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
			opts?: { tokenConfig?: GitConfigInjection },
		): Promise<{ reachable: boolean; reason?: string }> {
			const extraEnv: Record<string, string> = {};
			if (opts?.tokenConfig) {
				extraEnv.GIT_CONFIG_COUNT = "1";
				extraEnv.GIT_CONFIG_KEY_0 = opts.tokenConfig.key;
				extraEnv.GIT_CONFIG_VALUE_0 = opts.tokenConfig.value;
			}
			try {
				const result = await run(["ls-remote", "--quiet", "--", url], pushMs, extraEnv);
				if (result.exitCode === 0) return { reachable: true };
				const raw = (result.stderr.trim() || result.stdout.trim()).slice(0, 300);
				return { reachable: false, reason: redactArg(raw) };
			} catch (err) {
				const reason = err instanceof Error ? err.message : String(err);
				return { reachable: false, reason: redactArg(reason) };
			}
		},
		async clone(
			url: string,
			branch: string,
			opts?: { depth?: number; tokenConfig?: GitConfigInjection },
		): Promise<void> {
			const args: string[] = ["clone"];
			if (opts?.depth != null) args.push("--depth", String(opts.depth));
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
			if (bundlePath.startsWith("-") || ref.startsWith("-"))
				throw new Error("git bundle: bundlePath and ref must not start with '-'");
			await runExpectOk(["bundle", "create", bundlePath, ref], longLocalMs);
		},
		async worktreeAdd(
			worktreePath: string,
			branch: string,
			opts?: { createBranch?: boolean },
		): Promise<void> {
			if (worktreePath.startsWith("-") || branch.startsWith("-"))
				throw new Error("git worktree add: args must not start with '-'");
			const args: string[] = ["worktree", "add"];
			if (opts?.createBranch) args.push("-b", branch);
			args.push("--", worktreePath);
			if (!opts?.createBranch) args.push(branch);
			// @lore worktree-hook-timeout: `git worktree add` runs the post-checkout hook.
			await runExpectOk(args, longLocalMs);
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

export type { GitConfigInjection, GitRunner };
