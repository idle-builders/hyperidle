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

import { describe, expect, it, vi } from "vitest";
import { AdapterPool } from "@hyperidle/agent-layer";
import { WorkerConnectionManager } from "../../services/worker-ws.js";

// ── Mock WebSocket ────────────────────────────────────────────────────────────

class MockWs {
	public sent: string[] = [];
	send(data: string): void {
		this.sent.push(data);
	}
}

function makeRegisteredManager(
	pool: AdapterPool,
	ws: MockWs,
	id = "w-pause-1",
): WorkerConnectionManager {
	const manager = new WorkerConnectionManager(pool);
	manager.onMessage(
		JSON.stringify({
			type: "register",
			id,
			name: "pause-worker",
			modelProviders: ["anthropic"],
			maxConcurrent: 2,
		}),
		ws,
	);
	return manager;
}

// ── pause/resume message handling ─────────────────────────────────────────────

describe("S4: WorkerConnectionManager pause/resume", () => {
	it("pause message after registration calls pool.pause(workerId)", () => {
		const pool = new AdapterPool();
		const ws = new MockWs();
		const pauseSpy = vi.spyOn(pool, "pause");

		const manager = makeRegisteredManager(pool, ws, "w-p1");
		expect(pool.size).toBe(1);

		manager.onMessage(JSON.stringify({ type: "pause" }), ws);

		expect(pauseSpy).toHaveBeenCalledWith("w-p1");
	});

	it("resume message after registration calls pool.resume(workerId)", () => {
		const pool = new AdapterPool();
		const ws = new MockWs();
		const resumeSpy = vi.spyOn(pool, "resume");

		const manager = makeRegisteredManager(pool, ws, "w-r1");
		manager.onMessage(JSON.stringify({ type: "pause" }), ws);

		manager.onMessage(JSON.stringify({ type: "resume" }), ws);

		expect(resumeSpy).toHaveBeenCalledWith("w-r1");
	});

	it("pause message before registration is ignored — no crash, pool unchanged", () => {
		const pool = new AdapterPool();
		const ws = new MockWs();
		const pauseSpy = vi.spyOn(pool, "pause");

		const manager = new WorkerConnectionManager(pool);

		// Send pause BEFORE registering — should be silently ignored
		expect(() => manager.onMessage(JSON.stringify({ type: "pause" }), ws)).not.toThrow();
		expect(pauseSpy).not.toHaveBeenCalled();
		expect(pool.size).toBe(0);
	});

	it("resume message before registration is ignored — no crash, pool unchanged", () => {
		const pool = new AdapterPool();
		const ws = new MockWs();
		const resumeSpy = vi.spyOn(pool, "resume");

		const manager = new WorkerConnectionManager(pool);
		expect(() => manager.onMessage(JSON.stringify({ type: "resume" }), ws)).not.toThrow();
		expect(resumeSpy).not.toHaveBeenCalled();
	});

	it("pause/resume round trip: adapter is skipped then re-eligible", () => {
		const pool = new AdapterPool();
		const ws = new MockWs();

		// Register ONLY w-rt2 via manager2 (no makeRegisteredManager here so only one worker)
		const manager2 = new WorkerConnectionManager(pool);
		manager2.onMessage(
			JSON.stringify({
				type: "register",
				id: "w-rt2",
				name: "rt-worker",
				modelProviders: ["anthropic"],
				maxConcurrent: 2,
			}),
			ws,
		);

		// Before pause: selectable
		const before = pool.select();
		expect(before).not.toBeNull();
		pool.release("w-rt2");

		// Pause via message
		manager2.onMessage(JSON.stringify({ type: "pause" }), ws);
		expect(pool.select()).toBeNull(); // w-rt2 is paused — only adapter in pool

		manager2.onMessage(JSON.stringify({ type: "resume" }), ws);
		// "w-rt2" is resumed — should be selectable again
		const after = pool.select();
		expect(after).not.toBeNull();
	});
});
