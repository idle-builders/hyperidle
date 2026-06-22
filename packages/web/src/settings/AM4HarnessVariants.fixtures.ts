/**
 * AM4 design fixtures — realistic same-machine HarnessCapabilityDescriptor data.
 *
 * Mirrors the as-built proof states from docs/agent-layer/harness-capability-descriptor.md:
 *  - builtin       → ready (api-gateway, OpenRouter credential present)
 *  - claude-code   → ready (CLI logged in, v2.1.178, Claude Max subscription)
 *  - codex         → disabled (present + signed in, but turned off by the user)
 *  - opencode      → ready (auth via OpenCode, upstream providers connected)
 *  - cursor-agent  → unavailable (no headless surface; NO install CTA, NO toggle)
 *
 * HONEST PRODUCTION SHAPE — runtime caps are all-`false` on every backend,
 * including the `ready` ones. Production discovery deliberately does NOT run the
 * session probe (AM2 @lore; re-detect does not populate them either — same probe
 * gating), so `fileEditing`/`toolUse`/`mcpSupport`/`subAgents` stay `false` until
 * a first real run/AM3. The card must read correctly under this shape (the fold
 * shows "confirmed after first run", never a wall of "No"). Do NOT hardcode caps
 * `true` here — that would mask the realistic shape the founder reviews.
 *
 * `discovery.disabled` + `discovery.authSummary` are AM4 scope additions (R1
 * reversal): `disabled` is the persisted per-harness flag AdapterPool.select()
 * honors; `authSummary` is the calm t3code-style "Authenticated as …" sub-text.
 * Typed loosely here (descriptor extension lands in the build); see the mapper.
 *
 * Design-only fixture. Builder replaces with the live /api/harnesses fetch.
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/shared";

type AM4Discovery = HarnessCapabilityDescriptor["discovery"] & {
	disabled?: boolean;
	authSummary?: string;
};
type AM4Descriptor = Omit<HarnessCapabilityDescriptor, "discovery"> & {
	discovery: AM4Discovery;
	badge?: string;
};

export const AM4_HARNESS_FIXTURES: readonly AM4Descriptor[] = [
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
		discovery: {
			state: "ready",
			authSummary: "Authenticated · OpenRouter gateway key present.",
			reason: "OpenRouter credential present.",
		},
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
		// Production shape: session probe not run → runtime caps all-false (AM2 @lore).
		runtime: {
			preCompactionTrigger: false,
			subAgents: false,
			mcpSupport: false,
			modelProviders: ["anthropic", "openrouter"],
			fileEditing: false,
			toolUse: false,
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
		discovery: {
			state: "ready",
			version: "2.1.178",
			authSummary: "Authenticated as you@studio.dev · Claude Max subscription.",
		},
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
		// Production shape: session probe not run → runtime caps all-false (AM2 @lore).
		runtime: {
			preCompactionTrigger: false,
			subAgents: false,
			mcpSupport: false,
			modelProviders: ["anthropic"],
			fileEditing: false,
			toolUse: false,
		},
		modelProviders: ["anthropic"],
	},
	{
		type: "codex",
		name: "Codex",
		kind: "local",
		accessMode: "provider-subscription-cli",
		badge: "Early Access",
		authAction: {
			kind: "native_cli_login",
			label: "Log in to Codex",
			command: ["codex", "login"],
		},
		// Present + runnable but turned off by the user — the toggle is OFF and
		// AdapterPool.select() skips it. Reads "Disabled — …" like the reference.
		discovery: {
			state: "ready",
			version: "0.141.0",
			disabled: true,
			reason: "Turned off in HyperIdle — agents will not select Codex.",
		},
		models: [
			{
				id: "gpt-5-codex",
				label: "GPT-5 Codex",
				provider: "openai",
				selectable: true,
				inheritedFromGateway: false,
				options: [],
			},
		],
		runtime: {
			preCompactionTrigger: false,
			subAgents: false,
			mcpSupport: false,
			modelProviders: ["openai"],
			fileEditing: false,
			toolUse: false,
		},
		modelProviders: ["openai"],
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
		discovery: {
			state: "ready",
			version: "1.17.7",
			authSummary: "Authenticated · 2 upstream providers connected through OpenCode.",
		},
		models: [
			{
				id: "oc-router",
				label: "OpenCode Router",
				provider: "opencode",
				selectable: true,
				inheritedFromGateway: false,
				options: [],
			},
		],
		runtime: {
			preCompactionTrigger: false,
			subAgents: false,
			mcpSupport: false,
			modelProviders: ["opencode"],
			fileEditing: false,
			toolUse: false,
		},
		modelProviders: ["opencode"],
	},
	{
		type: "cursor-agent",
		name: "Cursor Agent",
		kind: "local",
		accessMode: "provider-subscription-cli",
		badge: "Early Access",
		authAction: { kind: "none", label: "Configured in the Cursor app" },
		discovery: {
			state: "unavailable",
			reason: "No documented headless local CLI surface — use Cursor inside the Cursor app.",
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
