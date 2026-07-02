/**
 * H1 Git Export — HTTP route tests.
 *
 * Route contract (see docs/plans/H1-plan.md §3.5):
 *   GET    /api/git-export/config  -> GitExportConfig (credentials redacted)
 *   PATCH  /api/git-export/config  -> GitExportConfig (zod-validated)
 *   POST   /api/git-export/run     -> GitExportResult  ({force?:boolean})
 *   GET    /api/git-export/status  -> { enabled, repoPath, branch, lastCommitAt, lastCommitSha, lastPushAt }
 */

import { factorySettings, type HyperIdleDb, knowledgeItems } from "@hyperidle/db";
import { type FsAdapter, type GitRunner, resetExportMutexes } from "@hyperidle/fabric";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { authMiddleware } from "../middleware/auth.js";
import { errorHandler } from "../middleware/error-handler.js";
import { createGitExportRoutes } from "../routes/git-export-routes.js";
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-git-export";
const REPO = "/tmp/h1-routes-repo";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

async function setConfigKV(db: HyperIdleDb, pairs: Record<string, string>): Promise<void> {
	const now = "2026-04-18T00:00:00.000Z";
	for (const [key, value] of Object.entries(pairs)) {
		await db
			.insert(factorySettings)
			.values({ key, value, updatedAt: now })
			.onConflictDoUpdate({
				target: factorySettings.key,
				set: { value, updatedAt: now },
			});
	}
}

async function enableExport(
	db: HyperIdleDb,
	overrides: Record<string, string> = {},
): Promise<void> {
	await setConfigKV(db, {
		"git_export.enabled": "true",
		"git_export.repo_path": REPO,
		"git_export.branch": "main",
		"git_export.author_name": "HyperIdle Export",
		"git_export.author_email": "export@hyperidle.local",
		"git_export.debounce_ms": "0",
		...overrides,
	});
}

/**
 * Stub runner that records calls but performs no real git work. Produces a
 * clean diff so the orchestrator lands on `{status:"noop"}` — enough to
 * prove the route wiring without spawning subprocesses.
 */
function createStubRunner(): GitRunner & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		async init(branch: string): Promise<void> {
			calls.push(`init ${branch}`);
		},
		async add(): Promise<void> {
			calls.push("add");
		},
		async rm(): Promise<void> {
			calls.push("rm");
		},
		async commit(): Promise<string> {
			calls.push("commit");
			return "0000000000000000000000000000000000000000";
		},
		async push(): Promise<void> {
			calls.push("push");
		},
		async diffCached(): Promise<boolean> {
			calls.push("diffCached");
			return true;
		},
		async revParseIsInsideWorkTree(): Promise<boolean> {
			calls.push("revParseIsInsideWorkTree");
			return true;
		},
		async configSet(): Promise<void> {
			calls.push("configSet");
		},
		async remoteAdd(): Promise<void> {
			calls.push("remoteAdd");
		},
		async lsFiles(): Promise<readonly string[]> {
			calls.push("lsFiles");
			return [];
		},
		async statusPorcelain(): Promise<readonly string[]> {
			calls.push("statusPorcelain");
			return [];
		},
		async lsRemote(
			_url: string,
			_opts?: { tokenConfig?: { key: string; value: string } },
		): Promise<{ reachable: boolean; reason?: string }> {
			calls.push("lsRemote");
			return { reachable: true };
		},
		// ── AO2 inbound-git stubs (not the subject of git-export-routes tests) ──
		async clone(): Promise<void> {
			calls.push("clone");
		},
		async bundle(): Promise<void> {
			calls.push("bundle");
		},
		async worktreeAdd(): Promise<void> {
			calls.push("worktreeAdd");
		},
		async worktreeRemove(): Promise<void> {
			calls.push("worktreeRemove");
		},
		async fetch(): Promise<void> {
			calls.push("fetch");
		},
		async checkout(): Promise<void> {
			calls.push("checkout");
		},
		async restoreStaged(): Promise<void> {
			calls.push("restoreStaged");
		},
		async cloneBundle(): Promise<void> {
			calls.push("cloneBundle");
		},
		async show(): Promise<string> {
			calls.push("show");
			return "";
		},
		async bundleListHeads(): Promise<Array<{ ref: string; sha: string }>> {
			calls.push("bundleListHeads");
			return [];
		},
	};
}

