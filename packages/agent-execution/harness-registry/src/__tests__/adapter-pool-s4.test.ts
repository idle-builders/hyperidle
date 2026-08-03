/**
 * S4 — AdapterPool pause/resume: unit tests (AC-7, AC-11).
 *
 * Extends the existing S2 adapter-pool tests with S4 pause/resume behaviour.
 * Existing assertions in adapter-pool.test.ts are NOT weakened.
 *
 * AC coverage:
 *  - pool.pause(id) marks adapter as paused
 *  - pool.resume(id) clears paused flag
 *  - select() skips paused adapters even if they have capacity
 *  - pool.list() includes paused: boolean in AdapterInfo
 *  - pool.register() initialises paused: false
 *  - pool.pause(unknownId) is a no-op (no throw)
 *  - pool.resume(unknownId) is a no-op (no throw)
 *  - paused adapter re-enters selection after resume
 */

import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import type { AdapterMeta } from "../adapter-pool.js";
import { AdapterPool } from "../adapter-pool.js";

// ── Minimal stub adapter ─────────────────────────────────────────────────────

function makeAdapter(): HarnessAdapter {
	return {
		async startSession(_config: SessionConfig): Promise<SessionHandle> {
			return { sessionId: "stub" };
		},
		async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
			// no events
		},
		async stopSession(_handle: SessionHandle): Promise<SessionResult> {
			return {
				outcome: "completed",
				tokenUsage: { byTier: {} },
			};
		},
		getCapabilities(): HarnessCapabilities {
			return {
				preCompactionTrigger: true,
				subAgents: true,
				modelProviders: ["anthropic"],
				mcpSupport: false,
				returnEnforcement: "none",
			};
		},
	};
}

const META: AdapterMeta = {
	name: "worker-1",
	kind: "remote",
	modelProviders: ["anthropic"],
	maxConcurrent: 4,
};

// ── AC-7: pause/resume ───────────────────────────────────────────────────────

describe("S4: AdapterPool pause/resume", () => {
	it("pause(id) marks adapter as paused — list() reflects paused: true", () => {
		const pool = new AdapterPool();
		pool.register("w1", makeAdapter(), META);

		pool.pause("w1");

		const info = pool.list()[0];
		expect(info?.paused).toBe(true);
	});

	it("register initialises paused: false", () => {
		const pool = new AdapterPool();
		pool.register("w1", makeAdapter(), META);

		const info = pool.list()[0];
		expect(info?.paused).toBe(false);
	});

	it("resume(id) clears paused flag — list() reflects paused: false", () => {
		const pool = new AdapterPool();
		pool.register("w1", makeAdapter(), META);
		pool.pause("w1");
		pool.resume("w1");

		const info = pool.list()[0];
		expect(info?.paused).toBe(false);
	});

	it("select() skips paused adapter even when it has capacity", () => {
		const pool = new AdapterPool();
		pool.register("w1", makeAdapter(), META);
		pool.pause("w1");

		const result = pool.select();
		expect(result).toBeNull();
	});

	it("select() returns paused adapter after resume", () => {
		const pool = new AdapterPool();
		pool.register("w1", makeAdapter(), META);
		pool.pause("w1");
		pool.resume("w1");

		const result = pool.select();
		expect(result).not.toBeNull();
		expect(result?.id).toBe("w1");
	});

	it("select() skips paused adapter and picks the available one", () => {
		const pool = new AdapterPool();
		pool.register("paused-worker", makeAdapter(), { ...META, name: "paused" });
		pool.register("active-worker", makeAdapter(), { ...META, name: "active" });

		pool.pause("paused-worker");

		const result = pool.select();
		expect(result).not.toBeNull();
		expect(result?.meta.name).toBe("active");
	});

	it("pause(unknownId) is a no-op — no throw, no side effects", () => {
		const pool = new AdapterPool();
		pool.register("w1", makeAdapter(), META);

		expect(() => pool.pause("nonexistent")).not.toThrow();

		// w1 should still be selectable
		expect(pool.select()).not.toBeNull();
	});

	it("resume(unknownId) is a no-op — no throw", () => {
		const pool = new AdapterPool();
		pool.register("w1", makeAdapter(), META);

		expect(() => pool.resume("nonexistent")).not.toThrow();
	});

	it("list() includes paused field for all entries", () => {
		const pool = new AdapterPool();
		pool.register("w1", makeAdapter(), META);
		pool.register("w2", makeAdapter(), { ...META, name: "worker-2" });
		pool.pause("w1");

		const list = pool.list();
		const w1 = list.find((e) => e.id === "w1");
		const w2 = list.find((e) => e.id === "w2");
		expect(w1?.paused).toBe(true);
		expect(w2?.paused).toBe(false);
	});
});
