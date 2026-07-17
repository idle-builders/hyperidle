/**
 * Stories for SettingsHarnesses — Agent backends section (AM4).
 *
 * Covers all rendering paths:
 * 1. Loading state (fetch never resolves)
 * 2. Error state (fetch fails)
 * 3. Empty state (no descriptors returned)
 * 4. Populated state — 5 AM4-scope backends (production shape: caps all-false)
 * 5. Disabled row — claude-code disabled (discovery.disabled=true)
 */

import { type JSX, useLayoutEffect, useState } from "react";

export default {
	title: "SettingsHarnesses",
	group: "Settings" as const,
};

const ALL_CAPS_FALSE = {
	preCompactionTrigger: false,
	subAgents: false,
	mcpSupport: false,
	modelProviders: [] as string[],
	fileEditing: false,
	toolUse: false,
};

const MOCK_DESCRIPTORS = [
	{
		type: "builtin",
		name: "Built-in",
		kind: "local",
		accessMode: "api-gateway",
		authAction: { kind: "enter_api_key", label: "Enter API key" },
		discovery: { state: "ready" },
		models: [
			{
				id: "claude-opus-4-8",
				label: "Claude Opus 4.8",
				provider: "anthropic",
				selectable: true,
				inheritedFromGateway: true,
				options: [],
			},
		],
		runtime: { ...ALL_CAPS_FALSE, modelProviders: ["anthropic", "openrouter"] },
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
		discovery: { state: "ready", version: "2.1.178" },
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
		runtime: { ...ALL_CAPS_FALSE, modelProviders: ["anthropic"] },
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
		runtime: ALL_CAPS_FALSE,
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
		discovery: { state: "installed", version: "1.17.8" },
		models: [],
		runtime: ALL_CAPS_FALSE,
		modelProviders: [],
	},
	{
		type: "cursor-agent",
		name: "Cursor Agent",
		kind: "local",
		accessMode: "provider-subscription-cli",
		authAction: { kind: "none", label: "Configured in Cursor app" },
		discovery: {
			state: "unavailable",
			reason: "No documented headless CLI surface.",
		},
		models: [],
		runtime: ALL_CAPS_FALSE,
		modelProviders: [],
	},
];

const DESCRIPTORS_WITH_DISABLED = MOCK_DESCRIPTORS.map((d) =>
	d.type === "claude-code"
		? { ...d, discovery: { ...d.discovery, disabled: true, reason: "Turned off by user." } }
		: d,
);

// biome-ignore lint/suspicious/noExplicitAny: Story fixture uses partial descriptor shapes that don't align with the full type
function makeMockFetch(
	// biome-ignore lint/suspicious/noExplicitAny: same
	descriptors: any[] | null,
	error = false,
): (url: string | Request | URL, init?: RequestInit) => Promise<Response> {
	return (url: unknown) => {
		const urlStr = String(url);
		if (error) {
			return Promise.resolve(new Response(null, { status: 500 }));
		}
		if (descriptors === null) {
			return new Promise(() => {}); // Never resolves — loading state
		}
		if (urlStr.includes("/api/harnesses")) {
			return Promise.resolve(
				new Response(JSON.stringify(descriptors), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}
		return Promise.resolve(new Response(null, { status: 404 }));
	};
}

/** Loading state — fetch never resolves. */
export const Loading = (): JSX.Element => {
	// @lore LG1: globalThis.fetch moved to useLayoutEffect + ready gate (same pattern
	// as other stories in this codebase) so the side-effect is not during render.
	const [ready, setReady] = useState(false);
	useLayoutEffect(() => {
		globalThis.fetch = makeMockFetch(null) as typeof fetch;
		setReady(true);
	}, []);
	if (!ready) return <></>;
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { SettingsHarnesses } = require("./SettingsHarnesses");
	return (
		<div className="p-[24px] max-w-[680px]">
			<SettingsHarnesses />
		</div>
	);
};
Loading.storyName = "Loading State";

/** Error state — fetch fails. */
export const ErrorStory = (): JSX.Element => {
	const [ready, setReady] = useState(false);
	useLayoutEffect(() => {
		globalThis.fetch = makeMockFetch([], true) as typeof fetch;
		setReady(true);
	}, []);
	if (!ready) return <></>;
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { SettingsHarnesses } = require("./SettingsHarnesses");
	return (
		<div className="p-[24px] max-w-[680px]">
			<SettingsHarnesses />
		</div>
	);
};
ErrorStory.storyName = "Error State";

/** Empty state — no descriptors returned. */
export const Empty = (): JSX.Element => {
	const [ready, setReady] = useState(false);
	useLayoutEffect(() => {
		globalThis.fetch = makeMockFetch([]) as typeof fetch;
		setReady(true);
	}, []);
	if (!ready) return <></>;
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { SettingsHarnesses } = require("./SettingsHarnesses");
	return (
		<div className="p-[24px] max-w-[680px]">
			<SettingsHarnesses />
		</div>
	);
};
Empty.storyName = "Empty State";

/** Populated — 5 AM4-scope backends, production shape (caps all-false). */
export const Populated = (): JSX.Element => {
	const [ready, setReady] = useState(false);
	useLayoutEffect(() => {
		globalThis.fetch = makeMockFetch(MOCK_DESCRIPTORS) as typeof fetch;
		setReady(true);
	}, []);
	if (!ready) return <></>;
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { SettingsHarnesses } = require("./SettingsHarnesses");
	return (
		<div className="p-[24px] max-w-[680px]">
			<SettingsHarnesses />
		</div>
	);
};
Populated.storyName = "Populated (5 backends)";

/** Disabled row — claude-code is turned off (discovery.disabled=true). */
export const WithDisabledRow = (): JSX.Element => {
	const [ready, setReady] = useState(false);
	useLayoutEffect(() => {
		globalThis.fetch = makeMockFetch(DESCRIPTORS_WITH_DISABLED) as typeof fetch;
		setReady(true);
	}, []);
	if (!ready) return <></>;
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { SettingsHarnesses } = require("./SettingsHarnesses");
	return (
		<div className="p-[24px] max-w-[680px]">
			<SettingsHarnesses />
		</div>
	);
};
WithDisabledRow.storyName = "With Disabled Row";
