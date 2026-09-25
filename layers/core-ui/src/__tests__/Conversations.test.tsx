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
 *
 * @lore BC3: the thread surface is `call("open_thread"|"search_tasks"|...)`,
 * never a fetch to a deleted `/api/threads*` route. Mocks target `call`
 * directly (see `.claude/rules/testing.md`'s UI test rule).
 */

import type { ThreadView } from "@hyperidle/domain-model";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Conversations } from "../pages/Conversations";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

vi.mock("../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({
		user: { id: "u-founder", name: "Alice Founder", avatarUrl: null },
		status: "ready",
		error: null,
		retry: vi.fn(),
	}),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const THREAD_ID = "t-l9-test";

function makeThread(
	overrides: Partial<Pick<ThreadView["thread"], "title" | "computedTitle">> = {},
): ThreadView["thread"] {
	return {
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
		...overrides,
	};
}

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
		reasoning: ["Reduces churn"],
		producedItemId: "art-1",
	},
};

const FAKE_PLAIN_MESSAGE: ThreadView["messages"][number] = {
	id: "m-plain",
	threadId: THREAD_ID,
	senderId: "u-founder",
	clientKey: "k-plain",
	blockId: null,
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:01:00.000Z",
	type: "plain",
	payload: { text: "Hello from plain message" },
};

function makeOpenThreadResult(
	messages: ThreadView["messages"],
	thread: ThreadView["thread"] = makeThread(),
) {
	return {
		ok: true as const,
		data: {
			thread,
			members: FAKE_MEMBERS,
			messages,
			headMessageId: messages[0]?.id ?? null,
			hostTitle: "Founder / Agent",
		},
	};
}

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
		callMock.mockReset();
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
		// Never resolve open_thread — keep useThread in "loading" state. search_tasks
		// resolves normally so useThreadTasks's call() has something to settle on.
		callMock.mockImplementation(async (action: string) => {
			if (action === "open_thread") return new Promise(() => undefined);
			return { ok: true, data: [] };
		});

		renderWithThreadId(THREAD_ID);
		// The skeleton should appear immediately before open_thread resolves
		expect(screen.getByLabelText(/loading thread/i)).toBeInTheDocument();
	});

	// -----------------------------------------------------------------------
	// State D — populated (review-shape) — AM1: ConversationSurface (Part model)
	// -----------------------------------------------------------------------
	it("State D: mounts ConversationSurface with a review-shape fetched thread", async () => {
		callMock.mockImplementation(async (action: string) => {
			if (action === "open_thread") return makeOpenThreadResult([FAKE_REVIEW_MESSAGE]);
			return { ok: true, data: [] };
		});

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
		callMock.mockImplementation(async (action: string) => {
			if (action === "open_thread") return makeOpenThreadResult([FAKE_PLAIN_MESSAGE]);
			return { ok: true, data: [] };
		});

		renderWithThreadId(THREAD_ID);
		await waitFor(() => {
			expect(screen.getByTestId("conversation-surface")).toBeInTheDocument();
		});
		// Plain message text is rendered in the Part column (no per-shape branch).
		expect(screen.getByText("Hello from plain message")).toBeInTheDocument();
	});

	// -----------------------------------------------------------------------
	// State D — page heading/breadcrumb title derivation (bug: raw host id)
	// -----------------------------------------------------------------------
	it("State D: a team-hosted thread with no stored title shows computedTitle as heading and breadcrumb leaf, never the raw host id", async () => {
		callMock.mockImplementation(async (action: string) => {
			if (action === "open_thread") {
				// hostKind "team" has no identity row and no server hostTitle —
				// title must never fall through to the raw hostId ("team-1").
				return makeOpenThreadResult(
					[FAKE_PLAIN_MESSAGE],
					makeThread({ title: null, computedTitle: "Founder" }),
				);
			}
			return { ok: true, data: [] };
		});

		renderWithThreadId(THREAD_ID);
		await waitFor(() => {
			expect(screen.getByRole("heading", { name: "Founder" })).toBeInTheDocument();
		});
		expect(screen.queryByText("team-1")).toBeNull();
		const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i });
		expect(within(breadcrumb).getByText("Founder")).toBeInTheDocument();
	});

	it("State D: a stored thread title wins over computedTitle as heading and breadcrumb leaf", async () => {
		callMock.mockImplementation(async (action: string) => {
			if (action === "open_thread") {
				return makeOpenThreadResult(
					[FAKE_PLAIN_MESSAGE],
					makeThread({ title: "Launch plan", computedTitle: "Founder" }),
				);
			}
			return { ok: true, data: [] };
		});

		renderWithThreadId(THREAD_ID);
		await waitFor(() => {
			expect(screen.getByRole("heading", { name: "Launch plan" })).toBeInTheDocument();
		});
		const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i });
		expect(within(breadcrumb).getByText("Launch plan")).toBeInTheDocument();
	});

	// -----------------------------------------------------------------------
	// State E — not found (404 equivalent: open_thread refuses with not_found)
	// -----------------------------------------------------------------------
	it("State E: renders 'thread not found' EmptyState when open_thread answers not_found", async () => {
		callMock.mockImplementation(async (action: string) => {
			if (action === "open_thread") {
				return {
					ok: false,
					problems: [{ code: "not_found", message: "Thread not found" }],
				};
			}
			return { ok: true, data: [] };
		});

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
	// State C — error (non-not_found open_thread refusal)
	// -----------------------------------------------------------------------
	it("State C: renders ErrorState with retry when open_thread refuses with a non-not_found problem", async () => {
		callMock.mockImplementation(async (action: string) => {
			if (action === "open_thread") {
				return {
					ok: false,
					problems: [{ code: "forbidden", message: "server error" }],
				};
			}
			return { ok: true, data: [] };
		});

		renderWithThreadId(THREAD_ID);
		await waitFor(() => {
			expect(screen.getByTestId("thread-error")).toBeInTheDocument();
		});
		expect(screen.queryByTestId("thread-shell")).toBeNull();
		expect(screen.queryByTestId("thread-not-found")).toBeNull();
	});
});
