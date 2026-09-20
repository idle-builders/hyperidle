/**
 * Conversations review routing.
 *
 * The Part-model conversation has NO inline verdict dispatch: a review
 * message renders as a `review` Part with a single "Open review" hook that
 * routes to the review page; the conversation never sends a verdict.
 *
 * Verdict SEMANTICS (Message type, payload, verdictDecisionLabel, send shape)
 * are covered where verdicts are actually taken (review page / server); only
 * the decision UI lives here (conversation → review page).
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
import { ReviewPage } from "../pages/review/ReviewPage";

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

const THREAD_ID = "t-am1-review-routing";

let lastPath = "";
function LocationProbe(): null {
	const loc = useLocation();
	lastPath = loc.pathname;
	return null;
}

// A team-hosted thread — there is no "task" host kind; a task's own
// thread is team-hosted.
const HOST_ID = "team-am1";

function makeThread(id: string, hostId: string): ThreadView["thread"] {
	return {
		id,
		hostKind: "team",
		hostId,
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

const FAKE_REVIEW: ThreadView["messages"][number] = {
	id: "m-rev-am1",
	threadId: THREAD_ID,
	senderId: "agent-1",
	clientKey: "k-rev-am1",
	blockId: null,
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "review",
	payload: {
		title: "Approve the deploy",
		reasoning: ["one"],
		producedItemId: "art-am1",
	},
};

interface SendMessageCall {
	input: { verdict?: unknown };
}

describe("Conversations — review routing (no inline verdict)", () => {
	let sends: SendMessageCall[];

	beforeEach(() => {
		sends = [];
		lastPath = "";
		callMock.mockImplementation(async (action: string, input?: unknown) => {
			if (action === "open_thread") {
				return {
					ok: true,
					data: {
						thread: makeThread(THREAD_ID, HOST_ID),
						members: FAKE_MEMBERS,
						messages: [FAKE_REVIEW],
						headMessageId: FAKE_REVIEW.id,
						hostTitle: "Founder / Aria",
					},
				};
			}
			if (action === "send_message") {
				sends.push({ input: input as SendMessageCall["input"] });
				return { ok: true, data: { message: { id: "x" }, thread: makeThread(THREAD_ID, HOST_ID) } };
			}
			return { ok: true, data: [] };
		});
	});

	afterEach(() => {
		callMock.mockReset();
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

	it("clicking 'Open review' navigates to the review route and sends no verdict", async () => {
		const user = userEvent.setup();
		renderConversations();
		await screen.findByText(/Approve the deploy/i);

		await user.click(screen.getByRole("button", { name: /open review/i }));

		// The route resolves to `/reviews/:reviewId` for EVERY review, carrying
		// the thread id on the query string — the URL no longer needs a bet at
		// all, since the loader names the review's own thread directly.
		await waitFor(() => expect(lastPath).toBe(`/reviews/${FAKE_REVIEW.id}`));
		expect(lastPath).not.toContain("//");
		expect(lastPath).not.toContain("/conversations");
		expect(lastPath).not.toContain("/work/bet");
		// The conversation took NO verdict — no send of any kind from a review click.
		expect(sends.some((s) => s.input.verdict !== undefined)).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// The render gate for a team-hosted review.
//
// @lore BC3: this used to be the render gate for a TASK-hosted review — host
// kind "task" no longer exists (architecture.md §3.9; a task's own thread is
// team-hosted), so there is no longer a distinct host kind to gate on here.
// The surviving behavior is "Open review navigates to the review route with
// the thread id", re-expressed over the same team-hosted fixture the describe
// above uses. This stays a `Conversations`-level test, not a `ReviewPage`
// one: mounting the page directly would go green while the button that
// reaches it stays invisible, proving nothing about reachability.
// ─────────────────────────────────────────────────────────────────────────────

const TEAM_THREAD_ID = "t-team-review";
const TEAM_HOST_ID = "team-2";
const TEAM_REVIEW_ID = "m-rev-team";

const TEAM_FAKE_REVIEW: ThreadView["messages"][number] = {
	id: TEAM_REVIEW_ID,
	threadId: TEAM_THREAD_ID,
	senderId: "agent-1",
	clientKey: "k-rev-team",
	blockId: null,
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "review",
	payload: {
		title: "Approve the deploy (team-hosted)",
		reasoning: ["a team-hosted review carries no bet"],
		producedItemId: "art-team",
	},
};

describe("Conversations — review routing, team-hosted (render gate)", () => {
	beforeEach(() => {
		lastPath = "";
		callMock.mockImplementation(async (action: string) => {
			if (action === "open_thread") {
				return {
					ok: true,
					data: {
						thread: makeThread(TEAM_THREAD_ID, TEAM_HOST_ID),
						members: FAKE_MEMBERS,
						messages: [TEAM_FAKE_REVIEW],
						headMessageId: TEAM_FAKE_REVIEW.id,
						hostTitle: "Founder / Aria",
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

	function renderTeamConversation(): void {
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
			{ initialEntries: [`/conversations/${TEAM_THREAD_ID}`] },
		);
		render(<RouterProvider router={router} />);
	}

	it("renders an 'Open review' control for a team-hosted review", async () => {
		renderTeamConversation();
		await screen.findByText(/Approve the deploy \(team-hosted\)/i);

		// The button must exist for a team host, not merely be inert.
		expect(screen.getByRole("button", { name: /open review/i })).toBeInTheDocument();
	});

	it("clicking 'Open review' on a team-hosted review navigates to the review route with the thread id", async () => {
		const user = userEvent.setup();
		renderTeamConversation();
		await screen.findByText(/Approve the deploy \(team-hosted\)/i);

		await user.click(screen.getByRole("button", { name: /open review/i }));

		await waitFor(() => expect(lastPath).toBe(`/reviews/${TEAM_REVIEW_ID}`));
		expect(lastPath).not.toContain("/work/bet");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// The verdict sent from the review page lands in the thread the URL's
// `?threadId=` query names.
//
// @lore BC3: this used to prove an approve POST landed on the loader-named
// thread rather than one a by-host lookup would guess. That guess path is
// gone entirely — `ReviewPage` reads `threadId` straight off the query string
// (`open-handler.ts`'s review target puts it there) and never looks it up by
// host. The surviving behavior: submitting Approve sends a `send_message`
// with `verdict.decision`/`resolvesMessageId` into exactly that thread.
// ─────────────────────────────────────────────────────────────────────────────

describe("ReviewPage — the verdict is a send_message into the thread named by ?threadId=", () => {
	const REVIEW_ID = "m-rev-approve";
	const NAMED_THREAD_ID = "thread-named-correct";

	function threadViewFor(threadId: string): ThreadView {
		return {
			thread: makeThread(threadId, "team-approve"),
			members: FAKE_MEMBERS,
			messages: [
				{
					id: REVIEW_ID,
					threadId,
					senderId: "agent-1",
					clientKey: "k-rev-approve",
					blockId: null,
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: "2026-04-19T12:00:00.000Z",
					type: "review",
					payload: { title: "Approve the deploy", reasoning: ["Ship it"], artifacts: [] },
				},
			],
			headMessageId: null,
			hostTitle: null,
		};
	}

	let sends: Array<{
		threadId?: string;
		verdict?: { decision: string; resolvesMessageId: string };
	}>;

	beforeEach(() => {
		sends = [];
		callMock.mockImplementation(async (action: string, input?: unknown) => {
			if (action === "open_thread") {
				const { id } = input as { id: string };
				return { ok: true, data: threadViewFor(id) };
			}
			if (action === "send_message") {
				sends.push(
					input as { threadId?: string; verdict?: { decision: string; resolvesMessageId: string } },
				);
				return {
					ok: true,
					data: { message: { id: "x" }, thread: makeThread(NAMED_THREAD_ID, "team-approve") },
				};
			}
			return { ok: true, data: [] };
		});
	});

	afterEach(() => {
		callMock.mockReset();
		vi.restoreAllMocks();
	});

	it("submitting Approve sends a send_message verdict into the ?threadId= thread", async () => {
		const user = userEvent.setup();
		const router = createMemoryRouter([{ path: "/reviews/:reviewId", element: <ReviewPage /> }], {
			initialEntries: [`/reviews/${REVIEW_ID}?threadId=${NAMED_THREAD_ID}`],
		});
		render(<RouterProvider router={router} />);

		const approveButton = await screen.findByRole("button", { name: /^approve$/i });
		await user.click(approveButton);

		await waitFor(() => expect(sends.some((s) => s.verdict !== undefined)).toBe(true));
		const verdictSend = sends.find((s) => s.verdict !== undefined);
		expect(verdictSend).toBeDefined();
		expect(verdictSend?.threadId).toBe(NAMED_THREAD_ID);
		expect(verdictSend?.verdict?.decision).toBe("approve");
		expect(verdictSend?.verdict?.resolvesMessageId).toBe(REVIEW_ID);
	});
});
