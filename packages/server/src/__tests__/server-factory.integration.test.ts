/**
 * Server Factory — I1 integration tests (S1–S5).
 *
 * Spawns a real subprocess pointed at a throwaway PGlite data directory
 * seeded up front, then hits endpoints over HTTP/WS.
 *
 * @lore PGlite migration: switched from better-sqlite3 file to PGlite
 * data directory. All seeding is async.
 */

import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { bets, products, schema, teams, threads, users } from "@hyperidle/db";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { authHeaders, waitForReady } from "./integration-helpers.js";

const TEST_API_KEY = "test-server-factory-I1-key";

async function createAndSeedDb(dataDir: string): Promise<void> {
	const migrationsFolder = resolve(__dirname, "../../../db/drizzle");
	const client = new PGlite(dataDir);
	await client.waitReady;
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder });

	const now = new Date().toISOString();
	await db
		.insert(products)
		.values({ id: "p-sf", name: "SF Product", phase: "build", createdAt: now });
	await db
		.insert(teams)
		.values({ id: "t-sf", productId: "p-sf", capacity: 5, activeBets: 0, formedAt: now });
	await db.insert(bets).values({
		id: "bet-sf",
		productId: "p-sf",
		teamId: "t-sf",
		pitch: "Ship the thing",
		appetite: "small",
		status: "shaped",
		createdAt: now,
	});
	await db.insert(users).values({
		id: "agent-sf",
		kind: "ai",
		name: "SF Agent",
		role: "builder",
		teamId: "t-sf",
		status: "active",
		maxConcurrentSessions: 2,
		createdAt: now,
	});
	await db.insert(threads).values({
		id: "thread-sf",
		hostKind: "task",
		hostId: "task-1",
		initiatorId: "agent-1",
		participants: JSON.stringify(["agent-1"]),
		lastActiveAt: now,
		createdAt: now,
	});

	await client.close();
}

describe("server-factory — I1 integration (S1–S5)", () => {
	let serverProcess: ChildProcess;
	let port: number;
	let tmpDir: string;

	beforeAll(async () => {
		port = 10000 + Math.floor(Math.random() * 50000);
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "i1-server-factory-"));
		const dataDir = path.join(tmpDir, "pgdata");
		await createAndSeedDb(dataDir);

		const serverRoot = resolve(__dirname, "../..");

		serverProcess = spawn("npx", ["tsx", "src/index.ts"], {
			cwd: serverRoot,
			env: {
				...process.env,
				HYPERIDLE_API_KEY: TEST_API_KEY,
				PORT: String(port),
				DATABASE_URL: dataDir,
				NODE_ENV: "test",
				HYPERIDLE_WS_TOKEN_TTL_MS: "200",
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

	describe("S2: all domain routes are mounted (non-404)", () => {
		const DOMAIN_PATHS = [
			"/api/bets",
			"/api/tasks",
			"/api/knowledge",
			"/api/conversations",
			"/api/users",
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
			expect(res.status).not.toBe(404);
		});

		it("also mounts /api/health (unauthenticated liveness)", async () => {
			const res = await fetch(`http://localhost:${port}/api/health`);
			expect(res.status).toBe(200);
		});

		const BOUNDED_INDEX_ROUTES: ReadonlyArray<{ path: string; resource: string }> = [
			{ path: "/api/notifications", resource: "notifications" },
			{ path: "/api/observability", resource: "observability" },
			{ path: "/api/git-export", resource: "git-export" },
		];
		it.each(BOUNDED_INDEX_ROUTES)(
			"GET %s returns 200 + { ok: true, resource, endpoints[] }",
			async ({ path: routePath, resource }) => {
				const res = await fetch(`http://localhost:${port}${routePath}`, {
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
			},
		);
	});

	describe("S3: GET /api/bets returns 200 + valid JSON", () => {
		it("returns grouped JSON with a valid API key and seeded data", async () => {
			const res = await fetch(`http://localhost:${port}/api/bets`, {
				headers: authHeaders(TEST_API_KEY),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as unknown;
			const isArrayOrObject = Array.isArray(body) || (typeof body === "object" && body !== null);
			expect(isArrayOrObject).toBe(true);
		});
	});

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

	describe("S5: WebSocket upgrade via short-lived upgrade token (I2 A3/A4/A5)", () => {
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

			const reuse = await fetch(
				`http://localhost:${port}/api/ws?token=${encodeURIComponent(token)}`,
			);
			expect(reuse.status).toBe(401);
		});

		it("A4: rejects an expired token (TTL controlled via HYPERIDLE_WS_TOKEN_TTL_MS)", async () => {
			const token = await issueToken();
			await new Promise((r) => setTimeout(r, 400));
			const res = await fetch(
				`http://localhost:${port}/api/ws?token=${encodeURIComponent(token)}`,
			);
			expect(res.status).toBe(401);
		});

		it("A5: rejects an unknown token", async () => {
			const res = await fetch(`http://localhost:${port}/api/ws?token=garbage-not-issued`);
			expect(res.status).toBe(401);
		});

		it("rejects passing the raw HYPERIDLE_API_KEY as the WS token", async () => {
			const res = await fetch(
				`http://localhost:${port}/api/ws?token=${encodeURIComponent(TEST_API_KEY)}`,
			);
			expect(res.status).toBe(401);
		});
	});
});
