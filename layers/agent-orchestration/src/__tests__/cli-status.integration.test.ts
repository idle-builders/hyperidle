/**
 * T5b (BA5 §14.2) — `ghAuthStatus` against the REAL, installed `gh` binary.
 * No stub of gh, git, or the exit-code path: `PATH` and `HOME` are the only
 * things a test manipulates, exactly as `git-runner-credentials.integration.
 * test.ts` (T2) does for git.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { pathWithGitOnly } from "../__testing__/path-only-git.js";
import { ghAuthStatus } from "../cli-status.js";

const dirs: string[] = [];
function tracked(prefix: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	dirs.push(dir);
	return dir;
}
afterEach(() => {
	for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("ghAuthStatus (T5b) — real gh binary", () => {
	test("gh absent from PATH resolves not_installed", async () => {
		vi.stubEnv("PATH", pathWithGitOnly(tracked));
		vi.stubEnv("HOME", tracked("cli-status-noph-"));
		const result = await ghAuthStatus(null);
		expect(result).toBe("not_installed");
	});

	test("an empty HOME with no GH_TOKEN resolves logged_out (offline, no network)", async () => {
		vi.stubEnv("HOME", tracked("cli-status-empty-"));
		vi.stubEnv("GH_TOKEN", "");
		delete process.env.GH_TOKEN;
		const result = await ghAuthStatus(null);
		expect(result).toBe("logged_out");
	});

	test("never throws even when the child spawn itself is impossible", async () => {
		// An empty *string* PATH is not "impossible" on every OS: `buildGhEnv`
		// drops env vars of zero length, so the child inherits no PATH key at
		// all, and the OS falls back to its own default search path — which,
		// unlike this dev machine, includes a pre-installed `gh` on the
		// ubuntu-latest CI runner (verified: CI got `logged_out`, not
		// `not_installed`, from this exact assertion). A real, empty
		// directory has none of that ambiguity: the env var is non-empty (so
		// it is kept), and the directory itself resolves nothing, on any OS.
		vi.stubEnv("PATH", tracked("cli-status-emptypath-"));
		vi.stubEnv("HOME", tracked("cli-status-nopath-"));
		let threw = false;
		let result: string | undefined;
		try {
			result = await ghAuthStatus(null);
		} catch {
			threw = true;
		}
		expect(threw).toBe(false);
		expect(result).toBe("not_installed");
	});
});
