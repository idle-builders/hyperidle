/**
 * AH3 — AssistantOverlay notice rendering + crash-recovery component tests.
 *
 * AC2 (overlay side):
 *   - when thread last message has payload.notice.kind=missing_key → renders
 *     the "No API key yet" guidance card, message names Settings → Credentials
 *   - missing_harness → "Runtime not configured", message names Agent settings
 *   - provider_error → "Couldn't reach the model" + Retry ghost button
 *
 * AC1/§1.7b (crash recovery):
 *   - thread whose last message is a human message AND older than
 *     ASSISTANT_TURN_TIMEOUT_MS shows Retry card, NOT infinite spinner
 *
 * @lore BC3: re-pointed off the deleted `useAssistantThread` onto
 * `useThread`/`useThreads`/`useAgents`/`useCurrentUser` — the overlay
 * resolves its own agent's direct thread via `useThreads({host:{kind:"agent"}})`
 * then reads it with `useThread(id)` (architecture.md §5 B6). `notice` stays
 * on the READ shape only (Reconciliation R9) — `AssistantOverlay.tsx`'s
 * renderer is unchanged, so this test is kept and re-pointed, not deleted.
 *
 * @lore BC3: `useAgentOwnership` (a second fetch of every AI-role user) is
 * deleted — `GET /api/agents` carries `ownerUserId` directly, so the overlay
 * finds "my agent" off the same `useAgents` fetch every agent picker shares.
 */

import type { Message } from "@hyperidle/domain-model";
import { ASSISTANT_TURN_TIMEOUT_MS } from "@hyperidle/domain-model";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UseAgentsResult } from "../../hooks/useAgents.js";
import type { UseCurrentUserResult } from "../../hooks/useCurrentUser.js";
import type { UseThreadResult } from "../../hooks/useThread.js";
import type { UseThreadsResult } from "../../hooks/useThreads.js";

vi.mock("../../hooks/useAgents.js", () => ({
	useAgents: vi.fn(),
}));
vi.mock("../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: vi.fn(),
}));
vi.mock("../../hooks/useThread.js", () => ({
	useThread: vi.fn(),
}));
vi.mock("../../hooks/useThreads.js", () => ({
	useThreads: vi.fn(),
}));

import { useAgents } from "../../hooks/useAgents.js";
import { useCurrentUser } from "../../hooks/useCurrentUser.js";
import { useThread } from "../../hooks/useThread.js";
import { useThreads } from "../../hooks/useThreads.js";
import { AssistantOverlay } from "../../shell/AssistantOverlay.js";

const NOW_ISO = new Date().toISOString();
// A timestamp older than the turn timeout
const STALE_ISO = new Date(Date.now() - ASSISTANT_TURN_TIMEOUT_MS - 10_000).toISOString();
// A timestamp within the turn timeout window
const RECENT_ISO = new Date(Date.now() - 30_000).toISOString();

const MY_AGENT_ID = "agent-ast-founder";
const MY_USER_ID = "u-founder";

const BASE_THREAD = {
	id: "t-overlay-ah3",
	hostKind: "user" as const,
	hostId: MY_USER_ID,
	initiatorId: MY_USER_ID,
	members: [MY_USER_ID, MY_AGENT_ID],
	title: null,
	computedTitle: "Assistant",
	pinned: false,
	resolvedAt: null,
	deletedAt: null,
	lastActiveAt: NOW_ISO,
	createdAt: NOW_ISO,
};

function mockOwnershipAndUser(): void {
	vi.mocked(useCurrentUser).mockReturnValue({
		user: { id: MY_USER_ID, name: "Founder", email: "founder@example.com", avatarUrl: null },
		status: "ready",
		error: null,
		retry: vi.fn(),
	} as UseCurrentUserResult);
	vi.mocked(useAgents).mockReturnValue({
		agents: [{ id: MY_AGENT_ID, ownerUserId: MY_USER_ID } as UseAgentsResult["agents"][number]],
		loading: false,
		error: null,
		refetch: vi.fn(),
	} as UseAgentsResult);
	vi.mocked(useThreads).mockReturnValue({
		status: "ready",
		threads: [{ ...BASE_THREAD, hasUnresolvedReview: false, lastMessagePreview: null }],
		error: null,
		retry: vi.fn(),
	} as UseThreadsResult);
}

function makeData(messages: ReadonlyArray<Record<string, unknown>>): UseThreadResult {
	return {
		status: "ready",
		data: {
			thread: BASE_THREAD,
			members: [
				{ id: MY_USER_ID, name: "Founder", role: "human", isAgent: false },
				{ id: MY_AGENT_ID, name: "Assistant", role: "assistant", isAgent: true },
			],
			messages: messages as unknown as Message[],
			headMessageId: null,
			hostTitle: "Assistant",
		},
		error: null,
		refresh: vi.fn(),
	};
}

