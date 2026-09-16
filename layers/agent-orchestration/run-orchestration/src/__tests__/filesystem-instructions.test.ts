/**
 * T9 (BA5 §14.2, §9) — the `## Filesystems` section names each mounted
 * filesystem, its kind, its branch and base, and how its work gets out.
 *
 * N3 (BA5 no-teardown §3/S6) — a reused git worktree carries one extra
 * sentence telling the agent to check `git status`/`git log` before it
 * starts, since it may already hold a previous session's uncommitted work.
 */
import { describe, expect, it } from "vitest";
import { describeMountedFilesystems } from "../filesystem-instructions.js";
import type { Filesystem, MountedFilesystem } from "../mounter.js";

function baseFs(resourceRef: Filesystem["resourceRef"]): Filesystem {
	return {
		id: "fs-1",
		teamId: "team-1",
		source: "local",
		kind: resourceRef.kind,
		connectionId: null,
		resourceRef,
		state: "attached",
		createdAt: "2026-09-01T00:00:00.000Z",
	};
}

describe("describeMountedFilesystems", () => {
	it("returns nothing when no filesystem was mounted", () => {
		expect(describeMountedFilesystems([])).toBe("");
	});

	it("names the folder, the remote, the session branch and its base, and how to push", () => {
		const mounted: MountedFilesystem = {
			filesystem: baseFs({ kind: "code", repo: "https://github.com/a/repo.git", branch: "main" }),
			folder: "/ws/repo",
			trustedPaths: ["/kept/repo", "/kept/worktrees/task-1/repo"],
			git: {
				keptCopy: "/kept/repo",
				branch: "hyperidle/task-1",
				base: "origin/main",
				remote: true,
			},
			agentEnv: {},
			reused: false,
		};

		const section = describeMountedFilesystems([mounted]);

		expect(section).toContain("## Filesystems");
		expect(section).toContain("/ws/repo");
		expect(section).toContain("hyperidle/task-1");
		expect(section).toContain("main");
		expect(section).toContain("git push");
		expect(section).not.toContain("check `git status`");
	});

	it("names a local repository's own path and says work stays there unless pushed", () => {
		const mounted: MountedFilesystem = {
			filesystem: baseFs({ kind: "code", repo: "/Users/me/repo", branch: "main" }),
			folder: "/ws/repo",
			trustedPaths: ["/Users/me/repo", "/kept/worktrees/task-2/repo"],
			git: { keptCopy: "/Users/me/repo", branch: "hyperidle/task-2", base: "main", remote: false },
			agentEnv: {},
			reused: false,
		};

		const section = describeMountedFilesystems([mounted]);

		expect(section).toContain("/Users/me/repo");
		expect(section).toContain("hyperidle/task-2");
		expect(section).toContain("push it if the repository has a remote");
	});

	it("names a folder mount as linked in, editing the real files", () => {
		const mounted: MountedFilesystem = {
			filesystem: baseFs({ kind: "doc_set", folder: "/Users/me/docs" }),
			folder: "/ws/docs",
			trustedPaths: ["/Users/me/docs"],
			agentEnv: {},
			reused: false,
		};

		const section = describeMountedFilesystems([mounted]);

		expect(section).toContain("/ws/docs");
		expect(section).toContain("/Users/me/docs");
		expect(section).toContain("linked in");
	});

	it("V8: names a Drive mount's folder, the remote:path, the exact rclone copy command, and that Google Docs are not included", () => {
		const mounted: MountedFilesystem = {
			filesystem: baseFs({ kind: "drive", remote: "gdrive", path: "Projects/Acme" }),
			folder: "/ws/acme",
			trustedPaths: ["/kept/fs-1"],
			agentEnv: {},
			reused: false,
		};

		const section = describeMountedFilesystems([mounted]);

		expect(section).toContain("/ws/acme");
		expect(section).toContain("gdrive:Projects/Acme");
		expect(section).toContain("rclone copy /ws/acme gdrive:Projects/Acme");
		expect(section).toContain("never deletes");
		expect(section).toContain("Google Docs, Sheets and Slides");
	});

	it("N3: a reused git worktree carries the check-before-you-start sentence", () => {
		const mounted: MountedFilesystem = {
			filesystem: baseFs({ kind: "code", repo: "/Users/me/repo", branch: "main" }),
			folder: "/ws/repo",
			trustedPaths: ["/Users/me/repo", "/kept/worktrees/task-3/repo"],
			git: { keptCopy: "/Users/me/repo", branch: "hyperidle/task-3", base: "main", remote: false },
			agentEnv: {},
			reused: true,
		};

		const section = describeMountedFilesystems([mounted]);

		expect(section).toContain("already holds earlier work on this task");
		expect(section).toContain("git status");
		expect(section).toContain("git log");
	});
});
