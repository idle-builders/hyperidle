import type { Message, PlainPayload } from "@hyperidle/shared";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ReviewPage } from "../ReviewPage.js";
import { REVIEW_COMPOSITION_SUBJECT } from "../review-composition.fixture.js";

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

vi.mock("../../../hooks/useHostThread.js", () => ({
	useHostThread: () => ({
		data: {
			thread: { id: "thread-review-1" },
			messages: [anchoredMessage],
			identities: { "u-founder": { name: "You", role: "founder" } },
		},
		error: null,
		isLoading: false,
		refresh: vi.fn(),
	}),
}));

vi.mock("../../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({ user: { id: "u-founder" }, isLoading: false, error: null }),
}));
describe("ReviewPage route", () => {
	function renderRoute(loader?: () => Promise<typeof REVIEW_COMPOSITION_SUBJECT>) {
		const router = createMemoryRouter(
			[
				{
					path: "/work/bet/:betId/review/:reviewId",
					element: <ReviewPage loader={loader} />,
				},
			],
			{ initialEntries: ["/work/bet/bet-123/review/rev-1"] },
		);
		return render(<RouterProvider router={router} />);
	}

	it("loads the review subject and renders the composition", async () => {
		const loader = vi.fn().mockResolvedValue(REVIEW_COMPOSITION_SUBJECT);
		renderRoute(loader);

		await waitFor(() => {
			expect(screen.getByText(`“${REVIEW_COMPOSITION_SUBJECT.prompt}”`)).toBeInTheDocument();
		});
		expect(loader).toHaveBeenCalledWith({ reviewId: "rev-1", betId: "bet-123" });
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
