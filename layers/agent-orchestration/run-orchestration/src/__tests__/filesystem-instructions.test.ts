/**
 * T9 (BA5 §14.2, §9) — the `## Filesystems` section names each mounted
 * filesystem, its kind, its branch and base, and how its work gets out.
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
			trustedPath: "/kept/repo",
			git: {
				keptCopy: "/kept/repo",
				branch: "hyperidle/sess-1",
				base: "origin/main",
				remote: true,
			},
			agentEnv: {},
			adopted: false,
		};

		const section = describeMountedFilesystems([mounted]);

		expect(section).toContain("## Filesystems");
		expect(section).toContain("/ws/repo");
		expect(section).toContain("hyperidle/sess-1");
		expect(section).toContain("main");
		expect(section).toContain("git push");
	});

	it("names a local repository's own path and says work stays there unless pushed", () => {
		const mounted: MountedFilesystem = {
			filesystem: baseFs({ kind: "code", repo: "/Users/me/repo", branch: "main" }),
			folder: "/ws/repo",
			trustedPath: "/Users/me/repo",
			git: { keptCopy: "/Users/me/repo", branch: "hyperidle/sess-2", base: "main", remote: false },
			agentEnv: {},
			adopted: false,
		};

		const section = describeMountedFilesystems([mounted]);

		expect(section).toContain("/Users/me/repo");
		expect(section).toContain("hyperidle/sess-2");
		expect(section).toContain("push it if the repository has a remote");
	});

	it("names a folder mount as linked in, editing the real files", () => {
		const mounted: MountedFilesystem = {
			filesystem: baseFs({ kind: "doc_set", folder: "/Users/me/docs" }),
			folder: "/ws/docs",
			trustedPath: "/Users/me/docs",
			agentEnv: {},
			adopted: false,
		};

		const section = describeMountedFilesystems([mounted]);

		expect(section).toContain("/ws/docs");
		expect(section).toContain("/Users/me/docs");
		expect(section).toContain("linked in");
	});
});
