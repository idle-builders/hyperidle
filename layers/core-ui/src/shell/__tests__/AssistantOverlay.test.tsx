/**
 * AssistantOverlay component tests: open/close, message thread rendering,
 * context chips, layout, and notice/crash-recovery rendering.
 *
 * @lore the overlay resolves its own agent's direct thread via useThreads({host:{kind:"agent"}}) then reads it with useThread(id) (architecture.md).
 *
 * @lore GET /api/agents carries ownerUserId directly — the overlay finds "my agent" off the same useAgents fetch every agent picker shares.
 */

import type { Message } from "@hyperidle/domain-model";
import { ASSISTANT_TURN_TIMEOUT_MS } from "@hyperidle/domain-model";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssistantContextRef } from "../../contexts/AssistantContext";
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
import { AssistantOverlay } from "../AssistantOverlay.js";

const MY_AGENT_ID = "agent-founder-assistant";
const MY_USER_ID = "u-founder";

const BASE_THREAD = {
	id: "thr-ast-u-founder",
	hostKind: "user" as const,
	hostId: MY_USER_ID,
	initiatorId: MY_USER_ID,
	members: [MY_USER_ID, MY_AGENT_ID],
	title: null,
	computedTitle: "Assistant",
	pinned: false,
	resolvedAt: null,
	deletedAt: null,
	lastActiveAt: "2026-06-09T10:00:00.000Z",
	createdAt: "2026-06-09T10:00:00.000Z",
};

/** Ready state: viewer resolved, one direct thread with their agent, no messages yet. */
function mockReadyOverlay(): void {
	vi.mocked(useCurrentUser).mockReturnValue({
		user: { id: MY_USER_ID, name: "You", avatarUrl: null },
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
	vi.mocked(useThread).mockReturnValue({
		status: "ready",
		data: {
			thread: BASE_THREAD,
			members: [
				{ id: MY_USER_ID, name: "You", role: "human", isAgent: false },
				{ id: MY_AGENT_ID, name: "Assistant", role: "assistant", isAgent: true },
			],
			messages: [],
			headMessageId: null,
			hostTitle: "Assistant",
		},
		error: null,
		refresh: vi.fn(),
	} as UseThreadResult);
}

const mockAnchorRef = createRef<HTMLButtonElement>();

function renderOverlay(
	open: boolean,
	contextRefs: ReadonlyArray<AssistantContextRef> = [],
	onClose = vi.fn(),
	onRemoveContextRef = vi.fn(),
): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<AssistantOverlay
				open={open}
				onClose={onClose}
				anchorRef={mockAnchorRef}
				contextRefs={contextRefs}
				onRemoveContextRef={onRemoveContextRef}
			/>
		</MemoryRouter>,
	);
}

describe("AssistantOverlay open/close", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders nothing when open=false", () => {
		renderOverlay(false);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("renders the overlay panel when open=true", () => {
		mockReadyOverlay();
		renderOverlay(true);
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("overlay has aria-label containing 'assistant'", () => {
		mockReadyOverlay();
		renderOverlay(true);
		expect(screen.getByRole("dialog", { name: /assistant/i })).toBeInTheDocument();
	});

	it("calls onClose when Escape is pressed", async () => {
		mockReadyOverlay();
		const user = userEvent.setup();
		const onClose = vi.fn();
		renderOverlay(true, [], onClose);
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalledOnce();
	});
});

describe("AssistantOverlay message thread rendering", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders ThreadShell when overlay is open", () => {
		mockReadyOverlay();
		renderOverlay(true);
		expect(screen.getByTestId("thread-shell")).toBeInTheDocument();
	});

	it("shows the assistant agent's own identity in the thread", () => {
		mockReadyOverlay();
		const { container } = renderOverlay(true);
		// The identity renders as an avatar with a title attribute — the visible
		// text content is abbreviated to initials, so query by title instead.
		const agentEl =
			container.querySelector("[title='Assistant']") ??
			container.querySelector("[aria-label*='Assistant' i]");
		expect(agentEl).toBeInTheDocument();
	});
});

describe("AssistantOverlay context chips", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders context chips when contextRefs is non-empty", () => {
		mockReadyOverlay();
		const contextRefs: ReadonlyArray<AssistantContextRef> = [
			{ kind: "task", id: "task-1", label: "Test Bet" },
		];
		renderOverlay(true, contextRefs);
		expect(screen.getByText("Test Bet")).toBeInTheDocument();
	});

	it("renders no context chips when contextRefs is empty", () => {
		mockReadyOverlay();
		renderOverlay(true, []);
		expect(screen.queryByTestId("assistant-context-chips")).not.toBeInTheDocument();
	});

	it("renders context chip container with correct data-testid", () => {
		mockReadyOverlay();
		const contextRefs: ReadonlyArray<AssistantContextRef> = [
			{ kind: "task", id: "task-1", label: "Fix bug" },
		];
		renderOverlay(true, contextRefs);
		expect(screen.getByTestId("assistant-context-chips")).toBeInTheDocument();
	});

	it("calls onRemoveContextRef when chip dismiss button is clicked", async () => {
		mockReadyOverlay();
		const user = userEvent.setup();
		const onRemoveContextRef = vi.fn();
		const contextRefs: ReadonlyArray<AssistantContextRef> = [
			{ kind: "task", id: "task-1", label: "My Bet" },
		];
		renderOverlay(true, contextRefs, vi.fn(), onRemoveContextRef);
		const dismissButton = screen.getByRole("button", { name: /remove|dismiss|×/i });
		await user.click(dismissButton);
		expect(onRemoveContextRef).toHaveBeenCalledWith(0);
	});
});

