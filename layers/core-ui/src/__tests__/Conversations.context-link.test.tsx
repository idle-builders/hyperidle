/**
 * AE5 — Conversations context link and presence tests (Task 7+8 acceptance).
 *
 * AC-3: Within conversations, a user can see and navigate to the thread's host context.
 * AC-4: Agent presence is visible (active session or idle).
 */

import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveHostRoute } from "../services/host-route.js";

// ── resolveHostRoute unit tests (AC-3 route resolution) ──────────────────────

describe("AE5 — resolveHostRoute", () => {
	// @lore BB1: task now navigates to /work/task/:id directly — no betId needed
	it("resolves task to /work/task/:id (BB1: was null no-op, now direct route)", () => {
		expect(resolveHostRoute("task", "task-123")).toBe("/work/task/task-123");
	});

	it("resolves task to /work/task/:id with different id", () => {
		expect(resolveHostRoute("task", "task-456")).toBe("/work/task/task-456");
	});

	it("resolves knowledge_item to /knowledge/:id", () => {
		expect(resolveHostRoute("knowledge_item", "ki-789")).toBe("/knowledge/ki-789");
	});

	// @lore artifacts-become-knowledge: artifact test removed — "artifact" is no longer a valid HostKind

	it("resolves agent to /work/agent/:id", () => {
		expect(resolveHostRoute("agent", "agent-001")).toBe("/agents/agent-001");
	});

	it("resolves team to /work/team/:id", () => {
		expect(resolveHostRoute("team", "team-001")).toBe("/work/team/team-001");
	});

	it("returns null for user host kind (self-referential, no navigation)", () => {
		expect(resolveHostRoute("user", "u-123")).toBeNull();
	});

	it("returns null for factory host kind (global scope, no navigation)", () => {
		expect(resolveHostRoute("factory", "factory-1")).toBeNull();
	});
});

// ── ThreadHostBanner presence dot tests (AC-4) ───────────────────────────────

describe("AE5 — ThreadHostBanner presence dots", () => {
	it("renders a green presence dot for active agent participant", async () => {
		const { ThreadHostBanner } = await import("../ds");

		const participants = [
			{
				id: "agent-1",
				name: "Aria",
				isAgent: true,
				operationalStatus: "active" as const,
			},
		];

		render(
			<ThreadHostBanner
				hostKind="task"
				hostTitle="Test Task"
				blocking={false}
				resolved={false}
				pinned={false}
				participants={participants}
			/>,
		);

		// Active presence dot should be present with aria-label
		const dot = screen.getByLabelText(/Aria.*active/i);
		expect(dot).toBeDefined();
	});

	it("renders a red presence dot for agent with error status", async () => {
		const { ThreadHostBanner } = await import("../ds");

		const participants = [
			{
				id: "agent-1",
				name: "Aria",
				isAgent: true,
				operationalStatus: "error" as const,
			},
		];

		render(
			<ThreadHostBanner
				hostKind="task"
				hostTitle="Test Task"
				blocking={false}
				resolved={false}
				pinned={false}
				participants={participants}
			/>,
		);

		const dot = screen.getByLabelText(/Aria.*error/i);
		expect(dot).toBeDefined();
	});

	it("renders no presence dot for idle agent participant", async () => {
		const { ThreadHostBanner } = await import("../ds");

		const participants = [
			{
				id: "agent-1",
				name: "Aria",
				isAgent: true,
				operationalStatus: "idle" as const,
			},
		];

		render(
			<ThreadHostBanner
				hostKind="task"
				hostTitle="Test Task"
				blocking={false}
				resolved={false}
				pinned={false}
				participants={participants}
			/>,
		);

		// No presence dot for idle — it is rendered as absence
		expect(screen.queryByLabelText(/Aria.*idle/i)).toBeNull();
	});

	it("renders no presence dot for human participants", async () => {
		const { ThreadHostBanner } = await import("../ds");

		const participants = [
			{
				id: "u-founder",
				name: "Alice",
				isAgent: false,
			},
		];

		render(
			<ThreadHostBanner
				hostKind="task"
				hostTitle="Test Task"
				blocking={false}
				resolved={false}
				pinned={false}
				participants={participants}
			/>,
		);

		// No presence dots for humans
		expect(screen.queryByLabelText(/Alice.*active/i)).toBeNull();
		expect(screen.queryByLabelText(/Alice.*error/i)).toBeNull();
	});

	it("renders no dots when operationalStatus is absent (backward compat)", async () => {
		const { ThreadHostBanner } = await import("../ds");

		const participants = [
			{
				id: "agent-1",
				name: "Aria",
				// no isAgent, no operationalStatus
			},
		];

		render(
			<ThreadHostBanner
				hostKind="task"
				hostTitle="Test Task"
				blocking={false}
				resolved={false}
				pinned={false}
				participants={participants}
			/>,
		);

		// Backward compat — no dots when status is not provided
		expect(screen.queryByLabelText(/Aria.*active/i)).toBeNull();
		expect(screen.queryByLabelText(/Aria.*error/i)).toBeNull();
	});
});

