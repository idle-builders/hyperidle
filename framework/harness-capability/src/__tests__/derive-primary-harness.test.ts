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
		acceptsApiKey: false,
		models: models.map((m) => ({
			id: m.id,
			label: m.id,
			provider: m.provider as never,
			selectable: m.selectable,
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

	// @lore These four used to assert a hardcoded "claude-sonnet-4-6" / "anthropic"
	// pair whenever the descriptor named no selectable model. That pair was
	// invented, not chosen: it went onto every scaffolded agent as though the user
	// had picked it, naming an Anthropic model on harnesses that may not serve one.
	// The absence is now carried as absence, and the harness runs its own default.

	it("names no model when the descriptor lists none as selectable", () => {
		const descriptor = makeDescriptor("codex", [{ id: "o3-mini", selectable: false }]);
		const result = derivePrimaryHarness(descriptor);
		expect(result.harnessType).toBe("codex");
		expect(result.modelId).toBeUndefined();
		expect(result.modelProvider).toBeUndefined();
	});

	it("names no model when the model list is empty", () => {
		const descriptor = makeDescriptor("opencode", []);
		const result = derivePrimaryHarness(descriptor);
		expect(result.harnessType).toBe("opencode");
		expect(result.modelId).toBeUndefined();
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

	it("names no provider when both model.provider and modelProviders are absent", () => {
		const descriptor = makeDescriptor("codex", [{ id: "some-model", selectable: true }]);
		const result = derivePrimaryHarness(descriptor);
		expect(result.modelProvider).toBeUndefined();
	});

	// The bring-your-own-key path: the user names the model themselves, and that
	// choice has to beat anything the descriptor happens to list.
	it("a model the user chose wins over the descriptor's first selectable", () => {
		const descriptor = makeDescriptor(
			"opencode",
			[{ id: "glm-model", provider: "openrouter", selectable: true }],
			["openrouter"],
		);
		const result = derivePrimaryHarness(descriptor, {
			modelId: "anthropic/claude-opus-5",
			modelProvider: "anthropic",
		});
		expect(result.modelId).toBe("anthropic/claude-opus-5");
		expect(result.modelProvider).toBe("anthropic");
	});
});
