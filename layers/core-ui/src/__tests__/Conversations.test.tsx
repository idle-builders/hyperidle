/**
 * Conversations: the single detail surface for /conversations and
 * /conversations/:threadId, with no per-shape branching at the page layer
 * (the Part renderer dispatches).
 *
 * State A — no :threadId param → the thread queue (filter bar + ThreadSections)
 * State B — loading → SkeletonList
 * State C — error (non-404) → ErrorState
 * State D — populated (200) → ConversationSurface (Part model)
 * State E — not found (404) → EmptyState "Thread not found" + back link
 *
 * `call` is mocked directly — the thread surface is
 * `call("open_thread"|"send_message"|"search_tasks"|...)`, never a fetch to
 * a deleted `/api/threads*` route.
 */

import type { ThreadView } from "@hyperidle/domain-model";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	createMemoryRouter,
	MemoryRouter,
	Route,
	RouterProvider,
	Routes,
	useLocation,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Conversations, resolveSessionAgentAuthor } from "../pages/Conversations.js";
import { ReviewPage } from "../pages/review/ReviewPage";

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
		// The Conversations page renders the thread queue when no threadId is
		// present. Since no fetch mock is provided, ThreadSections shows a
		// loading state.
		renderNoThreadId();
		expect(screen.getByTestId("conversations-page")).toBeInTheDocument();
		expect(screen.getByTestId("conversations-filter-bar")).toBeInTheDocument();
		expect(screen.getByTestId("thread-sections-loading")).toBeInTheDocument();
	});

	it("renders a 'New thread' button inside the page header", () => {
		renderNoThreadId();
		const btn = screen.getByTestId("new-thread-btn");
		expect(btn).toHaveAccessibleName(/new thread/i);
		// Lives in PageHeader.actions so it aligns with the page title.
		expect(document.querySelector("[data-conversations-header]")).toContainElement(btn);
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

// ---------------------------------------------------------------------------
// Mobile: the PageHeader collapses entirely when it has no visible content
// ---------------------------------------------------------------------------

describe("Conversations — mobile header collapses when empty", () => {
	it("does not render the PageHeader on mobile when there is no active session", async () => {
		vi.resetModules();
		vi.doMock("../hooks/useViewportBreakpoint.js", () => ({
			useViewportBreakpoint: () => ({ sidebarMobile: true }),
		}));
		const { Conversations: MobileConversations } = await import("../pages/Conversations.js");

		const threadId = "t-mobile-empty";
		callMock.mockImplementation(async (action: string) => {
			if (action === "open_thread") {
				return makeOpenThreadResult(
					[],
					makeThread({ title: null, computedTitle: "Founder / Aria" }),
				);
			}
			return { ok: true, data: [] };
		});

		render(
			<MemoryRouter initialEntries={[`/conversations/${threadId}`]}>
				<Routes>
					<Route path="/conversations/:threadId" element={<MobileConversations />} />
				</Routes>
			</MemoryRouter>,
		);

		await screen.findAllByTestId("conversations-page");
		// Wait for the artifact panel's own search_documents call so its effect
		// doesn't fire after this test's own cleanup.
		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("search_documents", expect.anything());
		});

		// On mobile with no active session, the PageHeader must not be in the
		// DOM at all — before this fix, an empty <header> occupied 37px of space.
		expect(document.querySelector('[data-ds-component="PageHeader"]')).toBeNull();
		vi.doUnmock("../hooks/useViewportBreakpoint.js");
	});
});

// ---------------------------------------------------------------------------
// Reasoning relocated to the review page: no inline reasoning toggle
// ---------------------------------------------------------------------------

