/**
 * AE5 — Conversations context link and presence tests (Task 7+8 acceptance).
 *
 * AC-3: Within conversations, a user can see and navigate to the thread's host context.
 * AC-4: Agent presence is visible (active session or idle).
 */

import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { resolveSessionAgentAuthor } from "../pages/Conversations.js";
import { resolveHostRoute } from "../services/host-route.js";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

vi.mock("../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({
		user: { id: "u-founder", name: "Alice Founder", email: "alice@example.com", avatarUrl: null },
		status: "ready",
		error: null,
		retry: vi.fn(),
	}),
}));

// ── resolveHostRoute unit tests (AC-3 route resolution) ──────────────────────

describe("AE5 — resolveHostRoute", () => {
	// @lore BB1: task now navigates to /work/task/:id directly — no betId needed
	it("resolves task to /work/task/:id (BB1: was null no-op, now direct route)", () => {
		expect(resolveHostRoute("task", "task-123")).toBe("/work/task/task-123");
	});

	it("resolves task to /work/task/:id with different id", () => {
		expect(resolveHostRoute("task", "task-456")).toBe("/work/task/task-456");
	});

	it("resolves document to /knowledge/:id", () => {
		expect(resolveHostRoute("document", "ki-789")).toBe("/knowledge/ki-789");
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
				hostKind="team"
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
				hostKind="team"
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
				hostKind="team"
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
				hostKind="team"
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
				hostKind="team"
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

// @lore BC3: the "renders host context title as link for task" case is
// DELETED, not repointed — thread `hostKind` can no longer be "task" (a
// task's own thread is `team`-hosted, architecture.md §3.9). There is no
// task-hosted thread left to link to.

function makeOpenThreadResult() {
	return {
		ok: true,
		data: {
			thread: {
				id: "t-1",
				hostKind: "user" as const,
				hostId: "u-founder",
				initiatorId: "u-founder",
				members: ["u-founder"],
				title: null,
				computedTitle: "My Test Task",
				pinned: false,
				resolvedAt: null,
				deletedAt: null,
				lastActiveAt: "2026-06-08T12:00:00.000Z",
				createdAt: "2026-06-08T11:00:00.000Z",
			},
			members: [{ id: "u-founder", name: "Alice Founder", role: "founder", isAgent: false }],
			messages: [],
			headMessageId: null,
			hostTitle: "My Test Task",
		},
	};
}

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
		threadId: "t-1",
		notes: null,
		createdAt: "2026-06-08T11:00:00.000Z",
		updatedAt: "2026-06-08T11:00:00.000Z",
		outcomeVerdict: null,
		outcomeSummary: null,
		outcomeRecordedAt: null,
		outcomeRecordedBy: null,
		tokensActualJson: null,
		sourceKnowledgeItemId: null,
		completedAt: null,
		position: 0,
		needsReview: false,
	};
}

describe("AE5 — Conversations header context link", () => {
	it("does not render context link when resolveHostRoute returns null (user thread)", async () => {
		callMock.mockImplementation(async (action: string) => {
			if (action === "open_thread") return makeOpenThreadResult();
			return { ok: true, data: [] };
		});

		const { Conversations } = await import("../pages/Conversations.js");

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

// ── A thread's own tasks replace the old task link ───────────

describe("Conversations thread task links", () => {
	it("shows one link per task, with the right hrefs, for a thread with two tasks", async () => {
		callMock.mockImplementation(async (action: string, input?: unknown) => {
			if (action === "open_thread") return makeOpenThreadResult();
			if (action === "search_tasks") {
				expect(input).toEqual({ threadId: "t-1" });
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

		const { Conversations } = await import("../pages/Conversations.js");

		const router = createMemoryRouter(
			[{ path: "/conversations/:threadId", element: <Conversations /> }],
			{ initialEntries: ["/conversations/t-1"] },
		);

		render(<RouterProvider router={router} />);

		await screen.findAllByTestId("conversations-page");

		const firstLink = await screen.findByRole("link", { name: /Write the doc/i });
		expect(firstLink).toHaveAttribute("href", "/work/task/task-1");
		const secondLink = screen.getByRole("link", { name: /Ship the PR/i });
		expect(secondLink).toHaveAttribute("href", "/work/task/task-2");
	});

	it("shows no task link for a thread with no tasks", async () => {
		callMock.mockImplementation(async (action: string) => {
			if (action === "open_thread") return makeOpenThreadResult();
			if (action === "search_tasks") return { ok: true, data: [] };
			return { ok: true, data: [] };
		});

		const { Conversations } = await import("../pages/Conversations.js");

		const router = createMemoryRouter(
			[{ path: "/conversations/:threadId", element: <Conversations /> }],
			{ initialEntries: ["/conversations/t-1"] },
		);

		render(<RouterProvider router={router} />);

		await screen.findAllByTestId("conversations-page");

		expect(screen.queryAllByRole("link", { name: /task/i })).toHaveLength(0);
	});
});

// ── Code-review fix: session panel agent identity ────────────────────────────
//
// A thread's host is a team, a knowledge item, a user or an agent — only in
// the last case is it an agent. `resolveSessionAgentAuthor` (Conversations.tsx)
// resolves the agent shown in a session's inspect panel; it must come from the
// session's OWN data (`useSessionActivity`'s `summary`), never from the
// hosting thread's id — a team-hosted (task) thread's session must never be
// labeled with the team's id.

describe("Conversations — session panel agent identity (code-review fix)", () => {
	it("gives the session's own agent id, never the (team) thread host id", () => {
		// A team-hosted thread whose session belongs to agent-7. The team's own
		// id/name must play no part in the resolution.
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
		// useSessionActivity's `summary` is null while streaming (AC10) — there is
		// no session-sourced agent id available. A generic placeholder is used;
		// the (unrelated) thread host id must never fill the gap.
		const teamIdentities = {
			"team-42": { id: "team-42", name: "Team Rocket", role: "member", isAgent: false },
		};
		const author = resolveSessionAgentAuthor(null, teamIdentities);
		expect(author.id).not.toBe("team-42");
		expect(author.name).not.toBe("Team Rocket");
	});
});
