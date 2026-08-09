/**
 * AN1 RED — HarnessCapabilityDescriptor.inheritedTools field tests.
 *
 * AC coverage:
 *   AC1 (inherited): descriptor extension enumerates inherited tools identity-only
 *                    (service + source harness, NO token value)
 *   Concept hard-rule 4: InheritedToolDescriptor has NO secret field
 *   Architecture §5: additive, non-breaking (existing descriptor consumers compile)
 *   Architecture §5: default inheritedTools: [] everywhere
 *   AC3 (inherited health): health is ConnectionHealth | "unknown" on InheritedToolDescriptor
 *
 * FAILS until:
 *   - framework/domain-model/src/connection.ts exports ConnectionHealth
 *   - framework/harness-capability/src/harness/harness-capability-descriptor.ts adds
 *     InheritedToolDescriptor + inheritedTools field
 */

import type {
	HarnessCapabilityDescriptor,
	InheritedToolDescriptor,
} from "@hyperidle/harness-capability";
import { describe, expect, it } from "vitest";
import type { ConnectionHealth } from "../connection.js";

describe("AN1 — HarnessCapabilityDescriptor.inheritedTools", () => {
	// AC1: descriptor field exists and is correctly typed
	describe("InheritedToolDescriptor shape — identity only, no secret", () => {
		it("InheritedToolDescriptor includes name, kind, harness, health", () => {
			const tool: InheritedToolDescriptor = {
				name: "github",
				kind: "mcp-server",
				harness: "claude-code",
				health: "working",
			};

			expect(tool.name).toBe("github");
			expect(tool.kind).toBe("mcp-server");
			expect(tool.harness).toBe("claude-code");
			expect(tool.health).toBe("working");
		});

		it("InheritedToolDescriptor kind is 'mcp-server' or 'cli'", () => {
			const mcpTool: InheritedToolDescriptor = {
				name: "linear",
				kind: "mcp-server",
				harness: "claude-code",
				health: "working",
			};
			const cliTool: InheritedToolDescriptor = {
				name: "gh",
				kind: "cli",
				harness: "environment",
				health: "working",
			};

			expect(mcpTool.kind).toBe("mcp-server");
			expect(cliTool.kind).toBe("cli");
		});

		it("InheritedToolDescriptor has NO secret, env, command, or token field", () => {
			const tool: InheritedToolDescriptor = {
				name: "stripe",
				kind: "cli",
				harness: "environment",
				health: "unknown",
			};

			// Concept hard-rule 4: no auth material in the descriptor
			expect(tool).not.toHaveProperty("secret");
			expect(tool).not.toHaveProperty("token");
			expect(tool).not.toHaveProperty("env");
			expect(tool).not.toHaveProperty("command");
		});

		it("health can be ConnectionHealth | 'unknown'", () => {
			const toolWorking: InheritedToolDescriptor = {
				name: "github",
				kind: "mcp-server",
				harness: "codex",
				health: "working" satisfies ConnectionHealth | "unknown",
			};
			const toolNeedsAttention: InheritedToolDescriptor = {
				name: "stripe",
				kind: "cli",
				harness: "environment",
				health: "needs-attention" satisfies ConnectionHealth | "unknown",
			};
			const toolUnknown: InheritedToolDescriptor = {
				name: "linear",
				kind: "mcp-server",
				harness: "codex",
				health: "unknown",
			};

			expect(toolWorking.health).toBe("working");
			expect(toolNeedsAttention.health).toBe("needs-attention");
			expect(toolUnknown.health).toBe("unknown");
		});
	});

	// Architecture §5: additive — HarnessCapabilityDescriptor gains inheritedTools
	describe("HarnessCapabilityDescriptor.inheritedTools", () => {
		it("HarnessCapabilityDescriptor accepts inheritedTools as a field", () => {
			const descriptor: HarnessCapabilityDescriptor = {
				type: "claude-code",
				name: "Claude Code",
				kind: "local",
				accessMode: "provider-subscription-cli",
				authAction: { kind: "native_cli_login", label: "Log in" },
				discovery: { state: "ready" },
				models: [],
				runtime: {
					preCompactionTrigger: false,
					subAgents: false,
					mcpSupport: true,
					modelProviders: ["anthropic"],
					fileEditing: true,
					toolUse: true,
				},
				modelProviders: ["anthropic"],
				inheritedTools: [
					{ name: "github", kind: "mcp-server", harness: "claude-code", health: "working" },
					{ name: "gh", kind: "cli", harness: "environment", health: "working" },
				],
			};

			expect(descriptor.inheritedTools ?? []).toHaveLength(2);
			expect((descriptor.inheritedTools ?? [])[0]?.name).toBe("github");
		});

		it("inheritedTools defaults to [] (additive, non-breaking)", () => {
			const descriptor: HarnessCapabilityDescriptor = {
				type: "builtin",
				name: "Built-in",
				kind: "local",
				accessMode: "api-gateway",
				authAction: { kind: "enter_api_key", label: "Enter API key" },
				discovery: { state: "ready" },
				models: [],
				runtime: {
					preCompactionTrigger: false,
					subAgents: false,
					mcpSupport: false,
					modelProviders: [],
					fileEditing: false,
					toolUse: false,
				},
				modelProviders: [],
				inheritedTools: [],
			};

			expect(descriptor.inheritedTools).toHaveLength(0);
			expect(Array.isArray(descriptor.inheritedTools)).toBe(true);
		});

		it("inherited tools contain no secret-bearing fields", () => {
			const descriptor: HarnessCapabilityDescriptor = {
				type: "claude-code",
				name: "Claude Code",
				kind: "local",
				accessMode: "provider-subscription-cli",
				authAction: { kind: "native_cli_login", label: "Log in" },
				discovery: { state: "ready" },
				models: [],
				runtime: {
					preCompactionTrigger: false,
					subAgents: false,
					mcpSupport: true,
					modelProviders: [],
					fileEditing: false,
					toolUse: false,
				},
				modelProviders: [],
				inheritedTools: [
					{ name: "github", kind: "mcp-server", harness: "claude-code", health: "working" },
				],
			};

			for (const tool of descriptor.inheritedTools ?? []) {
				expect(tool).not.toHaveProperty("secret");
				expect(tool).not.toHaveProperty("token");
				expect(tool).not.toHaveProperty("env");
			}
		});
	});
});
