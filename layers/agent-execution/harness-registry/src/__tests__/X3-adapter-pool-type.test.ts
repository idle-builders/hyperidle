/**
 * X3 — AdapterPool harnessType filtering tests (RED phase)
 *
 * AC-18: AdapterPool.select() filters by harnessType
 *
 * These tests FAIL until:
 *  - AdapterMeta gains optional `type?: string` field
 *  - SelectRequirements gains optional `harnessType?: string` field
 *  - AdapterPool.select() filters by harnessType when provided
 *
 * NOTE: Existing adapter-pool.test.ts and adapter-pool-s4.test.ts must
 * continue to pass — these tests add NEW behavior without touching existing tests.
 * The existing LOCAL_META and REMOTE_META fixtures don't have `type` — that is
 * intentional and must still work (backward compat: no type = matches any query).
 */

import type {
	AdapterMeta,
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/harness-protocol";
import { describe, expect, it } from "vitest";
import { AdapterPool } from "../adapter-pool.js";

// ---------------------------------------------------------------------------
// Stub adapter
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// X3: AdapterMeta accepts optional `type` field
// ---------------------------------------------------------------------------

describe("X3 AC-18: AdapterMeta accepts optional type field", () => {
	it("registers adapter with type field", () => {
		const pool = new AdapterPool();
		const meta: AdapterMeta = {
			name: "local",
			kind: "local",
			type: "claude-code",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		};
		// Should not throw; entry is selectable by its type
		pool.register("local", makeAdapter(), meta);
		expect(pool.size).toBe(1);
		expect(pool.select({ harnessType: "claude-code" })).not.toBeNull();
	});

	it("registers adapter without type field (backward compat)", () => {
		const pool = new AdapterPool();
		const meta: AdapterMeta = {
			name: "local",
			kind: "local",
			// type is optional — not provided
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		};
		pool.register("local", makeAdapter(), meta);
		expect(pool.size).toBe(1);
		// No-type adapter is selectable without a type filter
		expect(pool.select()).not.toBeNull();
	});

	it("adapter with type is selectable via harnessType filter", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), {
			name: "local",
			kind: "local",
			type: "claude-code",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		// select() with matching type returns the entry and exposes meta.type
		const entry = pool.select({ harnessType: "claude-code" });
		expect(entry?.meta.type).toBe("claude-code");
	});

	it("adapter without type does not match a specific harnessType query", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), {
			name: "local",
			kind: "local",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		// No type → undefined, does not match a typed query
		expect(pool.select({ harnessType: "claude-code" })).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// X3 AC-18: select() filters by harnessType
// ---------------------------------------------------------------------------

describe("X3 AC-18: AdapterPool.select() filters by harnessType", () => {
	it("selects adapter matching harnessType", () => {
		const pool = new AdapterPool();
		pool.register("claude-code-1", makeAdapter(), {
			name: "claude-code-1",
			kind: "local",
			type: "claude-code",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});
		pool.register("aider-1", makeAdapter(), {
			name: "aider-1",
			kind: "remote",
			type: "aider",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		const entry = pool.select({ harnessType: "aider" });
		expect(entry).not.toBeNull();
		expect(entry?.meta.name).toBe("aider-1");
	});

	it("does not select adapter with non-matching harnessType", () => {
		const pool = new AdapterPool();
		pool.register("claude-code-1", makeAdapter(), {
			name: "claude-code-1",
			kind: "local",
			type: "claude-code",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		const entry = pool.select({ harnessType: "aider" });
		// No aider adapter registered
		expect(entry).toBeNull();
	});

	it("returns null when matching adapter exists but is at capacity", () => {
		const pool = new AdapterPool();
		pool.register("aider-1", makeAdapter(), {
			name: "aider-1",
			kind: "remote",
			type: "aider",
			modelProviders: ["anthropic"],
			maxConcurrent: 1,
		});

		// Fill the one slot
		pool.select({ harnessType: "aider" });
		// Now at capacity — next select should return null
		expect(pool.select({ harnessType: "aider" })).toBeNull();
	});

	it("selects any adapter when harnessType is undefined (backward compat)", () => {
		const pool = new AdapterPool();
		pool.register("claude-code-1", makeAdapter(), {
			name: "claude-code-1",
			kind: "local",
			type: "claude-code",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		const entry = pool.select({ harnessType: undefined });
		expect(entry).not.toBeNull();
		expect(entry?.meta.name).toBe("claude-code-1");
	});

	it("selects any adapter when no requirements at all (backward compat)", () => {
		const pool = new AdapterPool();
		pool.register("claude-code-1", makeAdapter(), {
			name: "claude-code-1",
			kind: "local",
			type: "claude-code",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		const entry = pool.select();
		expect(entry).not.toBeNull();
	});

	it("selects adapter with type undefined when harnessType query is undefined", () => {
		const pool = new AdapterPool();
		// Adapter without a type (older worker that didn't report type)
		pool.register("old-worker", makeAdapter(), {
			name: "old-worker",
			kind: "remote",
			// No type field
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		// Without harnessType filter, old workers are still eligible
		const entry = pool.select();
		expect(entry).not.toBeNull();
		expect(entry?.meta.name).toBe("old-worker");
	});

	it("old worker (no type) is NOT selected when agent specifies a harnessType", () => {
		const pool = new AdapterPool();
		// Old worker without type — should not match a specific harnessType requirement
		pool.register("old-worker", makeAdapter(), {
			name: "old-worker",
			kind: "remote",
			// No type field
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		// Agent wants "claude-code" but only old workers are available (no type)
		const entry = pool.select({ harnessType: "claude-code" });
		expect(entry).toBeNull();
	});

	it("harnessType filter stacks with modelProviders filter", () => {
		const pool = new AdapterPool();
		// Adapter with matching type but wrong model provider
		pool.register("aider-openai", makeAdapter(), {
			name: "aider-openai",
			kind: "remote",
			type: "aider",
			modelProviders: ["openai"],
			maxConcurrent: 4,
		});
		// Adapter with matching type AND matching model provider
		pool.register("aider-anthropic", makeAdapter(), {
			name: "aider-anthropic",
			kind: "remote",
			type: "aider",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		const entry = pool.select({ harnessType: "aider", modelProviders: ["anthropic"] });
		expect(entry?.meta.name).toBe("aider-anthropic");
	});

	// "createLocalAdapterPool registers with type 'claude-code'" moved to
	// adapter-pool-real-discovery.integration.test.ts — it needs `claude` on PATH.
});
