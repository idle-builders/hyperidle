import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createMigratedDb, waitForReady } from "./integration-helpers.js";

const TEST_API_KEY = "test-ws-key-12345";

describe("AC6: WebSocket upgrade on /api/ws", { timeout: 120_000 }, () => {
	let serverProcess: ChildProcess;
	let port: number;
	let tmpDir: string;
	let dbPath: string;

	beforeAll(async () => {
		port = 10000 + Math.floor(Math.random() * 50000);
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hyperidle-ws-test-"));
		dbPath = path.join(tmpDir, "pgdata");
		await createMigratedDb(dbPath);

		const monoRoot = resolve(__dirname, "../../../..");
		const serverEntrypoint = resolve(__dirname, "../../src/index.ts");

		serverProcess = spawn("npx", ["tsx", serverEntrypoint], {
			cwd: monoRoot,
			env: {
				...process.env,
				HYPERIDLE_API_KEY: TEST_API_KEY,
				PORT: String(port),
				DATABASE_URL: dbPath,
				HYPERIDLE_RATE_LIMIT_PER_MIN: "100000",
			},
			stdio: ["ignore", "pipe", "pipe"],
		});

		// @lore: Under heavy CI load (10+ parallel worktrees on a 10-core machine),
		// spawning a real tsx server subprocess can take >8s. 90s for waitForReady
		// and 120s for the beforeAll hook handle worst-case multi-worktree contention.
		await waitForReady(serverProcess, port, 90_000);
	}, 120_000);

	afterAll(() => {
		serverProcess?.kill();
		if (tmpDir && fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

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
		const res = await fetch(`http://localhost:${port}/api/ws`);
		expect(res.status).toBe(401);
	});

	it("rejects WebSocket connection with invalid token", async () => {
		const res = await fetch(`http://localhost:${port}/api/ws?token=invalid`);
		expect(res.status).toBe(401);
	});

	it("rejects WebSocket connection using the raw HYPERIDLE_API_KEY as the token", async () => {
		const res = await fetch(`http://localhost:${port}/api/ws?token=${TEST_API_KEY}`);
		expect(res.status).toBe(401);
	});
});
