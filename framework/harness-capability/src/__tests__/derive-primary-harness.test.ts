/**
 * AV1 — derivePrimaryHarness unit tests
 *
 * AC1: Picker derives a PrimaryHarnessConfig from a HarnessCapabilityDescriptor.
 * - Model selection filters on selectable === true
 * - Falls back to claude-sonnet-4-6 / anthropic when no selectable model
 */

import { describe, expect, it } from "vitest";
import { derivePrimaryHarness } from "../harness/derive-primary-harness.js";
import type { HarnessCapabilityDescriptor } from "../harness/harness-capability-descriptor.js";

function makeDescriptor(
	type: string,
	models: Array<{ id: string; provider?: string; selectable: boolean }>,
	modelProviders?: string[],
): HarnessCapabilityDescriptor {
	return {
		type,
		name: type,
		kind: "local",
		authAction: { kind: "none", label: "None" },
		discovery: { state: "ready" },
		models: models.map((m) => ({
			id: m.id,
			label: m.id,
			provider: m.provider as never,
			selectable: m.selectable,
			inheritedFromGateway: false,
			options: [],
		})),
		modelProviders: modelProviders ?? [],
	};
}

describe("derivePrimaryHarness", () => {
	it("picks the first selectable model (filters selectable===true)", () => {
		const descriptor = makeDescriptor("claude-code", [
			{ id: "non-selectable-model", selectable: false },
			{ id: "haiku", provider: "anthropic", selectable: true },
			{ id: "sonnet", provider: "anthropic", selectable: true },
		]);
		const result = derivePrimaryHarness(descriptor);
		expect(result.harnessType).toBe("claude-code");
		expect(result.modelId).toBe("haiku");
		expect(result.modelProvider).toBe("anthropic");
	});

	it("falls back to claude-sonnet-4-6 / anthropic when no selectable model", () => {
		const descriptor = makeDescriptor("codex", [{ id: "o3-mini", selectable: false }]);
		const result = derivePrimaryHarness(descriptor);
		expect(result.harnessType).toBe("codex");
		expect(result.modelId).toBe("claude-sonnet-4-6");
		expect(result.modelProvider).toBe("anthropic");
	});

	it("falls back to claude-sonnet-4-6 when model list is empty", () => {
		const descriptor = makeDescriptor("builtin", []);
		const result = derivePrimaryHarness(descriptor);
		expect(result.harnessType).toBe("builtin");
		expect(result.modelId).toBe("claude-sonnet-4-6");
	});

	it("uses modelProviders[0] as provider fallback when model has no provider", () => {
		const descriptor = makeDescriptor(
			"opencode",
			[{ id: "glm-model", selectable: true }],
			["openrouter"],
		);
		const result = derivePrimaryHarness(descriptor);
		expect(result.modelProvider).toBe("openrouter");
	});

	it("falls back to anthropic as provider when both model.provider and modelProviders are absent", () => {
		const descriptor = makeDescriptor("builtin", [{ id: "some-model", selectable: true }]);
		const result = derivePrimaryHarness(descriptor);
		expect(result.modelProvider).toBe("anthropic");
	});
});
