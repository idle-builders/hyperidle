/**
 * L1a — ConversationsReview reasoning-block tests (rewritten per plan T13).
 *
 * The Reasoning block now lives inside `ThreadHead` (rendered when the
 * predicate identifies an unresolved review/questionnaire HEAD). The
 * legacy collapsible / single-key prefill flow is gone; verdict-grammar
 * shortcuts are deferred to a follow-up.
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
		reasoning: ["Step one", "Step two", "Step three"],
		artifactRef: { id: "art-1", kind: "text_diff" },
	},
};

describe("ConversationsReview — Reasoning (L1a, lives inside ThreadHead)", () => {
	beforeEach(() => {
		// L1 step5: ConversationsReview now requires ?id= in the URL — set it
		// before render.
		window.history.replaceState({}, "", "/?id=demo-thread-1");
		// biome-ignore lint/suspicious/noExplicitAny: testing-only fetch stub
		(globalThis as any).fetch = vi.fn(
			async () =>
				new Response(
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
				),
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		window.history.replaceState({}, "", "/");
	});

	it("renders the Reasoning label and the numbered steps in ThreadHead", async () => {
		render(
			<MemoryRouter>
				<ConversationsReview />
			</MemoryRouter>,
		);
		await waitFor(() => {
			expect(screen.getByTestId("thread-head")).toBeInTheDocument();
		});
		expect(screen.getByText(/reasoning/i)).toBeInTheDocument();
		expect(screen.getByText("Step one")).toBeInTheDocument();
		expect(screen.getByText("Step two")).toBeInTheDocument();
		expect(screen.getByText("Step three")).toBeInTheDocument();
	});
});
