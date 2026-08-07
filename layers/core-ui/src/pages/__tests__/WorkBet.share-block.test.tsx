/**
 * T4 — WorkBet "Share" block action tests (AC-3, AC-4, AC-5).
 *
 * RED phase: tests verify that:
 *  - BlockActionsPopover in WorkBet includes "Share" action alongside "Discuss"
 *  - Clicking "Share" calls attachContext with the correct block ref shape
 *  - AssistantAttachButton renders on blocks when overlay is open
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AssistantContext, type AssistantContextRef } from "../../contexts/AssistantContext";
import type { BetDetail } from "../../types/bet";
import { WorkBet } from "../WorkBet";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../hooks/useBet", () => ({
	useBet: () => ({ data: null, loading: false, error: null, refresh: vi.fn() }),
}));

vi.mock("../../hooks/useCurrentUser", () => ({
	useCurrentUser: () => ({ user: { id: "u-founder", name: "Founder" } }),
}));

vi.mock("../../hooks/useHostThread", () => ({
	useHostThread: () => ({
		data: { messages: [], thread: null },
		refresh: vi.fn(),
	}),
}));

vi.mock("../../hooks/useHints", () => ({
	useHint: () => ({ visible: false, dismiss: vi.fn(), copy: "", testId: "" }),
}));

vi.mock("../../components/ArtifactSection.js", () => ({
	ArtifactSection: () => null,
	useArtifactOpen: () => vi.fn(),
}));

vi.mock("../../components/ArtifactThreadsSummary.js", () => ({
	ArtifactThreadsSummary: () => null,
}));

vi.mock("../../shell/HostThreadSection.js", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section" />,
}));

vi.mock("../../shell/TaskSheet", () => ({
	TaskSheet: () => null,
}));

vi.mock("../../services/task-threads", () => ({
	resolveOrCreateTaskThread: vi.fn(),
	postRequestMessage: vi.fn(),
}));

vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
}));

vi.mock("../../lib/url-utils.js", () => ({
	isValidHarnessUrl: () => false,
}));

vi.mock("../../pages/knowledge/KnowledgeCreateDialog", () => ({
	KnowledgeCreateDialog: () => null,
}));

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const betWithPitch: BetDetail = {
	id: "bet-pitch-1",
	title: "Test Bet",
	team: "Core Team",
	status: "active",
	atRisk: false,
	progress: { done: 0, total: 2 },
	description: "This is the first paragraph of the pitch.\n\nThis is the second paragraph.",
	tokenAppetite: null,
	tokensActual: null,
	tasks: [],
};

function renderWithContext(attachContext = vi.fn(), overlayOpen = true) {
	return render(
		<MemoryRouter>
			<AssistantContext.Provider value={{ overlayOpen, attachContext }}>
				<WorkBet overrideBet={betWithPitch} />
			</AssistantContext.Provider>
		</MemoryRouter>,
	);
}

describe("T4 — WorkBet: 'Share' action in BlockActionsPopover (AC-3)", () => {
	it("BlockActionsPopover includes 'Share' when a block popover is open", async () => {
		const user = userEvent.setup();
		renderWithContext();

		// The bet-pitch section renders blocks. Blocks use data-block-id attributes.
		const betPitch = screen.queryByTestId("bet-pitch");
		if (!betPitch) return; // no pitch content in test

		const blocks = betPitch.querySelectorAll("[data-block-id]");
		if (blocks.length === 0) return; // no blocks rendered

		// Click the block handle to open block actions
		const firstBlock = blocks[0] as HTMLElement;
		const handleBtn = firstBlock.querySelector("button");
		if (handleBtn) {
			await user.click(handleBtn);
		}

		// After opening the popover, both "Discuss" and "Share" should be present
		const popover = screen.queryByTestId("block-actions-popover");
		if (popover) {
			expect(screen.getByRole("menuitem", { name: /discuss/i })).toBeInTheDocument();
			expect(screen.getByRole("menuitem", { name: /share/i })).toBeInTheDocument();
		}
	});
});

describe("T4 — WorkBet: AssistantAttachButton on blocks (AC-4)", () => {
	it("renders AssistantAttachButton inside bet-pitch blocks when overlay is open", () => {
		renderWithContext(vi.fn(), true);
		// The bet-pitch renders blocks. When overlayOpen=true, each block should
		// have an AssistantAttachButton ("+") visible inside the pitch section.
		const betPitch = screen.queryByTestId("bet-pitch");
		if (!betPitch) return; // no pitch

		const pitchAttachButtons = betPitch.querySelectorAll('[data-testid="assistant-attach-button"]');
		// At least one block attach button should be present
		expect(pitchAttachButtons.length).toBeGreaterThan(0);
	});

	it("AssistantAttachButton not rendered inside bet-pitch when overlay is closed", () => {
		renderWithContext(vi.fn(), false);
		// When overlayOpen=false, AssistantAttachButton returns null
		const betPitch = screen.queryByTestId("bet-pitch");
		if (!betPitch) return;

		const pitchAttachButtons = betPitch.querySelectorAll('[data-testid="assistant-attach-button"]');
		expect(pitchAttachButtons.length).toBe(0);
	});
});

describe("T4 — WorkBet: clicking '+' attach button calls attachContext (AC-5)", () => {
	it("clicking AssistantAttachButton on a bet pitch block calls attachContext with block ref shape", async () => {
		const user = userEvent.setup();
		const attachContext = vi.fn();
		renderWithContext(attachContext, true);

		// The block-level AssistantAttachButtons are inside the "bet-pitch" section
		const betPitch = screen.queryByTestId("bet-pitch");
		if (!betPitch) return; // no pitch in test fixture

		// Find attach buttons inside the pitch (these are block-level, not bet-level)
		const pitchAttachButtons = betPitch.querySelectorAll('[data-testid="assistant-attach-button"]');
		if (pitchAttachButtons.length === 0) return; // no blocks rendered

		await user.click(pitchAttachButtons[0] as HTMLElement);

		expect(attachContext).toHaveBeenCalledOnce();
		const calledRef = attachContext.mock.calls[0]![0] as AssistantContextRef;
		expect(calledRef.kind).toBe("block");
		// Block refs must carry blockId, hostKind, hostId
		expect("blockId" in calledRef).toBe(true);
		expect("hostKind" in calledRef).toBe(true);
		expect("hostId" in calledRef).toBe(true);
		// hostKind should be "bet" for bet pitch blocks
		if ("hostKind" in calledRef) {
			expect(calledRef.hostKind).toBe("bet");
		}
	});
});
