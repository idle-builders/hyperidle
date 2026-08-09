/**
 * S2 — AdapterPool: unit tests (AC3).
 *
 * Tests the pool selection logic:
 * - least-loaded selection
 * - capacity filtering
 * - modelProvider matching
 * - register/unregister/list
 *
 * These fail (red phase) until `adapter-pool.ts` is created.
 */

import type {
	AdapterMeta,
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
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

const LOCAL_META: AdapterMeta = {
	name: "local",
	kind: "local",
	modelProviders: ["anthropic"],
	maxConcurrent: 4,
};

const REMOTE_META: AdapterMeta = {
	name: "remote-1",
	kind: "remote",
	modelProviders: ["anthropic"],
	maxConcurrent: 2,
};

// ── register / list ──────────────────────────────────────────────────────────

describe("AdapterPool register/list", () => {
	it("starts empty", () => {
		const pool = new AdapterPool();
		expect(pool.list()).toHaveLength(0);
		expect(pool.size).toBe(0);
	});

	it("register adds an entry visible in list()", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), LOCAL_META);
		const entries = pool.list();
		expect(entries).toHaveLength(1);
		expect(entries[0]?.id).toBe("local");
		expect(entries[0]?.kind).toBe("local");
		expect(entries[0]?.currentLoad).toBe(0);
		expect(entries[0]?.maxConcurrent).toBe(4);
	});

	it("register multiple adapters", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), LOCAL_META);
		pool.register("remote-1", makeAdapter(), REMOTE_META);
		expect(pool.list()).toHaveLength(2);
		expect(pool.size).toBe(2);
	});

	it("list() includes connectedSince as an ISO string", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), LOCAL_META);
		const entry = pool.list()[0];
		expect(entry?.connectedSince).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});
});

// ── unregister ───────────────────────────────────────────────────────────────

describe("AdapterPool unregister", () => {
	it("unregister removes entry from list()", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), LOCAL_META);
		pool.register("remote-1", makeAdapter(), REMOTE_META);
		pool.unregister("remote-1");
		expect(pool.list()).toHaveLength(1);
		expect(pool.list()[0]?.id).toBe("local");
	});

	it("unregister on unknown id is a no-op", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), LOCAL_META);
		pool.unregister("nonexistent");
		expect(pool.list()).toHaveLength(1);
	});
});

// ── select ────────────────────────────────────────────────────────────────────

describe("AdapterPool select — no requirements", () => {
	it("returns null when pool is empty", () => {
		const pool = new AdapterPool();
		expect(pool.select()).toBeNull();
	});

	it("returns the only adapter when one is registered", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), LOCAL_META);
		const entry = pool.select();
		expect(entry).not.toBeNull();
		expect(entry?.meta.name).toBe("local");
	});

	it("select increments activeSessions", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), LOCAL_META);
		pool.select();
		expect(pool.list()[0]?.currentLoad).toBe(1);
	});

	it("picks the least-loaded adapter (both available)", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), LOCAL_META);
		pool.register("remote-1", makeAdapter(), REMOTE_META);
		// Alternate selection distributes load: local=1, remote-1=1, local=2.
		// After 3 selects: local has 2 active, remote-1 has 1 active.
		pool.select(); // → local (tied at 0, pick first)
		pool.select(); // → remote-1 (0 < 1)
		pool.select(); // → remote-1 is now tied with local=1; pick first = local → local=2
		// Now local=2, remote-1=1; next select should pick remote-1 (1 < 2)
		const entry = pool.select();
		expect(entry?.meta.name).toBe("remote-1");
	});

	it("returns null when all adapters at capacity", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), { ...LOCAL_META, maxConcurrent: 1 });
		// Fill the one slot
		pool.select();
		// Now at capacity
		expect(pool.select()).toBeNull();
	});

	it("returns non-full adapter when one is at capacity and other is not", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), { ...LOCAL_META, maxConcurrent: 1 });
		pool.register("remote-1", makeAdapter(), REMOTE_META);
		// Fill local's slot
		pool.select();
		// Should pick remote now
		const entry = pool.select();
		expect(entry?.meta.name).toBe("remote-1");
	});
});

describe("AdapterPool select — modelProviders requirement", () => {
	it("selects adapter matching required modelProviders", () => {
		const pool = new AdapterPool();
		pool.register("anthropic-worker", makeAdapter(), {
			...LOCAL_META,
			modelProviders: ["anthropic"],
		});
		pool.register("openai-worker", makeAdapter(), {
			...REMOTE_META,
			name: "openai-worker",
			modelProviders: ["openai"],
		});
		const entry = pool.select({ modelProviders: ["openai"] });
		expect(entry?.meta.name).toBe("openai-worker");
	});

	it("returns null when no adapter matches required modelProviders", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), { ...LOCAL_META, modelProviders: ["anthropic"] });
		const entry = pool.select({ modelProviders: ["google"] });
		expect(entry).toBeNull();
	});

	it("returns null when matching adapter is at capacity", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), {
			...LOCAL_META,
			maxConcurrent: 1,
			modelProviders: ["anthropic"],
		});
		pool.select({ modelProviders: ["anthropic"] }); // fills the slot
		expect(pool.select({ modelProviders: ["anthropic"] })).toBeNull();
	});

	it("requires ALL listed providers to be present in adapter's modelProviders", () => {
		const pool = new AdapterPool();
		pool.register("multi-provider", makeAdapter(), {
			...LOCAL_META,
			name: "multi-provider",
			modelProviders: ["anthropic", "openai"],
		});
		// Adapter has both — should match
		const entry = pool.select({ modelProviders: ["anthropic", "openai"] });
		expect(entry?.meta.name).toBe("multi-provider");
	});

	it("does not select adapter missing one of required providers", () => {
		const pool = new AdapterPool();
		pool.register("anthropic-only", makeAdapter(), {
			...LOCAL_META,
			modelProviders: ["anthropic"],
		});
		// Requires both anthropic and openai — adapter only has anthropic
		const entry = pool.select({ modelProviders: ["anthropic", "openai"] });
		expect(entry).toBeNull();
	});
});

// ── release ───────────────────────────────────────────────────────────────────

describe("AdapterPool release", () => {
	it("release decrements activeSessions", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), LOCAL_META);
		pool.select();
		expect(pool.list()[0]?.currentLoad).toBe(1);
		pool.release("local");
		expect(pool.list()[0]?.currentLoad).toBe(0);
	});

	it("release does not go below zero", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), LOCAL_META);
		pool.release("local"); // no sessions active
		expect(pool.list()[0]?.currentLoad).toBe(0);
	});

	it("release on unknown id is a no-op", () => {
		const pool = new AdapterPool();
		expect(() => pool.release("nonexistent")).not.toThrow();
	});
});
