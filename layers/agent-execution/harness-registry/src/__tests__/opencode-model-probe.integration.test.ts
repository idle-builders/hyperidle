import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/harness-protocol";
import { describe, expect, test } from "vitest";
import { AdapterPool } from "../adapter-pool.js";
import { discoverLocalHarnesses } from "../harness-discovery.js";
import { requireHarness } from "./require-harness.js";

function adapter(): HarnessAdapter {
	const capabilities: HarnessCapabilities = {
		preCompactionTrigger: false,
		subAgents: false,
		mcpSupport: true,
		modelProviders: [],
		fileEditing: false,
		toolUse: false,
		returnEnforcement: "none",
		descriptorModels: [],
	};
	return {
		async startSession(_config: SessionConfig): Promise<SessionHandle> {
			return { sessionId: "descriptor-only" };
		},
		async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {},
		async stopSession(_handle: SessionHandle): Promise<SessionResult> {
			return {
				outcome: "completed",
				tokenUsage: { byTier: {} },
			};
		},
		getCapabilities: () => capabilities,
	};
}

describe("opencode model probe through cohesive capability API", () => {
	requireHarness("opencode");

	test("real verbose catalog is parsed and merged into AdapterPool.describe", async () => {
		const discoveries = await discoverLocalHarnesses();
		expect(discoveries.opencode.state).not.toBe("missing");
		expect(discoveries.opencode.models?.length).toBeGreaterThan(0);

		const pool = new AdapterPool(discoveries);
		pool.register("local-opencode", adapter(), {
			type: "opencode",
			name: "OpenCode",
			kind: "local",
			modelProviders: [],
			maxConcurrent: 1,
		});
		const descriptor = pool.describe({ type: "opencode" }).at(0);
		expect(descriptor?.models).toEqual(discoveries.opencode.models);
		expect(descriptor?.models.some(({ contextWindow }) => (contextWindow ?? 0) > 0)).toBe(true);
		for (const model of descriptor?.models ?? []) {
			expect(model.id.length).toBeGreaterThan(0);
			expect(model.label.length).toBeGreaterThan(0);
			expect(model.contextWindow).toBeGreaterThanOrEqual(0);
			expect(model.selectable).toBe(true);
		}
	});
});
