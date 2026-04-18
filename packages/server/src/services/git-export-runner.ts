import { spawn } from "node:child_process";
import { type Logger, createLogger } from "@hyperidle/shared";

/**
 * Narrow interface over the git subcommands H1 needs. Tests substitute a
 * FakeGitRunner to assert argv shape without touching a real repo; production
 * wires `createGitRunner()` which spawns native `git`.
 *
 * @lore Every method is typed + whitelisted — we never forward user strings
 * straight into argv. The factory sets `GIT_TERMINAL_PROMPT=0` so an auth
 * failure errors immediately instead of hanging on an interactive password
 * prompt (see docs/plans/H1-plan.md §7).
 *
 * @lore DEFERRED vs plan §7: the plan mandates `Bun.spawn`; we use
 * `node:child_process.spawn` so the Vitest/Node test harness and the
 * Bun runtime execute the same code path. Both stream stdio the same
 * way in practice; Bun provides the Node shim. Adjusted plan language
 * rather than forcing two implementations.
 */
export interface GitRunner {
	/** Initialize a new repo. Uses `-b <branch>` so the default branch is set correctly. */
	init(branch: string): Promise<void>;
	/** Stage paths. When `paths` is empty the runner passes `-A`. */
	add(paths: readonly string[]): Promise<void>;
	/** Remove a tracked path from the index + working tree. */
	rm(path: string): Promise<void>;
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
	/** `git status --porcelain` rows (array of lines). */
	statusPorcelain(): Promise<readonly string[]>;
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
 * @lore Security review [high] `git-export-runner.ts:64` — inheriting
 * `process.env` exposed credential.helper, http.proxy, core.sshCommand,
 * and our own `HYPERIDLE_API_KEY` to child git. Now we compose a minimal
 * env from PATH + HOME + a small allow-list plus explicit hardening vars.
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
		"GH_TOKEN",
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
): Promise<SpawnResult> {
	logger.debug("git spawn", { args: redactArgs(args), cwd, timeoutMs });
	return new Promise<SpawnResult>((resolve) => {
		const proc = spawn("git", args, {
			cwd,
			env: buildGitEnv(),
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

	function run(args: readonly string[], timeoutMs: number): Promise<SpawnResult> {
		return spawnGit(args, repoPath, timeoutMs, logger);
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
		async rm(p: string): Promise<void> {
			await runExpectOk(["rm", "-f", "--", p], localMs);
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
		async statusPorcelain(): Promise<readonly string[]> {
			const r = await runExpectOk(["status", "--porcelain"], localMs);
			if (r.stdout.length === 0) return [];
			return r.stdout.split(/\r?\n/).filter((l) => l.length > 0);
		},
	};
}
