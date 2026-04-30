/**
 * L1a / L11 — ConversationsReview reasoning-block tests.
 *
 * Per L11 plan §8 migration table: the Reasoning block now lives inside
 * the in-stream `RichMessageCard` (the promoted unresolved review). Long
 * reasoning collapses behind a `> N reasons` toggle by default (Fix 2),
 * inline for a single short string. This test asserts the long-form
 * variant — the toggle is rendered with aria-expanded=false.
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

describe("ConversationsReview — Reasoning (L11, lives inside RichMessageCard)", () => {
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

	it("renders the reasoning toggle inside the promoted RichMessageCard (long-form: collapsed by default)", async () => {
		render(
			<MemoryRouter>
				<ConversationsReview />
			</MemoryRouter>,
		);
		await waitFor(() => {
			expect(screen.getByTestId("rich-message-card")).toBeInTheDocument();
		});
		const card = screen.getByTestId("rich-message-card");
		// Long reasoning (3 entries) renders behind a toggle, collapsed by default.
		const toggle = screen.getByRole("button", { name: /reasons/i });
		expect(card.contains(toggle)).toBe(true);
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		// Reasoning entries are not visible while collapsed.
		expect(screen.queryByText("Step one")).toBeNull();
	});
});
