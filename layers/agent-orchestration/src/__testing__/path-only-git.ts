/**
 * @lore BA5: a "PATH without gh" built by SUBTRACTING the real PATH's gh
 * directory is layout-dependent — verified failing on CI (ubuntu-latest):
 * there, `git` and `gh` both resolve to `/usr/bin`, so removing "gh's
 * directory" removes git too, and every "gh absent, git present" case comes
 * back `Install git` instead of exercising the git-only path it means to
 * test. On this dev machine `gh` is homebrew's `/opt/homebrew/bin` and `git`
 * is the system `/usr/bin`, so the same subtraction happens to leave git
 * behind — the bug was invisible locally.
 *
 * The fix builds the PATH forward instead: a fresh temp dir with a symlink
 * to the real `git` binary, and nothing else. `gh` is absent because it was
 * never placed there — true on every OS regardless of how the real
 * installation happens to lay the two binaries out.
 */
import * as fs from "node:fs";
import * as path from "node:path";

function findRealBinDir(binary: string): string {
	const real = process.env.PATH ?? "";
	for (const dir of real.split(path.delimiter)) {
		if (dir && fs.existsSync(path.join(dir, binary))) return dir;
	}
	throw new Error(`${binary} not found on PATH — cannot build a git-only PATH for this test`);
}

/**
 * A PATH containing ONLY the real `git` binary (via symlink) — `gh` is
 * absent by construction, never by filtering it out of the real PATH.
 * `mkTempDir` is the caller's own tracked-dir helper so the symlink dir is
 * cleaned up the same way as every other test-owned temp dir.
 */
export function pathWithGitOnly(mkTempDir: (prefix: string) => string): string {
	const dir = mkTempDir("path-git-only-");
	const gitDir = findRealBinDir("git");
	fs.symlinkSync(path.join(gitDir, "git"), path.join(dir, "git"));
	return dir;
}
