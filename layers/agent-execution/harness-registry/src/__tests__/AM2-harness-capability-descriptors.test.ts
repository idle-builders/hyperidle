import type { AdapterMeta, HarnessCapabilities } from "@hyperidle/harness-protocol";
import { describe, expect, it } from "vitest";
import { createCapabilityCatalog } from "../harness-capability-descriptors.js";
import type { HarnessDiscoveryInput } from "../harness-discovery.js";

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
	returnEnforcement: "none",
};
const catalog = createCapabilityCatalog();

describe("AM2 harness capability descriptor builders", () => {
	it("describes builtin as API-gateway/direct-key access with model descriptors", () => {
		const descriptor = catalog.describe(BUILTIN_META, BASE_CAPS);

		expect(descriptor.type).toBe("builtin");
		expect(descriptor.accessMode).toBe("api-gateway");
		expect(descriptor.authAction.kind).toBe("enter_api_key");
		expect(descriptor.models.length).toBeGreaterThan(0);
		expect(
			descriptor.models.some(
				(model: (typeof descriptor.models)[number]) => model.provider === "anthropic",
			),
		).toBe(true);
		expect(JSON.stringify(descriptor)).not.toContain("sk-");
	});

	it("describes CLI harnesses as provider-subscription CLI auth", () => {
		const descriptor = catalog.describe(
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
				returnEnforcement: "none",
			},
		);

		expect(descriptor.accessMode).toBe("provider-subscription-cli");
		expect(descriptor.authAction.kind).toBe("native_cli_login");
		expect(descriptor.discovery.state).toBe("ready");
	});

	it("emits missing descriptors for first-class known harness families", () => {
		const missing = catalog.missing(new Set(["builtin"]));
		const missingTypes = missing.map((descriptor) => descriptor.type);

		expect(missingTypes).toEqual(["codex", "claude-code", "cursor-agent", "opencode"]);
		expect(missing.every((descriptor) => descriptor.discovery.state === "missing")).toBe(true);
		expect(missing.every((descriptor) => descriptor.authAction.kind === "native_cli_login")).toBe(
			true,
		);
	});

	it("uses discovery state for missing families instead of inventing readiness", () => {
		// AC4: auth-status-only probe (no sessionProbe) — fileEditing/toolUse stay false
		// even when runtime is declared with true values, because sessionProbe.ok is absent.
		const discoveries: Record<string, HarnessDiscoveryInput> = {
			codex: {
				state: "ready",
				version: "0.141.0",
				// No sessionProbe — so fileEditing/toolUse must NOT be true (auth status ≠ launchable)
				runtime: { fileEditing: true, toolUse: true },
			},
			"cursor-agent": {
				state: "unavailable",
				reason: "No documented headless CLI surface.",
			},
		};

		const missing = catalog.missing(new Set(["builtin", "claude-code", "opencode"]), discoveries);

		const codex = missing.find((d) => d.type === "codex");
		const cursor = missing.find((d) => d.type === "cursor-agent");

		// Discovery state/version should be surfaced correctly
		expect(codex?.discovery.state).toBe("ready");
		expect(codex?.discovery.version).toBe("0.141.0");

		// AC4: without sessionProbe.ok, runtime caps stay false (auth status alone ≠ launchable)
		expect(codex?.runtime.fileEditing).toBe(false);
		expect(codex?.runtime.toolUse).toBe(false);

		expect(cursor?.discovery.state).toBe("unavailable");
		expect(cursor?.discovery.reason).toContain("headless CLI surface");
		expect(cursor?.runtime.fileEditing).toBe(false);
		expect(cursor?.runtime.toolUse).toBe(false);
	});

	it("overrides registered adapter discovery from real probe results", () => {
		const discoveries: Record<string, HarnessDiscoveryInput> = {
			builtin: {
				state: "unauthenticated",
				reason: "ANTHROPIC_API_KEY absent",
			},
		};

		const descriptor = catalog.describe(BUILTIN_META, BASE_CAPS, discoveries);

		expect(descriptor.discovery.state).toBe("unauthenticated");
		expect(descriptor.discovery.reason).toContain("ANTHROPIC_API_KEY");
	});

	it("AC4: auth-status-only probe (no sessionProbe) leaves fileEditing/toolUse false", () => {
		// A discovery that only ran auth status (state=ready but no sessionProbe)
		// must NOT set fileEditing/toolUse = true — auth status alone proves login,
		// NOT launchability.
		const discoveries: Record<string, HarnessDiscoveryInput> = {
			codex: {
				state: "ready",
				version: "0.141.0",
				// No sessionProbe — auth status only
			},
		};

		const missing = catalog.missing(
			new Set(["builtin", "claude-code", "cursor-agent", "opencode"]),
			discoveries,
		);

		const codex = missing.find((d) => d.type === "codex");
		expect(codex).toBeDefined();
		expect(codex?.discovery.state).toBe("ready");
		// Without sessionProbe.ok, runtime caps must be conservative
		expect(codex?.runtime.fileEditing).toBe(false);
		expect(codex?.runtime.toolUse).toBe(false);
	});

	it("AC4: sessionProbe.ok = true enables fileEditing/toolUse true", () => {
		// A discovery that ran a real session probe (sessionProbe.ok=true) proves
		// launchability — caps may be set to true.
		const discoveries: Record<string, HarnessDiscoveryInput> = {
			codex: {
				state: "ready",
				version: "0.141.0",
				sessionProbe: {
					ok: true,
					family: "codex",
					capturedLine: '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}',
					eventType: "turn.completed",
				},
				runtime: { fileEditing: true, toolUse: true },
			},
		};

		const missing = catalog.missing(
			new Set(["builtin", "claude-code", "cursor-agent", "opencode"]),
			discoveries,
		);

		const codex = missing.find((d) => d.type === "codex");
		expect(codex).toBeDefined();
		expect(codex?.discovery.state).toBe("ready");
		// With sessionProbe.ok=true and runtime set, caps are proven
		expect(codex?.runtime.fileEditing).toBe(true);
		expect(codex?.runtime.toolUse).toBe(true);
	});
});
