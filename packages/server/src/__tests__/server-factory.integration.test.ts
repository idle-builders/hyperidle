/**
 * Server Factory — I1 integration tests (S1–S5).
 *
 * `createServer` boots a Hono app that exposes the full route tree:
 * `/health`, `/api/health`, `/api/ws` and all domain routes
 * (`/api/bets`, `/api/tasks`, `/api/knowledge`, `/api/conversations`,
 * `/api/agents`, `/api/sessions`, `/api/rail`, `/api/status`,
 * `/api/notifications`, `/api/observability`, `/api/git-export`,
 * `/api/routines`). I1 fixed the original bug where production booted
 * a different app than the one used by integration tests.
 *
 * These tests assert:
 *   S1 — `GET /api/status/health` returns 200.
 *   S2 — every domain route returns non-404 (200/400/401/403 all OK;
 *        404 means the route is missing).
 *   S3 — `GET /api/bets` returns 200 + JSON.
 *   S4 — `POST /api/conversations/items` returns 201 + id when given a
 *        valid body + seeded thread.
 *   S5 — WebSocket upgrade at `/api/ws?token=<key>` succeeds.
 *
 * How: Vitest runs under Node; the server uses Node-compatible imports
 * (@hono/node-server, better-sqlite3 via @hyperidle/db). We spawn
 * `bun run src/index.ts` as a subprocess, pointed at a throwaway SQLite
 * file seeded up front.
 *
 * @lore I1 S-tests via subprocess: Vitest runs under Node; the subprocess
 * pattern mirrors the production boot path so any regression in
 * server-factory surfaces here. After N1, the server uses only
 * Node-compatible imports so `tsx` can also run it directly.
 */

import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolve } from "node:path";
import { agents, bets, createDb, products, teams, threads } from "@hyperidle/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { authHeaders, waitForReady } from "./integration-helpers.js";

const TEST_API_KEY = "test-server-factory-I1-key";

