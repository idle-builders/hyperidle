/**
 * BA5 §9 — what the agent is told about what it has: each mounted
 * filesystem, where it sits in the workspace, and how its work gets out.
 * Appended to the assembled prompt right before `writeSandboxAgentsMd`
 * (`provisioner.ts`), only when something was mounted.
 */
import type { MountedFilesystem } from "./mounter.js";

function describeOne(mounted: MountedFilesystem): string {
	const header = `\`${mounted.folder}/\``;
	if (mounted.git) {
		const configuredBranch =
			mounted.filesystem.resourceRef.kind === "code" ? mounted.filesystem.resourceRef.repo : "";
		const branch = mounted.git.branch;
		const base =
			mounted.filesystem.resourceRef.kind === "code" ? mounted.filesystem.resourceRef.branch : "";
		if (mounted.git.remote) {
			return `${header} — git repository ${configuredBranch}. You are on branch \`${branch}\`, started from \`${base}\`. Commit your work here and push the branch to get it out: \`git push -u origin HEAD\`.`;
		}
		return `${header} — git repository at \`${mounted.git.keptCopy}\`. You are on branch \`${branch}\`, started from \`${base}\`. Your commits stay on this branch in the repository at \`${mounted.git.keptCopy}\` after the session; push it if the repository has a remote.`;
	}
	return `${header} — the folder ${mounted.trustedPath}, linked in as it is. You are editing the real files.`;
}

export function describeMountedFilesystems(mounted: readonly MountedFilesystem[]): string {
	if (mounted.length === 0) return "";
	return `\n## Filesystems\n\n${mounted.map(describeOne).join("\n\n")}\n`;
}
