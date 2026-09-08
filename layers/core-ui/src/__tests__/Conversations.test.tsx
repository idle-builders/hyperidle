/**
 * L9 — Conversations page tests (single detail surface).
 *
 * The page is now the canonical route for /conversations and
 * /conversations/:threadId. Tests cover all five states (A–E) and
 * prove no per-shape branching at the page layer (the Part renderer dispatches).
 *
 * State A — no :threadId param → EmptyState "Open a thread to see it here"
 * State B — loading → SkeletonList
 * State C — error (non-404) → ErrorState
 * State D — populated (200) → ConversationSurface (AM1 Part model)
 * State E — not found (404) → EmptyState "Thread not found" + back link
 *
 * @lore L9: tests use MemoryRouter with route-params so that
 * useParams<{ threadId? }>() returns the correct value. Rendering without
 * a :threadId child path yields State A.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Conversations } from "../pages/Conversations";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const THREAD_ID = "t-l9-test";

const FAKE_THREAD = {
	id: THREAD_ID,
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
	threadId: THREAD_ID,
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
		producedItemId: "art-1",
	},
};

const FAKE_PLAIN_MESSAGE = {
	id: "m-plain",
	threadId: THREAD_ID,
	senderId: "u-founder",
	clientKey: "k-plain",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:01:00.000Z",
	type: "plain",
	payload: { text: "Hello from plain message" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render Conversations under /conversations/:threadId with the given id. */
function renderWithThreadId(threadId: string): void {
	render(
		<MemoryRouter initialEntries={[`/conversations/${threadId}`]}>
			<Routes>
				<Route path="/conversations" element={<Conversations />} />
				<Route path="/conversations/:threadId" element={<Conversations />} />
			</Routes>
		</MemoryRouter>,
	);
}

/** Render Conversations under /conversations (no id). */
function renderNoThreadId(): void {
	render(
		<MemoryRouter initialEntries={["/conversations"]}>
			<Routes>
				<Route path="/conversations" element={<Conversations />} />
				<Route path="/conversations/:threadId" element={<Conversations />} />
			</Routes>
		</MemoryRouter>,
	);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Conversations page (L9)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// -----------------------------------------------------------------------
	// State A — no :threadId
	// -----------------------------------------------------------------------
	it("State A: renders thread list (filter bar + ThreadSections) when no :threadId param", () => {
		// @lore U6: State A is now the thread list (filter bar + ThreadSections), NOT a static
		// "open a thread" empty state. The Conversations page renders the thread queue when no
		// threadId is present. Since no fetch mock is provided, ThreadSections shows a loading state.
		renderNoThreadId();
		expect(screen.getByTestId("conversations-page")).toBeInTheDocument();
		expect(screen.getByTestId("conversations-filter-bar")).toBeInTheDocument();
		// ThreadSections renders loading skeleton when no threads are fetched
		expect(screen.getByTestId("thread-sections-loading")).toBeInTheDocument();
	});

	// -----------------------------------------------------------------------
	// State B — loading
	// -----------------------------------------------------------------------
	it("State B: renders SkeletonList while the thread fetch is pending", async () => {
		// Never resolve — keep it in loading state
		globalThis.fetch = vi.fn(
			() => new Promise<Response>(() => undefined),
		) as unknown as typeof globalThis.fetch;

		renderWithThreadId(THREAD_ID);
		// The skeleton should appear immediately before fetch resolves
		expect(screen.getByLabelText(/loading thread/i)).toBeInTheDocument();
	});

	// -----------------------------------------------------------------------
	// State D — populated (review-shape) — AM1: ConversationSurface (Part model)
	// -----------------------------------------------------------------------
	it("State D: mounts ConversationSurface with a review-shape fetched thread", async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						thread: FAKE_THREAD,
						messages: [FAKE_REVIEW_MESSAGE],
						headMessageId: FAKE_REVIEW_MESSAGE.id,
						identities: {
							"u-founder": { name: "Founder", role: "founder" },
							"agent-1": { name: "Agent", role: "agent" },
						},
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
		) as unknown as typeof globalThis.fetch;

		renderWithThreadId(THREAD_ID);
		await waitFor(() => {
			expect(screen.getByTestId("conversation-surface")).toBeInTheDocument();
		});
		// The review renders as a compact review Part (no ThreadShell, no card).
		expect(screen.queryByTestId("thread-shell")).toBeNull();
		expect(screen.getByText("Pricing overhaul")).toBeInTheDocument();
	});

	// -----------------------------------------------------------------------
	// State D — populated (plain-shape) — proves no per-shape branching
	// -----------------------------------------------------------------------
	it("State D: mounts ConversationSurface with a plain-shape fetched thread (no per-shape branching)", async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						thread: FAKE_THREAD,
						messages: [FAKE_PLAIN_MESSAGE],
						headMessageId: null,
						identities: {
							"u-founder": { name: "Founder", role: "founder" },
						},
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
		) as unknown as typeof globalThis.fetch;

		renderWithThreadId(THREAD_ID);
		await waitFor(() => {
			expect(screen.getByTestId("conversation-surface")).toBeInTheDocument();
		});
		// Plain message text is rendered in the Part column (no per-shape branch).
		expect(screen.getByText("Hello from plain message")).toBeInTheDocument();
	});

	// -----------------------------------------------------------------------
	// State E — not found (404)
	// -----------------------------------------------------------------------
	it("State E: renders 'thread not found' EmptyState with a back-to-queue link on a 404", async () => {
		globalThis.fetch = vi.fn(
			async () => new Response("not found", { status: 404 }),
		) as unknown as typeof globalThis.fetch;

		renderWithThreadId("does-not-exist");
		await waitFor(() => {
			expect(screen.getByTestId("thread-not-found")).toBeInTheDocument();
		});
		// Must NOT mount ThreadShell — no message list, no composer
		expect(screen.queryByTestId("thread-shell")).toBeNull();
		// Back-to-queue link present
		const link = screen.getByRole("link", { name: /back to inbox/i });
		expect(link).toHaveAttribute("href", "/conversations");
		// Copy as specified in design §1.2 / §1.7
		expect(screen.getByText(/thread not found/i)).toBeInTheDocument();
	});

	// -----------------------------------------------------------------------
	// State C — error (non-404 fetch failure)
	// -----------------------------------------------------------------------
	it("State C: renders ErrorState with retry on a non-404 fetch failure", async () => {
		globalThis.fetch = vi.fn(
			async () => new Response("server error", { status: 500 }),
		) as unknown as typeof globalThis.fetch;

		renderWithThreadId(THREAD_ID);
		await waitFor(() => {
			expect(screen.getByTestId("thread-error")).toBeInTheDocument();
		});
		expect(screen.queryByTestId("thread-shell")).toBeNull();
		expect(screen.queryByTestId("thread-not-found")).toBeNull();
	});
});
