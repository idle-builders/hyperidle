/**
 * AK4 — AssistantOverlay BetCard rendering tests.
 *
 * Task 6:
 *   AC2: create_bet ok toolCall → renders skeleton then BetCard with goal title + click target
 *   AC4: edit_bet ok toolCall → card navigates to the same betId
 *   Task 7: create_bet error toolCall → renders error ToolCallRow, NO BetCard
 *
 * Tests mock:
 *   - useAssistantThread: supplies scripted message payloads
 *   - useBet: controls loading / data / error states
 *   - react-router-dom useNavigate: tracks navigation calls
 */

import type { Message } from "@hyperidle/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantThreadState } from "../../hooks/useAssistantThread.js";
import type { UseBetResult } from "../../hooks/useBet.js";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../../hooks/useAssistantThread.js", () => ({
	useAssistantThread: vi.fn(),
}));

vi.mock("../../hooks/useBet.js", () => ({
	useBet: vi.fn(),
}));

vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

// react-router-dom mock for navigation assertions
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		useNavigate: () => mockNavigate,
		Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
			<a href={to}>{children}</a>
		),
	};
});

import { useAssistantThread } from "../../hooks/useAssistantThread.js";
import { useBet } from "../../hooks/useBet.js";
import { AssistantOverlay } from "../../shell/AssistantOverlay.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW_ISO = new Date().toISOString();

const BASE_THREAD = {
	id: "t-overlay-ak4",
	hostKind: "user" as const,
	hostId: "u-founder",
	initiatorId: "u-founder",
	participants: ["u-founder", "ast-u-founder"],
	pinned: false,
	resolvedAt: null,
	lastActiveAt: NOW_ISO,
	createdAt: NOW_ISO,
};

const BASE_IDENTITIES = {
	"u-founder": { name: "Founder" },
	"ast-u-founder": { name: "Assistant", role: "assistant" },
};

function makeData(messages: ReadonlyArray<Record<string, unknown>>): AssistantThreadState {
	return {
		status: "ready" as const,
		data: {
			thread: BASE_THREAD,
			messages: messages as unknown as ReadonlyArray<Message>,
			identities: BASE_IDENTITIES,
		},
		error: null,
		retry: vi.fn(),
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

const BET_ID = "bet-ak4-draft-1";
const BET_TITLE = "Build a faster checkout flow";
const TEAM_NAME = "Alpha Team";

/** create_bet toolCall with status=ok */
function makeCreateBetMessage(betId: string): Record<string, unknown> {
	return {
		id: "msg-create-bet",
		threadId: "t-overlay-ak4",
		senderId: "ast-u-founder",
		type: "plain",
		payload: {
			text: "I've drafted that bet for you!",
			toolCalls: [
				{
					name: "create_bet",
					input: { description: BET_TITLE },
					output: JSON.stringify({ betId, status: "draft", teamId: "team-1" }),
					status: "ok",
				},
			],
		},
		clientKey: "ck-create-bet",
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: NOW_ISO,
	};
}

/** edit_bet toolCall with status=ok */
function makeEditBetMessage(betId: string): Record<string, unknown> {
	return {
		id: "msg-edit-bet",
		threadId: "t-overlay-ak4",
		senderId: "ast-u-founder",
		type: "plain",
		payload: {
			text: "I've updated the done condition!",
			toolCalls: [
				{
					name: "edit_bet",
					input: { doneCondition: "Ships in <3s" },
					output: JSON.stringify({ betId }),
					status: "ok",
				},
			],
		},
		clientKey: "ck-edit-bet",
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: NOW_ISO,
	};
}

/** create_bet toolCall with status=error (no team) */
function makeCreateBetErrorMessage(): Record<string, unknown> {
	return {
		id: "msg-create-bet-err",
		threadId: "t-overlay-ak4",
		senderId: "ast-u-founder",
		type: "plain",
		payload: {
			text: "I couldn't draft that — no team found for your account.",
			toolCalls: [
				{
					name: "create_bet",
					input: { description: "Should fail" },
					output: "Error [NO_TEAM]: No team found for this user — cannot create a draft bet.",
					status: "error",
				},
			],
		},
		clientKey: "ck-create-bet-err",
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: NOW_ISO,
	};
}

function makeUseBetLoading(): UseBetResult {
	return { data: null, loading: true, error: null, refresh: vi.fn() };
}

function makeUseBetData(betId: string): UseBetResult {
	return {
		data: {
			id: betId,
			title: BET_TITLE,
			team: TEAM_NAME,
			teamId: "team-1",
			status: "draft",
			description: "Checkout completes in <3s",
		} as import("../../types/bet.js").BetDetail,
		loading: false,
		error: null,
		refresh: vi.fn(),
	};
}

// ── AC2: create_bet ok → BetCard rendered ────────────────────────────────────

describe("AK4 AC2: create_bet ok toolCall → renders BetCard", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
		mockNavigate.mockReset();
	});

	it("shows skeleton while useBet is loading", () => {
		vi.mocked(useAssistantThread).mockReturnValue(makeData([makeCreateBetMessage(BET_ID)]));
		vi.mocked(useBet).mockReturnValue(makeUseBetLoading());

		renderOverlay();

		// Skeleton placeholder must be visible
		expect(screen.getByTestId("bet-draft-card-skeleton")).toBeInTheDocument();
		// BetCard title should NOT be visible yet
		expect(screen.queryByText(BET_TITLE)).not.toBeInTheDocument();
	});

	it("renders BetCard with goal title after useBet resolves", async () => {
		vi.mocked(useAssistantThread).mockReturnValue(makeData([makeCreateBetMessage(BET_ID)]));
		vi.mocked(useBet).mockReturnValue(makeUseBetData(BET_ID));

		renderOverlay();

		// BetCard title must be in the document
		await waitFor(() => {
			expect(screen.getByText(BET_TITLE)).toBeInTheDocument();
		});
	});

	it("useBet is called with the betId from the toolCall output", () => {
		vi.mocked(useAssistantThread).mockReturnValue(makeData([makeCreateBetMessage(BET_ID)]));
		vi.mocked(useBet).mockReturnValue(makeUseBetLoading());

		renderOverlay();

		// useBet must have been called with BET_ID
		expect(vi.mocked(useBet)).toHaveBeenCalledWith(BET_ID);
	});

	it("BetCard onClick navigates to /work/bets/:betId", async () => {
		const user = userEvent.setup();
		vi.mocked(useAssistantThread).mockReturnValue(makeData([makeCreateBetMessage(BET_ID)]));
		vi.mocked(useBet).mockReturnValue(makeUseBetData(BET_ID));

		renderOverlay();

		await waitFor(() => {
			expect(screen.getByText(BET_TITLE)).toBeInTheDocument();
		});

		// Click the BetCard title text — the BetCard's root div has the onClick handler
		const betTitle = screen.getByText(BET_TITLE);
		await user.click(betTitle);

		expect(mockNavigate).toHaveBeenCalledWith(`/work/bets/${BET_ID}`);
	});
});

