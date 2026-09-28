/**
 * Test-support helper (development world — lives in `__tests__/`, never
 * imported by production code).
 *
 * Every real-binary harness test needs a session cwd that is not this
 * repository: a directory under it would let a spawned CLI's cwd-walk-up
 * find our AGENTS.md / .mcp.json / .agents / .cursor / .claude and act on
 * them. `os.tmpdir()` is always outside any repository this process is
 * checked out in, so a `mkdtemp` there is a directory the spawned CLI's own
 * filesystem walk-up can never resolve back to hyperidle.
 *
 * @lore sandbox cwd gap: HOME-scoped plugins load regardless of cwd (e.g. cursor ~/.cursor/plugins/local); this helper owns sandbox dir only
 */

import { execFile, execFileSync } from "node:child_process";
import {
	appendFileSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach } from "vitest";
import type { HarnessName } from "./require-harness.js";

const execFileAsync = promisify(execFile);

// @lore cursor-agent-worker-sweep: registered once at module scope — every real-binary test file gets the sweep by importing this module
afterEach(() => {
	killOrphanedCursorAgentWorkers();
});

export interface HarnessSandbox {
	readonly path: string;
	/** Removes the sandbox directory, retrying past a transient post-exit ENOTEMPTY/EBUSY. */
	cleanup(): Promise<void>;
}

/** Creates a session sandbox under the OS temp dir, never inside this repo's git tree. */
export function createHarnessSandbox(prefix: string): HarnessSandbox {
	const path = mkdtempSync(join(tmpdir(), `${prefix}-`));
	return {
		path,
		async cleanup() {
			for (let attempt = 0; attempt < 5; attempt += 1) {
				try {
					rmSync(path, { recursive: true, force: true });
					return;
				} catch (err) {
					const code = (err as NodeJS.ErrnoException).code;
					if (code !== "ENOTEMPTY" && code !== "EBUSY") throw err;
					// @lore sandbox cleanup: a just-exited CLI harness can leave a helper touching the temp dir for a tick on macOS; retry rather than fail for a non-product race
					await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
				}
			}
			rmSync(path, { recursive: true, force: true });
		},
	};
}

/**
 * Copies ONLY the developer's real codex auth.json + config.toml into a
 * per-session `.codex-home/` (no `plugins/`) so a real-binary test can
 * authenticate a real codex turn without a production seam to call: unlike
 * the MCP server entries production writes to `.codex-home/config.toml`
 * (`writeCodexTomlEntries`, connection-provisioning.ts), production never
 * carries a developer's personal ChatGPT login into a session — that
 * credential only exists so a *test* can drive a real LLM turn.
 * Returns whether a real auth.json was found (false ⇒ caller should skip).
 */
export function provisionCodexHome(sandboxPath: string): boolean {
	const codexHomeDir = join(sandboxPath, ".codex-home");
	mkdirSync(codexHomeDir, { recursive: true });
	const homeCodexDir = join(homedir(), ".codex");
	let authFound = false;
	for (const fname of ["auth.json", "config.toml"]) {
		const src = join(homeCodexDir, fname);
		if (existsSync(src)) {
			copyFileSync(src, join(codexHomeDir, fname));
			if (fname === "auth.json") authFound = true;
		}
	}
	appendFileSync(
		join(codexHomeDir, "config.toml"),
		`\n[projects."${sandboxPath}"]\ntrust_level = "trusted"\n`,
		"utf-8",
	);
	return authFound;
}

/** Writes the sandbox files CLAUDE_CLI_CONFIG's args reference (--mcp-config, --settings). */
export function provisionClaudeSandbox(sandboxPath: string): void {
	// --mcp-config .mcp.json: dead URL is fine; claude marks it pending and proceeds.
	writeFileSync(
		join(sandboxPath, ".mcp.json"),
		JSON.stringify({
			mcpServers: { hyperidle: { type: "http", url: "http://localhost:9/api/mcp/x" } },
		}),
		"utf-8",
	);
	// --settings .claude/settings.json: empty object = no Stop hook → no re-prompt loop.
	mkdirSync(join(sandboxPath, ".claude"), { recursive: true });
	writeFileSync(join(sandboxPath, ".claude", "settings.json"), JSON.stringify({}), "utf-8");
}

// ── Auth probes ───────────────────────────────────────────────────────────────
//
// A harness binary can be on PATH (requireHarness passes) but not logged in.
// These probes answer that separately, and requireHarnessAuthed below turns a
// "not logged in" into the same hard-fail requireHarness uses for "not
// installed" — never a skip. One probe per harness, used by every real-binary
// test file so the login-detection logic exists exactly once.

async function claudeAuthed(): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync("claude", ["auth", "status"], { timeout: 10_000 });
		const parsed = JSON.parse(stdout.trim()) as { loggedIn?: boolean };
		return parsed.loggedIn === true;
	} catch {
		return false;
	}
}

