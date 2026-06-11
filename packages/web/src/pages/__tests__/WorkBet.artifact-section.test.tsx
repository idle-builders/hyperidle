/**
 * L12 — WorkBet: ArtifactSection mount tests.
 *
 * AC coverage (B-1 from architecture-critique):
 *  - ArtifactSection is inserted BEFORE HostThreadSection (not after ArtifactThreadsSummary)
 *  - filter has axis="bet" and the betId
 *  - layout="stack", no limit
 *  - heading "Artifacts" is rendered
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOCK_BETS } from "../../pages/__fixtures__/work-bet-fixtures";
import { WorkBet } from "../../pages/WorkBet";

// Mock HostThreadSection
vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: ({ hostKind }: { hostKind: string }) => (
		<div data-testid="host-thread-section" data-host-kind={hostKind}>
			Thread Section
		</div>
	),
}));

// Mock ArtifactThreadsSummary
vi.mock("../../components/ArtifactThreadsSummary", () => ({
	ArtifactThreadsSummary: ({ betId }: { betId: string }) => (
		<div data-testid="artifact-threads-summary" data-bet-id={betId}>
			Artifact Threads Summary
		</div>
	),
}));

// Mock ArtifactSection to capture props.
// useArtifactOpen must also be exported since WorkBet calls it.
vi.mock("../../components/ArtifactSection", () => ({
	ArtifactSection: ({
		filter,
		layout,
		limit,
		heading,
	}: {
		filter: { axis: string; betId?: string };
		layout: string;
		limit?: number;
		heading?: string;
	}) => (
		<div
			data-testid="artifact-section"
			data-filter-axis={filter.axis}
			data-filter-bet-id={filter.axis === "bet" ? filter.betId : ""}
			data-layout={layout}
			data-limit={limit !== undefined ? String(limit) : "none"}
			data-heading={heading ?? ""}
		>
			ArtifactSection
		</div>
	),
	useArtifactOpen: () => vi.fn(),
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

describe("WorkBet ArtifactSection mount (L12)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("mounts ArtifactSection with bet filter and stack layout", () => {
		renderBet("b1");

		const section = screen.getByTestId("artifact-section");
		expect(section).toBeInTheDocument();
		expect(section).toHaveAttribute("data-filter-axis", "bet");
		expect(section).toHaveAttribute("data-filter-bet-id", "b1");
		expect(section).toHaveAttribute("data-layout", "stack");
	});

	it("does not pass a limit to ArtifactSection", () => {
		renderBet("b1");

		const section = screen.getByTestId("artifact-section");
		expect(section).toHaveAttribute("data-limit", "none");
	});

	it("passes heading='Artifacts' to ArtifactSection", () => {
		renderBet("b1");

		const section = screen.getByTestId("artifact-section");
		expect(section).toHaveAttribute("data-heading", "Artifacts");
	});

	it("ArtifactSection appears BEFORE HostThreadSection in DOM (B-1 fix)", () => {
		renderBet("b1");

		const section = screen.getByTestId("artifact-section");
		const thread = screen.getByTestId("host-thread-section");

		expect(section).toBeInTheDocument();
		expect(thread).toBeInTheDocument();

		// Verify DOM order: ArtifactSection comes before HostThreadSection
		// compareDocumentPosition: DOCUMENT_POSITION_FOLLOWING = 4
		const position = section.compareDocumentPosition(thread);
		// If section is before thread, thread follows section → DOCUMENT_POSITION_FOLLOWING
		expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});
});
