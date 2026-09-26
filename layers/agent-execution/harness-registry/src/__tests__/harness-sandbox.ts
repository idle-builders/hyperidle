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
 * @lore This does NOT close every isolation gap — a CLI's *global*,
 * HOME-scoped plugins (e.g. cursor-agent's ~/.cursor/plugins/local) load
 * regardless of cwd, proven empirically for cursor-agent's idle-tasks
 * plugin. Fixing that needs a founder call on trading HOME-scoped auth for
 * HOME-scoped plugin exposure; this helper only owns the sandbox directory,
 * not the harness's own environment.
 */

import { execFile } from "node:child_process";
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
import type { HarnessName } from "./require-harness.js";

const execFileAsync = promisify(execFile);

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
					// @lore AV3-ship: a just-exited real CLI harness can leave a helper
					// touching the temp sandbox for a tick on macOS. Retry past it rather
					// than fail cleanup for a non-product race.
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
