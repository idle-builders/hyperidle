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

/** A complete send_message success body — `SendMessageOutputSchema`'s shape. */
const MOCK_SEND_MESSAGE_SUCCESS = {
	message: {
		id: "msg-story-1",
		threadId: "th-story-1",
		senderId: "user-founder",
		type: "plain",
		payload: { text: "Hey, can you take a look at this?" },
		clientKey: "ck-story-1",
		blockId: null,
		resolvedAt: null,
		deletedAt: null,
		redactedAt: null,
		createdAt: "2026-08-30T10:00:00.000Z",
	},
	thread: {
		id: "th-story-1",
		hostKind: "user",
		hostId: "user-founder",
		initiatorId: "user-founder",
		members: ["user-founder", "agent-builder"],
		title: null,
		computedTitle: "Builder Bot",
		pinned: false,
		resolvedAt: null,
		deletedAt: null,
		lastActiveAt: "2026-08-30T10:00:00.000Z",
		createdAt: "2026-08-30T10:00:00.000Z",
	},
};

/** The 422 shape `sendMessageInvariants` produces — `ActionResult`'s error arm. */
const MOCK_SEND_MESSAGE_ERROR = {
	ok: false,
	problems: [
		{ code: "no_target", message: "Name a thread or recipients to send to.", path: "threadId" },
	],
};

function useMockFetch(
	payload: Record<string, unknown> | null,
	/** Controls what `POST /api/actions/send_message` answers when the story's Send button is used. */
	sendMessageOutcome?: "success" | "error",
): void {
	useEffect(() => {
		const original = window.fetch;
		window.fetch = (async (url: unknown) => {
			const urlStr = typeof url === "string" ? url : String(url);
			if (urlStr.includes("/api/actions/send_message") && sendMessageOutcome !== undefined) {
				if (sendMessageOutcome === "error") {
					return new Response(JSON.stringify(MOCK_SEND_MESSAGE_ERROR), {
						status: 422,
						headers: { "Content-Type": "application/json" },
					});
				}
				return new Response(JSON.stringify({ ok: true, data: MOCK_SEND_MESSAGE_SUCCESS }), {
					status: 200,
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
	}, [payload, sendMessageOutcome]);
}

function Wrapper({
	mockPayload,
	sendMessageOutcome = "success",
}: {
	mockPayload?: Record<string, unknown> | null;
	sendMessageOutcome?: "success" | "error";
}): JSX.Element {
	useMockFetch(mockPayload ?? { recipients: MOCK_RECIPIENTS }, sendMessageOutcome);
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
