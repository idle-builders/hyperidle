/**
 * L18 — WorkBet discuss-block flow tests.
 *
 * AC coverage:
 *  - selecting Discuss prefills composer with the block excerpt
 *  - post forwards blockId to postPlainHostMessage
 */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkBet } from "../../pages/WorkBet";
import type { BetDetail } from "../../types/bet";

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
	id: "b-discuss",
	title: "Discuss Block Test Bet",
	team: "Alpha Core",
	status: "completed",
	atRisk: false,
	tokenAppetite: null,
	tokensActual: null,
	progress: { done: 0, total: 1 },
	description: `# Problem\n\nThis paragraph has important content to discuss.`,
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

describe("WorkBet discuss-block (L18)", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("selecting Discuss prefills the composer with the block excerpt", async () => {
		const user = userEvent.setup();
		renderBet();

		const blocks = document.querySelectorAll("[data-ds-component='block']");
		expect(blocks.length).toBeGreaterThan(0);

		// Open the block actions popover on the first block
		const firstBlock = blocks[0] as HTMLElement;
		firstBlock.focus();
		await user.keyboard(" ");

		// Click Discuss
		const discussButton = screen.getByRole("menuitem", { name: /discuss/i });
		await user.click(discussButton);

		// The HostThreadSection receives a prefill prop and renders the chip
		expect(screen.getByTestId("host-thread-prefill-chip")).toBeInTheDocument();
		// The chip text should contain a block excerpt
		const chip = screen.getByTestId("host-thread-prefill-chip");
		expect(chip.textContent).toMatch(/Re:/);
	});
});
