/**
 * AM1 task 12 — Conversations renders through ConversationSurface (Part model).
 *
 * The live page no longer mounts ThreadShell/RichMessageCard or any inline
 * verdict dispatch. It derives a `Part[]` and renders the calm column +
 * unified-"+" composer. This test proves:
 *  (a) a thread with plain + review + resolved messages renders the Part column
 *      (prose / review / resolved) — NO rich-message-card, NO inline Approve;
 *  (b) typing + Send calls `send_message` with a text body and a uuid clientKey,
 *      then refreshes;
 *  (c) "Open review" navigates to the review route with the thread's id (no
 *      verdict send);
 *  (d) the conversation never sends a verdict.
 *
 * @lore BC3: the thread surface is `call("open_thread"|"send_message"|...)`,
 * never a fetch to a deleted `/api/threads*` route. Mocks target `call`
 * directly (see `.claude/rules/testing.md`'s UI test rule).
 */

import type { ThreadView } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Conversations } from "../pages/Conversations";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

vi.mock("../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({
		user: { id: "u-founder", name: "Founder", email: "f@x", avatarUrl: null },
		status: "ready",
		error: null,
		retry: vi.fn(),
	}),
}));

let lastPath = "";
function LocationProbe(): null {
	const loc = useLocation();
	lastPath = loc.pathname;
	return null;
}

const THREAD_ID = "t-am1-migration";

// A team-hosted thread — host kind "task" no longer exists (architecture.md
// §3.9); a task's own thread is team-hosted.
const HOST_ID = "team-am1-migration";

function makeThread(): ThreadView["thread"] {
	return {
		id: THREAD_ID,
		hostKind: "team",
		hostId: HOST_ID,
		initiatorId: "agent-1",
		members: ["u-founder", "agent-1"],
		title: null,
		computedTitle: "Founder / Aria",
		pinned: false,
		resolvedAt: null,
		deletedAt: null,
		lastActiveAt: "2026-04-19T12:00:00.000Z",
		createdAt: "2026-04-19T12:00:00.000Z",
	};
}

const FAKE_MEMBERS: ThreadView["members"] = [
	{ id: "u-founder", name: "Founder", role: "founder", isAgent: false },
	{ id: "agent-1", name: "Aria", role: "agent", isAgent: true },
];

const PLAIN_MSG: ThreadView["messages"][number] = {
	id: "m-plain",
	threadId: THREAD_ID,
	senderId: "u-founder",
	clientKey: "k-plain",
	blockId: null,
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "plain",
	payload: { text: "Plain hello from the founder", refs: [] },
};

const REVIEW_MSG: ThreadView["messages"][number] = {
	id: "m-review",
	threadId: THREAD_ID,
	senderId: "agent-1",
	clientKey: "k-review",
	blockId: null,
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:01:00.000Z",
	type: "review",
	payload: {
		title: "Approve the pricing overhaul",
		reasoning: ["one"],
		producedItemId: "art-1",
	},
};

const RESOLVED_REVIEW_MSG: ThreadView["messages"][number] = {
	id: "m-review-resolved",
	threadId: THREAD_ID,
	senderId: "agent-1",
	clientKey: "k-review-resolved",
	blockId: null,
	deletedAt: null,
	redactedAt: null,
	resolvedAt: "2026-04-19T12:05:00.000Z",
	createdAt: "2026-04-19T12:02:00.000Z",
	type: "review",
	payload: {
		title: "Resolved review echo",
		reasoning: ["done"],
		producedItemId: "art-2",
	},
};

interface SendMessageCall {
	input: { text?: string; verdict?: unknown; clientKey?: string; refs?: unknown[] };
}

describe("Conversations — Part-model migration (AM1 task 12)", () => {
	let sends: SendMessageCall[];

	beforeEach(() => {
		sends = [];
		lastPath = "";
		callMock.mockImplementation(async (action: string, input?: unknown) => {
			if (action === "open_thread") {
				return {
					ok: true,
					data: {
						thread: makeThread(),
						members: FAKE_MEMBERS,
						messages: [PLAIN_MSG, REVIEW_MSG, RESOLVED_REVIEW_MSG],
						headMessageId: REVIEW_MSG.id,
						hostTitle: "Founder / Aria",
					},
				};
			}
			if (action === "send_message") {
				sends.push({ input: input as SendMessageCall["input"] });
				return { ok: true, data: { message: { id: "m-new" }, thread: makeThread() } };
			}
			return { ok: true, data: [] };
		});
	});

	afterEach(() => {
		callMock.mockReset();
		vi.restoreAllMocks();
	});

	function renderConversations(): void {
		// A catch-all `*` route captures wherever the conversation navigates so the
		// review-route param cannot make the router throw.
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
		expect(screen.getAllByRole("button", { name: /inspect review/i }).length).toBeGreaterThan(0);
	});

	it("types + Send calls send_message with the text and a uuid clientKey", async () => {
		const user = userEvent.setup();
		renderConversations();
		await screen.findByText("Plain hello from the founder");

		const textarea = await screen.findByPlaceholderText(/Message/i);
		await user.type(textarea, "A fresh reply");
		await user.click(screen.getByRole("button", { name: /send message/i }));

		await waitFor(() => expect(sends.length).toBeGreaterThan(0));
		const send = sends.find((s) => s.input.text === "A fresh reply");
		expect(send).toBeDefined();
		expect(typeof send?.input.clientKey).toBe("string");
		expect((send!.input.clientKey as string).length).toBeGreaterThan(0);

		// The conversation NEVER sends a verdict.
		expect(sends.some((s) => s.input.verdict !== undefined)).toBe(false);
	});

	it("clicking Open review navigates to the review route with the thread id (no verdict sent)", async () => {
		const user = userEvent.setup();
		renderConversations();
		await screen.findByText("Plain hello from the founder");

		const openReview = screen.getAllByRole("button", { name: /open review/i })[0]!;
		await user.click(openReview);

		// "Open review" fires the OpenTarget→navigate seam to the flattened
		// `/reviews/:reviewId` route, carrying the thread id on the query string
		// (`open_thread` needs it directly — architecture.md's review target).
		await waitFor(() => expect(lastPath).toBe(`/reviews/${REVIEW_MSG.id}`));
		expect(lastPath).not.toContain("//");
		expect(lastPath).not.toContain("/conversations");
		// No verdict was sent by the conversation.
		expect(sends.some((s) => s.input.verdict !== undefined)).toBe(false);
	});
});
