/**
 * AD8b — AssistantOverlay component tests.
 *
 * AC-7: The overlay renders artifacts and review messages (not just plain
 *       text). The coverage below proves ThreadShell renders.
 *
 * AC-8: Sidebar trigger is labeled "Assistant" (verified via aria-label).
 *
 * AC-9: Context can be attached (chips render when contextRefs is non-empty).
 *
 * @lore BC3: re-pointed off the deleted `useAssistantThread` onto
 * `useThread`/`useThreads`/`useAgents`/`useCurrentUser` — the overlay
 * resolves its own agent's direct thread via `useThreads({host:{kind:"agent"}})`
 * then reads it with `useThread(id)` (architecture.md §5 B6), same pattern as
 * `shell/__tests__/AH3-AssistantOverlay.notice.test.tsx`.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssistantContextRef } from "../contexts/AssistantContext";
import type { UseAgentsResult } from "../hooks/useAgents.js";
import type { UseCurrentUserResult } from "../hooks/useCurrentUser.js";
import type { UseThreadResult } from "../hooks/useThread.js";
import type { UseThreadsResult } from "../hooks/useThreads.js";

vi.mock("../hooks/useAgents.js", () => ({
	useAgents: vi.fn(),
}));
vi.mock("../hooks/useCurrentUser.js", () => ({
	useCurrentUser: vi.fn(),
}));
vi.mock("../hooks/useThread.js", () => ({
	useThread: vi.fn(),
}));
vi.mock("../hooks/useThreads.js", () => ({
	useThreads: vi.fn(),
}));

import { useAgents } from "../hooks/useAgents.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useThread } from "../hooks/useThread.js";
import { useThreads } from "../hooks/useThreads.js";
import { AssistantOverlay } from "../shell/AssistantOverlay";

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
		user: { id: MY_USER_ID, name: "You", email: "founder@example.com", avatarUrl: null },
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

// ---------------------------------------------------------------------------
// AC-8: Overlay renders with "Assistant" label (not "Coach" or "Chief of Staff")
// ---------------------------------------------------------------------------

describe("AD8b — AssistantOverlay open/close", () => {
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

	// SANCTIONED CHANGE #3 (AI2): AssistantOverlay migrates to useDialogBehavior with
	// layer="overlay" → --z-overlay (40). The old hardcoded z-30 class is gone.
	// Assert via data-dialog-layer attribute which getOverlayProps emits.
	// See architecture.md §Sanctioned assertion changes #3.
	it("overlay has data-dialog-layer='overlay' (--z-overlay = 40, above main, below modal)", () => {
		mockReadyOverlay();
		renderOverlay(true);
		const dialog = screen.getByRole("dialog");
		expect(dialog.getAttribute("data-dialog-layer")).toBe("overlay");
	});
});

// ---------------------------------------------------------------------------
// AC-7: ThreadShell renders the overlay's message thread.
// ---------------------------------------------------------------------------

describe("AD8b — AssistantOverlay message thread rendering", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders ThreadShell when overlay is open", () => {
		mockReadyOverlay();
		renderOverlay(true);
		expect(screen.getByTestId("thread-shell")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// AC-9: Context chips (unchanged from CocOverlay, now under AssistantContext)
// ---------------------------------------------------------------------------

describe("AD8b — AssistantOverlay context chips", () => {
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
