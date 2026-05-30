/**
 * N1 — Full WebSocket e2e lifecycle under Node runtime (AC10).
 *
 * Spawns the server via `tsx` (Node runtime) and exercises the full
 * WebSocket lifecycle:
 *   1. Connect via upgrade token (minted by POST /api/auth/ws-token).
 *   2. Receive the `{ type: "connected" }` message on open.
 *   3. Subscribe to a global topic ("work").
 *   4. Receive the `{ type: "subscribed", topic: "work" }` ack.
 *   5. Unsubscribe.
 *   6. Receive the `{ type: "unsubscribed", topic: "work" }` ack.
 *   7. Disconnect cleanly.
 *
 * Additionally tests the access-control boundary:
 *   - Connecting without a token yields HTTP 401.
 *   - Using an already-consumed token yields HTTP 401 (one-shot semantics).
 *
 * This test WILL FAIL in the red phase because:
 *   - `server-factory.ts` imports `serve` from `"bun"` which tsx cannot load.
 *   - `routes/ws.ts` imports from `"hono/bun"`.
 *
 * It WILL PASS after the green phase.
 *
 * @lore N1: upgradeWebSocket from @hono/node-server wraps the `ws` package
 * under Node. The WS client uses the same `ws` npm package the test suite
 * already depends on for the Bun integration tests.
 */

import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { authHeaders, createMigratedDb, waitForReady } from "./integration-helpers.js";

const TEST_API_KEY = "test-node-ws-N1-e2e-key";

/**
 * Mint a one-shot WebSocket upgrade token from the server.
 * Mirrors the helper in websocket.test.ts.
 *
 * @lore N1: The server uses createDbSubscribeAuthorizer which requires an
 * authenticated identity (senderId) before allowing subscribe calls —
 * even for global topics like "work" and "conversations". The authorizer
 * checks `clientIdentities.get(client)` and returns "forbidden" when no
 * identity is set. Passing X-Identity here binds an identityId to the
 * upgrade token so the WS broadcaster accepts subscribe requests from
 * this client. See ws-broadcaster.ts subscribe() and createServer() in
 * server-factory.ts.
 */
async function issueUpgradeToken(port: number): Promise<string> {
	const res = await fetch(`http://localhost:${port}/api/auth/ws-token`, {
		method: "POST",
		headers: { ...authHeaders(TEST_API_KEY), "X-Identity": "test-identity-n1-ws" },
	});
	expect(res.status).toBe(200);
	const body = (await res.json()) as { token?: string };
	expect(typeof body.token).toBe("string");
	return body.token as string;
}

/**
 * Open a WebSocket to the server with an upgrade token and wait for the
 * first message (the "connected" ack). Returns the open WebSocket.
 */
async function connectWs(port: number, token: string): Promise<WebSocket> {
	const ws = new WebSocket(`ws://localhost:${port}/api/ws?token=${encodeURIComponent(token)}`);

	// Wait for the "connected" message or an error.
	await new Promise<void>((res, rej) => {
		const timer = setTimeout(() => rej(new Error("WS connect timeout")), 5000);
		ws.once("message", (data) => {
			clearTimeout(timer);
			const msg = JSON.parse(String(data)) as { type?: string };
			if (msg.type === "connected") {
				res();
			} else {
				rej(new Error(`Expected "connected" message, got: ${String(data)}`));
			}
		});
		ws.once("error", (err) => {
			clearTimeout(timer);
			rej(err);
		});
	});

	return ws;
}

/**
 * Send a message and wait for the next message from the server.
 */
function sendAndReceive(ws: WebSocket, payload: unknown, timeoutMs = 3000): Promise<unknown> {
	return new Promise((res, rej) => {
		const timer = setTimeout(() => rej(new Error("WS response timeout")), timeoutMs);
		ws.once("message", (data) => {
			clearTimeout(timer);
			res(JSON.parse(String(data)));
		});
		ws.send(JSON.stringify(payload));
	});
}

