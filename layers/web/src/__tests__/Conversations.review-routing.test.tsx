/**
 * AM1 task 13 — Conversations review routing (was Conversations.dispatch).
 *
 * The founder-approved Part-model conversation REMOVES the inline verdict
 * dispatch (design §5: "NO inline decision … the decision is made on the review
 * page"). A review message now renders as a `review` Part with a single
 * "Open review" hook that routes to the review page; the conversation never POSTs
 * a verdict. This test asserts the NEW contract (intended-behavior change driven
 * by an approved design — not a weakened assertion).
 *
 * Verdict SEMANTICS (Message type, payload, verdictDecisionLabel, POST shape) are
 * unchanged and covered where verdicts are actually taken (review page / server);
 * only the decision UI relocated (conversation → review page).
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Conversations } from "../pages/Conversations";

const THREAD_ID = "t-am1-review-routing";

let lastPath = "";
function LocationProbe(): null {
	const loc = useLocation();
	lastPath = loc.pathname;
	return null;
}

// ARCH-1: a bet-hosted thread — the host id IS the bet the review belongs to, so
// the page sources a real betId and the review route resolves validly.
const BET_ID = "bet-am1";
const FAKE_THREAD = {
	id: THREAD_ID,
	hostKind: "bet",
	hostId: BET_ID,
	initiatorId: "agent-1",
	participants: ["u-founder", "agent-1"],
	pinned: false,
	resolvedAt: null,
	lastActiveAt: "2026-04-19T12:00:00.000Z",
	createdAt: "2026-04-19T12:00:00.000Z",
};

const FAKE_REVIEW = {
	id: "m-rev-am1",
	threadId: THREAD_ID,
	senderId: "agent-1",
	clientKey: "k-rev-am1",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "review",
	payload: {
		title: "Approve the deploy",
		reasoning: ["one"],
		artifactRef: { id: "art-am1", kind: "text_diff" },
	},
};

interface CapturedPost {
	url: string;
	body: { type?: string } | null;
}

describe("Conversations — review routing (AM1, no inline verdict)", () => {
	let posts: CapturedPost[];
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		posts = [];
		lastPath = "";
		originalFetch = globalThis.fetch;
		const detail = {
			thread: FAKE_THREAD,
			messages: [FAKE_REVIEW],
			headMessageId: FAKE_REVIEW.id,
			identities: {
				"u-founder": { name: "Founder", role: "founder" },
				"agent-1": { name: "Aria", role: "agent" },
			},
		};
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();
			const method = (init?.method ?? "GET").toUpperCase();
			if (method === "POST" && url.endsWith(`/api/threads/${THREAD_ID}/messages`)) {
				const body = init?.body ? JSON.parse(init.body as string) : null;
				posts.push({ url, body });
				return new Response(JSON.stringify({ message: { id: "x" }, thread: FAKE_THREAD }), {
					status: 201,
					headers: { "Content-Type": "application/json" },
				});
			}
			if (url.includes("/api/auth/me")) {
				return new Response(
					JSON.stringify({ id: "u-founder", name: "Founder", email: "f@x", avatarUrl: null }),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			if (url.endsWith(`/api/threads/${THREAD_ID}`)) {
				return new Response(JSON.stringify(detail), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			return new Response("not found", { status: 404 });
		}) as typeof globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	function renderConversations(): void {
		const router = createMemoryRouter(
			[
				{
					path: "/conversations/:threadId",
					element: (
						<>
							<LocationProbe />
							<Conversations />
						</>
					),
				},
				{ path: "*", element: <LocationProbe /> },
			],
			{ initialEntries: [`/conversations/${THREAD_ID}`] },
		);
		render(<RouterProvider router={router} />);
	}

	it("renders a review Part with 'Open review' and NO inline Approve/Request-changes/Reject", async () => {
		renderConversations();
		await screen.findByText(/Approve the deploy/i);

		expect(document.querySelector("[data-ds-component='ReviewRequestPart']")).not.toBeNull();
		expect(screen.getByRole("button", { name: /open review/i })).toBeInTheDocument();
		// The inline verdict controls are GONE from the conversation.
		expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
		expect(screen.queryByRole("button", { name: /request changes/i })).toBeNull();
		expect(screen.queryByRole("button", { name: /^reject$/i })).toBeNull();
		// The legacy promoted card + top toolbar are gone.
		expect(screen.queryByTestId("rich-message-card")).toBeNull();
		expect(screen.queryByTestId("review-header")).toBeNull();
	});

	it("clicking 'Open review' navigates to the review route and POSTs no verdict", async () => {
		const user = userEvent.setup();
		renderConversations();
		await screen.findByText(/Approve the deploy/i);

		await user.click(screen.getByRole("button", { name: /open review/i }));

		// ARCH-1 / ADV-2: the page sources the betId from the bet-hosted thread, so
		// the review route is the FULL valid path — no empty segment, no double slash.
		await waitFor(() => expect(lastPath).toBe(`/work/bet/${BET_ID}/review/${FAKE_REVIEW.id}`));
		expect(lastPath).not.toContain("//");
		expect(lastPath).not.toContain("/conversations");
		// The conversation took NO verdict — no POST of any kind from a review click.
		expect(posts.some((p) => p.body?.type === "verdict")).toBe(false);
	});
});
