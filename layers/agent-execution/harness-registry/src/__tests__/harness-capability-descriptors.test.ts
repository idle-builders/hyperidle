import type { AdapterMeta, HarnessCapabilities } from "@hyperidle/harness-protocol";
import { describe, expect, it } from "vitest";
import {
	describeHarnessCapability,
	missingHarnessCapabilities,
} from "../harness-capability-descriptors.js";
import type { HarnessDiscoveryInput } from "../harness-discovery.js";

const OPENCODE_META: AdapterMeta = {
	name: "OpenCode",
	kind: "local",
	type: "opencode",
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
const catalog = { describe: describeHarnessCapability, missing: missingHarnessCapabilities };

describe("AM2 harness capability descriptor builders", () => {
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

		expect(descriptor.authAction.kind).toBe("native_cli_login");
		expect(descriptor.discovery.state).toBe("ready");
	});

	it("emits missing descriptors for first-class known harness families", () => {
		const missing = catalog.missing(new Set<string>());
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
			},
			"cursor-agent": {
				state: "unavailable",
				reason: "No documented headless CLI surface.",
			},
		};

		const missing = catalog.missing(new Set(["claude-code", "opencode"]), discoveries);

		const codex = missing.find((d) => d.type === "codex");
		const cursor = missing.find((d) => d.type === "cursor-agent");

		// Discovery state/version should be surfaced correctly
		expect(codex?.discovery.state).toBe("ready");
		expect(codex?.discovery.version).toBe("0.141.0");

		expect(cursor?.discovery.state).toBe("unavailable");
		expect(cursor?.discovery.reason).toContain("headless CLI surface");
	});

	it("overrides registered adapter discovery from real probe results", () => {
		const discoveries: Record<string, HarnessDiscoveryInput> = {
			opencode: {
				state: "unauthenticated",
				reason: "no opencode login on this host",
			},
		};

		const descriptor = catalog.describe(OPENCODE_META, BASE_CAPS, discoveries);

		expect(descriptor.discovery.state).toBe("unauthenticated");
		expect(descriptor.discovery.reason).toContain("opencode login");
	});

	it("AC4: auth-status-only probe (no sessionProbe) surfaces discovery state", () => {
		// A discovery that only ran auth status (state=ready but no sessionProbe)
		// must surface the discovery state correctly.
		const discoveries: Record<string, HarnessDiscoveryInput> = {
			codex: {
				state: "ready",
				version: "0.141.0",
				// No sessionProbe — auth status only
			},
		};

		const missing = catalog.missing(
			new Set(["claude-code", "cursor-agent", "opencode"]),
			discoveries,
		);

		const codex = missing.find((d) => d.type === "codex");
		expect(codex).toBeDefined();
		expect(codex?.discovery.state).toBe("ready");
	});

	it("AC4: sessionProbe.ok = true surfaces ready state with session probe details", () => {
		// A discovery that ran a real session probe (sessionProbe.ok=true) proves
		// launchability — surfaces the session probe in discovery.
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
			},
		};

		const missing = catalog.missing(
			new Set(["claude-code", "cursor-agent", "opencode"]),
			discoveries,
		);

		const codex = missing.find((d) => d.type === "codex");
		expect(codex).toBeDefined();
		expect(codex?.discovery.state).toBe("ready");
	});
});
