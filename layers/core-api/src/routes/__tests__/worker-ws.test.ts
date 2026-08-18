/**
 * S2 — Worker WebSocket route: unit tests (AC2).
 *
 * Tests that registerWorkerWsRoute:
 * - accepts connections with valid token, rejects with invalid
 * - registers adapter in pool on WorkerRegisterMessage
 * - unregisters adapter when WebSocket closes
 * - sends { type: "registered" } ack to worker
 * - routes runtime messages (event, session_result, error) to the adapter
 *   after registration (S2-F07 regression guard)
 * - validates incoming messages with Zod and drops malformed data (S2-F05)
 */

import { AdapterPool } from "@hyperidle/harness-registry";
import { describe, expect, it } from "vitest";
import { registerWorkerTestSocket, startWorkerTestRuntime } from "./worker-runtime-test-helper.js";

async function registerWorkerWsRoute(app: MockHono, pool: AdapterPool): Promise<() => void> {
	const runtime = await startWorkerTestRuntime(pool);
	registerWorkerTestSocket(runtime, app as never);
	return () => void runtime.dispose();
}

async function createWorkerConnectionManager(pool: AdapterPool) {
	const runtime = await startWorkerTestRuntime(pool);
	const app = registerWorkerTestSocket(runtime);
	return {
		onMessage(data: string, ws: unknown) {
			app.handlers?.onMessage({ data }, ws);
		},
		onClose() {
			app.handlers?.onClose();
			void runtime.dispose();
		},
	};
}

// ── Mock WebSocket context ─────────────────────────────────────────────────

class MockWsContext {
	public sent: string[] = [];

	send(data: string): void {
		this.sent.push(data);
	}

	close(): void {
		// no-op in mock
	}
}

interface MockContext {
	req: {
		query(key: string): string | undefined;
		path: string;
	};
	json(body: unknown, status: number): { status: number; body: unknown };
}

/** A minimal Hono-like router that captures middleware registrations. */
class MockHono {
	public routes: { method: string; path: string }[] = [];
	public capturedMiddleware: ((c: MockContext, next: () => Promise<void>) => Promise<void>) | null =
		null;

	use(_path: string, handler: (c: MockContext, next: () => Promise<void>) => Promise<void>): void {
		this.capturedMiddleware = handler;
	}

	get(_path: string, _upgradeCall: unknown): void {
		this.routes.push({ method: "GET", path: "/ws/worker" });
	}
}

function makePool(): AdapterPool {
	return new AdapterPool();
}

// ── Basic registration test ───────────────────────────────────────────────────

describe("registerWorkerWsRoute — returns disposer", () => {
	it("returns a function disposer", async () => {
		const pool = makePool();
		const hono = new MockHono();
		const disposer = await registerWorkerWsRoute(hono, pool);
		expect(typeof disposer).toBe("function");
	});
});

// ── Token auth ───────────────────────────────────────────────────────────────

describe("registerWorkerWsRoute — token auth", () => {
	it("rejects connection when token is missing", async () => {
		const originalToken = process.env.HYPERIDLE_WORKER_TOKEN;
		process.env.HYPERIDLE_WORKER_TOKEN = "secret-worker-token";

		try {
			const pool = makePool();
			const hono = new MockHono();
			await registerWorkerWsRoute(hono, pool);

			const ctx: MockContext = {
				req: { query: () => undefined, path: "/ws/worker" },
				json: (body, status) => ({ status, body }),
			};

			let rejected = false;

			if (hono.capturedMiddleware) {
				const result: unknown = await hono
					.capturedMiddleware(ctx, async () => {
						// next() was called — not rejected
					})
					.catch(() => {
						rejected = true;
					});
				if (result && (result as { status: number }).status === 401) {
					rejected = true;
				}
			}

			expect(rejected).toBe(true);
		} finally {
			if (originalToken === undefined) {
				delete process.env.HYPERIDLE_WORKER_TOKEN;
			} else {
				process.env.HYPERIDLE_WORKER_TOKEN = originalToken;
			}
		}
	});

	it("rejects connection when token is wrong", async () => {
		const originalToken = process.env.HYPERIDLE_WORKER_TOKEN;
		process.env.HYPERIDLE_WORKER_TOKEN = "secret-worker-token";

		try {
			const pool = makePool();
			const hono = new MockHono();
			await registerWorkerWsRoute(hono, pool);

			const ctx: MockContext = {
				req: { query: (_k) => "wrong-token", path: "/ws/worker" },
				json: (body, status) => ({ status, body }),
			};

			let rejected = false;
			if (hono.capturedMiddleware) {
				const result: unknown = await hono.capturedMiddleware(ctx, async () => {});
				if (result && (result as { status: number }).status === 401) {
					rejected = true;
				}
			}
			expect(rejected).toBe(true);
		} finally {
			if (originalToken === undefined) {
				delete process.env.HYPERIDLE_WORKER_TOKEN;
			} else {
				process.env.HYPERIDLE_WORKER_TOKEN = originalToken;
			}
		}
	});
});

// ── Pool integration via WorkerConnectionManager ──────────────────────────────
// Uses the exported WorkerConnectionManager to simulate the WebSocket lifecycle.

