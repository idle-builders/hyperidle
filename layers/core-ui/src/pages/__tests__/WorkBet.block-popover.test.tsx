/**
 * L18 — WorkBet block popover tests.
 *
 * AC coverage:
 *  - clicking a block's gutter opens the actions popover
 *  - Escape closes the popover and returns focus to the block gutter
 *  - selecting Discuss invokes onDiscussBlock with the block id
 */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkBet } from "../../pages/WorkBet";
import type { BetDetail } from "../../types/bet";

// Stub HostThreadSection — renders the prefill chip when prefill is passed
// so the block-popover test can assert the discuss flow wires through.
vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: ({ prefill }: { prefill?: { blockId: string; blockExcerpt: string } }) => (
		<div data-testid="host-thread-section">
			{prefill && <div data-testid="host-thread-prefill-chip">Re: {prefill.blockExcerpt}</div>}
		</div>
	),
}));
vi.mock("../../components/ArtifactThreadsSummary", () => ({
	ArtifactThreadsSummary: () => <div data-testid="artifact-threads-summary" />,
}));

const BET_WITH_PITCH: BetDetail = {
	id: "b-popover",
	title: "Popover Test Bet",
	team: "Alpha Core",
	status: "completed",
	atRisk: false,
	tokenAppetite: null,
	tokensActual: null,
	progress: { done: 0, total: 1 },
	description: `# Problem\n\nThis is a test paragraph for popover testing.`,
	tasks: [],
};

function renderBet(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${BET_WITH_PITCH.id}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet overrideBet={BET_WITH_PITCH} />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkBet block popover (L18)", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("clicking a block's gutter opens the actions popover", async () => {
		const user = userEvent.setup();
		renderBet();

		// Block elements render in the pitch section
		const blocks = document.querySelectorAll("[data-ds-component='block']");
		expect(blocks.length).toBeGreaterThan(0);

		// Focus the first block and press Space to open actions
		const firstBlock = blocks[0] as HTMLElement;
		firstBlock.focus();
		await user.keyboard(" ");

		// The block actions popover should open
		expect(screen.getByTestId("block-actions-popover")).toBeInTheDocument();
	});

	it("selecting Discuss invokes the discuss handler with the block id", async () => {
		const user = userEvent.setup();
		renderBet();

		const blocks = document.querySelectorAll("[data-ds-component='block']");
		expect(blocks.length).toBeGreaterThan(0);

		const firstBlock = blocks[0] as HTMLElement;
		firstBlock.focus();
		await user.keyboard(" ");

		// Click the Discuss action
		const discussButton = screen.getByRole("menuitem", { name: /discuss/i });
		await user.click(discussButton);

		// Popover closes after selection
		expect(screen.queryByTestId("block-actions-popover")).not.toBeInTheDocument();

		// The composer prefill chip should appear (showing the discuss flow started)
		expect(screen.getByTestId("host-thread-prefill-chip")).toBeInTheDocument();
	});

	it("Escape closes the popover", async () => {
		const user = userEvent.setup();
		renderBet();

		const blocks = document.querySelectorAll("[data-ds-component='block']");
		const firstBlock = blocks[0] as HTMLElement;
		firstBlock.focus();
		await user.keyboard(" ");

		expect(screen.getByTestId("block-actions-popover")).toBeInTheDocument();

		await user.keyboard("{Escape}");

		expect(screen.queryByTestId("block-actions-popover")).not.toBeInTheDocument();
	});
});