describe("N1: WebSocket e2e lifecycle under Node runtime (AC10)", () => {
	let serverProcess: ChildProcess;
	let port: number;
	let tmpDir: string;
	let dbPath: string;

	beforeAll(async () => {
		port = 10000 + Math.floor(Math.random() * 50000);
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "n1-node-ws-e2e-"));
		dbPath = path.join(tmpDir, "test.db");
		await createMigratedDb(dbPath);

		// @lore O1: 4 levels up, not 5. See node-server.integration.test.ts.
		const monoRoot = resolve(__dirname, "../../../..");
		const serverEntrypoint = resolve(__dirname, "../../src/index.ts");

		serverProcess = spawn("npx", ["tsx", serverEntrypoint], {
			cwd: monoRoot,
			env: {
				...process.env,
				HYPERIDLE_API_KEY: TEST_API_KEY,
				PORT: String(port),
				DATABASE_URL: dbPath,
				NODE_ENV: "test",
				HYPERIDLE_RATE_LIMIT_PER_MIN: "100000",
				// Generous TTL for subscribe/unsubscribe flows.
				HYPERIDLE_WS_TOKEN_TTL_MS: "30000",
			},
			stdio: ["ignore", "pipe", "pipe"],
		});

		// @lore: Under heavy CI load (10+ parallel worktrees on a 10-core machine),
		// spawning a real tsx server subprocess can take >20s. 90s for waitForReady
		// and 120s for the beforeAll hook handle worst-case multi-worktree contention.
		await waitForReady(serverProcess, port, 90_000);
	}, 120_000);

	afterAll(() => {
		serverProcess?.kill();
		if (tmpDir && fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	// ------------------------------------------------------------------ N1-WS-1
	it("connects and receives connected ack with a valid upgrade token", async () => {
		const token = await issueUpgradeToken(port);
		const ws = await connectWs(port, token);
		// If we reach here the WebSocket opened and sent the "connected" ack.
		expect(ws.readyState).toBe(WebSocket.OPEN);
		ws.close();
	});

	// ------------------------------------------------------------------ N1-WS-2
	it("subscribe to global topic 'work' receives subscribed ack", async () => {
		const token = await issueUpgradeToken(port);
		const ws = await connectWs(port, token);

		const ack = (await sendAndReceive(ws, {
			type: "subscribe",
			topic: "work",
		})) as { type?: string; topic?: string };

		expect(ack.type).toBe("subscribed");
		expect(ack.topic).toBe("work");
		ws.close();
	});

	// ------------------------------------------------------------------ N1-WS-3
	it("unsubscribe receives unsubscribed ack", async () => {
		const token = await issueUpgradeToken(port);
		const ws = await connectWs(port, token);

		// Subscribe first.
		await sendAndReceive(ws, { type: "subscribe", topic: "work" });

		// Then unsubscribe.
		const unsubAck = (await sendAndReceive(ws, {
			type: "unsubscribe",
			topic: "work",
		})) as { type?: string; topic?: string };

		expect(unsubAck.type).toBe("unsubscribed");
		expect(unsubAck.topic).toBe("work");
		ws.close();
	});

	// ------------------------------------------------------------------ N1-WS-4
	it("connect without token returns HTTP 401", async () => {
		const res = await fetch(`http://localhost:${port}/api/ws`);
		expect(res.status).toBe(401);
	});

	// ------------------------------------------------------------------ N1-WS-5
	it("reusing a consumed token returns HTTP 401 (one-shot semantics)", async () => {
		const token = await issueUpgradeToken(port);

		// First use — should succeed.
		const ws = await connectWs(port, token);
		ws.close();

		// Second use of the same token — must be rejected.
		const res = await fetch(`http://localhost:${port}/api/ws?token=${encodeURIComponent(token)}`);
		expect(res.status).toBe(401);
	});

	// ------------------------------------------------------------------ N1-WS-6
	it("subscribes to conversations topic and receives subscribed ack", async () => {
		const token = await issueUpgradeToken(port);
		const ws = await connectWs(port, token);

		const ack = (await sendAndReceive(ws, {
			type: "subscribe",
			topic: "conversations",
		})) as { type?: string; topic?: string };

		expect(ack.type).toBe("subscribed");
		expect(ack.topic).toBe("conversations");
		ws.close();
	});
});
