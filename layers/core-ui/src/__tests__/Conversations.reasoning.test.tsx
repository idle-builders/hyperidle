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
 *
 * @lore BC3: the thread surface is `call("open_thread"|...)`, never a fetch to
 * a deleted `/api/threads*` route. Mocks target `call` directly (see
 * `.claude/rules/testing.md`'s UI test rule).
 */

import type { ThreadView } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Conversations } from "../pages/Conversations";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

vi.mock("../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({
		user: { id: "u-founder", name: "Founder", avatarUrl: null },
		status: "ready",
		error: null,
		retry: vi.fn(),
	}),
}));

const THREAD_ID = "demo-thread-1";

// A team-hosted thread — there is no "task" host kind. "Open review" renders
// regardless of host kind (the route needs no bet id), but a team host is
// the simplest happy path for the reasoning-relocation case this file covers.
const FAKE_THREAD: ThreadView["thread"] = {
	id: THREAD_ID,
	hostKind: "team",
	hostId: "team-1",
	initiatorId: "agent-1",
	members: ["u-founder", "agent-1"],
	title: null,
	computedTitle: "Founder / Agent",
	pinned: false,
	resolvedAt: null,
	deletedAt: null,
	lastActiveAt: "2026-04-19T12:00:00.000Z",
	createdAt: "2026-04-19T12:00:00.000Z",
};

const FAKE_MEMBERS: ThreadView["members"] = [
	{ id: "u-founder", name: "Founder", role: "founder", isAgent: false },
	{ id: "agent-1", name: "Agent", role: "agent", isAgent: true },
];

const FAKE_REVIEW_MESSAGE: ThreadView["messages"][number] = {
	id: "m-rev",
	threadId: THREAD_ID,
	senderId: "agent-1",
	clientKey: "k-rev",
	blockId: null,
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "review",
	payload: {
		title: "Pricing overhaul",
		reasoning: ["Step one", "Step two", "Step three"],
		producedItemId: "art-1",
	},
};

describe("Conversations — reasoning relocated to the review page (AM1)", () => {
	beforeEach(() => {
		callMock.mockImplementation(async (action: string) => {
			if (action === "open_thread") {
				return {
					ok: true,
					data: {
						thread: FAKE_THREAD,
						members: FAKE_MEMBERS,
						messages: [FAKE_REVIEW_MESSAGE],
						headMessageId: FAKE_REVIEW_MESSAGE.id,
						hostTitle: "Founder / Agent",
					},
				};
			}
			return { ok: true, data: [] };
		});
	});

	afterEach(() => {
		callMock.mockReset();
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
