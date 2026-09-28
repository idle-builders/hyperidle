/**
 * Stories for the Conversations page (L9).
 *
 * Five states (A–E per design/approved.md):
 *  A — no thread selected (empty queue)
 *  B — thread loading (fetch in-flight)
 *  C — thread error (network failure)
 *  D — thread populated (review shape)
 *  E — thread not found (404)
 *
 * Each story uses createMemoryRouter so useParams() resolves correctly.
 */

import type React from "react";
import { useMemo } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { useStoryFetch } from "../__storybook__/use-story-globals.js";
import { Conversations } from "./Conversations";

export default { title: "Page: Conversations" };

// ---------------------------------------------------------------------------
// State A — no thread selected
// ---------------------------------------------------------------------------

export const StateAEmpty = (): React.JSX.Element => {
	const router = createMemoryRouter(
		[
			{ path: "/conversations", element: <Conversations /> },
			{ path: "/conversations/:threadId", element: <Conversations /> },
		],
		{ initialEntries: ["/conversations"] },
	);
	return <RouterProvider router={router} />;
};
StateAEmpty.storyName = "A — Queue empty (no thread selected)";

// ---------------------------------------------------------------------------
// State B — loading
// ---------------------------------------------------------------------------

export const StateBLoading = (): React.JSX.Element => {
	// Never-resolving fetch keeps the hook in loading indefinitely.
	useStoryFetch(useMemo(() => (() => new Promise(() => {})) as typeof fetch, []));
	const router = createMemoryRouter(
		[
			{ path: "/conversations", element: <Conversations /> },
			{ path: "/conversations/:threadId", element: <Conversations /> },
		],
		{ initialEntries: ["/conversations/t-loading-demo"] },
	);
	return <RouterProvider router={router} />;
};
StateBLoading.storyName = "B — Thread loading";

// ---------------------------------------------------------------------------
// State C — error
// ---------------------------------------------------------------------------

export const StateCError = (): React.JSX.Element => {
	useStoryFetch(
		useMemo(
			() =>
				(async () =>
					new Response(JSON.stringify({ error: "Network failure" }), {
						status: 500,
					})) as typeof fetch,
			[],
		),
	);
	const router = createMemoryRouter(
		[
			{ path: "/conversations", element: <Conversations /> },
			{ path: "/conversations/:threadId", element: <Conversations /> },
		],
		{ initialEntries: ["/conversations/t-error-demo"] },
	);
	return <RouterProvider router={router} />;
};
StateCError.storyName = "C — Thread error";

// ---------------------------------------------------------------------------
// State D — populated (review shape)
// ---------------------------------------------------------------------------

const REVIEW_THREAD = {
	thread: {
		id: "t-review-story",
		hostKind: "task",
		hostId: "task-1",
		initiatorId: "agent-1",
		participants: ["u-founder", "agent-1"],
		pinned: false,
		resolvedAt: null,
		lastActiveAt: "2026-04-30T12:00:00.000Z",
		createdAt: "2026-04-30T12:00:00.000Z",
	},
	messages: [
		{
			id: "m-review-1",
			threadId: "t-review-story",
			senderId: "agent-1",
			clientKey: "ck-review-1",
			deletedAt: null,
			redactedAt: null,
			resolvedAt: null,
			createdAt: "2026-04-30T12:00:00.000Z",
			type: "review",
			payload: {
				title: "Pricing overhaul",
				reasoning: ["Market analysis shows a 20% gap vs. competitors."],
				producedItemId: "art-1",
			},
		},
	],
	headMessageId: "m-review-1",
	identities: {
		"u-founder": { name: "Founder", role: "founder" },
		"agent-1": { name: "Aria", role: "builder" },
	},
};

export const StateDPopulated = (): React.JSX.Element => {
	useStoryFetch(
		useMemo(
			() =>
				(async () =>
					new Response(JSON.stringify(REVIEW_THREAD), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					})) as typeof fetch,
			[],
		),
	);
	const router = createMemoryRouter(
		[
			{ path: "/conversations", element: <Conversations /> },
			{ path: "/conversations/:threadId", element: <Conversations /> },
		],
		{ initialEntries: ["/conversations/t-review-story"] },
	);
	return <RouterProvider router={router} />;
};
StateDPopulated.storyName = "D — Thread populated (review shape)";

// ---------------------------------------------------------------------------
// State E — not found
// ---------------------------------------------------------------------------

export const StateENotFound = (): React.JSX.Element => {
	useStoryFetch(
		useMemo(() => (async () => new Response("not found", { status: 404 })) as typeof fetch, []),
	);
	const router = createMemoryRouter(
		[
			{ path: "/conversations", element: <Conversations /> },
			{ path: "/conversations/:threadId", element: <Conversations /> },
		],
		{ initialEntries: ["/conversations/no-such-thread"] },
	);
	return <RouterProvider router={router} />;
};
StateENotFound.storyName = "E — Thread not found (404)";
