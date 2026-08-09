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
} from "@hyperidle/shared";
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
		// Should not throw
		pool.register("local", makeAdapter(), meta);
		expect(pool.list()).toHaveLength(1);
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
		expect(pool.list()).toHaveLength(1);
	});

	it("list() includes type field when adapter has one", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), {
			name: "local",
			kind: "local",
			type: "claude-code",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		const entries = pool.list();
		expect(entries[0]).toHaveProperty("type", "claude-code");
	});

	it("list() has type as undefined when adapter has no type", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), {
			name: "local",
			kind: "local",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		const entries = pool.list();
		// type should be undefined or absent — not a different value
		expect(entries[0]?.type).toBeUndefined();
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

	it("createLocalAdapterPool registers with type 'claude-code'", async () => {
		const { createLocalAdapterPool } = await import("../adapter-pool.js");
		const pool = await createLocalAdapterPool();

		const entries = pool.list();
		const claudeEntry = entries.find((e) => e.type === "claude-code");
		expect(claudeEntry).toBeDefined();
		expect(claudeEntry?.type).toBe("claude-code");
	});
});
