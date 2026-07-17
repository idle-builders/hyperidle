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
 * AO1: Per-bot Filesystems injection — the edit form gains a Filesystems control
 *      drawn from GET /api/filesystems (the team registry). The FilesystemInjection
 *      story auto-opens a bot's edit form showing 2 injected filesystems, each led
 *      by its `source` Tag.
 */

import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ToastRegion } from "../shell/ToastRegion.js";
import { SettingsAgents } from "./SettingsAgents.js";

export default {
	title: "SettingsAgents",
	tier: "3" as const,
};

/**
 * SettingsAgents calls useToast(), which throws outside a <ToastRegion>. Every
 * variant renders inside this frame so the section paints in the viewer.
 */
function Frame({
	children,
	rootRef,
}: {
	children: React.ReactNode;
	rootRef?: React.Ref<HTMLDivElement>;
}): React.JSX.Element {
	return (
		<ToastRegion>
			<div ref={rootRef} className="p-4 max-w-[680px]">
				{children}
			</div>
		</ToastRegion>
	);
}

const MOCK_HARNESSES = [
	{ type: "builtin", name: "Built-in Harness", modelProviders: ["anthropic", "openrouter"] },
	{ type: "claude-code", name: "Claude Code", modelProviders: ["anthropic"] },
];

// AO1: the team's registered filesystems — the per-bot injection pool.
const MOCK_FILESYSTEMS = [
	{ id: "fs-storefront", source: "github", resource: "acme/storefront", kind: "code" },
	{
		id: "fs-product-notes",
		source: "obsidian",
		resource: "~/vaults/product-notes",
		kind: "doc_set",
	},
	{ id: "fs-marketing-site", source: "github", resource: "acme/marketing-site", kind: "code" },
	{ id: "fs-brand-docs", source: "gdrive", resource: "Marketing / Brand", kind: "doc_set" },
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
		// AO1: this bot has 2 registered filesystems injected.
		filesystemIds: ["fs-storefront", "fs-product-notes"],
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
		if (urlStr.includes("/api/filesystems")) {
			return Promise.resolve(
				new Response(JSON.stringify(MOCK_FILESYSTEMS), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
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
	// @lore LG1: globalThis.fetch is a side-effect; useLayoutEffect runs before
	// children's useEffects, and the ready gate prevents children from mounting
	// before the mock is installed.
	const [ready, setReady] = useState(false);
	useLayoutEffect(() => {
		globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;
		setReady(true);
	}, []);
	if (!ready) return <></>;
	return (
		<Frame>
			<SettingsAgents />
		</Frame>
	);
};
Loading.storyName = "Loading State";

/** Error state — fetch fails. */
export const ErrorState = (): React.JSX.Element => {
	const [ready, setReady] = useState(false);
	useLayoutEffect(() => {
		globalThis.fetch = mockFetch([], true) as typeof fetch;
		setReady(true);
	}, []);
	if (!ready) return <></>;
	return (
		<Frame>
			<SettingsAgents />
		</Frame>
	);
};
ErrorState.storyName = "Error State";

/** Empty state — no agents. */
export const Empty = (): React.JSX.Element => {
	const [ready, setReady] = useState(false);
	useLayoutEffect(() => {
		globalThis.fetch = mockFetch([]) as typeof fetch;
		setReady(true);
	}, []);
	if (!ready) return <></>;
	return (
		<Frame>
			<SettingsAgents />
		</Frame>
	);
};
Empty.storyName = "Empty State";

/** Populated state — agents listed with harness + model selects. */
export const Populated = (): React.JSX.Element => {
	const [ready, setReady] = useState(false);
	useLayoutEffect(() => {
		globalThis.fetch = mockFetch(MOCK_AGENTS) as typeof fetch;
		setReady(true);
	}, []);
	if (!ready) return <></>;
	return (
		<Frame>
			<SettingsAgents />
		</Frame>
	);
};
Populated.storyName = "Populated (two agents)";

/**
 * AO1: Per-bot Filesystems injection — auto-opens Builder Bot's edit form so the
 * Filesystems injection control renders populated (2 injected filesystems, each
 * led by its source Tag), plus the "Add from registry…" Select.
 */
export const FilesystemInjection = (): React.JSX.Element => {
	const [ready, setReady] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		globalThis.fetch = mockFetch(MOCK_AGENTS) as typeof fetch;
		setReady(true);
	}, []);

	// Open Builder Bot's edit row after the table paints so the injection control
	// (which lives in the edit form) is visible in the static story. Scoped to this
	// variant's own subtree so the click doesn't leak into other variants on the page.
	useEffect(() => {
		if (!ready) return;
		const open = (): void => {
			const btn = rootRef.current?.querySelector<HTMLButtonElement>(
				'[aria-label="Edit Builder Bot"]',
			);
			if (btn) {
				btn.click();
			} else {
				requestAnimationFrame(open);
			}
		};
		const raf = requestAnimationFrame(open);
		return () => cancelAnimationFrame(raf);
	}, [ready]);

	if (!ready) return <></>;
	return (
		<Frame rootRef={rootRef}>
			<SettingsAgents />
		</Frame>
	);
};
FilesystemInjection.storyName = "Per-bot Filesystems injection";

/** Harness unavailable warning — agent's harnessType not in registry. */
export const HarnessUnavailable = (): React.JSX.Element => {
	const [ready, setReady] = useState(false);
	useLayoutEffect(() => {
		globalThis.fetch = mockFetch(MOCK_AGENT_UNAVAILABLE_HARNESS) as typeof fetch;
		setReady(true);
	}, []);
	if (!ready) return <></>;
	return (
		<Frame>
			<SettingsAgents />
		</Frame>
	);
};
HarnessUnavailable.storyName = "Harness Unavailable Warning";
