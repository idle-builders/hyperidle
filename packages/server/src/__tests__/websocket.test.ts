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

		serverProcess = spawn("bun", ["run", "src/index.ts"], {
			cwd: serverRoot,
			env: {
				...process.env,
				HYPERIDLE_API_KEY: TEST_API_KEY,
				PORT: String(port),
				DATABASE_URL: dbPath,
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

	it("upgrades WebSocket connection with valid token", async () => {
		const ws = new WebSocket(`ws://localhost:${port}/api/ws?token=${TEST_API_KEY}`);

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
});