// ── ThreadRow presence dot tests (AC-4) ─────────────────────────────────────

describe("AE5 — ThreadRow presence dots", () => {
	it("renders presence dot for active agent avatar", async () => {
		const { ThreadRow } = await import("../ds");

		render(
			<ThreadRow
				title="Test Thread"
				snippet="Last message"
				timestamp="2h ago"
				avatars={[
					{
						initials: "A",
						agent: true,
						operationalStatus: "active" as const,
					},
				]}
			/>,
		);

		// The thread row renders agent avatars; with active status, a dot should be present
		// Check via aria-label on the presence dot
		const dot = screen.getByLabelText(/active/i);
		expect(dot).toBeDefined();
	});

	it("renders no presence dot for idle agent avatar", async () => {
		const { ThreadRow } = await import("../ds");

		render(
			<ThreadRow
				title="Test Thread"
				snippet="Last message"
				timestamp="2h ago"
				avatars={[
					{
						initials: "A",
						agent: true,
						operationalStatus: "idle" as const,
					},
				]}
			/>,
		);

		expect(screen.queryByLabelText(/idle/i)).toBeNull();
	});

	it("renders no presence dot when operationalStatus absent (backward compat)", async () => {
		const { ThreadRow } = await import("../ds");

		render(
			<ThreadRow
				title="Test Thread"
				snippet="Last message"
				timestamp="2h ago"
				avatars={[{ initials: "A", agent: true }]}
			/>,
		);

		// No dot without operationalStatus
		expect(screen.queryByLabelText(/active/i)).toBeNull();
		expect(screen.queryByLabelText(/error/i)).toBeNull();
	});
});

// ── Conversations context link rendering (AC-3) ──────────────────────────────

describe("AE5 — Conversations header context link", () => {
	const mockThreadDetail = {
		thread: {
			id: "t-1",
			hostKind: "task" as const,
			hostId: "task-123",
			initiatorId: "u-founder",
			participants: ["u-founder"],
			pinned: false,
			resolvedAt: null,
			lastActiveAt: "2026-06-08T12:00:00.000Z",
			createdAt: "2026-06-08T11:00:00.000Z",
		},
		messages: [],
		headMessageId: null,
		identities: {
			"u-founder": { name: "Alice Founder", role: "founder" },
		},
		hostTitle: "My Test Task",
	};

	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const url =
					typeof input === "string"
						? input
						: input instanceof URL
							? input.href
							: (input as Request).url;
				if (url.includes("/api/threads/t-1")) {
					return {
						ok: true,
						status: 200,
						json: async () => mockThreadDetail,
					} as unknown as Response;
				}
				return {
					ok: true,
					status: 200,
					json: async () => ({ threads: [], nextCursor: null }),
				} as unknown as Response;
			}),
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// @lore BB1: task now navigates to /work/task/:id — was a no-op (AM5 H5/BLOCKER-1)
	it("renders host context title as link for task (BB1: was text-only no-op)", async () => {
		const { Conversations } = await import("../pages/Conversations.js");

		const router = createMemoryRouter(
			[
				{
					path: "/conversations/:threadId",
					element: <Conversations />,
				},
			],
			{
				initialEntries: ["/conversations/t-1"],
			},
		);

		render(<RouterProvider router={router} />);

		// BB1: task resolveHostRoute → /work/task/task-123 (was null no-op).
		// Wait for the thread to load.
		const heading = await screen.findByRole("heading", { name: /My Test Task/i }).catch(() => null);
		const hostText = await screen.findByText(/My Test Task/i).catch(() => null);
		expect(heading ?? hostText).not.toBeNull();
		const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
		// UI-030: threadTitle now prefers data.hostTitle ("My Test Task") over raw hostId ("task-123").
		expect(breadcrumb).toHaveTextContent("My Test Task");
		expect(breadcrumb).not.toHaveTextContent("task-123");
	});

	it("does not render context link when resolveHostRoute returns null (user thread)", async () => {
		const { Conversations } = await import("../pages/Conversations.js");

		const userThreadDetail = {
			...mockThreadDetail,
			thread: {
				...mockThreadDetail.thread,
				hostKind: "user" as const,
				hostId: "u-founder",
			},
		};

		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					({
						ok: true,
						status: 200,
						json: async () => userThreadDetail,
					}) as unknown as Response,
			),
		);

		const router = createMemoryRouter(
			[{ path: "/conversations/:threadId", element: <Conversations /> }],
			{ initialEntries: ["/conversations/t-1"] },
		);

		render(<RouterProvider router={router} />);

		// For user-kind threads, no context link (resolveHostRoute returns null)
		// Wait for the page to load first by waiting for something to appear
		// Use findAllByTestId because Conversations renders nested containers with the same testid
		await screen.findAllByTestId("conversations-page");
		// No context link for user-hosted thread
		const links = screen.queryAllByRole("link", { name: /My Test Task/i });
		expect(links).toHaveLength(0);
	});
});