// Seed a throwaway sqlite file + migrate it + insert minimal fixtures so
// S3 and S4 have something to query/create against. We use `createDb`
// from @hyperidle/db for the handle; migrations are run by a second
// import path because `createDb` itself does not migrate.
async function createAndSeedDb(dbPath: string): Promise<void> {
	// Import the migrator dynamically so we use the version bundled with
	// the @hyperidle/db package.
	const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
	const migrationsFolder = resolve(__dirname, "../../../db/drizzle");
	const db = createDb(dbPath);
	migrate(db, { migrationsFolder });

	const now = new Date().toISOString();
	db.insert(products)
		.values({ id: "p-sf", name: "SF Product", phase: "build", createdAt: now })
		.run();
	db.insert(teams)
		.values({ id: "t-sf", productId: "p-sf", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(bets)
		.values({
			id: "bet-sf",
			productId: "p-sf",
			teamId: "t-sf",
			pitch: "Ship the thing",
			appetite: "small",
			status: "shaped",
			createdAt: now,
		})
		.run();
	db.insert(agents)
		.values({
			id: "agent-sf",
			name: "SF Agent",
			role: "builder",
			teamId: "t-sf",
			status: "active",
			maxConcurrentSessions: 2,
			createdAt: now,
		})
		.run();
	db.insert(threads)
		.values({
			id: "thread-sf",
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "agent-1",
			participants: JSON.stringify(["agent-1"]),
			lastActiveAt: now,
			createdAt: now,
		})
		.run();
}

describe("server-factory — I1 integration (S1–S5)", () => {
	let serverProcess: ChildProcess;
	let port: number;
	let tmpDir: string;
	let dbPath: string;

	beforeAll(async () => {
		port = 10000 + Math.floor(Math.random() * 50000);
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "i1-server-factory-"));
		dbPath = path.join(tmpDir, "test.db");
		await createAndSeedDb(dbPath);

		const serverRoot = resolve(__dirname, "../..");

		// @lore N1: spawn via tsx (Node) instead of bun because better-sqlite3
		// cannot be dlopened under Bun (oven-sh/bun#4290).
		serverProcess = spawn("npx", ["tsx", "src/index.ts"], {
			cwd: serverRoot,
			env: {
				...process.env,
				HYPERIDLE_API_KEY: TEST_API_KEY,
				PORT: String(port),
				DATABASE_URL: dbPath,
				NODE_ENV: "test",
				// I2 A4: a tiny TTL so the expired-token assertion runs in
				// well under a second. The store reads this on construction.
				HYPERIDLE_WS_TOKEN_TTL_MS: "200",
				// Keep the I2 rate-limit middleware from tripping on the
				// many integration probes this suite fires per second.
				HYPERIDLE_RATE_LIMIT_PER_MIN: "100000",
			},
			stdio: ["ignore", "pipe", "pipe"],
		});

		await waitForReady(serverProcess, port, 8000);
	}, 15000);

	afterAll(() => {
		serverProcess?.kill();
		if (tmpDir && fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	// ------------------------------------------------------------ S1
	describe("S1: GET /api/status/health returns 200", () => {
		it("responds with 200 and JSON when authenticated", async () => {
			const res = await fetch(`http://localhost:${port}/api/status/health`, {
				headers: authHeaders(TEST_API_KEY),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { status?: string };
			expect(body.status).toBe("ok");
		});
	});

	// ------------------------------------------------------------ S2
	describe("S2: all domain routes are mounted (non-404)", () => {
		const DOMAIN_PATHS = [
			"/api/bets",
			"/api/tasks",
			"/api/knowledge",
			"/api/conversations",
			"/api/agents",
			"/api/sessions",
			"/api/rail",
			"/api/status",
			"/api/notifications",
			"/api/observability",
			"/api/git-export",
			"/api/routines",
		];

		it.each(DOMAIN_PATHS)("GET %s does not return 404", async (domainPath) => {
			const res = await fetch(`http://localhost:${port}${domainPath}`, {
				headers: authHeaders(TEST_API_KEY),
			});
			// 200 (data), 400 (bad input), 401 (auth), 403 (forbidden) are
			// all acceptable — they prove the route is mounted. 404 proves
			// the route is missing (the bug I1 fixes).
			expect(res.status).not.toBe(404);
		});

		it("also mounts /api/health (unauthenticated liveness)", async () => {
			const res = await fetch(`http://localhost:${port}/api/health`);
			expect(res.status).toBe(200);
		});

		// The five route files that gained `GET /` handlers in I1 must
		// return a consistent, DB-free descriptor — not an unbounded SELECT
		// or a redacted-config blob. This assertion pins the contract so any
		// future regression that reintroduces an unbounded list fails here.
		// @lore I1 simplification-#2 / architecture-S1.
		// @lore I6: /api/sessions removed — now returns a filterable list (not a descriptor).
		// O2: /api/knowledge now returns a list (not a descriptor) — removed from this check
		const BOUNDED_INDEX_ROUTES: ReadonlyArray<{ path: string; resource: string }> = [
			{ path: "/api/notifications", resource: "notifications" },
			{ path: "/api/observability", resource: "observability" },
			{ path: "/api/git-export", resource: "git-export" },
		];
		it.each(
			BOUNDED_INDEX_ROUTES,
		)("GET %s returns 200 + { ok: true, resource, endpoints[] }", async ({ path, resource }) => {
			const res = await fetch(`http://localhost:${port}${path}`, {
				headers: authHeaders(TEST_API_KEY),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				ok?: unknown;
				resource?: unknown;
				endpoints?: unknown;
			};
			expect(body.ok).toBe(true);
			expect(body.resource).toBe(resource);
			expect(Array.isArray(body.endpoints)).toBe(true);
		});
	});

	// ------------------------------------------------------------ S3
	describe("S3: GET /api/bets returns 200 + valid JSON", () => {
		it("returns grouped JSON with a valid API key and seeded data", async () => {
			const res = await fetch(`http://localhost:${port}/api/bets`, {
				headers: authHeaders(TEST_API_KEY),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as unknown;
			// The endpoint returns either an array or an object keyed by
			// status. Either shape is acceptable — both prove the route
			// is wired and the db query ran.
			const isArrayOrObject = Array.isArray(body) || (typeof body === "object" && body !== null);
			expect(isArrayOrObject).toBe(true);
		});
	});

	// ------------------------------------------------------------ S4
	describe("S4: POST /api/conversations/items returns 201", () => {
		it("creates an item bound to a seeded thread and returns its id", async () => {
			const res = await fetch(`http://localhost:${port}/api/conversations/items`, {
				method: "POST",
				headers: authHeaders(TEST_API_KEY),
				body: JSON.stringify({
					threadId: "thread-sf",
					title: "S4 test item",
				}),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as { id?: string };
			expect(typeof body.id).toBe("string");
			expect(body.id?.length ?? 0).toBeGreaterThan(0);
		});
	});

	// ------------------------------------------------------------ S5
	describe("S5: WebSocket upgrade via short-lived upgrade token (I2 A3/A4/A5)", () => {
		// Helper: hit the I2 ws-token endpoint with a valid X-API-Key.
		async function issueToken(): Promise<string> {
			const res = await fetch(`http://localhost:${port}/api/auth/ws-token`, {
				method: "POST",
				headers: authHeaders(TEST_API_KEY),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { token?: string };
			expect(typeof body.token).toBe("string");
			expect(body.token?.length ?? 0).toBeGreaterThan(0);
			return body.token as string;
		}

		it("A3: connects with a freshly issued upgrade token, then rejects reuse", async () => {
			const token = await issueToken();

			// First open should succeed.
			const url = `ws://localhost:${port}/api/ws?token=${encodeURIComponent(token)}`;
			const ws1 = new WebSocket(url);
			const opened = await new Promise<boolean>((resolveOpened) => {
				const timer = setTimeout(() => resolveOpened(false), 3000);
				ws1.onopen = (): void => {
					clearTimeout(timer);
					resolveOpened(true);
				};
				ws1.onerror = (): void => {
					clearTimeout(timer);
					resolveOpened(false);
				};
			});
			expect(opened).toBe(true);
			ws1.close();

			// Reusing the same token must fail with 401 (one-shot semantics).
			const reuse = await fetch(
				`http://localhost:${port}/api/ws?token=${encodeURIComponent(token)}`,
			);
			expect(reuse.status).toBe(401);
		});

		it("A4: rejects an expired token (TTL controlled via HYPERIDLE_WS_TOKEN_TTL_MS)", async () => {
			// We can't restart the subprocess from inside the test, so we
			// rely on a small TTL set at server startup. The startup env
			// below sets HYPERIDLE_WS_TOKEN_TTL_MS=200 — wait past that
			// before consuming the token.
			const token = await issueToken();
			await new Promise((r) => setTimeout(r, 400));
			const res = await fetch(`http://localhost:${port}/api/ws?token=${encodeURIComponent(token)}`);
			expect(res.status).toBe(401);
		});

		it("A5: rejects an unknown token", async () => {
			const res = await fetch(`http://localhost:${port}/api/ws?token=garbage-not-issued`);
			expect(res.status).toBe(401);
		});

		it("rejects passing the raw HYPERIDLE_API_KEY as the WS token (master key cannot be used)", async () => {
			const res = await fetch(
				`http://localhost:${port}/api/ws?token=${encodeURIComponent(TEST_API_KEY)}`,
			);
			expect(res.status).toBe(401);
		});
	});
});