describe("registerWorkerWsRoute — worker lifecycle", () => {
	it("registers adapter in pool after WorkerRegisterMessage", async () => {
		const pool = makePool();
		const ws = new MockWsContext();
		const manager = await createWorkerConnectionManager(pool);

		manager.onMessage(
			JSON.stringify({
				type: "register",
				id: "w-1",
				name: "test-worker",
				modelProviders: ["anthropic"],
				maxConcurrent: 2,
			}),
			ws as never,
		);

		// After registration, pool should have one adapter
		expect(pool.size).toBe(1);

		// Worker should receive registered ack
		const firstSent = ws.sent.at(0);
		expect(firstSent).toBeTruthy();
		const ack = JSON.parse(firstSent ?? "{}") as { type: string };
		expect(ack.type).toBe("registered");
	});

	it("unregisters adapter when connection closes", async () => {
		const pool = makePool();
		const ws = new MockWsContext();
		const manager = await createWorkerConnectionManager(pool);

		manager.onMessage(
			JSON.stringify({
				type: "register",
				id: "w-2",
				name: "test-worker-2",
				modelProviders: ["anthropic"],
				maxConcurrent: 2,
			}),
			ws as never,
		);

		expect(pool.size).toBe(1);

		manager.onClose();

		expect(pool.size).toBe(0);
	});

	it("two workers connect — both appear in pool", async () => {
		const pool = makePool();

		const ws1 = new MockWsContext();
		const manager1 = await createWorkerConnectionManager(pool);
		manager1.onMessage(
			JSON.stringify({
				type: "register",
				id: "w-3",
				name: "worker-3",
				modelProviders: ["anthropic"],
				maxConcurrent: 2,
			}),
			ws1 as never,
		);

		const ws2 = new MockWsContext();
		const manager2 = await createWorkerConnectionManager(pool);
		manager2.onMessage(
			JSON.stringify({
				type: "register",
				id: "w-4",
				name: "worker-4",
				modelProviders: ["anthropic"],
				maxConcurrent: 4,
			}),
			ws2 as never,
		);

		expect(pool.size).toBe(2);

		manager1.onClose();
		expect(pool.size).toBe(1);
		expect(pool.select()?.meta.name).toBe("worker-4");
	});
});

// ── Post-registration message routing (S2-F07 regression guard) ──────────────

describe("WorkerConnectionManager — post-registration message routing", () => {
	it("routes event messages to the adapter after registration", async () => {
		const pool = makePool();
		const ws = new MockWsContext();
		const manager = await createWorkerConnectionManager(pool);

		// Register the worker
		manager.onMessage(
			JSON.stringify({
				type: "register",
				id: "w-routing-1",
				name: "routing-worker",
				modelProviders: ["anthropic"],
				maxConcurrent: 2,
			}),
			ws as never,
		);

		expect(pool.size).toBe(1);

		// Get the registered adapter from the pool
		const selected = pool.select();
		expect(selected).not.toBeNull();

		// Start a session on the adapter to get a sessionId
		const handle = await selected?.adapter.startSession({
			sessionId: "test-session",
			sandboxPath: "/workspace/test",
			systemPromptPath: "",
			assembledPrompt: "",
			modelTier: "workhorse",
			tools: [],
		});
		const dispatchedMsg = JSON.parse(ws.sent.at(-1) ?? "{}") as { sessionId: string };
		const sessionId = dispatchedMsg.sessionId;

		// Set up stream consumer
		const eventsPromise: Promise<Array<{ type: string }>> = (async () => {
			const collected: Array<{ type: string }> = [];
			for await (const event of selected?.adapter.streamEvents(handle!) ?? []) {
				collected.push(event as { type: string });
			}
			return collected;
		})();

		// Simulate worker sending an event message via the WS handler
		manager.onMessage(
			JSON.stringify({
				type: "event",
				sessionId,
				event: { type: "completion", text: "hello" },
			}),
			ws as never,
		);

		// Simulate session completion
		manager.onMessage(
			JSON.stringify({
				type: "session_result",
				sessionId,
				result: {
					outcome: "completed",
					tokenUsage: { byTier: {} },
				},
			}),
			ws as never,
		);

		const events = await eventsPromise;
		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe("completion");
	});

	it("drops malformed messages and does not throw (S2-F05 Zod validation)", async () => {
		const pool = makePool();
		const ws = new MockWsContext();
		const manager = await createWorkerConnectionManager(pool);

		// Malformed JSON — should be swallowed silently
		expect(() => manager.onMessage("not-json", ws as never)).not.toThrow();

		// Valid JSON but missing required fields — Zod rejects, no throw
		expect(() =>
			manager.onMessage(JSON.stringify({ type: "register", id: "" }), ws as never),
		).not.toThrow();

		// Pool must remain empty (malformed messages don't register anything)
		expect(pool.size).toBe(0);
	});

	it("clears adapter reference on close", async () => {
		const pool = makePool();
		const ws = new MockWsContext();
		const manager = await createWorkerConnectionManager(pool);

		manager.onMessage(
			JSON.stringify({
				type: "register",
				id: "w-close-1",
				name: "close-worker",
				modelProviders: ["anthropic"],
				maxConcurrent: 1,
			}),
			ws as never,
		);

		expect(pool.size).toBe(1);
		manager.onClose();
		expect(pool.size).toBe(0);

		// After close, runtime messages should be silently ignored (no crash)
		expect(() =>
			manager.onMessage(
				JSON.stringify({ type: "event", sessionId: "s1", event: { type: "completion" } }),
				ws as never,
			),
		).not.toThrow();
	});
});
