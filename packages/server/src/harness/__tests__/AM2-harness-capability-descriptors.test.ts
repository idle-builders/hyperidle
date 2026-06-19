import type { HarnessCapabilities } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import type { AdapterMeta } from "../adapter-pool.js";
import {
	describeRegisteredHarness,
	KNOWN_HARNESS_FAMILIES,
	missingKnownHarnessDescriptors,
} from "../harness-capability-descriptors.js";

const BUILTIN_META: AdapterMeta = {
	name: "Built-in Harness",
	kind: "local",
	type: "builtin",
	modelProviders: ["anthropic", "openrouter", "openai-compatible"],
	maxConcurrent: 8,
};

const BASE_CAPS: HarnessCapabilities = {
	preCompactionTrigger: true,
	subAgents: false,
	modelProviders: ["anthropic", "openrouter", "openai-compatible"],
	mcpSupport: false,
};

describe("AM2 harness capability descriptor builders", () => {
	it("describes builtin as API-gateway/direct-key access with model descriptors", () => {
		const descriptor = describeRegisteredHarness(BUILTIN_META, BASE_CAPS);

		expect(descriptor.type).toBe("builtin");
		expect(descriptor.accessMode).toBe("api-gateway");
		expect(descriptor.authAction.kind).toBe("enter_api_key");
		expect(descriptor.models.length).toBeGreaterThan(0);
		expect(descriptor.models.some((model) => model.provider === "anthropic")).toBe(true);
		expect(JSON.stringify(descriptor)).not.toContain("sk-");
	});

	it("describes CLI harnesses as provider-subscription CLI auth", () => {
		const descriptor = describeRegisteredHarness(
			{
				name: "Claude Code",
				kind: "local",
				type: "claude-code",
				modelProviders: ["anthropic"],
				maxConcurrent: 4,
			},
			{
				preCompactionTrigger: true,
				subAgents: true,
				modelProviders: ["anthropic"],
				mcpSupport: true,
			},
		);

		expect(descriptor.accessMode).toBe("provider-subscription-cli");
		expect(descriptor.authAction.kind).toBe("native_cli_login");
		expect(descriptor.discovery.state).toBe("ready");
	});

	it("emits missing descriptors for first-class known harness families", () => {
		expect(KNOWN_HARNESS_FAMILIES).toEqual(["codex", "claude-code", "cursor-agent", "opencode"]);

		const missing = missingKnownHarnessDescriptors(new Set(["builtin"]));
		const missingTypes = missing.map((descriptor) => descriptor.type);

		expect(missingTypes).toEqual(["codex", "claude-code", "cursor-agent", "opencode"]);
		expect(missing.every((descriptor) => descriptor.discovery.state === "missing")).toBe(true);
		expect(missing.every((descriptor) => descriptor.authAction.kind === "native_cli_login")).toBe(
			true,
		);
	});
});
