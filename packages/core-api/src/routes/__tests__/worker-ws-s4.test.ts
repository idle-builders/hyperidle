/**
 * S4 — WorkerConnectionManager pause/resume: unit tests (AC-7).
 *
 * Extends the existing S2 worker-ws tests with pause/resume message handling.
 * Existing assertions in worker-ws.test.ts are NOT weakened.
 *
 * AC coverage:
 *  - Worker sends { type: "pause" } after registration → pool.pause(workerId) called
 *  - Worker sends { type: "resume" } after registration → pool.resume(workerId) called
 *  - Worker sends { type: "pause" } before registration → ignored (no crash, pool unchanged)
 *  - Pause message before registration with adapter null → no-op
 */

import { AdapterPool } from "@hyperidle/harness-registry";

import { describe, expect, it, vi } from "vitest";
import { registerWorkerTestSocket, startWorkerTestRuntime } from "./worker-runtime-test-helper.js";

// ── Mock WebSocket ────────────────────────────────────────────────────────────

class MockWs {
	public sent: string[] = [];
	send(data: string): void {
		this.sent.push(data);
	}
}

async function makeConnection(pool: AdapterPool, ws: MockWs, id?: string) {
	const runtime = await startWorkerTestRuntime(pool);
	const app = registerWorkerTestSocket(runtime);
	if (id)
		app.handlers?.onMessage(
			{
				data: JSON.stringify({
					type: "register",
					id,
					name: "pause-worker",
					modelProviders: ["anthropic"],
					maxConcurrent: 2,
				}),
			},
			ws,
		);
	return { runtime, handlers: app.handlers! };
}

// ── pause/resume message handling ─────────────────────────────────────────────

describe("S4: WorkerConnectionManager pause/resume", () => {
	it("pause message after registration calls pool.pause(workerId)", async () => {
		const pool = new AdapterPool();
		const ws = new MockWs();
		const pauseSpy = vi.spyOn(pool, "pause");

		const { runtime, handlers } = await makeConnection(pool, ws, "w-p1");
		expect(pool.size).toBe(1);

		handlers.onMessage({ data: JSON.stringify({ type: "pause" }) }, ws);

		expect(pauseSpy).toHaveBeenCalledWith("w-p1");
		await runtime.dispose();
	});

	it("resume message after registration calls pool.resume(workerId)", async () => {
		const pool = new AdapterPool();
		const ws = new MockWs();
		const resumeSpy = vi.spyOn(pool, "resume");

		const { runtime, handlers } = await makeConnection(pool, ws, "w-r1");
		handlers.onMessage({ data: JSON.stringify({ type: "pause" }) }, ws);

		handlers.onMessage({ data: JSON.stringify({ type: "resume" }) }, ws);

		expect(resumeSpy).toHaveBeenCalledWith("w-r1");
		await runtime.dispose();
	});

	it("pause message before registration is ignored — no crash, pool unchanged", async () => {
		const pool = new AdapterPool();
		const ws = new MockWs();
		const pauseSpy = vi.spyOn(pool, "pause");

		const { runtime, handlers } = await makeConnection(pool, ws);

		// Send pause BEFORE registering — should be silently ignored
		expect(() => handlers.onMessage({ data: JSON.stringify({ type: "pause" }) }, ws)).not.toThrow();
		expect(pauseSpy).not.toHaveBeenCalled();
		expect(pool.size).toBe(0);
		await runtime.dispose();
	});

	it("resume message before registration is ignored — no crash, pool unchanged", async () => {
		const pool = new AdapterPool();
		const ws = new MockWs();
		const resumeSpy = vi.spyOn(pool, "resume");

		const { runtime, handlers } = await makeConnection(pool, ws);
		expect(() =>
			handlers.onMessage({ data: JSON.stringify({ type: "resume" }) }, ws),
		).not.toThrow();
		expect(resumeSpy).not.toHaveBeenCalled();
		await runtime.dispose();
	});

	it("pause/resume round trip: adapter is skipped then re-eligible", async () => {
		const pool = new AdapterPool();
		const ws = new MockWs();

		// Register ONLY w-rt2 via manager2 (no makeRegisteredManager here so only one worker)
		const { runtime, handlers } = await makeConnection(pool, ws, "w-rt2");

		// Before pause: selectable
		const before = pool.select();
		expect(before).not.toBeNull();
		pool.release("w-rt2");

		// Pause via message
		handlers.onMessage({ data: JSON.stringify({ type: "pause" }) }, ws);
		expect(pool.select()).toBeNull(); // w-rt2 is paused — only adapter in pool

		handlers.onMessage({ data: JSON.stringify({ type: "resume" }) }, ws);
		// "w-rt2" is resumed — should be selectable again
		const after = pool.select();
		expect(after).not.toBeNull();
		await runtime.dispose();
	});
});