async function codexAuthed(): Promise<boolean> {
	try {
		const { stdout, stderr } = await execFileAsync("codex", ["login", "status"], {
			timeout: 10_000,
		});
		return (stdout + stderr).trim().startsWith("Logged in");
	} catch {
		return false;
	}
}

async function opencodeAuthed(): Promise<boolean> {
	try {
		// opencode reads OPENROUTER_API_KEY from its own environment — HyperIdle
		// holds no model credential to inject.
		if (!process.env.OPENROUTER_API_KEY) return false;
		const { stdout } = await execFileAsync("opencode", ["providers", "list"], { timeout: 10_000 });
		return /\d+\s+credentials/.test(stdout) || stdout.includes("environment variable");
	} catch {
		return false;
	}
}

async function cursorAgentAuthed(): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync("cursor-agent", ["status"], { timeout: 10_000 });
		return stdout.includes("Logged in");
	} catch {
		return false;
	}
}

const AUTH_CHECK: Record<HarnessName, () => Promise<boolean>> = {
	claude: claudeAuthed,
	codex: codexAuthed,
	opencode: opencodeAuthed,
	"cursor-agent": cursorAgentAuthed,
};

const LOGIN_HINT: Record<HarnessName, string> = {
	claude: "run `claude auth status` / sign in via the app",
	codex: "run `codex login`",
	opencode: "run `opencode auth login` (or export OPENROUTER_API_KEY)",
	"cursor-agent": "run `cursor-agent login`",
};

/** True iff the named harness is both on PATH and logged in / credentialed. */
export function isHarnessAuthed(name: HarnessName): Promise<boolean> {
	return AUTH_CHECK[name]();
}

/**
 * Throws (never skips) when a harness binary is on PATH but not authenticated.
 * Pairs with `requireHarness` (which checks PATH only) so a missing credential
 * hard-fails the run exactly like a missing binary does.
 */
export async function requireHarnessAuthed(name: HarnessName, context?: string): Promise<void> {
	if (await isHarnessAuthed(name)) return;
	throw new Error(
		`${name} is on PATH but not authenticated (${LOGIN_HINT[name]})` +
			`${context ? ` — ${context}` : ""}. Never skip to green.`,
	);
}

/**
 * cursor-agent's own `worker-server`: a detached process the binary spawns on
 * every real `-p` invocation (verified independent of any of our own spawn
 * code — a bare manual `cursor-agent -p ...` outside vitest reproduces it
 * too) and immediately reparents to init (`ppid=1`). It shares no process
 * group with the CLI's own direct child, so a caller's own process-group
 * kill (`killAllLiveSessionGroups`, cli-harness-adapter.ts) never reaches
 * it — this sweeps for it by binary path and start time instead, the same
 * proof shape `killAllLiveSessionGroups` uses (kill what THIS run started,
 * never a person's own earlier cursor-agent process).
 *
 * `sinceMs` defaults to this Node process's own start time — a worker-server
 * that predates the current test worker was never spawned by anything this
 * run did, and is left alone.
 */
export function killOrphanedCursorAgentWorkers(
	sinceMs: number = Date.now() - process.uptime() * 1000,
): void {
	let output: string;
	try {
		output = execFileSync("ps", ["-axo", "pid,lstart,command"], {
			encoding: "utf8",
			timeout: 5_000,
		});
	} catch {
		// `ps` itself failing is not this sweep's problem to solve — never throw
		// out of a cleanup hook over it.
		return;
	}

	const ROW = /^\s*(\d+)\s+(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.*)$/;
	for (const line of output.split("\n")) {
		const match = ROW.exec(line);
		if (!match) continue;
		const [, pidText, lstartText, command] = match;
		if (!(command?.includes("cursor-agent") && command.includes("worker-server"))) continue;
		const startedAt = new Date(lstartText ?? "").getTime();
		if (Number.isNaN(startedAt) || startedAt < sinceMs) continue;
		try {
			process.kill(Number(pidText), "SIGKILL");
		} catch {
			// Already gone.
		}
	}
}

/**
 * A copy of the current environment with every Claude-Code session-detection
 * var cleared, so a real-binary test spawned from inside an agent session
 * (this repo's own CI runner, a developer's Claude Code terminal, etc.) never
 * trips a harness's own nested-session guard.
 */
export function buildCleanEnv(): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (v !== undefined) env[k] = v;
	}
	const ccVars = [
		"CLAUDECODE",
		"CLAUDE_CODE_ENTRYPOINT",
		"CLAUDE_CODE_EXECPATH",
		"CLAUDE_CODE_SESSION_ID",
		"AI_AGENT",
		"CLAUDE_EFFORT",
		"CLAUDE_CODE_SIMPLE",
		"CLAUDE_CODE_SAFE_MODE",
	];
	for (const v of ccVars) env[v] = "";
	return env;
}