describe("Conversations — review Parts carry no inline verdict or reasoning toggle", () => {
	it("renders the calm Part column, an 'Open review' hook, and none of the legacy inline controls", async () => {
		const reviewWithReasoning: ThreadView["messages"][number] = {
			...FAKE_REVIEW_MESSAGE,
			payload: {
				title: "Pricing overhaul",
				reasoning: ["Step one", "Step two"],
				producedItemId: "art-1",
			},
		};
		callMock.mockImplementation(async (action: string) => {
			if (action === "open_thread") {
				return makeOpenThreadResult([FAKE_PLAIN_MESSAGE, reviewWithReasoning]);
			}
			if (action === "send_message")
				return { ok: true, data: { message: { id: "m-new" }, thread: makeThread() } };
			return { ok: true, data: [] };
		});

		renderWithThreadId(THREAD_ID);
		await screen.findByText("Hello from plain message");

		// The Part renderer is mounted; the legacy card and inline verdict UI are gone.
		expect(document.querySelector("[data-ds-component='PartList']")).not.toBeNull();
		expect(screen.queryByTestId("rich-message-card")).toBeNull();
		expect(screen.queryByTestId("thread-shell")).toBeNull();
		expect(screen.getByRole("button", { name: /open review/i })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /reasons/i })).toBeNull();
		expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
		expect(screen.queryByRole("button", { name: /request changes/i })).toBeNull();
		expect(screen.queryByRole("button", { name: /^reject$/i })).toBeNull();
		expect(screen.queryByText("Step one")).toBeNull();
		expect(screen.queryByText("Step two")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Sending a message; navigating to the review page; never sending a verdict
// ---------------------------------------------------------------------------

describe("Conversations — composer and review navigation", () => {
	let lastPath = "";
	function LocationProbe(): null {
		const loc = useLocation();
		lastPath = loc.pathname;
		return null;
	}

	interface SendMessageCall {
		input: { text?: string; verdict?: unknown; clientKey?: string };
	}
	let sends: SendMessageCall[];

	beforeEach(() => {
		sends = [];
		lastPath = "";
	});

	function renderWithProbe(threadId: string): void {
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
			{ initialEntries: [`/conversations/${threadId}`] },
		);
		render(<RouterProvider router={router} />);
	}

	it("typing + Send calls send_message with the text and a uuid clientKey, never a verdict", async () => {
		callMock.mockImplementation(async (action: string, input?: unknown) => {
			if (action === "open_thread") return makeOpenThreadResult([FAKE_PLAIN_MESSAGE]);
			if (action === "send_message") {
				sends.push({ input: input as SendMessageCall["input"] });
				return { ok: true, data: { message: { id: "m-new" }, thread: makeThread() } };
			}
			return { ok: true, data: [] };
		});

		const user = userEvent.setup();
		renderWithProbe(THREAD_ID);
		await screen.findByText("Hello from plain message");

		const textarea = await screen.findByPlaceholderText(/Message/i);
		await user.type(textarea, "A fresh reply");
		await user.click(screen.getByRole("button", { name: /send message/i }));

		await waitFor(() => expect(sends.length).toBeGreaterThan(0));
		const send = sends.find((s) => s.input.text === "A fresh reply");
		expect(send).toBeDefined();
		expect(typeof send?.input.clientKey).toBe("string");
		expect(sends.some((s) => s.input.verdict !== undefined)).toBe(false);
	});

	it("clicking 'Open review' navigates to /reviews/:reviewId (carrying the thread on the query string), for both a team host and a plain review, sending no verdict", async () => {
		const reviewId = FAKE_REVIEW_MESSAGE.id;
		callMock.mockImplementation(async (action: string, input?: unknown) => {
			if (action === "open_thread") return makeOpenThreadResult([FAKE_REVIEW_MESSAGE]);
			if (action === "send_message") {
				sends.push({ input: input as SendMessageCall["input"] });
				return { ok: true, data: { message: { id: "x" }, thread: makeThread() } };
			}
			return { ok: true, data: [] };
		});

		const user = userEvent.setup();
		renderWithProbe(THREAD_ID);
		await screen.findByText("Pricing overhaul");

		await user.click(screen.getByRole("button", { name: /open review/i }));

		await waitFor(() => expect(lastPath).toBe(`/reviews/${reviewId}`));
		expect(lastPath).not.toContain("//");
		expect(lastPath).not.toContain("/conversations");
		expect(lastPath).not.toContain("/work/bet");
		expect(sends.some((s) => s.input.verdict !== undefined)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// The verdict sent from the review page lands in the thread the URL's
// ?threadId= names — never a by-host lookup guess.
// ---------------------------------------------------------------------------

describe("ReviewPage — the verdict is a send_message into the thread named by ?threadId=", () => {
	const REVIEW_ID = "m-rev-approve";
	const NAMED_THREAD_ID = "thread-named-correct";

	function threadViewFor(threadId: string): ThreadView {
		return {
			thread: makeThread({ title: null, computedTitle: "Founder / Agent" }),
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

	it("submitting Approve sends a send_message verdict into the ?threadId= thread", async () => {
		const sends: Array<{
			threadId?: string;
			verdict?: { decision: string; resolvesMessageId: string };
		}> = [];
		callMock.mockImplementation(async (action: string, input?: unknown) => {
			if (action === "open_thread") {
				const { id } = input as { id: string };
				return { ok: true, data: threadViewFor(id) };
			}
			if (action === "send_message") {
				sends.push(
					input as { threadId?: string; verdict?: { decision: string; resolvesMessageId: string } },
				);
				return { ok: true, data: { message: { id: "x" }, thread: makeThread() } };
			}
			return { ok: true, data: [] };
		});

		const user = userEvent.setup();
		const router = createMemoryRouter([{ path: "/reviews/:reviewId", element: <ReviewPage /> }], {
			initialEntries: [`/reviews/${REVIEW_ID}?threadId=${NAMED_THREAD_ID}`],
		});
		render(<RouterProvider router={router} />);

		await user.click(await screen.findByRole("button", { name: /^approve$/i }));

		await waitFor(() => expect(sends.some((s) => s.verdict !== undefined)).toBe(true));
		const verdictSend = sends.find((s) => s.verdict !== undefined);
		expect(verdictSend?.threadId).toBe(NAMED_THREAD_ID);
		expect(verdictSend?.verdict?.decision).toBe("approve");
		expect(verdictSend?.verdict?.resolvesMessageId).toBe(REVIEW_ID);
	});
});

// ---------------------------------------------------------------------------
// Header context link and a thread's own task links
// ---------------------------------------------------------------------------

describe("Conversations — header context link and task links", () => {
	function makeTask(id: string, title: string, state: string) {
		return {
			id,
			parentTaskId: null,
			teamId: "team-1",
			ownerAgentId: null,
			title,
			description: null,
			doneCondition: null,
			state,
			dependencies: null,
			threadId: THREAD_ID,
			notes: null,
			createdAt: "2026-06-08T11:00:00.000Z",
			updatedAt: "2026-06-08T11:00:00.000Z",
			outcomeVerdict: null,
			outcomeSummary: null,
			outcomeRecordedAt: null,
			outcomeRecordedBy: null,
			tokensActualJson: null,
			sourceDocumentId: null,
			completedAt: null,
			position: 0,
			needsReview: false,
		};
	}

	it("does not render a context link for a user-hosted thread (resolveHostRoute returns null)", async () => {
		callMock.mockImplementation(async (action: string) => {
			if (action === "open_thread") {
				return makeOpenThreadResult([], {
					...makeThread(),
					hostKind: "user",
					hostId: "u-founder",
					computedTitle: "My Test Task",
				});
			}
			return { ok: true, data: [] };
		});
		renderWithThreadId(THREAD_ID);
		await screen.findAllByTestId("conversations-page");
		expect(screen.queryAllByRole("link", { name: /My Test Task/i })).toHaveLength(0);
	});

	it("shows one link per task with the right hrefs, and none when the thread has no tasks", async () => {
		callMock.mockImplementation(async (action: string, input?: unknown) => {
			if (action === "open_thread") return makeOpenThreadResult([]);
			if (action === "search_tasks") {
				expect(input).toEqual({ threadId: THREAD_ID });
				return {
					ok: true,
					data: [
						makeTask("task-1", "Write the doc", "in_progress"),
						makeTask("task-2", "Ship the PR", "review"),
					],
				};
			}
			return { ok: true, data: [] };
		});
		renderWithThreadId(THREAD_ID);
		await screen.findAllByTestId("conversations-page");

		expect(await screen.findByRole("link", { name: /Write the doc/i })).toHaveAttribute(
			"href",
			"/work/task/task-1",
		);
		expect(screen.getByRole("link", { name: /Ship the PR/i })).toHaveAttribute(
			"href",
			"/work/task/task-2",
		);
	});
});

// ---------------------------------------------------------------------------
// Session panel agent identity: comes from the session, never the thread host
// ---------------------------------------------------------------------------

describe("Conversations — session panel agent identity", () => {
	it("gives the session's own agent id, never the (team) thread host id", () => {
		const teamIdentities = {
			"team-42": { id: "team-42", name: "Team Rocket", role: "member", isAgent: false },
		};
		const author = resolveSessionAgentAuthor({ agentId: "agent-7" }, teamIdentities);
		expect(author.id).toBe("agent-7");
		expect(author.id).not.toBe("team-42");
		expect(author.name).not.toBe("Team Rocket");
	});

	it("resolves the agent's display name from identities when known", () => {
		const identities = {
			"agent-7": { id: "agent-7", name: "Atlas", role: "agent", isAgent: true },
		};
		const author = resolveSessionAgentAuthor({ agentId: "agent-7" }, identities);
		expect(author.name).toBe("Atlas");
		expect(author.isAgent).toBe(true);
	});

	it("does not invent a lookup when the session carries no agent id yet (streaming)", () => {
		const teamIdentities = {
			"team-42": { id: "team-42", name: "Team Rocket", role: "member", isAgent: false },
		};
		const author = resolveSessionAgentAuthor(null, teamIdentities);
		expect(author.id).not.toBe("team-42");
		expect(author.name).not.toBe("Team Rocket");
	});
});