// ---------------------------------------------------------------------------
// Layout fixes: composer/message-list height, no duplicate "Assistant" header
// ---------------------------------------------------------------------------

describe("AssistantOverlay layout fixes", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("overlay bar contains no heading — ThreadShell banner is the only title", () => {
		mockReadyOverlay();
		renderOverlay(true);

		// The overlay's own bar used to have an <h2>Assistant</h2> which duplicated
		// ThreadShell's host banner. That h2 is now removed. The close button
		// is the only interactive element in the bar.
		const closeBtn = screen.getByRole("button", { name: /close assistant/i });
		expect(closeBtn).toBeInTheDocument();

		// No semantic headings — ThreadHostBanner renders non-heading text.
		const headings = screen.queryAllByRole("heading");
		expect(headings).toHaveLength(0);
	});

	it("ThreadShell mounts inside the overlay dialog", () => {
		mockReadyOverlay();
		renderOverlay(true);

		expect(screen.getByTestId("thread-shell")).toBeInTheDocument();
		expect(screen.getByRole("dialog", { name: /assistant conversation/i })).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Notice rendering: missing_harness / provider_error guidance,
// plus crash-recovery (stale thinking state)
// ---------------------------------------------------------------------------

const NOW_ISO = new Date().toISOString();
// A timestamp older than the turn timeout
const STALE_ISO = new Date(Date.now() - ASSISTANT_TURN_TIMEOUT_MS - 10_000).toISOString();
// A timestamp within the turn timeout window
const RECENT_ISO = new Date(Date.now() - 30_000).toISOString();

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

function renderNoticeOverlay() {
	return render(
		<AssistantOverlay
			open={true}
			onClose={vi.fn()}
			contextRefs={[]}
			onRemoveContextRef={vi.fn()}
		/>,
	);
}

describe("AssistantOverlay notice rendering", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders missing_harness guidance card naming Agent settings", () => {
		mockReadyOverlay();
		vi.mocked(useThread).mockReturnValue(
			makeData([
				{
					id: "msg-mh-1",
					threadId: BASE_THREAD.id,
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

		renderNoticeOverlay();

		// Must render guidance card for missing_harness
		expect(screen.getByText(/runtime not configured/i)).toBeInTheDocument();
		// Must have an affordance pointing to Agent settings
		expect(screen.getByText(/agent/i)).toBeInTheDocument();
	});

	it("renders provider_error guidance card with Retry ghost button", () => {
		mockReadyOverlay();
		vi.mocked(useThread).mockReturnValue(
			makeData([
				{
					id: "msg-pe-1",
					threadId: BASE_THREAD.id,
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

		renderNoticeOverlay();

		// Must render provider_error card copy
		expect(screen.getByText(/couldn't reach the model/i)).toBeInTheDocument();
		// Must have a Retry affordance (ghost button)
		expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
	});

	it("renders notice card with role=alert (accessibility)", () => {
		mockReadyOverlay();
		vi.mocked(useThread).mockReturnValue(
			makeData([
				{
					id: "msg-alert-1",
					threadId: BASE_THREAD.id,
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

		renderNoticeOverlay();

		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("regular plain messages without notice render as normal chat (no guidance card)", () => {
		mockReadyOverlay();
		vi.mocked(useThread).mockReturnValue(
			makeData([
				{
					id: "msg-normal-1",
					threadId: BASE_THREAD.id,
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

		renderNoticeOverlay();

		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		expect(screen.getByText("Hello! How can I help you today?")).toBeInTheDocument();
	});
});

describe("Crash-recovery: stale thinking state renders Retry card", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("thread whose last message is human AND older than ASSISTANT_TURN_TIMEOUT_MS shows Retry card (not spinner)", () => {
		mockReadyOverlay();
		// Last message is a human message, older than the timeout window
		vi.mocked(useThread).mockReturnValue(
			makeData([
				{
					id: "msg-stale-1",
					threadId: BASE_THREAD.id,
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

		renderNoticeOverlay();

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
		mockReadyOverlay();
		vi.mocked(useThread).mockReturnValue(
			makeData([
				{
					id: "msg-recent-1",
					threadId: BASE_THREAD.id,
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

		renderNoticeOverlay();

		// Must show "thinking…" indicator (not the Retry card for a stale turn)
		expect(screen.getByText(/thinking/i)).toBeInTheDocument();
	});

	it("thread whose last message is from the assistant shows neither thinking nor Retry", () => {
		mockReadyOverlay();
		vi.mocked(useThread).mockReturnValue(
			makeData([
				{
					id: "msg-ast-1",
					threadId: BASE_THREAD.id,
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
					threadId: BASE_THREAD.id,
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

		renderNoticeOverlay();

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

		const { container } = renderNoticeOverlay();

		expect(screen.queryByText(/couldn't find your assistant agent/i)).not.toBeInTheDocument();
		expect(container.querySelectorAll(".loading-spinner")).toHaveLength(1);
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
			user: { id: MY_USER_ID, name: "Founder", avatarUrl: null },
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
		renderNoticeOverlay();

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
		mockReadyOverlay();
		// No existing thread — overrides mockReadyOverlay's default thread row.
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

		renderNoticeOverlay();

		expect(screen.getByText(/say something to start/i)).toBeInTheDocument();
		expect(screen.queryByText(/couldn't find your assistant agent/i)).not.toBeInTheDocument();
	});
});
