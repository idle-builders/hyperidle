/**
 * W3 — Work Pages surviving tests (AD9 migration).
 *
 * AC-13 (portfolio filter pills), AC-14 (team filter pills), AC-18 (bet grid) —
 * RETIRED with WorkPortfolio. Only WorkBet and BetCard tests survive.
 *
 * Surviving ACs:
 * AC-15: Bet cards have no status dots.
 * AC-16: Bet cards show description, progress bar, avatar group, budget badge.
 * AC-19: Overflow action menu "..." in bet detail header.
 * AC-20: Stat cards row in bet detail.
 * AC-21: "Pitch" section with Edit button in bet detail.
 * AC-22: Task rows clickable, no table, status badge not dot.
 * AC-25: Bet detail content max-width 800px, centered.
 */

import { BetCard } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { MOCK_BETS } from "../../pages/__fixtures__/work-bet-fixtures";
import { WorkBet } from "../../pages/WorkBet";
import type { BetDetail } from "../../types/bet";

// Mocks for WorkBet
vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section-mock" />,
}));
vi.mock("../../components/ArtifactThreadsSummary", () => ({
	ArtifactThreadsSummary: () => null,
}));
vi.mock("../../hooks/useHostThread", () => ({
	useHostThread: () => ({ data: null, error: null, isLoading: false, refresh: vi.fn() }),
}));

function renderBet(betId = "b1"): ReturnType<typeof render> {
	const bet = MOCK_BETS[betId]!;
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${bet.id}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet overrideBet={bet} />} />
				<Route
					path="/work/bet/:betId/task/:taskId"
					element={<div data-testid="task-detail-page" />}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

