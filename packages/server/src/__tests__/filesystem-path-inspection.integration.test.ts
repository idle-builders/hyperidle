/**
 * Folder registered as filesystem with detected branch.
 *
 * Integration test — real DB/app + real git in temp dir.
 * - Git repo with branch → kind:"code" + branch + writeback:"none"
 * - Non-git folder → kind:"doc_set" + writeback:"none"
 * - Git repo with NO commits (no resolvable branch) → kind:"doc_set" (never 400)
 */

import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { vi } from "vitest";
import { describe, expect, test } from "../test-fixtures.js";

const exec = promisify(execFile);
const TEST_API_KEY = "test-key-AV1-fs";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function initGitRepo(dir: string, withCommit: boolean): Promise<string> {
	await exec("git", ["init", "-b", "main", dir]);
	await exec("git", ["-C", dir, "config", "user.email", "test@test.com"]);
	await exec("git", ["-C", dir, "config", "user.name", "Tester"]);
	if (withCommit) {
		await writeFile(join(dir, "README.md"), "# test");
		await exec("git", ["-C", dir, "add", "."]);
		await exec("git", ["-C", dir, "commit", "-m", "init"]);
	}
	return dir;
}

describe("filesystem path inspection and registration", () => {
	test("POST /api/filesystems/inspect-path: git repo with branch returns isGitRepo:true + branch", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const dir = join(tmpdir(), `av1-git-${Date.now()}`);
		await mkdir(dir, { recursive: true });
		try {
			await initGitRepo(dir, true);

			const res = await app.request("/api/filesystems/inspect-path", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ path: dir }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				exists: boolean;
				isGitRepo: boolean;
				branch: string | null;
			};
			expect(body.exists).toBe(true);
			expect(body.isGitRepo).toBe(true);
			expect(body.branch).toBe("main");
		} finally {
			await rm(dir, { recursive: true, force: true });
			vi.unstubAllEnvs();
		}
	});

	test("POST /api/filesystems/inspect-path: non-git folder returns isGitRepo:false, branch:null", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		// @lore AV1: os.tmpdir() on macOS may be inside a git worktree (/var/folders/…)
		// so `git rev-parse --is-inside-work-tree` returns true for tmpdir children.
		// os.homedir() is confirmed outside any git repo on dev machines.
		const dir = join(homedir(), `.hyperidle-test-nongit-${Date.now()}`);
		await mkdir(dir, { recursive: true });
		try {
			const res = await app.request("/api/filesystems/inspect-path", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ path: dir }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				exists: boolean;
				isGitRepo: boolean;
				branch: string | null;
			};
			expect(body.exists).toBe(true);
			expect(body.isGitRepo).toBe(false);
			expect(body.branch).toBeNull();
		} finally {
			await rm(dir, { recursive: true, force: true });
			vi.unstubAllEnvs();
		}
	});

	test("POST /api/filesystems/inspect-path: git repo with NO commits returns branch:null", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const dir = join(tmpdir(), `av1-empty-git-${Date.now()}`);
		await mkdir(dir, { recursive: true });
		try {
			await initGitRepo(dir, false); // no commits

			const res = await app.request("/api/filesystems/inspect-path", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ path: dir }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				exists: boolean;
				isGitRepo: boolean;
				branch: string | null;
			};
			expect(body.exists).toBe(true);
			expect(body.isGitRepo).toBe(true);
			expect(body.branch).toBeNull(); // detached / no commits → null
		} finally {
			await rm(dir, { recursive: true, force: true });
			vi.unstubAllEnvs();
		}
	});

	test("git repo with branch → filesystem registered as kind:code with branch + writeback:none", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const dir = join(tmpdir(), `av1-reg-git-${Date.now()}`);
		await mkdir(dir, { recursive: true });
		try {
			await initGitRepo(dir, true);

			// Create a team first
			const teamRes = await app.request("/api/teams", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ name: "FS Team", functions: ["development"] }),
			});
			expect(teamRes.status).toBe(201);
			const teamBody = (await teamRes.json()) as { team: { id: string } };
			const teamId = teamBody.team.id;

			// Register as code filesystem
			const fsRes = await app.request("/api/filesystems", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: dir, branch: "main" },
					writeback: "none",
				}),
			});
			expect(fsRes.status).toBe(201);

			// Assert via GET /api/filesystems?teamId=
			const listRes = await app.request(`/api/filesystems?teamId=${teamId}`, {
				headers: authHeaders(),
			});
			expect(listRes.status).toBe(200);
			const listBody = (await listRes.json()) as {
				filesystems: Array<{
					kind: string;
					resourceRef: { kind: string; repo?: string; branch?: string };
					writeback: string;
				}>;
			};
			const fs = listBody.filesystems[0];
			expect(fs?.kind).toBe("code");
			expect(fs?.resourceRef?.branch).toBe("main");
			expect(fs?.writeback).toBe("none");
		} finally {
			await rm(dir, { recursive: true, force: true });
			vi.unstubAllEnvs();
		}
	});

	test("empty-branch git repo → registered as doc_set, never 400", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const dir = join(tmpdir(), `av1-empty-reg-${Date.now()}`);
		await mkdir(dir, { recursive: true });
		try {
			await initGitRepo(dir, false); // no commits → no resolvable branch

			// Create team
			const teamRes = await app.request("/api/teams", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ name: "Empty FS Team", functions: ["development"] }),
			});
			expect(teamRes.status).toBe(201);
			const teamBody = (await teamRes.json()) as { team: { id: string } };
			const teamId = teamBody.team.id;

			// Since no branch, register as doc_set (the fallback for empty-branch)
			const fsRes = await app.request("/api/filesystems", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId,
					kind: "doc_set",
					connectionId: null,
					resourceRef: { kind: "doc_set", folder: dir },
					writeback: "none",
				}),
			});
			// Must NOT 400 — doc_set registration should succeed
			expect(fsRes.status).toBe(201);

			const listRes = await app.request(`/api/filesystems?teamId=${teamId}`, {
				headers: authHeaders(),
			});
			expect(listRes.status).toBe(200);
			const listBody = (await listRes.json()) as {
				filesystems: Array<{ kind: string; writeback: string }>;
			};
			expect(listBody.filesystems.length).toBe(1);
			expect(listBody.filesystems[0]?.kind).toBe("doc_set");
			expect(listBody.filesystems[0]?.writeback).toBe("none");
		} finally {
			await rm(dir, { recursive: true, force: true });
			vi.unstubAllEnvs();
		}
	});

	test("non-git folder → registered as doc_set with writeback:none", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const dir = join(tmpdir(), `av1-doc-${Date.now()}`);
		await mkdir(dir, { recursive: true });
		try {
			// Create team
			const teamRes = await app.request("/api/teams", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ name: "Doc Team", functions: ["development"] }),
			});
			expect(teamRes.status).toBe(201);
			const teamBody = (await teamRes.json()) as { team: { id: string } };
			const teamId = teamBody.team.id;

			// Register as doc_set
			const fsRes = await app.request("/api/filesystems", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId,
					kind: "doc_set",
					connectionId: null,
					resourceRef: { kind: "doc_set", folder: dir },
					writeback: "none",
				}),
			});
			expect(fsRes.status).toBe(201);

			const listRes = await app.request(`/api/filesystems?teamId=${teamId}`, {
				headers: authHeaders(),
			});
			const listBody = (await listRes.json()) as {
				filesystems: Array<{ kind: string; writeback: string }>;
			};
			const fs = listBody.filesystems[0];
			expect(fs?.kind).toBe("doc_set");
			expect(fs?.writeback).toBe("none");
		} finally {
			await rm(dir, { recursive: true, force: true });
			vi.unstubAllEnvs();
		}
	});
});
