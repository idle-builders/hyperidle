/**
 * AM4 design fixtures — realistic same-machine HarnessCapabilityDescriptor data.
 *
 * Mirrors the as-built proof states from docs/agent-layer/harness-capability-descriptor.md:
 *  - builtin       → ready (api-gateway, OpenRouter credential present)
 *  - claude-code   → ready (CLI logged in, version 2.1.170)
 *  - codex         → unauthenticated (codex login)
 *  - opencode      → installed (auth unknown; normalization unknown)
 *  - cursor-agent  → unavailable (no headless surface; NO install CTA)
 *
 * Design-only fixture. Builder replaces with the live /api/harnesses fetch.
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/shared";

export const AM4_HARNESS_FIXTURES: readonly HarnessCapabilityDescriptor[] = [
	{
		type: "builtin",
		name: "Built-in",
		kind: "local",
		accessMode: "api-gateway",
		authAction: {
			kind: "enter_api_key",
			label: "Enter API key",
			description: "Store a model gateway API key in HyperIdle.",
			credentialNames: ["anthropic_api_key", "openrouter_api_key"],
		},
		discovery: { state: "ready", reason: "OpenRouter credential present." },
		models: [
			{
				id: "claude-opus-4-8",
				label: "Claude Opus 4.8",
				provider: "anthropic",
				contextWindow: 200000,
				selectable: true,
				inheritedFromGateway: true,
				options: [],
			},
			{
				id: "claude-sonnet-4-6",
				label: "Claude Sonnet 4.6",
				provider: "anthropic",
				contextWindow: 200000,
				selectable: true,
				inheritedFromGateway: true,
				options: [],
			},
		],
		runtime: {
			preCompactionTrigger: false,
			subAgents: false,
			mcpSupport: true,
			modelProviders: ["anthropic", "openrouter"],
			fileEditing: true,
			toolUse: true,
		},
		modelProviders: ["anthropic", "openrouter"],
	},
	{
		type: "claude-code",
		name: "Claude Code",
		kind: "local",
		accessMode: "provider-subscription-cli",
		authAction: {
			kind: "native_cli_login",
			label: "Log in to Claude Code",
			command: ["claude", "auth", "login"],
		},
		discovery: { state: "ready", version: "2.1.170" },
		models: [
			{
				id: "claude-sonnet-4-6",
				label: "Claude Sonnet 4.6",
				provider: "anthropic",
				selectable: true,
				inheritedFromGateway: false,
				options: [],
			},
		],
		runtime: {
			preCompactionTrigger: true,
			subAgents: true,
			mcpSupport: true,
			modelProviders: ["anthropic"],
			fileEditing: true,
			toolUse: true,
		},
		modelProviders: ["anthropic"],
	},
	{
		type: "codex",
		name: "Codex",
		kind: "local",
		accessMode: "provider-subscription-cli",
		authAction: {
			kind: "native_cli_login",
			label: "Log in to Codex",
			command: ["codex", "login"],
		},
		discovery: { state: "unauthenticated", version: "0.141.0" },
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
	},
	{
		type: "opencode",
		name: "OpenCode",
		kind: "local",
		accessMode: "provider-subscription-cli",
		authAction: {
			kind: "native_cli_login",
			label: "Log in to OpenCode",
			command: ["opencode", "providers", "login"],
		},
		discovery: { state: "installed", version: "1.17.8", reason: "Auth status not yet confirmed." },
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
	},
	{
		type: "cursor-agent",
		name: "Cursor Agent",
		kind: "local",
		accessMode: "provider-subscription-cli",
		authAction: { kind: "none", label: "Configured in the Cursor app" },
		discovery: {
			state: "unavailable",
			reason: "No documented headless local CLI surface exists. Use Cursor inside the Cursor app.",
		},
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
	},
];
