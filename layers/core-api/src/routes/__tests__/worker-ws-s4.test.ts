/**
 * WorkerConnectionManager pause/resume: a worker sending { type: "pause" }
 * or { type: "resume" } after registration calls the matching pool method
 * for its own workerId; before registration, both are ignored — no crash,
 * pool unchanged.
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
	close(): void {}
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

describe("WorkerConnectionManager pause/resume", () => {
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

	it.each(["pause", "resume"] as const)(
		"%s message before registration is ignored — no crash, pool unchanged",
		async (type) => {
			const pool = new AdapterPool();
			const ws = new MockWs();
			const spy = vi.spyOn(pool, type);

			const { runtime, handlers } = await makeConnection(pool, ws);

			expect(() => handlers.onMessage({ data: JSON.stringify({ type }) }, ws)).not.toThrow();
			expect(spy).not.toHaveBeenCalled();
			expect(pool.size).toBe(0);
			await runtime.dispose();
		},
	);
});
