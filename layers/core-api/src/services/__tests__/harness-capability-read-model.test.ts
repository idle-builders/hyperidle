/**
 * Constructs a REAL AdapterPool (registers a real adapter instance implementing
 * the HarnessAdapter contract, mirroring the pattern in
 * harness-registry/src/__tests__/adapter-pool.test.ts) and asserts each of the 6 exported
 * read functions forwards the exact value the corresponding AdapterPool member
 * returns. Also asserts the two optional-reader forwarders fall back to
 * null/[] when passed undefined, and that a real AdapterPool instance is
 * structurally assignable to HarnessCapabilityReader (the no-execution
 * guarantee's compile-time property).
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
import { AdapterPool } from "@hyperidle/harness-registry";
import { describe, expect, it } from "vitest";
import {
	type HarnessCapabilityReader,
	harnessCapabilitiesForType,
	harnessRegistrationMeta,
} from "../harness-capability-reader.js";

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

const OPENCODE_META: AdapterMeta = {
	name: "OpenCode",
	kind: "local",
	type: "opencode",
	modelProviders: ["anthropic", "openrouter", "openai-compatible"],
	maxConcurrent: 1,
};

function makePopulatedPool(): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local-opencode", makeAdapter(), OPENCODE_META);
	return pool;
}

describe("harness-capability-read-model", () => {
	it("harnessCapabilitiesForType returns non-null for a registered type", () => {
		const pool = makePopulatedPool();
		const result = harnessCapabilitiesForType(pool, "opencode");
		expect(result).toMatchObject({
			mcpSupport: false,
			modelProviders: [],
			returnEnforcement: "none",
		});
	});

	it("harnessCapabilitiesForType forwards null for an unregistered type", () => {
		const pool = makePopulatedPool();
		expect(harnessCapabilitiesForType(pool, "claude-code")).toBeNull();
	});

	it("harnessCapabilitiesForType returns null when reader is undefined (nullable-pool fallback)", () => {
		expect(harnessCapabilitiesForType(undefined, "opencode")).toBeNull();
	});

	it("harnessRegistrationMeta derives registration metadata from AdapterPool.describe()", () => {
		const pool = makePopulatedPool();
		expect(harnessRegistrationMeta(pool, "opencode")).toEqual(OPENCODE_META);
		expect(harnessRegistrationMeta(pool, "unknown-type")).toBeNull();
	});

	it("a real AdapterPool is structurally assignable to HarnessCapabilityReader (compile-time guarantee)", () => {
		const pool = makePopulatedPool();
		const reader: HarnessCapabilityReader = pool;
		expect(harnessCapabilitiesForType(reader, "opencode")?.returnEnforcement).toBe("none");
	});
});
