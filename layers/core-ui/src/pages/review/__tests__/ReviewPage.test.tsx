import type { Message, PlainPayload, ReviewPayload } from "@hyperidle/domain-model";
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
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: new Date().toISOString(),
	type: "review",
	payload: {
		text: "Ready for review",
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
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: new Date().toISOString(),
	type: "review",
	payload: {
		text: "Re-opened review",
		artifacts: [],
	} as unknown as ReviewPayload,
};

const retrySpy = vi.fn();

// ReviewPage fetches the thread the loader NAMES directly (`useThreadDetail`),
// instead of guessing it from a by-host lookup (`useHostThread`).
vi.mock("../../../hooks/useThreadDetail.js", () => ({
	useThreadDetail: () => ({
		status: "ready",
		data: {
			thread: { id: "thread-review-1" },
			messages: [reviewMessage, anchoredMessage, laterReviewMessage],
			headMessageId: null,
			identities: {
				"u-founder": { name: "You", role: "founder" },
				"agent-atlas": { name: "Atlas", role: "agent" },
			},
		},
		error: null,
		retry: retrySpy,
	}),
}));

vi.mock("../../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({ user: { id: "u-founder" }, isLoading: false, error: null }),
}));

const postVerdictSpy = vi.fn().mockResolvedValue("ok");
vi.mock("../../../services/host-threads.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../services/host-threads.js")>();
	return {
		...actual,
		postVerdictHostMessage: (...args: unknown[]) => postVerdictSpy(...args),
	};
});

afterEach(() => {
	postVerdictSpy.mockClear();
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
			{ initialEntries: ["/reviews/rev-1"] },
		);
		return render(<RouterProvider router={router} />);
	}

	it("loads the review subject and renders the composition", async () => {
		const loader = vi.fn().mockResolvedValue(REVIEW_COMPOSITION_SUBJECT);
		renderRoute(loader);

		await waitFor(() => {
			expect(screen.getByText(`“${REVIEW_COMPOSITION_SUBJECT.prompt}”`)).toBeInTheDocument();
		});
		expect(loader).toHaveBeenCalledWith({ reviewId: "rev-1" });
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

	it("submitting Approve POSTs a verdict resolving the review message, then refreshes", async () => {
		const loader = vi.fn().mockResolvedValue(REVIEW_COMPOSITION_SUBJECT);
		renderRoute(loader);

		const approve = await screen.findByRole("button", { name: /^approve$/i });
		fireEvent.click(approve);

		await waitFor(() => {
			expect(postVerdictSpy).toHaveBeenCalledTimes(1);
		});
		const [threadId, decision, resolvesMessageId] = postVerdictSpy.mock.calls[0] as [
			string,
			string,
			string,
			string,
		];
		expect(threadId).toBe("thread-review-1");
		expect(decision).toBe("approve");
		// resolvesMessageId is the ROUTE's review message id ("rev-1"), not the
		// last review message in the thread ("review-msg-99"). Proves the verdict
		// resolves the review the user opened, not whichever happens to be last.
		expect(resolvesMessageId).toBe("rev-1");

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

// ── CRITICAL-2: end-to-end canvas rendering test ─────────────────────────────
//
// This test exercises the real loader → ComposedReviewSubject → ReviewComposition
// → ReviewActionOperation → Outcome band chain. It proves that the loader shape
// (artifact.proposedCall.{proposedCallId, toolId, args, status, outcome}) actually
// reaches the rendered canvas — NOT just the raw JSON boundary.
//
// The "result visible against the review" AC requires this chain, not just the
// route-level assertion in AL7-reviews-loader-redo.integration.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

describe("CRITICAL-2 — loader → composition → canvas: Outcome band renders", () => {
	function renderReview(subject: typeof REVIEW_COMPOSITION_SUBJECT) {
		const loader = vi.fn().mockResolvedValue(subject);
		const router = createMemoryRouter(
			[
				{
					path: "/reviews/:reviewId",
					element: <ReviewPage loader={loader} />,
				},
			],
			{ initialEntries: ["/reviews/rev-1"] },
		);
		render(<RouterProvider router={router} />);
		return loader;
	}

	it("renders 'Executed' outcome band when loader returns artifact with proposedCall.outcome.status=ok", async () => {
		// Build a subject where the action_operation artifact has a proposedCall with ok outcome.
		// This is the shape the trust-first loader emits (artifact.proposedCall, not top-level).
		const subjectWithOutcome: typeof REVIEW_COMPOSITION_SUBJECT = {
			...REVIEW_COMPOSITION_SUBJECT,
			artifacts: REVIEW_COMPOSITION_SUBJECT.artifacts.map((a) => {
				if (a.kind !== "action_operation") return a;
				return {
					...a,
					proposedCall: {
						proposedCallId: "pc-e2e-test",
						toolId: "commit_file",
						args: { path: "/workspace/out.txt", content: "done" },
						status: "executed" as const,
						outcome: {
							status: "ok" as const,
							receipt: "abc1234e2etestreceipt",
							executedAt: "2 min ago",
						},
					},
				};
			}),
		};

		renderReview(subjectWithOutcome);

		// Wait for the subject to load, then open the action_operation artifact.
		// The artifact row contains "Open →" button; click the row itself.
		// The action artifact has title "Refund payment · ch_3Qspee…"
		const artifactRow = await screen.findByText(/Refund payment/);
		fireEvent.click(artifactRow);

		// The Outcome band must render with "Executed" text — proving the chain works
		await waitFor(() => {
			expect(screen.getByText("Executed")).toBeInTheDocument();
		});
		// Receipt must appear
		expect(screen.getByText("abc1234e2etestreceipt")).toBeInTheDocument();
	});

	it("renders 'Execution failed' outcome band when loader returns artifact with proposedCall.outcome.status=failed", async () => {
		const verbatimError =
			"GitHub merge-pr failed HTTP 409 Pull Request is not mergeable e2efailtest";
		const subjectWithFailure: typeof REVIEW_COMPOSITION_SUBJECT = {
			...REVIEW_COMPOSITION_SUBJECT,
			artifacts: REVIEW_COMPOSITION_SUBJECT.artifacts.map((a) => {
				if (a.kind !== "action_operation") return a;
				return {
					...a,
					proposedCall: {
						proposedCallId: "pc-e2e-fail",
						toolId: "commit_file",
						args: { path: "/workspace/out.txt" },
						status: "failed" as const,
						outcome: {
							status: "failed" as const,
							error: verbatimError,
							executedAt: "3 min ago",
						},
					},
				};
			}),
		};

		renderReview(subjectWithFailure);

		const artifactRow = await screen.findByText(/Refund payment/);
		fireEvent.click(artifactRow);

		await waitFor(() => {
			expect(screen.getByText("Execution failed")).toBeInTheDocument();
		});
		// Error text must appear verbatim
		expect(screen.getByText(verbatimError)).toBeInTheDocument();
	});
});
