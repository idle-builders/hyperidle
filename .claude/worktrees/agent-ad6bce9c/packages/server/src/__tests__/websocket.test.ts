import { type ChildProcess, spawn } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";

const TEST_API_KEY = "test-ws-key-12345";

describe("AC6: WebSocket upgrade on /api/ws", () => {
	let serverProcess: ChildProcess;
	let port: number;

	beforeAll(async () => {
		port = 10000 + Math.floor(Math.random() * 50000);

		// Resolve the server package root
		const serverRoot = resolve(__dirname, "../..");

		serverProcess = spawn("bun", ["run", "src/index.ts"], {
			cwd: serverRoot,
			env: {
				...process.env,
				HYPERIDLE_API_KEY: TEST_API_KEY,
				PORT: String(port),
			},
			stdio: ["ignore", "pipe", "pipe"],
		});

		// Wait for server to be ready
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error("Server start timeout")), 5000);
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
