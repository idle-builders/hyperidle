/**
 * Stories for SettingsAgents.
 *
 * Covers all rendering paths:
 * 1. Loading state
 * 2. Error state
 * 3. Empty state (no agents)
 * 4. Populated state (agents listed, with model + harness selects)
 * 5. Harness unavailable warning (agent's harnessType not in registry)
 *
 * AH2: Updated for harness Select + model Select + inline 422 error.
 */

import type React from "react";

export default {
	title: "SettingsAgents",
	tier: "3" as const,
};

const MOCK_HARNESSES = [
	{ type: "builtin", name: "Built-in Harness", modelProviders: ["anthropic", "openrouter"] },
	{ type: "claude-code", name: "Claude Code", modelProviders: ["anthropic"] },
];

const MOCK_AGENTS = [
	{
		id: "story-agent-pm",
		name: "Acme PM",
		role: "product_manager",
		systemPrompt: "# PM\n\nYou are the product manager.",
		harnessType: "claude-code",
		modelId: "claude-sonnet-4-6",
		modelProvider: "anthropic",
		modelTierPreference: null,
		maxConcurrentSessions: 1,
		status: "active",
		activeSessions: 0,
		agentCategory: "team",
	},
	{
		id: "story-agent-builder",
		name: "Builder Bot",
		role: "builder",
		systemPrompt: null,
		harnessType: "builtin",
		modelId: "claude-opus-4-8",
		modelProvider: "anthropic",
		modelTierPreference: null,
		maxConcurrentSessions: 2,
		status: "active",
		activeSessions: 1,
		agentCategory: "team",
	},
];

const MOCK_AGENT_UNAVAILABLE_HARNESS: (typeof MOCK_AGENTS)[number][] = [
	{
		...(MOCK_AGENTS[0] as (typeof MOCK_AGENTS)[number]),
		id: "story-agent-aider",
		name: "Aider Agent",
		harnessType: "aider", // not in MOCK_HARNESSES
	},
];

function mockFetch(
	agents: (typeof MOCK_AGENTS)[number][] | null,
	error = false,
): (url: string | Request | URL, init?: RequestInit) => Promise<Response> {
	return (url: unknown) => {
		const urlStr = String(url);
		if (error) {
			return Promise.resolve(new Response(null, { status: 500 }));
		}
		if (agents === null) {
			return new Promise(() => {}); // Never resolves — loading state
		}
		if (urlStr.includes("/api/harnesses")) {
			return Promise.resolve(
				new Response(JSON.stringify(MOCK_HARNESSES), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}
		if (urlStr.includes("/api/agents/templates")) {
			return Promise.resolve(new Response(null, { status: 404 }));
		}
		if (urlStr.includes("/api/agents")) {
			return Promise.resolve(
				new Response(JSON.stringify(agents), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}
		return Promise.resolve(new Response(null, { status: 404 }));
	};
}

/** Loading state — fetch never resolves. */
export const Loading = (): React.JSX.Element => {
	globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;

	const { SettingsAgents } = require("./SettingsAgents");
	return (
		<div className="p-4 max-w-[680px]">
			<SettingsAgents />
		</div>
	);
};
Loading.storyName = "Loading State";

/** Error state — fetch fails. */
export const ErrorState = (): React.JSX.Element => {
	globalThis.fetch = mockFetch([], true) as typeof fetch;

	const { SettingsAgents } = require("./SettingsAgents");
	return (
		<div className="p-4 max-w-[680px]">
			<SettingsAgents />
		</div>
	);
};
ErrorState.storyName = "Error State";

/** Empty state — no agents. */
export const Empty = (): React.JSX.Element => {
	globalThis.fetch = mockFetch([]) as typeof fetch;

	const { SettingsAgents } = require("./SettingsAgents");
	return (
		<div className="p-4 max-w-[680px]">
			<SettingsAgents />
		</div>
	);
};
Empty.storyName = "Empty State";

/** Populated state — agents listed with harness + model selects. */
export const Populated = (): React.JSX.Element => {
	globalThis.fetch = mockFetch(MOCK_AGENTS) as typeof fetch;

	const { SettingsAgents } = require("./SettingsAgents");
	return (
		<div className="p-4 max-w-[680px]">
			<SettingsAgents />
		</div>
	);
};
Populated.storyName = "Populated (two agents)";

/** Harness unavailable warning — agent's harnessType not in registry. */
export const HarnessUnavailable = (): React.JSX.Element => {
	globalThis.fetch = mockFetch(MOCK_AGENT_UNAVAILABLE_HARNESS) as typeof fetch;

	const { SettingsAgents } = require("./SettingsAgents");
	return (
		<div className="p-4 max-w-[680px]">
			<SettingsAgents />
		</div>
	);
};
HarnessUnavailable.storyName = "Harness Unavailable Warning";
