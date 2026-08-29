/**
 * AM1 task 13 — Conversations reasoning relocation.
 *
 * The old `> N reasons` toggle lived inside the in-stream RichMessageCard. The
 * founder-approved Part-model conversation removes inline reasoning depth — a
 * review renders as a compact `review` Part (proposal + change-set + "Open
 * review"); the reasoning depth relocates to the review page. This test asserts
 * the NEW contract: the conversation shows the review reference with NO `> N
 * reasons` toggle and does NOT inline the reasoning steps.
 *
 * @lore AM1: reasoning depth lives where the decision is made (the review page),
 * not in the conversation. The conversation's only fold is the calm session/work
 * Fold (a session reference), never a reasoning toggle.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Conversations } from "../pages/Conversations";

const THREAD_ID = "demo-thread-1";

const FAKE_THREAD = {
	id: THREAD_ID,
	// A bet-hosted thread. "Open review" renders regardless of host kind
	// (the route needs no bet id), but a bet host is the simplest happy path
	// for the reasoning-relocation AC this file covers.
	hostKind: "bet",
	hostId: "bet-1",
	initiatorId: "agent-1",
	participants: ["u-founder", "agent-1"],
	pinned: false,
	resolvedAt: null,
	lastActiveAt: "2026-04-19T12:00:00.000Z",
	createdAt: "2026-04-19T12:00:00.000Z",
};

const FAKE_REVIEW_MESSAGE = {
	id: "m-rev",
	threadId: THREAD_ID,
	senderId: "agent-1",
	clientKey: "k-rev",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "review",
	payload: {
		title: "Pricing overhaul",
		reasoning: ["Step one", "Step two", "Step three"],
		artifactRef: { id: "art-1", kind: "text_diff" },
	},
};

describe("Conversations — reasoning relocated to the review page (AM1)", () => {
	beforeEach(() => {
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/auth/me")) {
				return new Response(
					JSON.stringify({ id: "u-founder", name: "Founder", email: "f@x", avatarUrl: null }),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			return new Response(
				JSON.stringify({
					thread: FAKE_THREAD,
					messages: [FAKE_REVIEW_MESSAGE],
					headMessageId: FAKE_REVIEW_MESSAGE.id,
					identities: {
						"u-founder": { name: "Founder", role: "founder" },
						"agent-1": { name: "Agent", role: "agent" },
					},
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}) as typeof globalThis.fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders the review reference with 'Open review' and NO `> N reasons` toggle in the conversation", async () => {
		const router = createMemoryRouter(
			[{ path: "/conversations/:threadId", element: <Conversations /> }],
			{ initialEntries: [`/conversations/${THREAD_ID}`] },
		);
		render(<RouterProvider router={router} />);

		await waitFor(() => {
			expect(screen.getByText(/Pricing overhaul/i)).toBeInTheDocument();
		});

		// The compact review Part is present with its single hook.
		expect(screen.getByRole("button", { name: /open review/i })).toBeInTheDocument();
		// No reasoning toggle in the conversation.
		expect(screen.queryByRole("button", { name: /reasons/i })).toBeNull();
		// Reasoning steps are NOT inlined in the conversation.
		expect(screen.queryByText("Step one")).toBeNull();
		expect(screen.queryByText("Step two")).toBeNull();
		// The legacy card is gone.
		expect(screen.queryByTestId("rich-message-card")).toBeNull();
	});
});
