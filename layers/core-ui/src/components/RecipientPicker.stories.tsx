/**
 * Q1 §4.4: RecipientPicker stories.
 */

import type { JSX } from "react";
import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { RecipientPicker } from "./RecipientPicker";

export default { title: "RecipientPicker", tier: "utility" as const };

const MOCK_RECIPIENTS = [
	{
		id: "agent-builder",
		kind: "agent" as const,
		name: "Builder Bot",
		role: "builder",
		status: "active",
		hasActiveSession: true,
		avatarUrl: null,
	},
	{
		id: "agent-growth",
		kind: "agent" as const,
		name: "Growth Engine",
		role: "growth",
		status: "idle",
		hasActiveSession: false,
		avatarUrl: null,
	},
	{
		id: "user-founder",
		kind: "user" as const,
		name: "Founder",
		role: "founder",
		status: "active",
		hasActiveSession: false,
		avatarUrl: null,
	},
];

function useMockFetch(
	payload: Record<string, unknown> | null,
	createResponse?: Record<string, unknown> | null,
): void {
	useEffect(() => {
		const original = window.fetch;
		window.fetch = (async (url: unknown) => {
			const urlStr = typeof url === "string" ? url : String(url);
			if (urlStr.includes("/api/threads") && createResponse !== undefined) {
				return new Response(JSON.stringify(createResponse ?? {}), {
					status: createResponse ? 201 : 500,
					headers: { "Content-Type": "application/json" },
				});
			}
			return new Response(JSON.stringify(payload ?? { recipients: [] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as typeof window.fetch;
		return () => {
			window.fetch = original;
		};
	}, [payload, createResponse]);
}

function Wrapper({
	mockPayload,
	createResponse,
}: {
	mockPayload?: Record<string, unknown> | null;
	createResponse?: Record<string, unknown> | null;
}): JSX.Element {
	useMockFetch(mockPayload ?? { recipients: MOCK_RECIPIENTS }, createResponse);
	return (
		<MemoryRouter>
			<div className="p-[16px] max-w-[400px]">
				<RecipientPicker
					onSelect={(r) => {
						// biome-ignore lint/suspicious/noConsole: story-only demo
						console.log("[story] Selected:", r);
					}}
					onCancel={() => {
						// biome-ignore lint/suspicious/noConsole: story-only demo
						console.log("[story] Cancelled");
					}}
				/>
			</div>
		</MemoryRouter>
	);
}

export const Default = {
	name: "Browsing (recipient list)",
	render: (): JSX.Element => <Wrapper />,
};

export const Empty = {
	name: "Empty (no recipients)",
	render: (): JSX.Element => <Wrapper mockPayload={{ recipients: [] }} />,
};

function LoadingWrapper(): JSX.Element {
	useEffect(() => {
		const original = window.fetch;
		window.fetch = (() => new Promise(() => {})) as typeof window.fetch;
		return () => {
			window.fetch = original;
		};
	}, []);
	return (
		<MemoryRouter>
			<div className="p-[16px] max-w-[400px]">
				<RecipientPicker onSelect={() => {}} onCancel={() => {}} />
			</div>
		</MemoryRouter>
	);
}

export const Loading = {
	name: "Loading state",
	render: (): JSX.Element => <LoadingWrapper />,
};
