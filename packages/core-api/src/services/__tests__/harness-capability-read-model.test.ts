/**
 * AU16 — harness-capability-read-model: unit tests (RED phase)
 *
 * Constructs a REAL AdapterPool (registers a real adapter instance implementing
 * the HarnessAdapter contract, mirroring the pattern in
 * harness/__tests__/adapter-pool-ab1.test.ts) and asserts each of the 6 exported
 * read functions forwards the exact value the corresponding AdapterPool member
 * returns. Also asserts the two optional-reader forwarders fall back to
 * null/[] when passed undefined, and that a real AdapterPool instance is
 * structurally assignable to HarnessCapabilityReader (the AC-2 no-execution
 * guarantee's compile-time property).
 *
 * These tests FAIL until packages/server/src/services/harness-capability-read-model.ts
 * is created.
 */

import type { AdapterMeta } from "@hyperidle/harness-registry";
import { AdapterPool } from "@hyperidle/harness-registry";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import {
	type HarnessCapabilityReader,
	harnessCapabilitiesForType,
	harnessCapabilityDescriptors,
	harnessRegistrationMeta,
	refreshHarnessDiscoveries,
	registeredHarnessCount,
	workerConnections,
} from "../harness-capability-read-model.js";

function makeAdapter(caps?: Partial<HarnessCapabilities>): HarnessAdapter {
	const capabilities: HarnessCapabilities = {
		preCompactionTrigger: caps?.preCompactionTrigger ?? true,
		subAgents: caps?.subAgents ?? true,
		modelProviders: caps?.modelProviders ?? ["anthropic", "openrouter", "openai-compatible"],
		mcpSupport: caps?.mcpSupport ?? true,
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

const BUILTIN_META: AdapterMeta = {
	name: "Built-in Harness",
	kind: "local",
	type: "builtin",
	modelProviders: ["anthropic", "openrouter", "openai-compatible"],
	maxConcurrent: 8,
};

function makePopulatedPool(): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local-builtin", makeAdapter(), BUILTIN_META);
	return pool;
}

describe("harness-capability-read-model", () => {
	it("registeredHarnessCount forwards AdapterPool.size", () => {
		const pool = makePopulatedPool();
		expect(registeredHarnessCount(pool)).toBe(pool.size);
		expect(registeredHarnessCount(pool)).toBe(1);
	});

	it("registeredHarnessCount is 0 for an empty pool", () => {
		const pool = new AdapterPool();
		expect(registeredHarnessCount(pool)).toBe(0);
	});

	it("workerConnections forwards AdapterPool.list()", () => {
		const pool = makePopulatedPool();
		expect(workerConnections(pool)).toEqual(pool.list());
		expect(workerConnections(pool)).toHaveLength(1);
		expect(workerConnections(pool)[0]?.type).toBe("builtin");
	});

	it("harnessCapabilitiesForType forwards AdapterPool.getCapabilitiesByType() for a known type", () => {
		const pool = makePopulatedPool();
		expect(harnessCapabilitiesForType(pool, "builtin")).toEqual(
			pool.getCapabilitiesByType("builtin"),
		);
		expect(harnessCapabilitiesForType(pool, "builtin")).not.toBeNull();
	});

	it("harnessCapabilitiesForType forwards null for an unregistered type", () => {
		const pool = makePopulatedPool();
		expect(harnessCapabilitiesForType(pool, "claude-code")).toBeNull();
		expect(harnessCapabilitiesForType(pool, "claude-code")).toBe(
			pool.getCapabilitiesByType("claude-code"),
		);
	});

	it("harnessCapabilitiesForType returns null when reader is undefined (nullable-pool fallback)", () => {
		expect(harnessCapabilitiesForType(undefined, "builtin")).toBeNull();
	});

	it("harnessRegistrationMeta forwards AdapterPool.getRegistrationMetaByType()", () => {
		const pool = makePopulatedPool();
		expect(harnessRegistrationMeta(pool, "builtin")).toEqual(
			pool.getRegistrationMetaByType("builtin"),
		);
		expect(harnessRegistrationMeta(pool, "unknown-type")).toBeNull();
	});

	it("harnessCapabilityDescriptors forwards AdapterPool.listCapabilityDescriptors()", () => {
		const pool = makePopulatedPool();
		expect(harnessCapabilityDescriptors(pool)).toEqual(pool.listCapabilityDescriptors());
		expect(harnessCapabilityDescriptors(pool, { includeKnownMissing: false })).toEqual(
			pool.listCapabilityDescriptors({ includeKnownMissing: false }),
		);
	});

	it("harnessCapabilityDescriptors returns [] when reader is undefined (nullable-pool fallback)", () => {
		expect(harnessCapabilityDescriptors(undefined)).toEqual([]);
	});

	it("refreshHarnessDiscoveries forwards AdapterPool.refreshDiscoveries() and resolves", async () => {
		const pool = makePopulatedPool();
		await expect(refreshHarnessDiscoveries(pool)).resolves.toBeUndefined();
		// Registered adapter survives a discovery refresh (refresh only replaces
		// the discovery snapshot, not the entries map).
		expect(pool.size).toBe(1);
	});

	it("a real AdapterPool is structurally assignable to HarnessCapabilityReader (AC-2 compile-time guarantee)", () => {
		const pool = makePopulatedPool();
		const reader: HarnessCapabilityReader = pool;
		expect(registeredHarnessCount(reader)).toBe(1);
	});
});
