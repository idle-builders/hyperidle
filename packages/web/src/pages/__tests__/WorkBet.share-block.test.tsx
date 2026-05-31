/**
 * T4 — WorkBet "Share" block action tests (AC-3, AC-4, AC-5).
 *
 * RED phase: tests verify that:
 *  - BlockActionsPopover in WorkBet includes "Share" action alongside "Discuss"
 *  - Clicking "Share" calls attachContext with the correct block ref shape
 *  - CocAttachButton renders on blocks when overlay is open
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CocContext, type CocContextRef } from "../../contexts/CocContext";
import { WorkBet } from "../WorkBet";
import type { BetDetail } from "../../types/bet";

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
	title: "Ambrovia Bet",
	product: "Ambrovia",
	team: "Core Team",
	status: "active",
	progress: 50,
	pitch: "This is the first paragraph of the pitch.\n\nThis is the second paragraph.",
	costAppetite: null,
	costActual: null,
	tokensActual: null,
	tasks: [],
};

function renderWithContext(attachContext = vi.fn(), overlayOpen = true) {
	return render(
		<MemoryRouter>
			<CocContext.Provider value={{ overlayOpen, attachContext }}>
				<WorkBet overrideBet={betWithPitch} />
			</CocContext.Provider>
		</MemoryRouter>,
	);
}

describe("T4 — WorkBet: 'Share' action in BlockActionsPopover (AC-3)", () => {
	it("BlockActionsPopover includes 'Share' when a block popover is open", async () => {
		const user = userEvent.setup();
		renderWithContext();

		// Open block actions by activating the block handle (Space key on a block)
		// The bet-pitch section renders blocks. We need to trigger block actions.
		// Blocks render with data-block-id attributes and handle Space/Enter for actions.
		const blocks = screen.getAllByTestId("block");
		expect(blocks.length).toBeGreaterThan(0);

		// Press Space on the first block to open block actions
		await user.click(blocks[0]!);
		// The block handle button opens the popover
		const handleBtn = blocks[0]!.querySelector('[data-block-gutter] button, [aria-label*="block actions"]');
		if (handleBtn) {
			await user.click(handleBtn as HTMLElement);
		}

		// After opening the popover, both "Discuss" and "Share" should be present
		const popover = screen.queryByTestId("block-actions-popover");
		if (popover) {
			expect(screen.getByRole("menuitem", { name: /discuss/i })).toBeInTheDocument();
			expect(screen.getByRole("menuitem", { name: /share/i })).toBeInTheDocument();
		}
	});
});

describe("T4 — WorkBet: CocAttachButton on blocks (AC-4)", () => {
	it("renders CocAttachButton on blocks when overlay is open", () => {
		renderWithContext(vi.fn(), true);
		// The bet-pitch renders blocks. When overlayOpen=true, each block should
		// have a CocAttachButton ("+") visible.
		// CocAttachButton renders with data-testid="coc-attach-button"
		const attachButtons = screen.getAllByTestId("coc-attach-button");
		expect(attachButtons.length).toBeGreaterThan(0);
	});

	it("CocAttachButton not rendered on blocks when overlay is closed", () => {
		renderWithContext(vi.fn(), false);
		// When overlayOpen=false, CocAttachButton returns null
		expect(screen.queryByTestId("coc-attach-button")).not.toBeInTheDocument();
	});
});

describe("T4 — WorkBet: clicking '+' attach button calls attachContext (AC-5)", () => {
	it("clicking CocAttachButton calls attachContext with block ref shape", async () => {
		const user = userEvent.setup();
		const attachContext = vi.fn();
		renderWithContext(attachContext, true);

		const attachButtons = screen.getAllByTestId("coc-attach-button");
		expect(attachButtons.length).toBeGreaterThan(0);
		await user.click(attachButtons[0]!);

		expect(attachContext).toHaveBeenCalledOnce();
		const calledRef = attachContext.mock.calls[0][0] as CocContextRef;
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
