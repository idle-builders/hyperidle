/**
 * N1 — Node server integration test (AC9).
 *
 * Spawns the server via `tsx packages/server/src/index.ts` (Node runtime)
 * and verifies:
 *   1. The HTTP health endpoint responds with 200.
 *   2. A domain route (/api/teams or equivalent) is mounted (non-404).
 *   3. The WebSocket upgrade endpoint rejects an invalid token with 401.
 *
 * This test WILL FAIL in the red phase because:
 *   - `server-factory.ts` still imports `serve` from `"bun"` which tsx
 *     (Node) cannot resolve.
 *   - `routes/ws.ts` still imports from `"hono/bun"`.
 *
 * It WILL PASS after the green phase removes all Bun-specific APIs.
 *
 * Infrastructure mirrors `server-factory.integration.test.ts` — see
 * that file for the full pattern rationale.
 *
 * @lore N1: tsx is the tool for running TypeScript under Node without
 * a build step. It is added as a root devDependency in the green phase.
 * If `tsx` is not found on PATH this test fails with ENOENT — add tsx
 * to root package.json devDependencies first.
 */

import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authHeaders, createMigratedDb, waitForReady } from "./integration-helpers.js";

const TEST_API_KEY = "test-node-server-N1-key";

describe("N1: Node server integration (AC9)", () => {
	let serverProcess: ChildProcess;
	let port: number;
	let tmpDir: string;
	let dbPath: string;

	beforeAll(async () => {
		port = 10000 + Math.floor(Math.random() * 50000);
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "n1-node-server-"));
		dbPath = path.join(tmpDir, "test.db");
		await createMigratedDb(dbPath);

		// Resolve the monorepo root — tsx must be invoked from there so
		// workspace package resolution works.
		const monoRoot = resolve(__dirname, "../../../../..");
		const serverEntrypoint = resolve(__dirname, "../../src/index.ts");

		// Spawn the server under Node via tsx.
		// tsx is a devDependency added in the N1 green phase.
		serverProcess = spawn("npx", ["tsx", serverEntrypoint], {
			cwd: monoRoot,
			env: {
				...process.env,
				HYPERIDLE_API_KEY: TEST_API_KEY,
				PORT: String(port),
				DATABASE_URL: dbPath,
				NODE_ENV: "test",
				HYPERIDLE_RATE_LIMIT_PER_MIN: "100000",
			},
			stdio: ["ignore", "pipe", "pipe"],
		});

		await waitForReady(serverProcess, port);
	}, 20000);

	afterAll(() => {
		serverProcess?.kill();
		if (tmpDir && fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	// ------------------------------------------------------------------ N1-HTTP-1
	it("GET /api/health returns 200 under Node runtime", async () => {
		const res = await fetch(`http://localhost:${port}/api/health`);
		expect(res.status).toBe(200);
	});

	// ------------------------------------------------------------------ N1-HTTP-2
	it("GET /api/status/health returns 200 with auth", async () => {
		const res = await fetch(`http://localhost:${port}/api/status/health`, {
			headers: authHeaders(TEST_API_KEY),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { status?: string };
		expect(body.status).toBe("ok");
	});

	// ------------------------------------------------------------------ N1-HTTP-3
	it("domain routes are mounted (non-404) under Node runtime", async () => {
		const domainPaths = ["/api/bets", "/api/tasks", "/api/agents", "/api/sessions"];
		for (const domainPath of domainPaths) {
			const res = await fetch(`http://localhost:${port}${domainPath}`, {
				headers: authHeaders(TEST_API_KEY),
			});
			// 200/400/401/403 all indicate the route exists; only 404 = missing.
			expect(res.status, `${domainPath} returned 404 — route not mounted`).not.toBe(404);
		}
	});

	// ------------------------------------------------------------------ N1-HTTP-4
	it("GET /api/ws without token returns 401 (WS endpoint is mounted)", async () => {
		const res = await fetch(`http://localhost:${port}/api/ws`);
		// 401 proves the auth middleware is active and the route is mounted.
		expect(res.status).toBe(401);
	});
});