/** In-memory fs adapter — same shape as git-export.test.ts::createMemFs. */
function createMemFs(): FsAdapter {
	const files = new Map<string, string>();
	const dirs = new Set<string>();
	return {
		existsSync: (p) => files.has(p) || dirs.has(p),
		readFileSync: (p) => {
			const v = files.get(p);
			if (v === undefined) throw new Error(`ENOENT: ${p}`);
			return v;
		},
		writeFileSync: (p, data) => {
			files.set(p, data);
		},
		mkdirSync: (p) => {
			dirs.add(p);
		},
		unlinkSync: (p) => {
			files.delete(p);
		},
	};
}

function buildApp(
	db: HyperIdleDb,
	opts: { createRunner?: (repoPath: string) => GitRunner; fs?: FsAdapter } = {},
): Hono {
	const app = new Hono();
	const api = new Hono();
	api.onError(errorHandler);
	api.use("*", authMiddleware);
	api.route("/git-export", createGitExportRoutes(db, opts));
	api.notFound((c) => {
		const response: ApiErrorResponse = {
			error: "Not found",
			code: API_ERROR_CODES.NOT_FOUND,
		};
		return c.json(response, 404);
	});
	app.route("/api", api);
	return app;
}

describe("Git Export HTTP routes", () => {
	beforeEach(() => {
		resetExportMutexes();
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("GET /api/git-export/config", () => {
		test("requires auth (401 without X-API-Key)", async ({ db }) => {
			const app = buildApp(db);
			const res = await app.request("/api/git-export/config");
			expect(res.status).toBe(401);
			const body = (await res.json()) as ApiErrorResponse;
			expect(body.code).toBe("UNAUTHORIZED");
		});

		test("returns the current config as JSON when authed", async ({ db }) => {
			await enableExport(db, {
				"git_export.remote_url": "git@example.com:owner/repo.git",
				"git_export.branch": "docs",
			});
			const app = buildApp(db);
			const res = await app.request("/api/git-export/config", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				enabled: boolean;
				repoPath: string;
				remoteUrl: string | null;
				branch: string;
				authorName: string;
				authorEmail: string;
				debounceMs: number;
			};
			expect(body.enabled).toBe(true);
			expect(body.repoPath).toBe(REPO);
			expect(body.remoteUrl).toBe("git@example.com:owner/repo.git");
			expect(body.branch).toBe("docs");
		});

		test("redacts embedded credentials from remoteUrl in the response", async ({ db }) => {
			// Somebody seeded `factory_settings` with a credential-bearing URL
			// via migrations / CLI / bypass. GET /config MUST NOT echo it.
			await enableExport(db, {
				"git_export.remote_url": "https://user:ghp_secrettoken@github.com/owner/repo.git",
			});
			const app = buildApp(db);
			const res = await app.request("/api/git-export/config", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { remoteUrl: string | null };
			expect(body.remoteUrl).toBe("https://github.com/owner/repo.git");
			expect(body.remoteUrl).not.toContain("ghp_secrettoken");
			expect(body.remoteUrl).not.toContain("user");
		});
	});

	describe("PATCH /api/git-export/config", () => {
		test("returns 400 for a non-object body", async ({ db }) => {
			const app = buildApp(db);
			const res = await app.request("/api/git-export/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ branch: 12345 }),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as ApiErrorResponse;
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		test("returns 400 when debounceMs is negative", async ({ db }) => {
			const app = buildApp(db);
			const res = await app.request("/api/git-export/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ debounceMs: -1 }),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 when repoPath contains '..' (path traversal)", async ({ db }) => {
			const app = buildApp(db);
			const res = await app.request("/api/git-export/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ repoPath: "/tmp/../etc/passwd" }),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 when repoPath is relative (not absolute)", async ({ db }) => {
			const app = buildApp(db);
			const res = await app.request("/api/git-export/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ repoPath: "./some/relative/path" }),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 when repoPath is under /etc", async ({ db }) => {
			const app = buildApp(db);
			const res = await app.request("/api/git-export/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ repoPath: "/etc/passwd" }),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 when remoteUrl has userinfo credentials", async ({ db }) => {
			const app = buildApp(db);
			const res = await app.request("/api/git-export/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					remoteUrl: "https://user:token@github.com/owner/repo.git",
				}),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 when remoteUrl uses `ext::`", async ({ db }) => {
			const app = buildApp(db);
			const res = await app.request("/api/git-export/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ remoteUrl: "ext::sh -c evil" }),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 when branch starts with '-' (option injection)", async ({ db }) => {
			const app = buildApp(db);
			const res = await app.request("/api/git-export/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ branch: "--upload-pack=evil" }),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 when authorEmail is not an email", async ({ db }) => {
			const app = buildApp(db);
			const res = await app.request("/api/git-export/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ authorEmail: "not-an-email" }),
			});
			expect(res.status).toBe(400);
		});

		test("updates config and returns the patched shape", async ({ db }) => {
			await enableExport(db);
			const app = buildApp(db);
			const res = await app.request("/api/git-export/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					branch: "docs",
					remoteUrl: "git@example.com:owner/repo.git",
					authorName: "Custom Bot",
				}),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				branch: string;
				remoteUrl: string | null;
				authorName: string;
			};
			expect(body.branch).toBe("docs");
			expect(body.remoteUrl).toBe("git@example.com:owner/repo.git");
			expect(body.authorName).toBe("Custom Bot");
		});

		test("accepts toggling enabled to false", async ({ db }) => {
			await enableExport(db);
			const app = buildApp(db);
			const res = await app.request("/api/git-export/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ enabled: false }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { enabled: boolean };
			expect(body.enabled).toBe(false);
		});
	});

	describe("POST /api/git-export/run", () => {
		test("requires auth (401 without X-API-Key)", async ({ db }) => {
			const app = buildApp(db);
			const res = await app.request("/api/git-export/run", { method: "POST" });
			expect(res.status).toBe(401);
		});

		test("returns a GitExportResult shape when disabled", async ({ db }) => {
			await setConfigKV(db, {
				"git_export.enabled": "false",
				"git_export.repo_path": REPO,
			});
			const runner = createStubRunner();
			const app = buildApp(db, { createRunner: () => runner, fs: createMemFs() });
			const res = await app.request("/api/git-export/run", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string };
			expect(body.status).toBe("disabled");
			expect(runner.calls).toHaveLength(0);
		});

		test("returns 400 when repoPath is empty (no fallback)", async ({ db }) => {
			const app = buildApp(db, { createRunner: () => createStubRunner(), fs: createMemFs() });
			const res = await app.request("/api/git-export/run", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ force: true }),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as ApiErrorResponse;
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		test("supports { force: true } to override disabled", async ({ db }) => {
			await setConfigKV(db, {
				"git_export.enabled": "false",
				"git_export.repo_path": REPO,
			});
			await db.insert(knowledgeItems).values({
				id: "ki-force",
				scopeId: null,
				topic: null,
				title: "Force principles",
				body: "# forced\n",
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: "test",
				createdAt: "2026-04-18T00:00:00.000Z",
				updatedAt: "2026-04-18T00:00:00.000Z",
			});

			const runner: GitRunner & { calls: string[] } = {
				calls: [],
				async init(branch) {
					runner.calls.push(`init ${branch}`);
				},
				async add() {
					runner.calls.push("add");
				},
				async rm() {
					runner.calls.push("rm");
				},
				async commit() {
					runner.calls.push("commit");
					return "deadbeefcafef00d1234567890abcdef12345678";
				},
				async push() {
					runner.calls.push("push");
				},
				async diffCached() {
					runner.calls.push("diffCached");
					return false;
				},
				async revParseIsInsideWorkTree() {
					runner.calls.push("revParseIsInsideWorkTree");
					return true;
				},
				async configSet() {
					runner.calls.push("configSet");
				},
				async remoteAdd() {
					runner.calls.push("remoteAdd");
				},
				async lsFiles() {
					runner.calls.push("lsFiles");
					return [];
				},
				async statusPorcelain() {
					runner.calls.push("statusPorcelain");
					return [];
				},
				async lsRemote(
					_url: string,
					_opts?: { tokenConfig?: { key: string; value: string } },
				): Promise<{ reachable: boolean; reason?: string }> {
					runner.calls.push("lsRemote");
					return { reachable: true };
				},
				// ── AO2 inbound-git stubs ──────────────────────────────────────────────
				async clone(): Promise<void> {
					runner.calls.push("clone");
				},
				async bundle(): Promise<void> {
					runner.calls.push("bundle");
				},
				async worktreeAdd(): Promise<void> {
					runner.calls.push("worktreeAdd");
				},
				async worktreeRemove(): Promise<void> {
					runner.calls.push("worktreeRemove");
				},
				async fetch(): Promise<void> {
					runner.calls.push("fetch");
				},
				async checkout(): Promise<void> {
					runner.calls.push("checkout");
				},
				async restoreStaged(): Promise<void> {
					runner.calls.push("restoreStaged");
				},
				async cloneBundle(): Promise<void> {
					runner.calls.push("cloneBundle");
				},
				async show(): Promise<string> {
					runner.calls.push("show");
					return "";
				},
				async bundleListHeads(): Promise<Array<{ ref: string; sha: string }>> {
					runner.calls.push("bundleListHeads");
					return [];
				},
			};
			const app = buildApp(db, { createRunner: () => runner, fs: createMemFs() });
			const res = await app.request("/api/git-export/run", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ force: true }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string };
			expect(body.status).toBe("committed");
			expect(runner.calls).toContain("commit");
		});

		test("returns 400 when body fails zod validation (wrong force type)", async ({ db }) => {
			const app = buildApp(db);
			const res = await app.request("/api/git-export/run", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ force: "please" }),
			});
			expect(res.status).toBe(400);
		});
	});

	describe("GET /api/git-export/status", () => {
		test("requires auth", async ({ db }) => {
			const app = buildApp(db);
			const res = await app.request("/api/git-export/status");
			expect(res.status).toBe(401);
		});

		test("returns { enabled, repoPath, branch, remoteUrl, lastCommitAt, lastCommitSha, lastPushAt }", async ({
			db,
		}) => {
			await enableExport(db, {
				"git_export.last_commit_at": "2026-04-18T09:15:00.000Z",
				"git_export.last_commit_sha": "deadbeefcafef00d1234567890abcdef12345678",
				"git_export.last_push_at": "2026-04-18T09:15:05.000Z",
			});
			const app = buildApp(db);
			const res = await app.request("/api/git-export/status", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				enabled: boolean;
				repoPath: string;
				branch: string;
				remoteUrl: string | null;
				lastCommitAt: string | null;
				lastCommitSha: string | null;
				lastPushAt: string | null;
			};
			expect(body.enabled).toBe(true);
			expect(body.repoPath).toBe(REPO);
			expect(body.branch).toBe("main");
			expect(body.lastCommitAt).toBe("2026-04-18T09:15:00.000Z");
			expect(body.lastCommitSha).toBe("deadbeefcafef00d1234567890abcdef12345678");
			expect(body.lastPushAt).toBe("2026-04-18T09:15:05.000Z");
		});

		test("returns sensible defaults when no config rows exist", async ({ db }) => {
			const app = buildApp(db);
			const res = await app.request("/api/git-export/status", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				enabled: boolean;
				lastCommitAt: string | null;
				lastCommitSha: string | null;
				lastPushAt: string | null;
			};
			expect(body.enabled).toBe(false);
			expect(body.lastCommitAt).toBeNull();
			expect(body.lastCommitSha).toBeNull();
			expect(body.lastPushAt).toBeNull();
		});

		test("redacts embedded credentials from remoteUrl", async ({ db }) => {
			await enableExport(db, {
				"git_export.remote_url": "https://user:ghp_secret@github.com/owner/repo.git",
			});
			const app = buildApp(db);
			const res = await app.request("/api/git-export/status", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { remoteUrl: string | null };
			expect(body.remoteUrl).toBe("https://github.com/owner/repo.git");
		});
	});
});
