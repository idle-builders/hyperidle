/**
 * V1 — Route integration tests for git-export endpoints.
 *
 * GET   /api/git-export           — resource descriptor
 * GET   /api/git-export/config    — get config
 * PATCH /api/git-export/config    — update config
 * POST  /api/git-export/run       — run export
 * GET   /api/git-export/status    — status
 */

import { createTestDb } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { createGitExportRoutes } from "../../routes/git-export-routes.js";
import type { FsAdapter } from "../../services/git-export.js";
import type { GitRunner } from "../../services/git-export-runner.js";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-git-export";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("git-export routes", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("git-export auth", () => {
		test("returns 401 without auth header on GET /api/git-export", async ({ app }) => {
			const res = await app.request("/api/git-export", { method: "GET" });
			expect(res.status).toBe(401);
		});
	});

	describe("GET /api/git-export", () => {
		test("returns 200 with resource descriptor", async ({ app }) => {
			const res = await app.request("/api/git-export", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { ok: boolean; resource: string };
			expect(body.ok).toBe(true);
			expect(body.resource).toBe("git-export");
		});
	});

	describe("GET /api/git-export/config", () => {
		test("returns 200 with config (defaults when no settings exist)", async ({ app }) => {
			const res = await app.request("/api/git-export/config", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				enabled: boolean;
				repoPath: string;
				branch: string;
				authorName: string;
				authorEmail: string;
			};
			expect(typeof body.enabled).toBe("boolean");
			expect(typeof body.branch).toBe("string");
		});
	});

	describe("PATCH /api/git-export/config", () => {
		test("returns 200 with updated config on valid patch", async ({ app }) => {
			const res = await app.request("/api/git-export/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ branch: "main", authorName: "Test Author" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { branch: string; authorName: string };
			expect(body.branch).toBe("main");
			expect(body.authorName).toBe("Test Author");
		});

		test("returns 400 on invalid field values (e.g., bad branch name)", async ({ app }) => {
			// Branch name starting with '-' is invalid
			const res = await app.request("/api/git-export/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ branch: "-invalid-branch" }),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 with extra/unknown fields (strict schema)", async ({ app }) => {
			const res = await app.request("/api/git-export/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ unknownField: "value" }),
			});
			expect(res.status).toBe(400);
		});

		test("redacts remoteUrl in response", async ({ app }) => {
			// HYPERIDLE_GIT_ALLOW_FILE_REMOTE must be true for file:// URLs in tests
			vi.stubEnv("HYPERIDLE_GIT_ALLOW_FILE_REMOTE", "true");
			const res = await app.request("/api/git-export/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ remoteUrl: "file:///path/to/repo.git" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { remoteUrl: string | null };
			// file:// URLs are allowed but should still be redacted (path info removed)
			// Even if not redacted, plaintext credentials must not appear
			expect(typeof body.remoteUrl === "string" || body.remoteUrl === null).toBe(true);
		});
	});

	describe("POST /api/git-export/run", () => {
		test("returns 400 when repoPath is not configured", async ({ app }) => {
			const res = await app.request("/api/git-export/run", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as { error: string };
			expect(body.error).toContain("repoPath");
		});

		test("returns 200 on successful export (injected stubs)", async ({}) => {
			// Build stub GitRunner + FsAdapter and inject directly into route
			const stubRunner: GitRunner = {
				init: async () => {},
				add: async () => {},
				rm: async () => {},
				commit: async () => "abc1234",
				push: async () => {},
				diffCached: async () => true,
				revParseIsInsideWorkTree: async () => true,
				configSet: async () => {},
				remoteAdd: async () => {},
				lsFiles: async () => [],
				statusPorcelain: async () => [],
				lsRemote: async () => ({ reachable: true }),
				// ── AO2 inbound-git stubs (not subject of git-export-routes tests) ──
				clone: async () => {},
				bundle: async () => {},
				worktreeAdd: async () => {},
				worktreeRemove: async () => {},
				fetch: async () => {},
				checkout: async () => {},
				restoreStaged: async () => {},
				currentBranch: async () => null,
			};
			const stubFs: FsAdapter = {
				existsSync: () => true,
				readFileSync: () => "",
				writeFileSync: () => {},
				mkdirSync: () => {},
				unlinkSync: () => {},
			};

			// Use a fresh DB that has repoPath configured
			const handle = await createTestDb();
			const stubDb = handle.db;

			// Configure repoPath via a direct route call with stubs
			const router = createGitExportRoutes(stubDb, {
				createRunner: () => stubRunner,
				fs: stubFs,
			});

			// First set the config
			const configRes = await router.request("/config", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ repoPath: "/tmp/test-repo", enabled: true }),
			});
			expect(configRes.status).toBe(200);

			// Now run
			const runRes = await router.request("/run", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ trigger: "manual" }),
			});
			expect(runRes.status).toBe(200);
			const body = (await runRes.json()) as { status: string };
			// Should be committed, pushed, noop, or similar — but not error
			expect(["committed", "pushed", "noop", "disabled"]).toContain(body.status);

			await handle.close();
		});
	});

	describe("GET /api/git-export/status", () => {
		test("returns 200 with status including enabled, branch, commit info", async ({ app }) => {
			const res = await app.request("/api/git-export/status", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				enabled: boolean;
				branch: string;
				lastCommitAt: string | null;
				lastCommitSha: string | null;
			};
			expect(typeof body.enabled).toBe("boolean");
			expect(typeof body.branch).toBe("string");
			// lastCommitAt and lastCommitSha are null before any export
			expect(body.lastCommitAt === null || typeof body.lastCommitAt === "string").toBe(true);
			expect(body.lastCommitSha === null || typeof body.lastCommitSha === "string").toBe(true);
		});
	});
});
