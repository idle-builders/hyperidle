/**
 * AO2 — Mounter registry: selectMountAdapter dispatch table + W4 selection precedence.
 *
 * AC6: registry of adapters by (kind,source); v1 = worktree+clone+local-folder;
 *      cloud → explicit "not built", never silent.
 * AC1: selectMountAdapter is the only dispatcher; session-provisioning never branches on source.
 */

import { createFakeGitRunner } from "@hyperidle/core-app";
import type { Filesystem } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import {
	type AdapterDeps,
	MalformedFilesystemError,
	selectMountAdapter,
} from "../mounter-registry.js";

// Minimal AdapterDeps for unit testing.
function makeDeps(): AdapterDeps {
	return {
		gitRunnerFactory: (_repoPath: string) => createFakeGitRunner(),
		capturesDir: "/tmp/captures",
		db: null as never, // capture-store not exercised in unit tests
	};
}

function makeFs(overrides: Partial<Filesystem>): Filesystem {
	return {
		id: "fs-test",
		teamId: "team-1",
		source: "local",
		kind: "code",
		connectionId: null,
		resourceRef: { kind: "code", repo: "/home/user/myrepo", branch: "main" },
		writeback: "git",
		state: "reachable",
		createdAt: "2025-01-01T00:00:00Z",
		...overrides,
	};
}

describe("selectMountAdapter chooses the correct filesystem adapter", () => {
	it("code + connectionId present → GitCloneAdapter (id='git-clone')", () => {
		const fs = makeFs({ connectionId: "conn-123" });
		const adapter = selectMountAdapter(fs, makeDeps());
		expect(adapter.id).toBe("git-clone");
	});

	it("code + null connectionId + local path → GitWorktreeAdapter (id='git-worktree')", () => {
		const fs = makeFs({
			connectionId: null,
			resourceRef: { kind: "code", repo: "/home/user/repo", branch: "main" },
		});
		const adapter = selectMountAdapter(fs, makeDeps());
		expect(adapter.id).toBe("git-worktree");
	});

	it("code + null connectionId + ./relative path → GitWorktreeAdapter", () => {
		const fs = makeFs({
			connectionId: null,
			resourceRef: { kind: "code", repo: "./my-repo", branch: "main" },
		});
		const adapter = selectMountAdapter(fs, makeDeps());
		expect(adapter.id).toBe("git-worktree");
	});

	it("code + null connectionId + ~/home path → GitWorktreeAdapter", () => {
		const fs = makeFs({
			connectionId: null,
			resourceRef: { kind: "code", repo: "~/projects/repo", branch: "main" },
		});
		const adapter = selectMountAdapter(fs, makeDeps());
		expect(adapter.id).toBe("git-worktree");
	});

	it("code + null connectionId + file:// path → GitWorktreeAdapter", () => {
		const fs = makeFs({
			connectionId: null,
			resourceRef: { kind: "code", repo: "file:///home/user/repo", branch: "main" },
		});
		const adapter = selectMountAdapter(fs, makeDeps());
		expect(adapter.id).toBe("git-worktree");
	});

	it("code + null connectionId + owner/repo → MalformedFilesystemError (loud, never silent)", () => {
		const fs = makeFs({
			connectionId: null,
			resourceRef: { kind: "code", repo: "owner/repo", branch: "main" },
		});
		expect(() => selectMountAdapter(fs, makeDeps())).toThrow(MalformedFilesystemError);
	});

	it("code + null connectionId + https URL → MalformedFilesystemError", () => {
		const fs = makeFs({
			connectionId: null,
			resourceRef: { kind: "code", repo: "https://github.com/org/repo.git", branch: "main" },
		});
		expect(() => selectMountAdapter(fs, makeDeps())).toThrow(MalformedFilesystemError);
	});

	it("code + null connectionId + git@ SSH URL → MalformedFilesystemError", () => {
		const fs = makeFs({
			connectionId: null,
			resourceRef: { kind: "code", repo: "git@github.com:org/repo.git", branch: "main" },
		});
		expect(() => selectMountAdapter(fs, makeDeps())).toThrow(MalformedFilesystemError);
	});

	it("doc_set + local source → LocalFolderAdapter (id='local-folder')", () => {
		const fs = makeFs({
			kind: "doc_set",
			source: "local",
			resourceRef: { kind: "doc_set", folder: "/home/user/vault" },
		});
		const adapter = selectMountAdapter(fs, makeDeps());
		expect(adapter.id).toBe("local-folder");
	});

	it("doc_set + obsidian source → LocalFolderAdapter", () => {
		const fs = makeFs({
			kind: "doc_set",
			source: "obsidian",
			resourceRef: { kind: "doc_set", folder: "/home/user/vault" },
		});
		const adapter = selectMountAdapter(fs, makeDeps());
		expect(adapter.id).toBe("local-folder");
	});

	it("doc_set + gdrive source → CloudNotBuiltAdapter (id='cloud-not-built:gdrive')", () => {
		const fs = makeFs({
			kind: "doc_set",
			source: "gdrive",
			resourceRef: { kind: "doc_set", folder: "drive://MyDocs" },
		});
		const adapter = selectMountAdapter(fs, makeDeps());
		expect(adapter.id).toBe("cloud-not-built:gdrive");
	});

	it("doc_set + dropbox source → CloudNotBuiltAdapter", () => {
		const fs = makeFs({
			kind: "doc_set",
			source: "dropbox",
			resourceRef: { kind: "doc_set", folder: "dropbox://MyDocs" },
		});
		const adapter = selectMountAdapter(fs, makeDeps());
		expect(adapter.id).toBe("cloud-not-built:dropbox");
	});

	it("document set with cloud object storage source uses CloudNotBuiltAdapter", () => {
		const fs = makeFs({
			kind: "doc_set",
			source: "s3",
			resourceRef: { kind: "doc_set", folder: "s3://mybucket" },
		});
		const adapter = selectMountAdapter(fs, makeDeps());
		expect(adapter.id).toBe("cloud-not-built:s3");
	});

	it("unknown kind → CloudNotBuiltAdapter (never silent)", () => {
		const fs = makeFs({ kind: "unknown_future_kind" as never, source: "local" });
		const adapter = selectMountAdapter(fs, makeDeps());
		expect(adapter.id).toMatch(/^cloud-not-built:/);
	});
});

