/**
 * L18 — WorkBet artifact thread summary tests.
 *
 * AC coverage:
 *  - summary section appears below the bet thread on WorkBet
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOCK_BETS } from "../../pages/__fixtures__/work-bet-fixtures";
import { WorkBet } from "../../pages/WorkBet";

vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: ({ hostKind }: { hostKind: string }) => (
		<div data-testid="host-thread-section" data-host-kind={hostKind}>
			Thread Section
		</div>
	),
}));

vi.mock("../../components/ArtifactThreadsSummary", () => ({
	ArtifactThreadsSummary: ({ betId }: { betId: string }) => (
		<div data-testid="artifact-threads-summary" data-bet-id={betId}>
			Artifact Threads Summary
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

describe("WorkBet artifact thread summary (L18)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("summary section appears below the bet thread", () => {
		renderBet("b1");

		const betThread = screen.getByTestId("host-thread-section");
		const summary = screen.getByTestId("artifact-threads-summary");

		expect(betThread).toBeInTheDocument();
		expect(summary).toBeInTheDocument();
		expect(summary).toHaveAttribute("data-bet-id", "b1");

		// Verify DOM order: thread section comes before summary
		const allItems = screen.getAllByTestId(/host-thread-section|artifact-threads-summary/);
		const threadIdx = allItems.findIndex(
			(el) => el.getAttribute("data-testid") === "host-thread-section",
		);
		const summaryIdx = allItems.findIndex(
			(el) => el.getAttribute("data-testid") === "artifact-threads-summary",
		);
		expect(threadIdx).toBeLessThan(summaryIdx);
	});
});
