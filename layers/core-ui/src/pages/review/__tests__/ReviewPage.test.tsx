import type { Message, PlainPayload, ReviewPayload, ThreadView } from "@hyperidle/domain-model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REVIEW_COMPOSITION_SUBJECT } from "../__fixtures__/review-composition.fixture.js";
import { ReviewPage } from "../ReviewPage.js";

const anchoredMessage: Message = {
	id: "host-msg-1",
	threadId: "thread-review-1",
	senderId: "u-founder",
	clientKey: "ck-1",
	blockId: "block:review-code:promo-webhook.ts:118",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: new Date().toISOString(),
	type: "plain",
	payload: {
		text: "Can we namespace this error code?",
		blockId: "block:review-code:promo-webhook.ts:118",
		spotLabel: "PromoField.tsx:118",
		refs: [{ kind: "artifact", id: "artifact:code:1" }],
	} as PlainPayload,
};

// The verdict must resolve the type:"review" message the route points at. The
// review page derives resolvesMessageId from the route `reviewId` (which IS the
// review message id), NOT from "last review in the thread".
const reviewMessage: Message = {
	id: "rev-1",
	threadId: "thread-review-1",
	senderId: "agent-atlas",
	clientKey: "ck-review",
	blockId: null,
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: new Date().toISOString(),
	type: "review",
	payload: {
		title: "Ready for review",
		reasoning: ["Ready for review"],
		artifacts: [],
	} as unknown as ReviewPayload,
};

// A second, non-target review message that appears AFTER the route's review in
// the thread. Reviews re-open by design, so multiple coexist. A "last review"
// resolver would wrongly pick this one — the assertion proves it does not.
const laterReviewMessage: Message = {
	id: "review-msg-99",
	threadId: "thread-review-1",
	senderId: "agent-atlas",
	clientKey: "ck-review-2",
	blockId: null,
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: new Date().toISOString(),
	type: "review",
	payload: {
		title: "Re-opened review",
		reasoning: ["Re-opened review"],
		artifacts: [],
	} as unknown as ReviewPayload,
};

function makeThreadView(): ThreadView {
	return {
		thread: {
			id: "thread-review-1",
			hostKind: "team",
			hostId: "team-1",
			initiatorId: "u-founder",
			members: ["u-founder", "agent-atlas"],
			title: null,
			computedTitle: "Review thread",
			pinned: false,
			resolvedAt: null,
			deletedAt: null,
			lastActiveAt: new Date().toISOString(),
			createdAt: new Date().toISOString(),
		},
		members: [
			{ id: "u-founder", name: "You", role: "founder", isAgent: false },
			{ id: "agent-atlas", name: "Atlas", role: "agent", isAgent: true },
		],
		messages: [reviewMessage, anchoredMessage, laterReviewMessage],
		headMessageId: null,
		hostTitle: null,
	};
}

const retrySpy = vi.fn();

// ReviewPage fetches the thread the route NAMES directly (`useThread`),
// instead of guessing it from a by-host lookup.
vi.mock("../../../hooks/useThread.js", () => ({
	useThread: () => ({
		status: "ready",
		data: makeThreadView(),
		error: null,
		refresh: retrySpy,
	}),
}));

vi.mock("../../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({ user: { id: "u-founder" }, isLoading: false, error: null }),
}));

const postMessageSpy = vi.fn().mockResolvedValue({ ok: true, data: { message: {}, thread: {} } });
vi.mock("../../../services/call.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../services/call.js")>();
	return {
		...actual,
		call: (...args: unknown[]) => postMessageSpy(...args),
	};
});

afterEach(() => {
	postMessageSpy.mockClear();
	retrySpy.mockClear();
});
describe("ReviewPage route", () => {
	function renderRoute(loader?: () => Promise<typeof REVIEW_COMPOSITION_SUBJECT>) {
		const router = createMemoryRouter(
			[
				{
					path: "/reviews/:reviewId",
					element: <ReviewPage loader={loader} />,
				},
			],
			{ initialEntries: ["/reviews/rev-1?threadId=thread-review-1"] },
		);
		return render(<RouterProvider router={router} />);
	}

	it("loads the review subject and renders the composition", async () => {
		const loader = vi.fn().mockResolvedValue(REVIEW_COMPOSITION_SUBJECT);
		renderRoute(loader);

		await waitFor(() => {
			expect(screen.getByText(`“${REVIEW_COMPOSITION_SUBJECT.prompt}”`)).toBeInTheDocument();
		});
		expect(loader).toHaveBeenCalledWith({ reviewId: "rev-1", threadId: "thread-review-1" });
	});

	it("maps host-thread messages into the review conversation with anchors", async () => {
		const loader = vi.fn().mockResolvedValue(REVIEW_COMPOSITION_SUBJECT);
		renderRoute(loader);

		await waitFor(() => {
			expect(screen.getByText((anchoredMessage.payload as PlainPayload).text)).toBeInTheDocument();
		});
		expect(screen.getByRole("button", { name: /Go to anchor/i })).toBeInTheDocument();
	});

	it("exposes the verdict decision controls (the AM1 destination for 'Open review')", async () => {
		// AM1 §12.4: the conversation no longer takes a verdict inline; "Open
		// review" routes here. This confirms the relocated verdict DECISION UI
		// (Approve / Request changes + the overflow reject/edit menu) is present
		// and reachable on the review page.
		const loader = vi.fn().mockResolvedValue(REVIEW_COMPOSITION_SUBJECT);
		renderRoute(loader);

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /^approve$/i })).toBeInTheDocument();
		});
		expect(screen.getByRole("button", { name: /request changes/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /more verdict options/i })).toBeInTheDocument();
	});

	it("submitting Approve sends a verdict message resolving the review message, then refreshes", async () => {
		const loader = vi.fn().mockResolvedValue(REVIEW_COMPOSITION_SUBJECT);
		renderRoute(loader);

		const approve = await screen.findByRole("button", { name: /^approve$/i });
		fireEvent.click(approve);

		await waitFor(() => {
			expect(postMessageSpy).toHaveBeenCalledTimes(1);
		});
		const [action, input] = postMessageSpy.mock.calls[0] as [
			string,
			{ threadId: string; verdict: { decision: string; resolvesMessageId: string } },
		];
		expect(action).toBe("send_message");
		expect(input.threadId).toBe("thread-review-1");
		expect(input.verdict.decision).toBe("approve");
		// resolvesMessageId is the ROUTE's review message id ("rev-1"), not the
		// last review message in the thread ("review-msg-99"). Proves the verdict
		// resolves the review the user opened, not whichever happens to be last.
		expect(input.verdict.resolvesMessageId).toBe("rev-1");

		// On success the page refreshes the thread + reloads the subject.
		await waitFor(() => {
			expect(retrySpy).toHaveBeenCalled();
		});
		expect(loader).toHaveBeenCalledTimes(2);
	});

	it("shows a loading state while the subject is being fetched", () => {
		const loader = vi.fn().mockImplementation(() => new Promise(() => {}));
		renderRoute(loader);

		expect(screen.getByText(/loading review/i)).toBeInTheDocument();
	});

	it("shows an error state when the fetch fails", async () => {
		const loader = vi.fn().mockRejectedValue(new Error("boom"));
		renderRoute(loader);

		await waitFor(() => {
			expect(screen.getByText(/could not load review/i)).toBeInTheDocument();
		});
	});
});
