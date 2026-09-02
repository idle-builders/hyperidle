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
import { createLogger } from "@hyperidle/diagnostics";
const DEFAULT_LOCAL_MS = 5_000;
const DEFAULT_PUSH_MS = 30_000;
const DEFAULT_WORKTREE_MS = 120_000;
function redactArg(arg) {
    if (/^(https?|ssh|git|file):\/\//i.test(arg)) {
        try {
            const u = new URL(arg);
            if (u.username || u.password) {
                u.username = "";
                u.password = "";
                return u.toString();
            }
        }
        catch {
            // fall through
        }
    }
    return arg.replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, "[REDACTED]");
}
function redactArgs(args) {
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
function buildGitEnv(extraConfigs) {
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
    const env = {};
    for (const k of allowed) {
        const v = process.env[k];
        if (typeof v === "string" && v.length > 0)
            env[k] = v;
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
async function spawnGit(args, cwd, timeoutMs, logger, extraEnv) {
    logger.info("git spawn", { args: redactArgs(args), cwd, timeoutMs });
    return new Promise((resolve) => {
        const proc = spawn("git", args, {
            cwd,
            env: { ...buildGitEnv(), ...extraEnv },
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        proc.stdout?.setEncoding("utf-8");
        proc.stderr?.setEncoding("utf-8");
        proc.stdout?.on("data", (chunk) => {
            stdout += chunk;
        });
        proc.stderr?.on("data", (chunk) => {
            stderr += chunk;
        });
        let killed = false;
        const timer = setTimeout(() => {
            killed = true;
            proc.kill("SIGTERM");
            setTimeout(() => {
                try {
                    proc.kill("SIGKILL");
                }
                catch {
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
export function createGitRunner(repoPath) {
    const logger = createLogger({ pkg: "git-runner" });
    const localMs = DEFAULT_LOCAL_MS;
    const longLocalMs = DEFAULT_WORKTREE_MS;
    const pushMs = DEFAULT_PUSH_MS;
    function run(args, timeoutMs, extraEnv) {
        return spawnGit(args, repoPath, timeoutMs, logger, extraEnv);
    }
    async function runExpectOk(args, timeoutMs) {
        const result = await run(args, timeoutMs);
        if (result.exitCode !== 0) {
            const tail = result.stderr.trim() || result.stdout.trim();
            throw new Error(`git ${redactArgs(args).join(" ")} failed (${result.exitCode}): ${redactArg(tail)}`);
        }
        return result;
    }
    return {
        async add(paths) {
            const args = paths.length === 0 ? ["add", "-A"] : ["add", "--", ...paths];
            await runExpectOk(args, localMs);
        },
        async commit(message, authorName, authorEmail) {
            await runExpectOk([
                "-c",
                `user.name=${authorName}`,
                "-c",
                `user.email=${authorEmail}`,
                "commit",
                "-m",
                message,
            ], localMs);
            const head = await runExpectOk(["rev-parse", "HEAD"], localMs);
            return head.stdout.trim();
        },
        async diffCached() {
            const hasHead = await run(["rev-parse", "--verify", "HEAD"], localMs);
            if (hasHead.exitCode !== 0) {
                const ls = await run(["ls-files", "--cached"], localMs);
                return ls.exitCode === 0 && ls.stdout.trim().length === 0;
            }
            const result = await run(["diff", "--cached", "--quiet", "HEAD"], localMs);
            return result.exitCode === 0;
        },
        async revParseIsInsideWorkTree() {
            const result = await run(["rev-parse", "--is-inside-work-tree"], localMs);
            return result.exitCode === 0 && result.stdout.trim() === "true";
        },
        async lsFiles() {
            const r = await runExpectOk(["ls-files", "-z"], localMs);
            if (r.stdout.length === 0)
                return [];
            return r.stdout.split("\0").filter((p) => p.length > 0);
        },
        async lsRemote(url, opts) {
            const extraEnv = {};
            if (opts?.tokenConfig) {
                extraEnv.GIT_CONFIG_COUNT = "1";
                extraEnv.GIT_CONFIG_KEY_0 = opts.tokenConfig.key;
                extraEnv.GIT_CONFIG_VALUE_0 = opts.tokenConfig.value;
            }
            try {
                const result = await run(["ls-remote", "--quiet", "--", url], pushMs, extraEnv);
                if (result.exitCode === 0)
                    return { reachable: true };
                const raw = (result.stderr.trim() || result.stdout.trim()).slice(0, 300);
                return { reachable: false, reason: redactArg(raw) };
            }
            catch (err) {
                const reason = err instanceof Error ? err.message : String(err);
                return { reachable: false, reason: redactArg(reason) };
            }
        },
        async clone(url, branch, opts) {
            const args = ["clone"];
            if (opts?.depth != null)
                args.push("--depth", String(opts.depth));
            args.push("--single-branch", "--branch", branch, "--", url, ".");
            const extraEnv = {};
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
        async bundle(bundlePath, ref) {
            if (bundlePath.startsWith("-") || ref.startsWith("-"))
                throw new Error("git bundle: bundlePath and ref must not start with '-'");
            await runExpectOk(["bundle", "create", bundlePath, ref], longLocalMs);
        },
        async worktreeAdd(worktreePath, branch, opts) {
            if (worktreePath.startsWith("-") || branch.startsWith("-"))
                throw new Error("git worktree add: args must not start with '-'");
            const args = ["worktree", "add"];
            if (opts?.createBranch)
                args.push("-b", branch);
            args.push("--", worktreePath);
            if (!opts?.createBranch)
                args.push(branch);
            // @lore worktree-hook-timeout: `git worktree add` runs the post-checkout hook.
            await runExpectOk(args, longLocalMs);
        },
        async worktreeRemove(worktreePath, opts) {
            if (worktreePath.startsWith("-"))
                throw new Error("git worktree remove: path must not start with '-'");
            const args = ["worktree", "remove"];
            if (opts?.force)
                args.push("--force");
            args.push("--", worktreePath);
            await runExpectOk(args, longLocalMs);
        },
        async restoreStaged(paths) {
            if (paths.length === 0)
                return;
            for (const p of paths) {
                if (p.startsWith("-"))
                    throw new Error(`git restore --staged: path must not start with '-' (got: '${p}')`);
            }
            await runExpectOk(["restore", "--staged", "--", ...paths], localMs);
        },
        async currentBranch() {
            try {
                const result = await run(["rev-parse", "--abbrev-ref", "HEAD"], localMs);
                if (result.exitCode !== 0)
                    return null;
                const branch = result.stdout.trim();
                if (branch === "" || branch === "HEAD")
                    return null;
                return branch;
            }
            catch {
                return null;
            }
        },
    };
}
//# sourceMappingURL=git-runner.js.map