/**
 * L18 — WorkBet thread tests.
 *
 * AC coverage:
 *  - renders HostThreadSection with hostKind=bet
 *  - legacy bet-comment-thread testid is absent
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOCK_BETS } from "../../pages/__fixtures__/work-bet-fixtures";
import { WorkBet } from "../../pages/WorkBet";

// Mock HostThreadSection to focus on mount/unmount assertions
vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: ({ hostKind, hostId }: { hostKind: string; hostId: string }) => (
		<div data-testid="host-thread-section" data-host-kind={hostKind} data-host-id={hostId}>
			Thread Section
		</div>
	),
}));

function renderBet(id = "b1"): ReturnType<typeof render> {
	const bet = MOCK_BETS[id]!;
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${bet.id}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet overrideBet={bet} />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkBet thread (L18)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders HostThreadSection with hostKind=bet", () => {
		renderBet("b1");

		const section = screen.getByTestId("host-thread-section");
		expect(section).toBeInTheDocument();
		expect(section).toHaveAttribute("data-host-kind", "bet");
		expect(section).toHaveAttribute("data-host-id", "b1");
	});

	it("legacy bet-comment-thread testid is absent", () => {
		renderBet("b1");
		expect(screen.queryByTestId("bet-comment-thread")).not.toBeInTheDocument();
	});

	it("does not render the hardcoded Comments section", () => {
		renderBet("b1");
		// The old Comments <section> with hardcoded comments must be gone
		expect(screen.queryByRole("region", { name: /comments/i })).not.toBeInTheDocument();
	});
});
