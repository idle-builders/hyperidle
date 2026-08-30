/**
 * Conversations review routing.
 *
 * The Part-model conversation has NO inline verdict dispatch: a review
 * message renders as a `review` Part with a single "Open review" hook that
 * routes to the review page; the conversation never POSTs a verdict.
 *
 * Verdict SEMANTICS (Message type, payload, verdictDecisionLabel, POST shape)
 * are covered where verdicts are actually taken (review page / server); only
 * the decision UI lives here (conversation → review page).
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Conversations } from "../pages/Conversations";
import { ReviewPage } from "../pages/review/ReviewPage";

const THREAD_ID = "t-am1-review-routing";

let lastPath = "";
function LocationProbe(): null {
	const loc = useLocation();
	lastPath = loc.pathname;
	return null;
}

// A bet-hosted thread — the host id IS the bet the review belongs to.
const BET_ID = "bet-am1";
const FAKE_THREAD = {
	id: THREAD_ID,
	hostKind: "task",
	hostId: BET_ID,
	initiatorId: "agent-1",
	participants: ["u-founder", "agent-1"],
	pinned: false,
	resolvedAt: null,
	lastActiveAt: "2026-04-19T12:00:00.000Z",
	createdAt: "2026-04-19T12:00:00.000Z",
};

const FAKE_REVIEW = {
	id: "m-rev-am1",
	threadId: THREAD_ID,
	senderId: "agent-1",
	clientKey: "k-rev-am1",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "review",
	payload: {
		title: "Approve the deploy",
		reasoning: ["one"],
		artifactRef: { id: "art-am1", kind: "text_diff" },
	},
};

interface CapturedPost {
	url: string;
	body: { type?: string } | null;
}

describe("Conversations — review routing (no inline verdict)", () => {
	let posts: CapturedPost[];
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		posts = [];
		lastPath = "";
		originalFetch = globalThis.fetch;
		const detail = {
			thread: FAKE_THREAD,
			messages: [FAKE_REVIEW],
			headMessageId: FAKE_REVIEW.id,
			identities: {
				"u-founder": { name: "Founder", role: "founder" },
				"agent-1": { name: "Aria", role: "agent" },
			},
		};
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();
			const method = (init?.method ?? "GET").toUpperCase();
			if (method === "POST" && url.endsWith(`/api/threads/${THREAD_ID}/messages`)) {
				const body = init?.body ? JSON.parse(init.body as string) : null;
				posts.push({ url, body });
				return new Response(JSON.stringify({ message: { id: "x" }, thread: FAKE_THREAD }), {
					status: 201,
					headers: { "Content-Type": "application/json" },
				});
			}
			if (url.includes("/api/auth/me")) {
				return new Response(
					JSON.stringify({ id: "u-founder", name: "Founder", email: "f@x", avatarUrl: null }),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			if (url.endsWith(`/api/threads/${THREAD_ID}`)) {
				return new Response(JSON.stringify(detail), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			return new Response("not found", { status: 404 });
		}) as typeof globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	function renderConversations(): void {
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
			{ initialEntries: [`/conversations/${THREAD_ID}`] },
		);
		render(<RouterProvider router={router} />);
	}

	it("renders a review Part with 'Open review' and NO inline Approve/Request-changes/Reject", async () => {
		renderConversations();
		await screen.findByText(/Approve the deploy/i);

		expect(document.querySelector("[data-ds-component='ReviewRequestPart']")).not.toBeNull();
		expect(screen.getByRole("button", { name: /open review/i })).toBeInTheDocument();
		// The inline verdict controls are GONE from the conversation.
		expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
		expect(screen.queryByRole("button", { name: /request changes/i })).toBeNull();
		expect(screen.queryByRole("button", { name: /^reject$/i })).toBeNull();
		// The legacy promoted card + top toolbar are gone.
		expect(screen.queryByTestId("rich-message-card")).toBeNull();
		expect(screen.queryByTestId("review-header")).toBeNull();
	});

	it("clicking 'Open review' navigates to the review route and POSTs no verdict", async () => {
		const user = userEvent.setup();
		renderConversations();
		await screen.findByText(/Approve the deploy/i);

		await user.click(screen.getByRole("button", { name: /open review/i }));

		// The route resolves to `/reviews/:reviewId` for EVERY review, bet-hosted
		// included — the URL no longer needs a bet at all, since the loader
		// names the review's own thread directly.
		await waitFor(() => expect(lastPath).toBe(`/reviews/${FAKE_REVIEW.id}`));
		expect(lastPath).not.toContain("//");
		expect(lastPath).not.toContain("/conversations");
		expect(lastPath).not.toContain("/work/bet");
		// The conversation took NO verdict — no POST of any kind from a review click.
		expect(posts.some((p) => p.body?.type === "verdict")).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// The render gate for a TASK-hosted review.
//
// The "Open review" button must render even when the thread's host is a
// task, not a bet — a task-hosted thread has no bet id to gate on. This is
// deliberately a `Conversations`-level test, not a `ReviewPage` one:
// mounting the page directly would go green while the button that reaches
// it stays invisible, proving nothing about reachability.
// ─────────────────────────────────────────────────────────────────────────────

const TASK_THREAD_ID = "t-task-review";
const TASK_ID = "task-1";
const TASK_REVIEW_ID = "m-rev-task";

const TASK_FAKE_THREAD = {
	id: TASK_THREAD_ID,
	hostKind: "task",
	hostId: TASK_ID,
	initiatorId: "agent-1",
	participants: ["u-founder", "agent-1"],
	pinned: false,
	resolvedAt: null,
	lastActiveAt: "2026-04-19T12:00:00.000Z",
	createdAt: "2026-04-19T12:00:00.000Z",
};

const TASK_FAKE_REVIEW = {
	id: TASK_REVIEW_ID,
	threadId: TASK_THREAD_ID,
	senderId: "agent-1",
	clientKey: "k-rev-task",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "review",
	payload: {
		title: "Approve the deploy (task-hosted)",
		reasoning: ["a task-hosted review carries no bet"],
		artifactRef: { id: "art-task", kind: "text_diff" },
	},
};

describe("Conversations — review routing, TASK-hosted (render gate)", () => {
	let taskPosts: CapturedPost[];
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		taskPosts = [];
		lastPath = "";
		originalFetch = globalThis.fetch;
		const detail = {
			thread: TASK_FAKE_THREAD,
			messages: [TASK_FAKE_REVIEW],
			headMessageId: TASK_FAKE_REVIEW.id,
			identities: {
				"u-founder": { name: "Founder", role: "founder" },
				"agent-1": { name: "Aria", role: "agent" },
			},
		};
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();
			const method = (init?.method ?? "GET").toUpperCase();
			if (method === "POST" && url.endsWith(`/api/threads/${TASK_THREAD_ID}/messages`)) {
				const body = init?.body ? JSON.parse(init.body as string) : null;
				taskPosts.push({ url, body });
				return new Response(JSON.stringify({ message: { id: "x" }, thread: TASK_FAKE_THREAD }), {
					status: 201,
					headers: { "Content-Type": "application/json" },
				});
			}
			if (url.includes("/api/auth/me")) {
				return new Response(
					JSON.stringify({ id: "u-founder", name: "Founder", email: "f@x", avatarUrl: null }),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			if (url.endsWith(`/api/threads/${TASK_THREAD_ID}`)) {
				return new Response(JSON.stringify(detail), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			return new Response("not found", { status: 404 });
		}) as typeof globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	function renderTaskConversation(): void {
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
			{ initialEntries: [`/conversations/${TASK_THREAD_ID}`] },
		);
		render(<RouterProvider router={router} />);
	}

	it("renders an 'Open review' control for a task-hosted review", async () => {
		renderTaskConversation();
		await screen.findByText(/Approve the deploy \(task-hosted\)/i);

		// The button must exist for a task host, not merely be inert.
		expect(screen.getByRole("button", { name: /open review/i })).toBeInTheDocument();
	});

	it("clicking 'Open review' on a task-hosted review navigates to /reviews/:reviewId", async () => {
		const user = userEvent.setup();
		renderTaskConversation();
		await screen.findByText(/Approve the deploy \(task-hosted\)/i);

		await user.click(screen.getByRole("button", { name: /open review/i }));

		await waitFor(() => expect(lastPath).toBe(`/reviews/${TASK_REVIEW_ID}`));
		expect(lastPath).not.toContain("/work/bet");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Approving a TASK-hosted review reaches the server, on the thread the
// loader NAMES rather than one the page GUESSES.
//
// This mounts the REAL `ReviewPage` at the flattened route with only the
// network boundary mocked (no thread-lookup hook mocked — that would hide
// exactly the behavior under test), seeds TWO threads under the same task
// host, and proves the approve POST lands on the thread the loader's
// `threadId` names, not the one a by-host lookup would guess.
// ─────────────────────────────────────────────────────────────────────────────

describe("ReviewPage — approve reaches the thread the loader NAMES, for a task-hosted review", () => {
	const REVIEW_ID = "m-rev-approve";
	const TASK_ID_2 = "task-approve";
	const NAMED_THREAD_ID = "thread-named-correct";
	const GUESSED_THREAD_ID = "thread-guessed-wrong";

	let approvePosts: CapturedPost[];
	let getUrls: string[];
	let originalFetch: typeof globalThis.fetch;

	const composedSubject = {
		id: REVIEW_ID,
		title: "Approve the deploy",
		parentTaskId: null,
		betTitle: "",
		taskId: TASK_ID_2,
		taskTitle: "Ship the deploy",
		threadId: NAMED_THREAD_ID,
		prompt: "Ship it",
		authorName: "Aria",
		reviewerName: "Founder",
		blocking: true,
		producedAgo: "2026-04-19T12:00:00.000Z",
		tokens: "",
		tools: [] as string[],
		outcome: "Deployed to staging; needs prod approval.",
		resultKpis: [] as unknown[],
		intent: [] as unknown[],
		needs: [] as unknown[],
		conversation: [] as unknown[],
		artifacts: [] as unknown[],
	};

	function emptyThreadDetail(threadId: string, hostId: string): unknown {
		return {
			thread: {
				id: threadId,
				hostKind: "task",
				hostId,
				initiatorId: "agent-1",
				participants: ["u-founder", "agent-1"],
				pinned: false,
				resolvedAt: null,
				lastActiveAt: "2026-04-19T12:00:00.000Z",
				createdAt: "2026-04-19T12:00:00.000Z",
			},
			messages: [],
			headMessageId: null,
			identities: {
				"u-founder": { name: "Founder", role: "founder" },
				"agent-1": { name: "Aria", role: "agent" },
			},
		};
	}

	function jsonResponse(body: unknown, status = 200): Response {
		return new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	}

	// GET routing table for this scenario, extracted so the fetch mock stays a
	// flat dispatch instead of a long if-chain. A by-host lookup for this task
	// resolves to the GUESSED (wrong) thread — simulating a host with more
	// than one thread.
	function handleGet(url: string): Response {
		if (url.includes("/api/auth/me")) {
			return jsonResponse({ id: "u-founder", name: "Founder", email: "f@x", avatarUrl: null });
		}
		if (url.endsWith(`/api/reviews/${REVIEW_ID}`)) {
			return jsonResponse(composedSubject);
		}
		if (url.includes(`host_kind=task&host_id=${TASK_ID_2}`)) {
			return jsonResponse({ threads: [{ id: GUESSED_THREAD_ID }] });
		}
		if (url.endsWith(`/api/threads/${NAMED_THREAD_ID}`)) {
			return jsonResponse(emptyThreadDetail(NAMED_THREAD_ID, TASK_ID_2));
		}
		if (url.endsWith(`/api/threads/${GUESSED_THREAD_ID}`)) {
			return jsonResponse(emptyThreadDetail(GUESSED_THREAD_ID, TASK_ID_2));
		}
		return new Response("not found", { status: 404 });
	}

	beforeEach(() => {
		approvePosts = [];
		getUrls = [];
		originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();
			const method = (init?.method ?? "GET").toUpperCase();

			if (method === "POST" && url.includes("/messages")) {
				const body = init?.body ? JSON.parse(init.body as string) : null;
				approvePosts.push({ url, body });
				return jsonResponse({ message: { id: "x" } }, 201);
			}
			getUrls.push(url);
			return handleGet(url);
		}) as typeof globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it("POSTs the approve verdict to the loader-named thread, not a by-host guess", async () => {
		const user = userEvent.setup();
		const router = createMemoryRouter([{ path: "/reviews/:reviewId", element: <ReviewPage /> }], {
			initialEntries: [`/reviews/${REVIEW_ID}`],
		});
		render(<RouterProvider router={router} />);

		const approveButton = await screen.findByRole("button", { name: /^approve$/i });

		// Give the thread-resolution chain a turn to settle before acting, so
		// the click exercises steady state, not a loading race.
		await waitFor(() => expect(getUrls.some((u) => u.includes("/api/threads/"))).toBe(true));

		await user.click(approveButton);

		await waitFor(() => expect(approvePosts.length).toBeGreaterThan(0), { timeout: 3000 });
		const verdictPost = approvePosts.find((p) => p.body?.type === "verdict");
		expect(verdictPost).toBeDefined();
		// It must land on NAMED_THREAD_ID, the thread the loader's own
		// `threadId` field names — never the one a by-host guess would find.
		expect(verdictPost?.url).toContain(NAMED_THREAD_ID);
		expect(verdictPost?.url).not.toContain(GUESSED_THREAD_ID);
	});
});
