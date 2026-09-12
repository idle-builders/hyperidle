/**
 * `ghAuthStatus` — the one `gh` login probe, driven entirely by exit code.
 *
 * @lore BA5 §2.6/§7.2: no separate "is gh installed" probe exists — a spawn
 * `ENOENT` from this call, or from git's own spawn (`git-runner.ts`), IS the
 * detection. Lives beside `git-runner.ts` because this layer root is where
 * this Layer spawns processes.
 *
 * @lore BA5 §7.2: `gh auth status --json hosts` always exits 0 (even logged
 * out, printing `{"hosts":{}}` — verified, and the exact bug the OLD inherited
 * probe has, §17.5) so only the plain, non-JSON exit code is ever read here.
 * Verified against gh 2.92.0: exit 0 = logged in; exit 1 = logged out, and
 * exit 1 for an invalid `GH_TOKEN` too ("The token in GH_TOKEN is invalid") —
 * both correctly collapse to `"logged_out"`, which is exactly what a caller
 * needs to know ("this credential does not work"), not why.
 */
import { spawn } from "node:child_process";

export type GhAuthState = "logged_in" | "logged_out" | "not_installed";

/** Same minimal allow-list idea as `git-runner.ts`'s `buildGitEnv` — never the raw `process.env`. */
function buildGhEnv(token: string | null): Record<string, string> {
	const allowed = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "TMPDIR"];
	const env: Record<string, string> = {};
	for (const key of allowed) {
		const value = process.env[key];
		if (typeof value === "string" && value.length > 0) env[key] = value;
	}
	if (token) env.GH_TOKEN = token;
	return env;
}

/**
 * `gh auth status --hostname github.com`, with `GH_TOKEN` set only when
 * `token` is given (a filesystem's connection PAT). With no token, this
 * reports the person's own `gh` login (from `HOME`'s `gh` config). Never
 * throws.
 */
export function ghAuthStatus(token: string | null): Promise<GhAuthState> {
	return new Promise<GhAuthState>((resolve) => {
		const proc = spawn("gh", ["auth", "status", "--hostname", "github.com"], {
			env: buildGhEnv(token),
			stdio: "ignore",
		});
		proc.on("error", (err: NodeJS.ErrnoException) => {
			resolve(err.code === "ENOENT" ? "not_installed" : "logged_out");
		});
		proc.on("close", (code) => {
			resolve(code === 0 ? "logged_in" : "logged_out");
		});
	});
}