// ---------------------------------------------------------------------------
// AC-15: Bet cards have no status dots
// ---------------------------------------------------------------------------
describe("W3 AC-15 — BetCard has no status dots", () => {
	it("BetCard does not render a status dot element", () => {
		render(
			<BetCard
				title="Test Bet"
				team="Alpha Core"
				status="active"
				appetite="$2k"
				description="A description"
				progress={{ done: 3, total: 8 }}
				budgetLabel="$200"
			/>,
		);
		// No status dot element
		const dot = document.querySelector("[class*='status-dot'], [data-status-dot], .dot");
		expect(dot).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC-16: BetCard shows description, progress bar, avatar group, budget badge
// ---------------------------------------------------------------------------
describe("W3 AC-16 — BetCard extended props", () => {
	it("renders description text", () => {
		render(
			<BetCard
				title="Test Bet"
				team="Alpha Core"
				status="active"
				appetite="$2k"
				description="Migrate auth to JWT."
			/>,
		);
		expect(screen.getByText("Migrate auth to JWT.")).toBeInTheDocument();
	});

	it("renders a progress bar when progress prop provided", () => {
		const { container } = render(
			<BetCard title="Test Bet" team="Alpha Core" status="active" appetite="$2k" progress={37} />,
		);
		const progressBar = container.querySelector(
			"[role='progressbar'], progress, [data-progress-bar]",
		);
		expect(progressBar).not.toBeNull();
	});

	it("renders progress percentage label", () => {
		render(
			<BetCard title="Test Bet" team="Alpha Core" status="active" appetite="$2k" progress={37} />,
		);
		expect(screen.getByText("37%")).toBeInTheDocument();
	});

	it("renders avatar group when avatarGroup prop provided", () => {
		render(
			<BetCard
				title="Test Bet"
				team="Alpha Core"
				status="active"
				appetite="$2k"
				avatarGroup={[{ initials: "JD" }, { initials: "AS", agent: true }]}
			/>,
		);
		// Avatar initials visible
		expect(screen.getByText("JD")).toBeInTheDocument();
		expect(screen.getByText("AS")).toBeInTheDocument();
	});

	it("renders budget badge when budgetLabel prop provided", () => {
		render(
			<BetCard
				title="Test Bet"
				team="Alpha Core"
				status="active"
				appetite="$2k"
				budgetLabel="$200 / $2k"
			/>,
		);
		expect(screen.getByText("$200 / $2k")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// AC-19: Overflow action menu in bet detail header
// ---------------------------------------------------------------------------
describe("W3 AC-19 — Bet detail overflow action menu", () => {
	it("renders a '...' overflow button in the header", () => {
		renderBet();
		// The overflow button replaces inline action buttons
		const overflowBtn = screen.getByRole("button", { name: /more actions|overflow|\.\.\.|⋯/i });
		expect(overflowBtn).toBeInTheDocument();
	});

	it("does NOT render inline Pause/Kill/Unblock/Adjust buttons in active state", () => {
		// These are now inside the overflow dropdown, not inline
		const activeBet: BetDetail = {
			...MOCK_BETS.b1!,
			status: "active" as const,
		};
		render(
			<MemoryRouter initialEntries={[`/work/bet/${activeBet.id}`]}>
				<Routes>
					<Route path="/work/bet/:betId" element={<WorkBet overrideBet={activeBet} />} />
				</Routes>
			</MemoryRouter>,
		);
		// Inline action buttons should not be in the header bar directly
		// They live inside the dropdown/popover instead
		const pauseInlineBtn = document.querySelector(
			"[data-bet-action='pause']:not([data-dropdown-item])",
		);
		expect(pauseInlineBtn).toBeNull();
	});

	it("overflow dropdown shows Kill after clicking '...' (Pause removed in AD5)", async () => {
		const user = userEvent.setup();
		const activeBet: BetDetail = { ...MOCK_BETS.b1!, status: "active" as const };
		render(
			<MemoryRouter initialEntries={[`/work/bet/${activeBet.id}`]}>
				<Routes>
					<Route path="/work/bet/:betId" element={<WorkBet overrideBet={activeBet} />} />
				</Routes>
			</MemoryRouter>,
		);
		const overflowBtn = screen.getByRole("button", { name: /more actions|overflow|\.\.\.|⋯/i });
		await user.click(overflowBtn);
		expect(screen.queryByText(/pause/i)).toBeNull();
		expect(screen.getAllByText(/kill/i).length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// AC-20: Stat cards row in bet detail
// ---------------------------------------------------------------------------
describe("W3 AC-20 — Stat cards row in bet detail", () => {
	it("renders a stats row with progress stat card", () => {
		renderBet();
		const statsRow = document.querySelector("[data-testid='bet-stats-row']");
		expect(statsRow).not.toBeNull();
	});

	it("renders Progress stat card", () => {
		renderBet();
		const statsRow = document.querySelector("[data-testid='bet-stats-row']");
		expect(statsRow).not.toBeNull();
		expect(statsRow?.textContent).toMatch(/progress/i);
	});

	// @lore AU21 Increment 14a: "renders Budget spent stat card" is
	// HARD-DELETED — the Budget stat card is gone along with the rest of the
	// cost-cap feature, no replacement.

	it("renders Team stat card", () => {
		renderBet();
		// Team card with member count
		const statsRow = document.querySelector("[data-testid='bet-stats-row']");
		expect(statsRow).not.toBeNull();
		const teamCard = statsRow?.querySelector("[data-stat-card='team']");
		expect(teamCard).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC-21: "Pitch" section with Edit button
// ---------------------------------------------------------------------------
describe("W3 AC-21 — Pitch section with Edit button", () => {
	it("renders a 'PITCH' section title", () => {
		renderBet();
		expect(screen.getByText(/pitch/i)).toBeInTheDocument();
	});

	it("hides edit controls for completed bets (pitch is immutable)", () => {
		renderBet();
		const indicator = document.querySelector("[data-testid='pitch-save-indicator']");
		expect(indicator).toBeNull();
		const editBtn = document.querySelector("[data-bet-action='edit-pitch']");
		expect(editBtn).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC-22: Task rows (no table, clickable, status badge not dot)
// ---------------------------------------------------------------------------
describe("W3 AC-22 — Task rows in bet detail", () => {
	it("does NOT render a <table> element for tasks", () => {
		renderBet("b1");
		// Tasks should be in a flat list, not a table
		expect(document.querySelector("table")).toBeNull();
	});

	it("renders task rows as clickable divs/buttons", () => {
		// b1 has tasks; verify they render as clickable rows
		renderBet("b1");
		const taskRows = document.querySelectorAll("[data-testid='task-row']");
		// At least one task row for bet b1
		expect(taskRows.length).toBeGreaterThan(0);
	});

	// UI-080: task rows are now <a href> links so ⌘-click / middle-click work natively.
	// In jsdom + MemoryRouter, <a href> clicks don't trigger SPA navigation; the correct
	// assertion is that each row has an href pointing to the task detail route.
	it("task row is an anchor link with href to task detail route", () => {
		const betWithTask: BetDetail = {
			...MOCK_BETS.b1!,
			tasks: [
				{
					id: "t1",
					title: "Implement login",
					owner: "Dev Agent 1",
					state: "in_progress" as const,
				},
			],
		};

		render(
			<MemoryRouter initialEntries={[`/work/bet/${betWithTask.id}`]}>
				<Routes>
					<Route path="/work/bet/:betId" element={<WorkBet overrideBet={betWithTask} />} />
				</Routes>
			</MemoryRouter>,
		);

		const taskRow = document.querySelector("[data-testid='task-row']");
		expect(taskRow).not.toBeNull();
		expect(taskRow?.tagName.toLowerCase()).toBe("a");
		// href must point to the task detail route
		expect(taskRow?.getAttribute("href")).toMatch(/\/work\/bet\/.+\/task\/.+/);
	});
});

// ---------------------------------------------------------------------------
// AC-25: Bet detail content max-width 960px (workbench lane), left-aligned in page frame.
// FR-5: upgraded from 800px to 960px to use the workbench lane for richer bet detail.
// ---------------------------------------------------------------------------
describe("W3 AC-25 — Bet detail max-width 960px", () => {
	it("bet detail body keeps 960px measure and starts in the page frame", () => {
		renderBet();
		const detailBody = document.querySelector("[data-testid='bet-detail-body']");
		expect(detailBody).not.toBeNull();
		expect(detailBody?.className).toMatch(/max-w-\[960px\]/);
		expect(detailBody?.className).not.toMatch(/mx-auto/);
		expect(detailBody?.closest("[data-page-frame]")).not.toBeNull();
	});
});
