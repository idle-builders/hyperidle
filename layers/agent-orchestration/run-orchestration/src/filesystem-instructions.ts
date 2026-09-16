/**
 * What the agent is told about what it has: each mounted filesystem, where
 * it sits in the workspace, and how its work gets out. Appended to the
 * assembled prompt right before `writeSandboxAgentsMd` (`provisioner.ts`),
 * only when something was mounted.
 */
import type { MountedFilesystem } from "./mounter.js";

/**
 * @lore BA5 (no-teardown) §3/S6: a second, non-resume session for the same
 * task gets a fresh chat and a fresh workspace but an OLD worktree — today's
 * sentence ("You are on branch X, started from Y") reads as if it were
 * fresh when it may already hold a previous session's uncommitted work.
 * Told once, plainly, rather than left for the agent to discover mid-turn.
 */
const REUSED_WORKTREE_NOTE =
	" This worktree already holds earlier work on this task — check `git status` and `git log` before you start.";

function describeOne(mounted: MountedFilesystem): string {
	const header = `\`${mounted.folder}/\``;
	if (mounted.git) {
		const configuredBranch =
			mounted.filesystem.resourceRef.kind === "code" ? mounted.filesystem.resourceRef.repo : "";
		const branch = mounted.git.branch;
		const base =
			mounted.filesystem.resourceRef.kind === "code" ? mounted.filesystem.resourceRef.branch : "";
		const reusedNote = mounted.reused ? REUSED_WORKTREE_NOTE : "";
		if (mounted.git.remote) {
			return `${header} — git repository ${configuredBranch}. You are on branch \`${branch}\`, started from \`${base}\`. Commit your work here and push the branch to get it out: \`git push -u origin HEAD\`.${reusedNote}`;
		}
		return `${header} — git repository at \`${mounted.git.keptCopy}\`. You are on branch \`${branch}\`, started from \`${base}\`. Your commits stay on this branch in the repository at \`${mounted.git.keptCopy}\` after the session; push it if the repository has a remote.${reusedNote}`;
	}
	if (mounted.filesystem.resourceRef.kind === "drive") {
		const { remote, path } = mounted.filesystem.resourceRef;
		return `${header} — a copy of the Google Drive folder \`${remote}:${path}\`. Your changes stay on this machine until you put them back: \`rclone copy ${mounted.folder} ${remote}:${path}\`. That adds and updates files in Drive and never deletes anything there. Work you do not put back stays in this copy and is here again next time, but nobody else can see it until you do. Google Docs, Sheets and Slides that live in this folder are **not** here — they are not files, and this filesystem does not carry them.`;
	}
	return `${header} — the folder ${mounted.trustedPaths[0]}, linked in as it is. You are editing the real files.`;
}

export function describeMountedFilesystems(mounted: readonly MountedFilesystem[]): string {
	if (mounted.length === 0) return "";
	return `\n## Filesystems\n\n${mounted.map(describeOne).join("\n\n")}\n`;
}
