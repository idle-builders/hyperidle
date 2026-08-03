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
	maxConcurrent: 1,
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

	it("harnessCapabilitiesForType derives capabilities from AdapterPool.describe()", () => {
		const pool = makePopulatedPool();
		expect(harnessCapabilitiesForType(pool, "builtin")).toEqual({
			...pool.describe({ type: "builtin", includeKnownMissing: false })[0]?.runtime,
			returnEnforcement:
				pool.describe({ type: "builtin", includeKnownMissing: false })[0]?.returnEnforcement ??
				"none",
		});
		expect(harnessCapabilitiesForType(pool, "builtin")).not.toBeNull();
	});

	it("harnessCapabilitiesForType forwards null for an unregistered type", () => {
		const pool = makePopulatedPool();
		expect(harnessCapabilitiesForType(pool, "claude-code")).toBeNull();
	});

	it("harnessCapabilitiesForType returns null when reader is undefined (nullable-pool fallback)", () => {
		expect(harnessCapabilitiesForType(undefined, "builtin")).toBeNull();
	});

	it("harnessRegistrationMeta derives registration metadata from AdapterPool.describe()", () => {
		const pool = makePopulatedPool();
		expect(harnessRegistrationMeta(pool, "builtin")).toEqual(BUILTIN_META);
		expect(harnessRegistrationMeta(pool, "unknown-type")).toBeNull();
	});

	it("harnessCapabilityDescriptors forwards AdapterPool.describe()", () => {
		const pool = makePopulatedPool();
		expect(harnessCapabilityDescriptors(pool)).toEqual(pool.describe());
		expect(harnessCapabilityDescriptors(pool, { includeKnownMissing: false })).toEqual(
			pool.describe({ includeKnownMissing: false }),
		);
	});

	it("harnessCapabilityDescriptors returns [] when reader is undefined (nullable-pool fallback)", () => {
		expect(harnessCapabilityDescriptors(undefined)).toEqual([]);
	});

	it("refreshHarnessDiscoveries forwards AdapterPool.refresh() and resolves", async () => {
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
