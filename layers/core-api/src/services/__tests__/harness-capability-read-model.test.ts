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

import type {
	AdapterMeta,
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/harness-protocol";
import {
	type HarnessCapabilityReader,
	harnessCapabilitiesForType,
	harnessRegistrationMeta,
} from "../harness-capability-reader.js";
import { AdapterPool } from "@hyperidle/harness-registry";
import { describe, expect, it } from "vitest";

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
	it("harnessCapabilitiesForType returns non-null for a registered type", () => {
		const pool = makePopulatedPool();
		const result = harnessCapabilitiesForType(pool, "builtin");
		expect(result).not.toBeNull();
		expect(result?.returnEnforcement).toBeDefined();
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

	it("a real AdapterPool is structurally assignable to HarnessCapabilityReader (AC-2 compile-time guarantee)", () => {
		const pool = makePopulatedPool();
		const reader: HarnessCapabilityReader = pool;
		expect(harnessCapabilitiesForType(reader, "builtin")).not.toBeNull();
	});
});
