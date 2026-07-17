/**
 * Stories for SettingsModels.
 *
 * Covers all rendering paths:
 * 1. Loading state
 * 2. Error state
 * 3. Anthropic defaults (all tiers → anthropic)
 * 4. Mixed providers (openrouter + openai-compatible)
 */

import { type ComponentType, type ReactElement, useLayoutEffect, useState } from "react";

export default {
	title: "SettingsModels",
	tier: "3" as const,
};

// AH2: Updated to current catalog IDs.
const MOCK_GATEWAY_CONFIG_DEFAULT = {
	reasoning: { provider: "anthropic", model: "claude-opus-4-8", hasApiKey: false },
	workhorse: { provider: "anthropic", model: "claude-sonnet-4-6", hasApiKey: false },
	fast: { provider: "anthropic", model: "claude-haiku-4-5", hasApiKey: false },
};

const MOCK_GATEWAY_CONFIG_MIXED = {
	reasoning: { provider: "anthropic", model: "claude-opus-4-8", hasApiKey: true },
	workhorse: { provider: "openrouter", model: "anthropic/claude-sonnet-4", hasApiKey: true },
	fast: {
		provider: "openai-compatible",
		model: "gemma-3",
		baseUrl: "https://api.together.xyz/v1",
		hasApiKey: true,
	},
};

type StoryComponent = ComponentType & { storyName?: string };

function withMockedFetch(config: typeof MOCK_GATEWAY_CONFIG_DEFAULT | null): StoryComponent {
	return function Story(): ReactElement {
		// Patch global fetch for the story
		if (config === null) {
			globalThis.fetch = (): Promise<Response> =>
				Promise.resolve({ ok: false, status: 500, json: async () => ({}) } as Response);
		} else {
			globalThis.fetch = (): Promise<Response> =>
				Promise.resolve({ ok: true, status: 200, json: async () => config } as Response);
		}

		const { SettingsModels } = require("./SettingsModels.js") as {
			SettingsModels: ComponentType;
		};
		return <SettingsModels />;
	};
}

export const Loading = (): ReactElement => {
	// @lore LG1: globalThis.fetch side-effect moved to useLayoutEffect + ready gate.
	const [ready, setReady] = useState(false);
	useLayoutEffect(() => {
		globalThis.fetch = (): Promise<Response> => new Promise(() => {});
		setReady(true);
	}, []);
	if (!ready) return <></>;
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { SettingsModels } = require("./SettingsModels.js") as {
		SettingsModels: ComponentType;
	};
	return <SettingsModels />;
};
Loading.storyName = "Loading State";

export const ErrorState = withMockedFetch(null);
ErrorState.storyName = "Error State";

export const AllAnthropic = withMockedFetch(MOCK_GATEWAY_CONFIG_DEFAULT);
AllAnthropic.storyName = "All Anthropic (defaults)";

export const MixedProviders = withMockedFetch(
	MOCK_GATEWAY_CONFIG_MIXED as typeof MOCK_GATEWAY_CONFIG_DEFAULT,
);
MixedProviders.storyName = "Mixed Providers (openrouter + openai-compatible)";
