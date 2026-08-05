/**
 * AM1 task 12 — Conversations renders through ConversationSurface (Part model).
 *
 * The live page no longer mounts ThreadShell/RichMessageCard or any inline
 * verdict dispatch. It derives a `Part[]` and renders the calm column +
 * unified-"+" composer. This test proves:
 *  (a) a thread with plain + review + resolved messages renders the Part column
 *      (prose / review / resolved) — NO rich-message-card, NO inline Approve;
 *  (b) typing + Send POSTs a `plain` message to /api/threads/:id/messages with
 *      a uuid clientKey and refs:[], then refreshes;
 *  (c) "Open review" navigates to the review route (no verdict POST);
 *  (d) the conversation never POSTs a verdict.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Conversations } from "../pages/Conversations";

let lastPath = "";
function LocationProbe(): null {
	const loc = useLocation();
	lastPath = loc.pathname;
	return null;
}

const THREAD_ID = "t-am1-migration";

// ARCH-1: bet-hosted thread → the host id IS the bet, so the page sources a real
// betId and "Open review" routes to the full valid review path.
const BET_ID = "bet-am1-migration";
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

const PLAIN_MSG = {
	id: "m-plain",
	threadId: THREAD_ID,
	senderId: "u-founder",
	clientKey: "k-plain",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "plain",
	payload: { text: "Plain hello from the founder", refs: [] },
};

const REVIEW_MSG = {
	id: "m-review",
	threadId: THREAD_ID,
	senderId: "agent-1",
	clientKey: "k-review",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:01:00.000Z",
	type: "review",
	payload: {
		title: "Approve the pricing overhaul",
		reasoning: ["one"],
		artifactRef: { id: "art-1", kind: "text_diff" },
	},
};

const RESOLVED_REVIEW_MSG = {
	id: "m-review-resolved",
	threadId: THREAD_ID,
	senderId: "agent-1",
	clientKey: "k-review-resolved",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: "2026-04-19T12:05:00.000Z",
	createdAt: "2026-04-19T12:02:00.000Z",
	type: "review",
	payload: {
		title: "Resolved review echo",
		reasoning: ["done"],
		artifactRef: { id: "art-2", kind: "text_diff" },
	},
};

interface CapturedPost {
	url: string;
	body: { type?: string; payload?: { text?: string; refs?: unknown[] }; clientKey?: string };
}

function installFetch(posts: CapturedPost[]): void {
	const detail = {
		thread: FAKE_THREAD,
		messages: [PLAIN_MSG, REVIEW_MSG, RESOLVED_REVIEW_MSG],
		headMessageId: REVIEW_MSG.id,
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
			return new Response(
				JSON.stringify({
					message: { id: "m-new", type: body?.type ?? "plain" },
					thread: FAKE_THREAD,
				}),
				{ status: 201, headers: { "Content-Type": "application/json" } },
			);
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
}

describe("Conversations — Part-model migration (AM1 task 12)", () => {
	let posts: CapturedPost[];
	let originalFetch: typeof globalThis.fetch;
	beforeEach(() => {
		posts = [];
		originalFetch = globalThis.fetch;
		installFetch(posts);
		lastPath = "";
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	function renderConversations(): void {
		// A catch-all `*` route captures wherever the conversation navigates so the
		// review-route param (betId opaque/AM5-owned) cannot make the router throw.
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

	it("renders the calm Part column (prose/review/resolved) — no rich-message-card, no inline Approve", async () => {
		renderConversations();
		await screen.findByText("Plain hello from the founder");

		// The Part renderer is mounted, the legacy card is gone.
		expect(document.querySelector("[data-ds-component='PartList']")).not.toBeNull();
		expect(screen.queryByTestId("rich-message-card")).toBeNull();
		expect(screen.queryByTestId("thread-shell")).toBeNull();

		// Review Part: "Open review", NO inline Approve/Request-changes/Reject.
		expect(screen.getByText(/Approve the pricing overhaul/i)).toBeInTheDocument();
		expect(screen.getAllByRole("button", { name: /open review/i }).length).toBeGreaterThan(0);
		expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
		expect(screen.queryByRole("button", { name: /request changes/i })).toBeNull();
		expect(screen.queryByRole("button", { name: /^reject$/i })).toBeNull();

		// Resolved review echo renders + its quiet "View review".
		expect(screen.getAllByRole("button", { name: /view review/i }).length).toBeGreaterThan(0);
	});

	it("types + Send POSTs a plain message with refs:[] and a uuid clientKey", async () => {
		const user = userEvent.setup();
		renderConversations();
		await screen.findByText("Plain hello from the founder");

		const textarea = await screen.findByPlaceholderText(/Message/i);
		await user.type(textarea, "A fresh reply");
		await user.click(screen.getByRole("button", { name: /send message/i }));

		await waitFor(() => expect(posts.length).toBeGreaterThan(0));
		const post = posts.find((p) => p.body?.type === "plain");
		expect(post).toBeDefined();
		expect(post?.body.payload?.text).toBe("A fresh reply");
		expect(post?.body.payload?.refs).toEqual([]);
		expect(typeof post?.body.clientKey).toBe("string");
		expect((post!.body.clientKey as string).length).toBeGreaterThan(0);

		// The conversation NEVER POSTs a verdict.
		expect(posts.some((p) => p.body?.type === "verdict")).toBe(false);
	});

	it("clicking Open review navigates to the review route (no verdict POST)", async () => {
		const user = userEvent.setup();
		renderConversations();
		await screen.findByText("Plain hello from the founder");

		const openReview = screen.getAllByRole("button", { name: /open review/i })[0]!;
		await user.click(openReview);

		// ARCH-1 / ADV-2: "Open review" fires the OpenTarget→navigate seam to the FULL
		// valid review path. The page sources the betId from the bet-hosted thread
		// (host id IS the bet), so there is no empty segment / double slash. The
		// conversation navigates AWAY to the review route and never takes the verdict
		// inline.
		await waitFor(() => expect(lastPath).toBe(`/work/bet/${BET_ID}/review/${REVIEW_MSG.id}`));
		expect(lastPath).not.toContain("//");
		expect(lastPath).not.toContain("/conversations");
		// No verdict was POSTed by the conversation.
		expect(posts.some((p) => p.body?.type === "verdict")).toBe(false);
	});
});
