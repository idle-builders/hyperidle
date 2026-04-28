/**
 * L1a — ConversationsReview page tests (rewritten per plan T13).
 *
 * The page now mounts <ThreadShell> with data fetched from `GET /api/threads/:id`.
 * The legacy `MockReviewItem` + `PREFILL_KEYS` flow is gone.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationsReview } from "../pages/ConversationsReview";

const FAKE_THREAD = {
	id: "demo-thread-1",
	hostKind: "task",
	hostId: "task-1",
	initiatorId: "agent-1",
	participants: ["u-founder", "agent-1"],
	pinned: false,
	resolvedAt: null,
	lastActiveAt: "2026-04-19T12:00:00.000Z",
	createdAt: "2026-04-19T12:00:00.000Z",
};

const FAKE_REVIEW_MESSAGE = {
	id: "m-rev",
	threadId: "demo-thread-1",
	senderId: "agent-1",
	clientKey: "k-rev",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "review",
	payload: {
		title: "Pricing overhaul",
		reasoning: ["Reduces churn"],
		artifactRef: { id: "art-1", kind: "text_diff" },
	},
};

describe("ConversationsReview (L1a)", () => {
	beforeEach(() => {
		// biome-ignore lint/suspicious/noExplicitAny: testing only — global stub
		(globalThis as any).fetch = vi.fn(async (input: string) => {
			if (input.endsWith("/demo-thread-1")) {
				return new Response(
					JSON.stringify({
						thread: FAKE_THREAD,
						messages: [FAKE_REVIEW_MESSAGE],
						headMessageId: FAKE_REVIEW_MESSAGE.id,
						identities: {
							"u-founder": { name: "Founder", role: "founder" },
							"agent-1": { name: "Agent", role: "builder" },
						},
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			return new Response("not found", { status: 404 });
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders the page testid", () => {
		render(
			<MemoryRouter>
				<ConversationsReview />
			</MemoryRouter>,
		);
		expect(screen.getByTestId("conversations-review-page")).toBeInTheDocument();
	});

	it("mounts ThreadShell with the fetched thread + messages", async () => {
		render(
			<MemoryRouter>
				<ConversationsReview />
			</MemoryRouter>,
		);
		await waitFor(() => {
			expect(screen.getByTestId("thread-shell")).toBeInTheDocument();
		});
		expect(screen.getByText("Pricing overhaul")).toBeInTheDocument();
	});
});
