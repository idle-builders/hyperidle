/**
 * L11 step5 (write-tests) — Decision dispatch from a review thread (AC-11).
 *
 * Approved.md §5.4. Plan §5.6 + §6.2 + §11 T7.
 *
 * Click the Approve button in the promoted card → page POSTs to the
 * canonical thread-message endpoint with the verdict shape and a fresh
 * UUID `clientKey`. This proves the `RichMessageCard` action surface is
 * wired to L7's response-as-event path (the canonical surface, per plan
 * CONFUSION resolution A).
 *
 * @lore L11 step5: fails before the green phase because the legacy thread
 * head + sticky verdict bar are mounted instead of the RichMessageCard.
 * Plan T7 makes this pass.
 *
 * @lore L9: ConversationsReview replaced by Conversations. The page reads
 * threadId from useParams() so tests use createMemoryRouter at
 * /conversations/:threadId instead of window.history.replaceState + ?id=.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Conversations } from "../pages/Conversations";

const THREAD_ID = "t-l11-dispatch";

const FAKE_THREAD = {
	id: THREAD_ID,
	hostKind: "task",
	hostId: "task-9",
	initiatorId: "agent-1",
	participants: ["u-founder", "agent-1"],
	pinned: false,
	resolvedAt: null,
	lastActiveAt: "2026-04-19T12:00:00.000Z",
	createdAt: "2026-04-19T12:00:00.000Z",
};

const FAKE_REVIEW = {
	id: "m-rev-l11",
	threadId: THREAD_ID,
	senderId: "agent-1",
	clientKey: "k-rev-l11",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "review",
	payload: {
		title: "L11 dispatch fixture",
		reasoning: ["one"],
		artifactRef: { id: "art-l11", kind: "text_diff" },
	},
};

interface CapturedPost {
	url: string;
	body: unknown;
}

describe("Conversations — verdict dispatch (AC-11)", () => {
	let posts: CapturedPost[];
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		posts = [];
		originalFetch = globalThis.fetch;
		const detail = {
			thread: FAKE_THREAD,
			messages: [FAKE_REVIEW],
			headMessageId: FAKE_REVIEW.id,
			identities: {
				"u-founder": { name: "Founder", role: "founder" },
				"agent-1": { name: "Aria", role: "builder" },
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
						message: {
							id: "m-verdict-1",
							threadId: THREAD_ID,
							senderId: "u-founder",
							clientKey: (body as { clientKey?: string }).clientKey ?? "x",
							deletedAt: null,
							redactedAt: null,
							resolvedAt: null,
							createdAt: "2026-04-19T12:30:00.000Z",
							type: "verdict",
							payload: {
								decision: (body as { payload?: { decision?: string } }).payload?.decision,
								resolvesMessageId: FAKE_REVIEW.id,
							},
						},
						thread: { ...FAKE_THREAD, resolvedAt: "2026-04-19T12:30:00.000Z" },
					}),
					{ status: 201, headers: { "Content-Type": "application/json" } },
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
			[{ path: "/conversations/:threadId", element: <Conversations /> }],
			{ initialEntries: [`/conversations/${THREAD_ID}`] },
		);
		render(<RouterProvider router={router} />);
	}

	it("clicking Approve in the RichMessageCard POSTs a verdict with the canonical shape", async () => {
		const user = (await import("@testing-library/user-event")).default.setup();
		renderConversations();

		const card = await screen.findByTestId("rich-message-card");
		expect(card).toBeInTheDocument();

		const approve = await screen.findByRole("button", { name: /^approve$/i });
		await user.click(approve);

		await waitFor(() => expect(posts.length).toBeGreaterThan(0));

		const post = posts[0];
		expect(post.url).toContain(`/api/threads/${THREAD_ID}/messages`);
		const body = post.body as {
			type?: string;
			payload?: { decision?: string; resolvesMessageId?: string };
			clientKey?: string;
		};
		expect(body.type).toBe("verdict");
		expect(body.payload?.decision).toBe("approve");
		expect(body.payload?.resolvesMessageId).toBe(FAKE_REVIEW.id);
		// Plan §6.2: clientKey is a UUID generated per click intent.
		expect(typeof body.clientKey).toBe("string");
		expect((body.clientKey as string).length).toBeGreaterThan(0);
	});

	it("does NOT mount the deleted top toolbar (AC-2)", async () => {
		renderConversations();
		await screen.findByTestId("rich-message-card");
		// The deleted top toolbar was the only surface labelling itself with
		// this testid.
		expect(screen.queryByTestId("review-header")).toBeNull();
	});
});
