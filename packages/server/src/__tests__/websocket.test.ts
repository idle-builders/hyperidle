import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolve } from "node:path";
import { createDb } from "@hyperidle/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";

const TEST_API_KEY = "test-ws-key-12345";

describe("AC6: WebSocket upgrade on /api/ws", () => {
	let serverProcess: ChildProcess;
	let port: number;
	let tmpDir: string;
	let dbPath: string;

	beforeAll(async () => {
		port = 10000 + Math.floor(Math.random() * 50000);
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hyperidle-ws-test-"));
		dbPath = path.join(tmpDir, "test.db");

		// I1: `createApp` queries `factory_settings` at boot, so the DB must
		// be migrated before the server starts. Seed it here with the same
		// migrator the production path uses.
		const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
		const migrationsFolder = resolve(__dirname, "../../../db/drizzle");
		const db = createDb(dbPath);
		migrate(db, { migrationsFolder });

		// Resolve the server package root
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
				// I2: avoid rate-limit interference between independent
				// integration suites that may share an IP bucket.
				HYPERIDLE_RATE_LIMIT_PER_MIN: "100000",
			},
			stdio: ["ignore", "pipe", "pipe"],
		});

		// Wait for server to be ready
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error("Server start timeout")), 8000);
			serverProcess.stdout?.on("data", (data: Buffer) => {
				if (data.toString().includes("Server running")) {
					clearTimeout(timeout);
					resolve();
				}
			});
			serverProcess.on("error", (err) => {
				clearTimeout(timeout);
				reject(err);
			});
		});
	});

	afterAll(() => {
		serverProcess?.kill();
		if (tmpDir && fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	// I2 A3: the WS endpoint no longer accepts the raw HYPERIDLE_API_KEY as
	// `?token=...`. Clients must POST /api/auth/ws-token (with the API key)
	// to mint a one-shot upgrade token, then open the WS with that token.
	async function issueUpgradeToken(): Promise<string> {
		const res = await fetch(`http://localhost:${port}/api/auth/ws-token`, {
			method: "POST",
			headers: { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { token?: string };
		expect(typeof body.token).toBe("string");
		return body.token as string;
	}

	it("upgrades WebSocket connection with a freshly-minted upgrade token", async () => {
		const token = await issueUpgradeToken();
		const ws = new WebSocket(`ws://localhost:${port}/api/ws?token=${encodeURIComponent(token)}`);

		const connected = await new Promise<boolean>((resolve) => {
			ws.onopen = () => resolve(true);
			ws.onerror = () => resolve(false);
			setTimeout(() => resolve(false), 3000);
		});

		expect(connected).toBe(true);
		ws.close();
	});

	it("rejects WebSocket connection without token", async () => {
		// Without token, the auth middleware returns 401 before upgrade
		const res = await fetch(`http://localhost:${port}/api/ws`);

		expect(res.status).toBe(401);
	});

	it("rejects WebSocket connection with invalid token", async () => {
		const res = await fetch(`http://localhost:${port}/api/ws?token=invalid`);

		expect(res.status).toBe(401);
	});

	it("rejects WebSocket connection using the raw HYPERIDLE_API_KEY as the token", async () => {
		// The master key must NOT be accepted on the WS query channel.
		const res = await fetch(`http://localhost:${port}/api/ws?token=${TEST_API_KEY}`);
		expect(res.status).toBe(401);
	});
});
