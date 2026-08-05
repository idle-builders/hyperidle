/**
 * AF16 T1 — WorkBet progress stat card correctness (RED).
 *
 * AC: zero-task bet shows "No tasks yet" (no NaN, no bar); populated shows NN%.
 * Z8-019, Z8-020.
 */
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WorkBet } from "../../pages/WorkBet";
import type { BetDetail } from "../../types/bet";

// Mock heavy sub-components to isolate the progress card.
vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section-mock" />,
}));
vi.mock("../../components/ArtifactThreadsSummary", () => ({
	ArtifactThreadsSummary: () => null,
}));
vi.mock("../../hooks/useHostThread", () => ({
	useHostThread: () => ({ data: null, error: null, isLoading: false, refresh: vi.fn() }),
}));

function makeBet(progress: BetDetail["progress"], overrides: Partial<BetDetail> = {}): BetDetail {
	return {
		id: "bet-progress-test",
		title: "Progress Test Bet",
		team: "Alpha Core",
		status: "active",
		atRisk: false,
		tokenAppetite: null,
		tokensActual: null,
		progress,
		description: "# Test",
		tasks: [],
		...overrides,
	};
}

function renderBet(bet: BetDetail): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${bet.id}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet overrideBet={bet} />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("AF16 T1 — WorkBet progress card", () => {
	it("zero-task bet: renders 'No tasks yet' in stats row, no NaN, no progress bar (Z8-019, Z8-020)", () => {
		renderBet(makeBet({ done: 0, total: 0 }));

		// Must not contain NaN
		const statsRow = document.querySelector("[data-testid='bet-stats-row']");
		expect(statsRow?.textContent).not.toContain("NaN");

		// Must show "No tasks yet" inside the stats row
		expect(statsRow?.textContent).toContain("No tasks yet");

		// Must NOT render a progress bar element inside stats row
		const progressBar = statsRow?.querySelector("[data-testid='bet-progress-bar']");
		expect(progressBar).toBeNull();
	});

	it("null progress: same as zero-task (no NaN, shows 'No tasks yet' in stats, no bar)", () => {
		renderBet(makeBet(undefined));

		const statsRow = document.querySelector("[data-testid='bet-stats-row']");
		expect(statsRow?.textContent).not.toContain("NaN");
		expect(statsRow?.textContent).toContain("No tasks yet");
	});

	it("50% progress: renders '50%' and a bar with 50% width", () => {
		renderBet(makeBet({ done: 2, total: 4 }));

		expect(screen.getByText("50%")).toBeTruthy();

		// Progress bar should exist with 50% width style
		const bar = document.querySelector("[data-testid='bet-progress-bar']") as HTMLElement | null;
		expect(bar).not.toBeNull();
		expect(bar?.style.width).toBe("50%");
	});

	it("100% progress: renders '100%'", () => {
		renderBet(makeBet({ done: 5, total: 5 }));
		expect(screen.getByText("100%")).toBeTruthy();
	});

	it("0/5 tasks: renders '0%' + bar (measured zero, not empty state)", () => {
		renderBet(makeBet({ done: 0, total: 5 }));
		expect(screen.getByText("0%")).toBeTruthy();
		// Bar should exist (denominator exists)
		const bar = document.querySelector("[data-testid='bet-progress-bar']");
		expect(bar).not.toBeNull();
	});
});