function renderOverlay() {
	return render(
		<AssistantOverlay
			open={true}
			onClose={vi.fn()}
			contextRefs={[]}
			onRemoveContextRef={vi.fn()}
		/>,
	);
}

describe("AH3: AssistantOverlay notice rendering", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders missing_key guidance card naming Settings → Credentials", () => {
		mockOwnershipAndUser();
		vi.mocked(useThread).mockReturnValue(
			makeData([
				{
					id: "msg-mk-1",
					threadId: "t-overlay-ah3",
					senderId: MY_AGENT_ID,
					type: "plain",
					payload: {
						text: "I can't think yet — no API key is configured. Add your Anthropic key in Settings → Credentials.",
						notice: { kind: "missing_key" },
					},
					clientKey: "ck-mk-1",
					blockId: null,
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: NOW_ISO,
				},
			]),
		);

		renderOverlay();

		// Must render guidance card for missing_key
		expect(screen.getByText(/no api key/i)).toBeInTheDocument();
		// The message itself names where to go — no live navigation affordance exists.
		expect(screen.getByText(/credentials/i)).toBeInTheDocument();
	});

	it("renders missing_harness guidance card naming Agent settings", () => {
		mockOwnershipAndUser();
		vi.mocked(useThread).mockReturnValue(
			makeData([
				{
					id: "msg-mh-1",
					threadId: "t-overlay-ah3",
					senderId: MY_AGENT_ID,
					type: "plain",
					payload: {
						text: "My runtime isn't set up. Pick a harness for me and I'll be ready.",
						notice: { kind: "missing_harness" },
					},
					clientKey: "ck-mh-1",
					blockId: null,
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: NOW_ISO,
				},
			]),
		);

		renderOverlay();

		// Must render guidance card for missing_harness
		expect(screen.getByText(/runtime not configured/i)).toBeInTheDocument();
		// Must have an affordance pointing to Agent settings
		expect(screen.getByText(/agent/i)).toBeInTheDocument();
	});

	it("renders provider_error guidance card with Retry ghost button", () => {
		mockOwnershipAndUser();
		vi.mocked(useThread).mockReturnValue(
			makeData([
				{
					id: "msg-pe-1",
					threadId: "t-overlay-ah3",
					senderId: MY_AGENT_ID,
					type: "plain",
					payload: {
						text: "The model provider returned an error and I couldn't complete that.",
						notice: { kind: "provider_error" },
					},
					clientKey: "ck-pe-1",
					blockId: null,
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: NOW_ISO,
				},
			]),
		);

		renderOverlay();

		// Must render provider_error card copy
		expect(screen.getByText(/couldn't reach the model/i)).toBeInTheDocument();
		// Must have a Retry affordance (ghost button)
		expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
	});

	it("renders notice card with role=alert (accessibility)", () => {
		mockOwnershipAndUser();
		vi.mocked(useThread).mockReturnValue(
			makeData([
				{
					id: "msg-alert-1",
					threadId: "t-overlay-ah3",
					senderId: MY_AGENT_ID,
					type: "plain",
					payload: {
						text: "Provider error.",
						notice: { kind: "provider_error" },
					},
					clientKey: "ck-alert-1",
					blockId: null,
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: NOW_ISO,
				},
			]),
		);

		renderOverlay();

		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("regular plain messages without notice render as normal chat (no guidance card)", () => {
		mockOwnershipAndUser();
		vi.mocked(useThread).mockReturnValue(
			makeData([
				{
					id: "msg-normal-1",
					threadId: "t-overlay-ah3",
					senderId: MY_AGENT_ID,
					type: "plain",
					payload: {
						text: "Hello! How can I help you today?",
					},
					clientKey: "ck-normal-1",
					blockId: null,
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: NOW_ISO,
				},
			]),
		);

		renderOverlay();

		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		expect(screen.getByText("Hello! How can I help you today?")).toBeInTheDocument();
	});
});

describe("AH3 §1.7b: crash-recovery — stale thinking state renders Retry card", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("thread whose last message is human AND older than ASSISTANT_TURN_TIMEOUT_MS shows Retry card (not spinner)", () => {
		mockOwnershipAndUser();
		// Last message is a human message, older than the timeout window
		vi.mocked(useThread).mockReturnValue(
			makeData([
				{
					id: "msg-stale-1",
					threadId: "t-overlay-ah3",
					senderId: MY_USER_ID,
					type: "plain",
					payload: { text: "Can you help me with this?" },
					clientKey: "ck-stale-1",
					blockId: null,
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: STALE_ISO,
				},
			]),
		);

		renderOverlay();

		// Must NOT show an infinite spinner
		expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();

		// Must show a Retry card (provider_error shape)
		// Either "try again" copy OR a retry button
		const hasRetry =
			screen.queryByRole("button", { name: /retry/i }) !== null ||
			screen.queryByText(/try again/i) !== null;
		expect(hasRetry).toBe(true);
	});

	it("thread whose last message is human AND within ASSISTANT_TURN_TIMEOUT_MS shows thinking indicator", () => {
		mockOwnershipAndUser();
		vi.mocked(useThread).mockReturnValue(
			makeData([
				{
					id: "msg-recent-1",
					threadId: "t-overlay-ah3",
					senderId: MY_USER_ID,
					type: "plain",
					payload: { text: "What do you think?" },
					clientKey: "ck-recent-1",
					blockId: null,
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: RECENT_ISO,
				},
			]),
		);

		renderOverlay();

		// Must show "thinking…" indicator (not the Retry card for a stale turn)
		expect(screen.getByText(/thinking/i)).toBeInTheDocument();
	});

	it("thread whose last message is from the assistant shows neither thinking nor Retry", () => {
		mockOwnershipAndUser();
		vi.mocked(useThread).mockReturnValue(
			makeData([
				{
					id: "msg-ast-1",
					threadId: "t-overlay-ah3",
					senderId: MY_USER_ID,
					type: "plain",
					payload: { text: "Help me." },
					clientKey: "ck-ast-0",
					blockId: null,
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: STALE_ISO,
				},
				{
					id: "msg-ast-2",
					threadId: "t-overlay-ah3",
					senderId: MY_AGENT_ID,
					type: "plain",
					payload: { text: "Sure, here is my answer." },
					clientKey: "ck-ast-1",
					blockId: null,
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: NOW_ISO,
				},
			]),
		);

		renderOverlay();

		// The assistant replied — no thinking indicator, no stale Retry
		expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
		expect(screen.getByText("Sure, here is my answer.")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Review fix: user-loading guard, no-agent Retry wiring, useThread "idle".
// ---------------------------------------------------------------------------

describe("Review fix: loading guard covers useCurrentUser too", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("user still loading + agents loaded shows the spinner, not the no-agent message", () => {
		vi.mocked(useCurrentUser).mockReturnValue({
			user: null,
			status: "loading",
			error: null,
			retry: vi.fn(),
		} as UseCurrentUserResult);
		vi.mocked(useAgents).mockReturnValue({
			agents: [],
			loading: false,
			error: null,
			refetch: vi.fn(),
		} as UseAgentsResult);
		vi.mocked(useThreads).mockReturnValue({
			status: "ready",
			threads: [],
			error: null,
			retry: vi.fn(),
		} as UseThreadsResult);
		vi.mocked(useThread).mockReturnValue({
			status: "loading",
			data: null,
			error: null,
			refresh: vi.fn(),
		} as UseThreadResult);

		const { container } = renderOverlay();

		expect(screen.queryByText(/couldn't find your assistant agent/i)).not.toBeInTheDocument();
		expect(container.querySelector(".loading-spinner")).not.toBeNull();
	});
});

describe("Review fix: no-agent Retry calls useAgents().refetch, not threadSearch.retry", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("shows the not-found message once the user is resolved and Retry refetches agents", async () => {
		const refetchAgents = vi.fn();
		const retryThreads = vi.fn();
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: MY_USER_ID, name: "Founder", email: "founder@example.com", avatarUrl: null },
			status: "ready",
			error: null,
			retry: vi.fn(),
		} as UseCurrentUserResult);
		vi.mocked(useAgents).mockReturnValue({
			agents: [],
			loading: false,
			error: null,
			refetch: refetchAgents,
		} as UseAgentsResult);
		vi.mocked(useThreads).mockReturnValue({
			status: "ready",
			threads: [],
			error: null,
			retry: retryThreads,
		} as UseThreadsResult);
		vi.mocked(useThread).mockReturnValue({
			status: "loading",
			data: null,
			error: null,
			refresh: vi.fn(),
		} as UseThreadResult);

		const user = userEvent.setup();
		renderOverlay();

		expect(screen.getByText(/couldn't find your assistant agent/i)).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: /retry/i }));

		expect(refetchAgents).toHaveBeenCalledOnce();
		expect(retryThreads).not.toHaveBeenCalled();
	});
});

describe("Review fix: useThread 'idle' status is the empty say-hello state, not loading", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders the compose-only empty state, not a spinner, when useThread reports 'idle'", () => {
		mockOwnershipAndUser();
		// No existing thread — overrides mockOwnershipAndUser's default thread row.
		vi.mocked(useThreads).mockReturnValue({
			status: "ready",
			threads: [],
			error: null,
			retry: vi.fn(),
		} as UseThreadsResult);
		// "idle" is the new terminal status for "no id given, nothing to open" —
		// cast through `unknown` since UseThreadStatus may not carry it yet.
		vi.mocked(useThread).mockReturnValue({
			status: "idle",
			data: null,
			error: null,
			refresh: vi.fn(),
		} as unknown as UseThreadResult);

		renderOverlay();

		expect(screen.getByText(/say something to start/i)).toBeInTheDocument();
		expect(screen.queryByText(/couldn't find your assistant agent/i)).not.toBeInTheDocument();
	});
});
