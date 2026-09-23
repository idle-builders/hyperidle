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
import { describe, expect, test } from "../__testing__/test-fixtures.js";

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

	// @lore BC5 T11: `POST /api/teams` and `POST /api/filesystems` are deleted
	// with the `teams`/`filesystems` route families — a folder is a user
	// attribute now, given through `edit_user({ folders: { add } })` and read
	// back through `open_user({ id }).folders`.
	async function createHumanWithTeam(
		app: { request: (path: string, init?: RequestInit) => Promise<Response> },
		name: string,
	): Promise<string> {
		const res = await app.request("/api/actions/edit_user", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ kind: "human", name, team: { name: `${name} Team` } }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: true; data: { user: { id: string } | null } };
		const id = body.data.user?.id;
		if (!id) throw new Error("edit_user did not return a created human");
		return id;
	}

	async function addFolder(
		app: { request: (path: string, init?: RequestInit) => Promise<Response> },
		id: string,
		folder: {
			kind: "code" | "doc_set";
			resourceRef: Record<string, unknown>;
			writeback: "git" | "file" | "none";
		},
	): Promise<Response> {
		return app.request("/api/actions/edit_user", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ id, folders: { add: [folder] } }),
		});
	}

	async function openFolders(
		app: { request: (path: string, init?: RequestInit) => Promise<Response> },
		id: string,
	): Promise<Array<{ kind: string; resourceRef: Record<string, unknown>; writeback: string }>> {
		const res = await app.request("/api/actions/open_user", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ id }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			ok: true;
			data: {
				folders: Array<{ kind: string; resourceRef: Record<string, unknown>; writeback: string }>;
			};
		};
		return body.data.folders;
	}

	test("git repo with branch → filesystem registered as kind:code with branch + writeback:none", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const dir = join(tmpdir(), `av1-reg-git-${Date.now()}`);
		await mkdir(dir, { recursive: true });
		try {
			await initGitRepo(dir, true);

			const id = await createHumanWithTeam(app, "FS Human");

			const fsRes = await addFolder(app, id, {
				kind: "code",
				resourceRef: { kind: "code", repo: dir, branch: "main" },
				writeback: "none",
			});
			expect(fsRes.status).toBe(200);

			const folders = await openFolders(app, id);
			const fs = folders[0];
			expect(fs?.kind).toBe("code");
			expect(fs?.resourceRef?.branch).toBe("main");
			expect(fs?.writeback).toBe("none");
		} finally {
			await rm(dir, { recursive: true, force: true });
			vi.unstubAllEnvs();
		}
	});

	test("empty-branch git repo → registered as doc_set, never refused", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const dir = join(tmpdir(), `av1-empty-reg-${Date.now()}`);
		await mkdir(dir, { recursive: true });
		try {
			await initGitRepo(dir, false); // no commits → no resolvable branch

			const id = await createHumanWithTeam(app, "Empty FS Human");

			// Since no branch, register as doc_set (the fallback for empty-branch).
			// Must NOT be refused — doc_set registration should succeed.
			const fsRes = await addFolder(app, id, {
				kind: "doc_set",
				resourceRef: { kind: "doc_set", folder: dir },
				writeback: "none",
			});
			expect(fsRes.status).toBe(200);

			const folders = await openFolders(app, id);
			expect(folders.length).toBe(1);
			expect(folders[0]?.kind).toBe("doc_set");
			expect(folders[0]?.writeback).toBe("none");
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
			const id = await createHumanWithTeam(app, "Doc Human");

			const fsRes = await addFolder(app, id, {
				kind: "doc_set",
				resourceRef: { kind: "doc_set", folder: dir },
				writeback: "none",
			});
			expect(fsRes.status).toBe(200);

			const folders = await openFolders(app, id);
			const fs = folders[0];
			expect(fs?.kind).toBe("doc_set");
			expect(fs?.writeback).toBe("none");
		} finally {
			await rm(dir, { recursive: true, force: true });
			vi.unstubAllEnvs();
		}
	});
});
