/**
 * Q1 §4.5: SessionActivityPanel stories.
 */

import type { JSX } from "react";
import { useEffect } from "react";
import { SessionActivityPanel } from "./SessionActivityPanel";

export default { title: "SessionActivityPanel", tier: "utility" as const };

const NOW = Date.now();

const MOCK_ACTIVITY = [
	{
		type: "tool_call" as const,
		timestamp: NOW - 5000,
		data: { toolName: "bash", argsSummary: 'cmd="ls -la /src"' },
	},
	{
		type: "tool_call" as const,
		timestamp: NOW - 4000,
		data: { toolName: "read_file", argsSummary: 'path="src/index.ts"' },
	},
	{
		type: "reasoning" as const,
		timestamp: NOW - 3000,
		data: { excerpt: "Analyzing the directory structure to find the right module..." },
	},
	{
		type: "tool_call" as const,
		timestamp: NOW - 2000,
		data: { toolName: "write_file", argsSummary: 'path="src/feature.ts"' },
	},
];

function makeFetchMock(sessionState: "active" | "done", activity = MOCK_ACTIVITY): void {
	const original = window.fetch;
	window.fetch = (() =>
		Promise.resolve(
			new Response(
				JSON.stringify({
					session: {
						id: "sess-1",
						agentId: "agent-builder",
						taskId: "task-1",
						state: sessionState,
						startedAt: new Date(NOW - 60000).toISOString(),
						modelTier: "workhorse",
					},
					activity,
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			),
		)) as typeof window.fetch;
	// Store original for cleanup
	(window as unknown as Record<string, unknown>).__story_fetch_original__ = original;
}

function Wrapper({
	sessionState = "active" as const,
	activity = MOCK_ACTIVITY,
}: {
	sessionState?: "active" | "done";
	activity?: typeof MOCK_ACTIVITY;
}): JSX.Element {
	useEffect(() => {
		makeFetchMock(sessionState, activity);
		return () => {
			const orig = (window as unknown as Record<string, unknown>).__story_fetch_original__;
			if (typeof orig === "function") {
				window.fetch = orig as typeof window.fetch;
			}
		};
	}, [sessionState, activity]);

	return (
		<div className="flex h-[500px] max-w-[360px] border border-[var(--border-default)] rounded-[var(--r-subtle)] overflow-hidden">
			<SessionActivityPanel
				sessionId="sess-1"
				agentName="Builder Bot"
				taskTitle="Implement feature X"
				onClose={() => {
					// biome-ignore lint/suspicious/noConsole: story-only demo
					console.log("[story] Closed");
				}}
			/>
		</div>
	);
}

export const Streaming = {
	name: "Streaming (active session)",
	render: (): JSX.Element => <Wrapper sessionState="active" />,
};

export const Ended = {
	name: "Ended (session done)",
	render: (): JSX.Element => <Wrapper sessionState="done" />,
};

export const Empty = {
	name: "Empty (no activity)",
	render: (): JSX.Element => <Wrapper activity={[]} />,
};

function ErrorWrapper(): JSX.Element {
	useEffect(() => {
		const original = window.fetch;
		window.fetch = (() =>
			Promise.resolve(new Response("Error", { status: 500 }))) as typeof window.fetch;
		return () => {
			window.fetch = original;
		};
	}, []);
	return (
		<div className="flex h-[500px] max-w-[360px] border border-[var(--border-default)] rounded-[var(--r-subtle)] overflow-hidden">
			<SessionActivityPanel
				sessionId="sess-err"
				agentName="Builder Bot"
				taskTitle="Implement feature X"
				onClose={() => {}}
			/>
		</div>
	);
}

export const ErrorState = {
	name: "Error state",
	render: (): JSX.Element => <ErrorWrapper />,
};
