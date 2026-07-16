/**
 * AB1 — AdapterPool.getCapabilitiesByType(): unit tests (RED phase)
 *
 * Tests the new getCapabilitiesByType() method on AdapterPool.
 *
 * These tests FAIL until AdapterPool.getCapabilitiesByType() is implemented
 * in packages/server/src/harness/adapter-pool.ts.
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

// ---------------------------------------------------------------------------
// Stub adapter helper
// ---------------------------------------------------------------------------

function makeAdapter(caps?: Partial<HarnessCapabilities>): HarnessAdapter {
	const capabilities: HarnessCapabilities = {
		preCompactionTrigger: caps?.preCompactionTrigger ?? true,
		subAgents: caps?.subAgents ?? true,
		modelProviders: caps?.modelProviders ?? ["anthropic"],
		mcpSupport: caps?.mcpSupport ?? false,
		returnEnforcement: caps?.returnEnforcement ?? "none",
	};

	return {
		async startSession(_config: SessionConfig): Promise<SessionHandle> {
			return { sessionId: "stub" };
		},
		async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {},
		async stopSession(_handle: SessionHandle): Promise<SessionResult> {
			return {
				outcome: "completed",
				cost: { minor: 0, currency: "USD" },
				tokenUsage: { byTier: {} },
			};
		},
		getCapabilities(): HarnessCapabilities {
			return capabilities;
		},
	};
}

const BASE_META: AdapterMeta = {
	name: "test-adapter",
	kind: "local",
	modelProviders: ["anthropic"],
	maxConcurrent: 4,
};

// ---------------------------------------------------------------------------
// getCapabilitiesByType tests
// ---------------------------------------------------------------------------

describe("AdapterPool.getCapabilitiesByType", () => {
	it("returns null when pool is empty", () => {
		const pool = new AdapterPool();
		const result = pool.getCapabilitiesByType("claude-code");
		expect(result).toBeNull();
	});

	it("returns null for an unknown harness type", () => {
		const pool = new AdapterPool();
		pool.register("local-aider", makeAdapter(), {
			...BASE_META,
			type: "aider",
		});

		const result = pool.getCapabilitiesByType("nonexistent-type");
		expect(result).toBeNull();
	});

	it("returns capabilities for a known harness type", () => {
		const pool = new AdapterPool();
		const caps: HarnessCapabilities = {
			preCompactionTrigger: true,
			subAgents: true,
			modelProviders: ["anthropic"],
			mcpSupport: true,
			returnEnforcement: "none",
		};
		pool.register("local-claude-code", makeAdapter(caps), {
			...BASE_META,
			name: "Claude Code",
			type: "claude-code",
		});

		const result = pool.getCapabilitiesByType("claude-code");
		expect(result).not.toBeNull();
		expect(result?.mcpSupport).toBe(true);
		expect(result?.subAgents).toBe(true);
	});

	it("returns capabilities for the matching type when multiple types are registered", () => {
		const pool = new AdapterPool();

		// Claude code adapter
		pool.register("local-claude-code", makeAdapter({ mcpSupport: true }), {
			...BASE_META,
			name: "Claude Code",
			type: "claude-code",
		});

		// Aider adapter (different capabilities)
		pool.register("local-aider", makeAdapter({ mcpSupport: false }), {
			...BASE_META,
			name: "Aider",
			type: "aider",
		});

		const claudeCodeResult = pool.getCapabilitiesByType("claude-code");
		const aiderResult = pool.getCapabilitiesByType("aider");

		expect(claudeCodeResult?.mcpSupport).toBe(true);
		expect(aiderResult?.mcpSupport).toBe(false);
	});

	it("returns null when the type-matched adapter has no getCapabilities", () => {
		// This tests that getCapabilitiesByType handles the case where
		// no adapters with matching type exist
		const pool = new AdapterPool();
		pool.register("local-builtin", makeAdapter(), {
			...BASE_META,
			type: "builtin",
		});

		// Search for a different type that isn't registered
		const result = pool.getCapabilitiesByType("claude-code");
		expect(result).toBeNull();
	});

	it("returns capabilities when harnessType is undefined in meta (generic adapter)", () => {
		// When harnessType is null/undefined, getCapabilitiesByType(null) should
		// return ANY available adapter's capabilities (the first one found)
		const pool = new AdapterPool();
		pool.register("local-generic", makeAdapter({ subAgents: false }), {
			...BASE_META,
			// no type
		});

		// Searching with null should return the generic adapter's capabilities
		const result = pool.getCapabilitiesByType(null);
		expect(result).not.toBeNull();
		expect(result?.subAgents).toBe(false);
	});

	it("returns null when getCapabilitiesByType(null) but pool is empty", () => {
		const pool = new AdapterPool();
		const result = pool.getCapabilitiesByType(null);
		expect(result).toBeNull();
	});
});