describe("CloudNotBuiltAdapter — explicit 'not built', never silent", () => {
	it("mount returns success:false with 'not built' error message", async () => {
		const fs = makeFs({
			kind: "doc_set",
			source: "gdrive",
			resourceRef: { kind: "doc_set", folder: "drive://MyDocs" },
		});
		const adapter = selectMountAdapter(fs, makeDeps());
		const result = await adapter.mount({
			filesystem: fs,
			sandboxPath: "/tmp/sandbox",
			auth: null,
		});
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/not built/i);
	});

	it("captureBack returns success:false captured:false", async () => {
		const fs = makeFs({
			kind: "doc_set",
			source: "gdrive",
			resourceRef: { kind: "doc_set", folder: "drive://MyDocs" },
		});
		const adapter = selectMountAdapter(fs, makeDeps());
		const result = await adapter.captureBack({
			filesystem: fs,
			sandboxPath: "/tmp/sandbox",
			sessionId: "sess-abc",
		});
		expect(result.success).toBe(false);
		expect(result.captured).toBe(false);
	});
});

describe("MalformedFilesystemError", () => {
	it("is an instance of Error", () => {
		const fs = makeFs({
			connectionId: null,
			resourceRef: { kind: "code", repo: "owner/repo", branch: "main" },
		});
		expect(() => selectMountAdapter(fs, makeDeps())).toThrow(Error);
	});

	it("message contains filesystem id", () => {
		const fs = makeFs({
			id: "fs-bad-abc",
			connectionId: null,
			resourceRef: { kind: "code", repo: "owner/repo", branch: "main" },
		});
		try {
			selectMountAdapter(fs, makeDeps());
			expect.fail("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(MalformedFilesystemError);
			if (err instanceof MalformedFilesystemError) {
				expect(err.filesystem.id).toBe("fs-bad-abc");
			}
		}
	});
});
