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

import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

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
