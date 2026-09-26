import type { Message, PlainPayload, ReviewPayload, ThreadView } from "@hyperidle/domain-model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// ReviewPage fetches the thread the route NAMES directly (`useThread`), instead
// of guessing it from a by-host lookup. `useThreadMock` is a controllable spy
// (not a fixed factory) so the "task naming" tests below can hand
// it a different `ThreadView` per test — this is the ONE fetch of thread data
// the page makes; `defaultLoader` must never call `open_thread` itself.
const { useThreadMock } = vi.hoisted(() => ({ useThreadMock: vi.fn() }));

vi.mock("../../../hooks/useThread.js", () => ({
	useThread: useThreadMock,
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

beforeEach(() => {
	useThreadMock.mockReturnValue({
		status: "ready",
		data: makeThreadView(),
		error: null,
		refresh: retrySpy,
	});
});

afterEach(() => {
	postMessageSpy.mockClear();
	retrySpy.mockClear();
	useThreadMock.mockReset();
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
		expect(loader).toHaveBeenCalledWith(
			expect.objectContaining({ reviewId: "rev-1", threadId: "thread-review-1" }),
		);
	});

	it("maps host-thread messages into the review conversation with anchors", async () => {
		const loader = vi.fn().mockResolvedValue(REVIEW_COMPOSITION_SUBJECT);
		renderRoute(loader);

		await waitFor(() => {
			expect(screen.getByText((anchoredMessage.payload as PlainPayload).text)).toBeInTheDocument();
		});
		expect(screen.getByRole("button", { name: /Go to anchor/i })).toBeInTheDocument();
	});

	it("exposes the verdict decision controls — the destination for 'Open review'", async () => {
		// The conversation no longer takes a verdict inline; "Open
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

	it("submitting Approve sends a verdict message resolving the review message, then issues exactly one refetch", async () => {
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

		// Exactly ONE refetch — `threadDetail.refresh()` — and no second fetch
		// through the loader or a direct `open_thread` call — the
		// subject is derived from `useThread`'s own data, not refetched twice.
		await waitFor(() => {
			expect(retrySpy).toHaveBeenCalledTimes(1);
		});
		expect(loader).toHaveBeenCalledTimes(1);
		expect(postMessageSpy).not.toHaveBeenCalledWith("open_thread", expect.anything());
	});

	it("a refused verdict shows the reason inline next to the verdict control, keeps the review visible, and leaves the page title unchanged", async () => {
		const loader = vi.fn().mockResolvedValue(REVIEW_COMPOSITION_SUBJECT);
		postMessageSpy.mockResolvedValueOnce({
			ok: false,
			problems: [{ code: "conflict", message: "Someone else's verdict already won." }],
		});
		renderRoute(loader);

		const approve = await screen.findByRole("button", { name: /^approve$/i });
		fireEvent.click(approve);

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Someone else's verdict already won.");
		});
		// The review composition stays mounted and its real title never gets
		// replaced by the page-level "Could not load review" state.
		expect(
			screen.getByRole("heading", { name: REVIEW_COMPOSITION_SUBJECT.title }),
		).toBeInTheDocument();
		expect(screen.queryByText(/could not load review/i)).not.toBeInTheDocument();
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

	it("renders an error state instead of a permanent spinner when the route has no threadId", () => {
		// Simulates the landed `useThread` contract's terminal "idle" status for
		// a falsy id — but the page must not even wait on that: a missing
		// threadId is a bad link, not a loading state.
		useThreadMock.mockReturnValue({ status: "idle", data: null, error: null, refresh: retrySpy });
		const router = createMemoryRouter([{ path: "/reviews/:reviewId", element: <ReviewPage /> }], {
			initialEntries: ["/reviews/rev-1"],
		});
		render(<RouterProvider router={router} />);

		expect(screen.getByText(/missing its conversation/i)).toBeInTheDocument();
		expect(screen.queryByText(/loading review/i)).not.toBeInTheDocument();
	});
});

// The real (default) loader — task naming from the review payload's
// `taskId` (server-stamped, commit ee37000af). These exercise
// `defaultLoader` itself, unlike the suite above which always injects a
// stub `loader` and never reaches it. `useThreadMock` supplies the
// `ThreadView` directly here — `defaultLoader` must never
// call `open_thread` itself to get it.
describe("ReviewPage default loader — task naming", () => {
	function reviewMessageWithTaskId(taskId?: string): Message {
		return {
			id: "rev-task-1",
			threadId: "thread-task-review",
			senderId: "agent-atlas",
			clientKey: "ck-review-task",
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
				...(taskId ? { taskId } : {}),
			} as unknown as ReviewPayload,
		};
	}

	function threadViewFor(message: Message): ThreadView {
		return {
			thread: {
				id: message.threadId,
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
			messages: [message],
			headMessageId: null,
			hostTitle: null,
		};
	}

	function taskViewFor(id: string, title: string) {
		return {
			task: {
				id,
				parentTaskId: null,
				teamId: "team-1",
				ownerAgentId: null,
				title,
				description: null,
				doneCondition: null,
				state: "proposed",
				dependencies: null,
				threadId: "thread-task-review",
				notes: null,
				createdAt: "2026-09-01T00:00:00.000Z",
				updatedAt: "2026-09-01T00:00:00.000Z",
				outcomeVerdict: null,
				outcomeSummary: null,
				outcomeRecordedAt: null,
				outcomeRecordedBy: null,
				tokensActualJson: null,
				sourceDocumentId: null,
				completedAt: null,
				position: 0,
				needsReview: false,
			},
			ancestors: [],
			children: [],
			tokensActualRollup: null,
			threadId: "thread-task-review",
			attachments: [],
		};
	}

	function renderDefaultRoute() {
		const router = createMemoryRouter([{ path: "/reviews/:reviewId", element: <ReviewPage /> }], {
			initialEntries: ["/reviews/rev-task-1?threadId=thread-task-review"],
		});
		return render(<RouterProvider router={router} />);
	}

	afterEach(() => {
		// The other tests in this file rely on `postMessageSpy`'s original fixed
		// resolved value — restore it so a per-test `mockImplementation` here
		// never leaks forward.
		postMessageSpy.mockReset();
		postMessageSpy.mockResolvedValue({ ok: true, data: { message: {}, thread: {} } });
	});

	it("with a taskId on the review payload: names the task and links to it, with no open_thread call from the loader", async () => {
		const message = reviewMessageWithTaskId("task-1");
		useThreadMock.mockReturnValue({
			status: "ready",
			data: threadViewFor(message),
			error: null,
			refresh: retrySpy,
		});
		postMessageSpy.mockImplementation((action: unknown, input: unknown) => {
			if (action === "open_task") {
				expect(input).toEqual({ id: "task-1" });
				return Promise.resolve({ ok: true, data: taskViewFor("task-1", "Fix the webhook") });
			}
			throw new Error(`unexpected call: ${String(action)}`);
		});

		renderDefaultRoute();

		const link = await screen.findByRole("link", { name: "Fix the webhook" });
		expect(link).toHaveAttribute("href", "/work/task/task-1");
		// The thread itself is fetched exactly once, by `useThread` — the loader
		// must never issue a second `open_thread` call.
		expect(postMessageSpy).not.toHaveBeenCalledWith("open_thread", expect.anything());
	});

	it("without a taskId on the review payload: task fields stay empty, and the loader makes no network call at all — the mount's one open_thread is useThread's, not the loader's", async () => {
		const message = reviewMessageWithTaskId();
		useThreadMock.mockReturnValue({
			status: "ready",
			data: threadViewFor(message),
			error: null,
			refresh: retrySpy,
		});
		postMessageSpy.mockImplementation((action: unknown) => {
			throw new Error(`unexpected call: ${String(action)}`);
		});

		renderDefaultRoute();

		await screen.findByRole("heading", { name: "Ready for review" });
		expect(screen.queryByRole("link", { name: /Fix the webhook/ })).not.toBeInTheDocument();
		expect(postMessageSpy).not.toHaveBeenCalled();
	});
});
