/**
 * Stories for SettingsAgents.
 *
 * Covers all rendering paths:
 * 1. Loading state
 * 2. Error state
 * 3. Empty state (no agents)
 * 4. Populated state (agents listed)
 */

import type React from "react";

export default {
	title: "SettingsAgents",
	tier: "3" as const,
};

const MOCK_AGENTS = [
	{
		id: "story-agent-pm",
		name: "Acme PM",
		role: "product_manager",
		soulPrompt: "# PM\n\nYou are the product manager for {{product}}.",
		harnessType: "claude-code",
		modelTierPreference: "workhorse",
		maxConcurrentSessions: 1,
		status: "active",
		activeSessions: 0,
	},
	{
		id: "story-agent-builder",
		name: "Builder Bot",
		role: "builder",
		soulPrompt: null,
		harnessType: null,
		modelTierPreference: null,
		maxConcurrentSessions: 2,
		status: "active",
		activeSessions: 1,
	},
];

function mockFetch(agents: typeof MOCK_AGENTS | null, error = false): () => Promise<Response> {
	return () => {
		if (error) {
			return Promise.resolve(new Response(null, { status: 500 }));
		}
		if (agents === null) {
			return new Promise(() => {}); // Never resolves — loading state
		}
		return Promise.resolve(
			new Response(JSON.stringify(agents), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
	};
}

/** Loading state — fetch never resolves. */
export const Loading = (): React.JSX.Element => {
	const original = globalThis.fetch;
	globalThis.fetch = mockFetch(null) as typeof fetch;
	setTimeout(() => {
		globalThis.fetch = original;
	}, 5000);

	const { SettingsAgents } = require("./SettingsAgents");
	return (
		<div className="p-4 max-w-[680px]">
			<SettingsAgents />
		</div>
	);
};

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

/** Populated state — agents listed. */
export const Populated = (): React.JSX.Element => {
	globalThis.fetch = mockFetch(MOCK_AGENTS) as typeof fetch;

	const { SettingsAgents } = require("./SettingsAgents");
	return (
		<div className="p-4 max-w-[680px]">
			<SettingsAgents />
		</div>
	);
};