// ── AC4: edit_bet ok → same betId navigates ───────────────────────────────────

describe("AK4 AC4: edit_bet ok toolCall → card navigates to same betId", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		mockNavigate.mockReset();
	});

	it("edit_bet ok toolCall → BetCard rendered with correct betId click target", async () => {
		const user = userEvent.setup();
		vi.mocked(useAssistantThread).mockReturnValue(makeData([makeEditBetMessage(BET_ID)]));
		vi.mocked(useBet).mockReturnValue(makeUseBetData(BET_ID));

		renderOverlay();

		await waitFor(() => {
			expect(screen.getByText(BET_TITLE)).toBeInTheDocument();
		});

		// useBet called with the same betId
		expect(vi.mocked(useBet)).toHaveBeenCalledWith(BET_ID);

		// Click the BetCard title — the BetCard's root div has the onClick handler
		const betTitle = screen.getByText(BET_TITLE);
		await user.click(betTitle);
		expect(mockNavigate).toHaveBeenCalledWith(`/work/bets/${BET_ID}`);
	});
});

// ── Task 7: create_bet error → no BetCard ─────────────────────────────────────

describe("AK4 Task 7: create_bet error toolCall → no BetCard rendered", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it("create_bet status=error → useBet NOT called, no BetCard in DOM", () => {
		vi.mocked(useAssistantThread).mockReturnValue(makeData([makeCreateBetErrorMessage()]));
		// useBet should not be called but mock it anyway
		vi.mocked(useBet).mockReturnValue(makeUseBetLoading());

		renderOverlay();

		// useBet must NOT be called with BET_ID for an error toolCall
		expect(vi.mocked(useBet)).not.toHaveBeenCalledWith(BET_ID);
		// No skeleton or card
		expect(screen.queryByTestId("bet-draft-card-skeleton")).not.toBeInTheDocument();
		expect(screen.queryByTestId("bet-draft-card")).not.toBeInTheDocument();
	});

	it("create_bet status=error → error ToolCallRow still rendered (never silent)", () => {
		vi.mocked(useAssistantThread).mockReturnValue(makeData([makeCreateBetErrorMessage()]));
		vi.mocked(useBet).mockReturnValue({
			data: null,
			loading: false,
			error: null,
			refresh: vi.fn(),
		});

		renderOverlay();

		// The ToolCallRow for the error must still be rendered
		const toolCallSummaries = screen.getByTestId("tool-call-summaries");
		expect(toolCallSummaries).toBeInTheDocument();
	});
});
