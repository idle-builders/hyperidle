/**
 * `rclone` subprocess runner — the Google Drive counterpart to `git-runner.ts`.
 * One value, not repository-scoped: `rclone` addresses a remote by name, not
 * by a bound cwd, so there is no factory here (contrast `createGitRunner`).
 *
 * @lore Google Drive phase: `spawn`, never `execSync`, never a shell — same
 * idiom as `git-runner.ts`. The env allow-list adds `XDG_CONFIG_HOME` to
 * git's list, because rclone reads it before `~/.config` (rclone's
 * config-file precedence, https://rclone.org/docs/#config-config-file,
 * fetched 2026-09-12) — without it HyperIdle's rclone and the person's own
 * shell could resolve two different configs and disagree about whether a
 * remote exists. `--ask-password=false` on every call is the exact
 * counterpart of `GIT_TERMINAL_PROMPT=0`: an encrypted config's password
 * prompt must fail fast, never hang the drain.
 */
import { spawn } from "node:child_process";
import { createLogger, type Logger } from "@hyperidle/diagnostics";
import type { RcloneFailureCode, RcloneOutcome, RcloneRunner } from "@hyperidle/run-orchestration";
import { redactSecrets } from "./redact-secrets.js";

interface SpawnResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	/** Set when `spawn` itself failed with ENOENT — rclone is not on PATH. */
	spawnErrorCode?: string;
}

const STAT_MS = 30_000;
/** @lore Google Drive phase: the same ceiling a kept copy's first git clone gets (`git-runner.ts`'s `DEFAULT_CLONE_MS`) — a first Drive copy can be just as large. */
const COPY_DOWN_MS = 600_000;

/**
 * Minimal env allow-list — never the raw `process.env`. Same shape as
 * `git-runner.ts`'s `buildGitEnv`, plus `XDG_CONFIG_HOME` (see top-of-file
 * lore) and minus the git-specific hardening vars, which rclone has no use
 * for.
 */
function buildRcloneEnv(): Record<string, string> {
	const allowed = [
		"PATH",
		"HOME",
		"XDG_CONFIG_HOME",
		"USER",
		"LOGNAME",
		"LANG",
		"LC_ALL",
		"LC_CTYPE",
		"TZ",
		"TMPDIR",
	];
	const env: Record<string, string> = {};
	for (const k of allowed) {
		const v = process.env[k];
		if (typeof v === "string" && v.length > 0) env[k] = v;
	}
	return env;
}

async function spawnRclone(
	args: readonly string[],
	timeoutMs: number,
	logger: Logger,
): Promise<SpawnResult> {
	logger.info("rclone spawn", { args, timeoutMs });
	return new Promise<SpawnResult>((resolve) => {
		const proc = spawn("rclone", [...args, "--ask-password=false"], {
			env: buildRcloneEnv(),
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
			resolve({ stdout, stderr: stderr + String(err), exitCode: -1, spawnErrorCode: err.code });
		});
		proc.on("close", (code) => {
			clearTimeout(timer);
			const exit = typeof code === "number" ? code : killed ? -2 : -1;
			resolve({ stdout, stderr, exitCode: exit });
		});
	});
}

/**
 * Exit-code mapping, from rclone's documented list
 * (https://rclone.org/docs/#list-of-exit-codes, fetched 2026-09-12): `0` is
 * ok, `3` ("Directory not found") is `directory_not_found`, everything else
 * is `failed`. Only these two are given meaning — the rest of rclone's table
 * is not load-bearing here, so a version that renumbers something cannot
 * silently mis-report.
 */
function toFailure(result: SpawnResult): { code: RcloneFailureCode; reason: string } {
	if (result.spawnErrorCode === "ENOENT") {
		return { code: "not_installed", reason: "rclone is not installed" };
	}
	const reason = redactSecrets(result.stderr.trim() || result.stdout.trim(), []);
	if (result.exitCode === 3) return { code: "directory_not_found", reason };
	return { code: "failed", reason };
}

export function createRcloneRunner(): RcloneRunner {
	const logger = createLogger({ pkg: "rclone-runner" });

	return {
		async listRemotes(): Promise<RcloneOutcome<readonly string[]>> {
			const result = await spawnRclone(["listremotes"], STAT_MS, logger);
			if (result.exitCode !== 0 || result.spawnErrorCode)
				return { ok: false, ...toFailure(result) };
			const remotes = result.stdout
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line.length > 0)
				.map((line) => (line.endsWith(":") ? line.slice(0, -1) : line));
			return { ok: true, value: remotes };
		},

		async statPath(remote: string, path: string): Promise<RcloneOutcome<{ isDir: boolean }>> {
			const result = await spawnRclone(["lsjson", "--stat", `${remote}:${path}`], STAT_MS, logger);
			if (result.exitCode !== 0 || result.spawnErrorCode)
				return { ok: false, ...toFailure(result) };
			try {
				const parsed = JSON.parse(result.stdout) as { IsDir?: boolean } | null;
				return { ok: true, value: { isDir: parsed?.IsDir === true } };
			} catch {
				return { ok: false, code: "failed", reason: "rclone returned an unreadable response" };
			}
		},

		async copyDown(
			remote: string,
			path: string,
			destination: string,
		): Promise<RcloneOutcome<void>> {
			// @lore Google Drive phase: `copy`, never `sync`/`bisync` — the one
			// verb of rclone's that never deletes from the destination. `-u`
			// (`--update`) skips a destination file whose mtime is newer than the
			// source, so the agent's un-copied-back local edit survives a refresh
			// unless the same file also changed in Drive afterwards.
			// `--drive-skip-gdocs` makes a Google-native Doc/Sheet/Slide invisible
			// to rclone rather than silently exported to a lossy, disconnected copy.
			const result = await spawnRclone(
				["copy", `${remote}:${path}`, destination, "--drive-skip-gdocs", "-u"],
				COPY_DOWN_MS,
				logger,
			);
			if (result.exitCode !== 0 || result.spawnErrorCode)
				return { ok: false, ...toFailure(result) };
			return { ok: true, value: undefined };
		},
	};
}
