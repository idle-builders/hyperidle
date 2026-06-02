/**
 * W3 — Work Pages AC-13 through AC-25: Red phase tests.
 *
 * AC-13: Status filter tabs (All/Active/Completed/Draft) as horizontal pills in portfolio header.
 * AC-14: Team pill filters (styling: border + text, not filled).
 * AC-15: Bet cards have no status dots.
 * AC-16: Bet cards show description, progress bar, avatar group, budget badge.
 * AC-17: "New bet" button in header.
 * AC-18: Bet grid max-width 960px, centered.
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
import { WorkPortfolio } from "../../pages/WorkPortfolio";

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

// Mocks for WorkPortfolio
vi.mock("../../hooks/useBets", () => ({
	useBets: () => ({
		bets: [
			{
				id: "b1",
				title: "User Auth Flow",
				teamId: "t1",
				team: "Alpha Core",
				status: "active",
				appetite: "$2k",
				description: "Migrate auth to JWT with refresh rotation.",
				progress: { done: 3, total: 8 },
				budget: "$200",
			},
		],
		loading: false,
		refresh: vi.fn(),
	}),
}));
vi.mock("../../hooks/useTeams", () => ({
	useTeams: () => ({
		data: { teams: [{ id: "t1", name: "Alpha Core" }] },
		loading: false,
		error: null,
	}),
}));

function renderPortfolio(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/work/portfolio"]}>
			<Routes>
				<Route path="/work/portfolio" element={<WorkPortfolio />} />
			</Routes>
		</MemoryRouter>,
	);
}

function renderBet(betId = "b1"): ReturnType<typeof render> {
	const bet = MOCK_BETS[betId];
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
// AC-13: Status filter tabs in portfolio
// ---------------------------------------------------------------------------
describe("W3 AC-13 — Status filter pills in portfolio header", () => {
	it("renders All/Active/Completed/Draft status filter pills", () => {
		renderPortfolio();
		// All four status filter options must be present
		expect(screen.getByRole("button", { name: /^all$/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /^active$/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /^completed$/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /^draft$/i })).toBeInTheDocument();
	});

	it("status filter pills are in the content header (not in sidebar)", () => {
		renderPortfolio();
		const statusAll = screen.getByRole("button", { name: /^all$/i });
		// The pills must live in the content area, not in a sidebar nav
		const portfolioPage = document.querySelector("[data-testid='work-portfolio-page']");
		expect(portfolioPage).toContainElement(statusAll);
	});

	it("clicking Active filters bets by active status", async () => {
		const user = userEvent.setup();
		renderPortfolio();
		await user.click(screen.getByRole("button", { name: /^active$/i }));
		// After filter, only active bets shown — the active button should be pressed/selected
		const activeBtn = screen.getByRole("button", { name: /^active$/i });
		expect(activeBtn).toHaveAttribute("aria-pressed", "true");
	});
});

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
// AC-18: Bet grid max-width 960px, centered
// ---------------------------------------------------------------------------
describe("W3 AC-18 — Bet grid max-width 960px", () => {
	it("bet-grid container has max-width 960px class", () => {
		renderPortfolio();
		const grid = document.querySelector("[data-testid='bet-grid']");
		expect(grid).not.toBeNull();
		// Should have max-w-[960px] and mx-auto
		expect(grid?.className).toMatch(/max-w-\[960px\]/);
		expect(grid?.className).toMatch(/mx-auto/);
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
		const activeBet = {
			...MOCK_BETS.b1,
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

	it("overflow dropdown shows Pause/Adjust appetite/Unblock/Kill after clicking '...'", async () => {
		const user = userEvent.setup();
		const activeBet = { ...MOCK_BETS.b1, status: "active" as const };
		render(
			<MemoryRouter initialEntries={[`/work/bet/${activeBet.id}`]}>
				<Routes>
					<Route path="/work/bet/:betId" element={<WorkBet overrideBet={activeBet} />} />
				</Routes>
			</MemoryRouter>,
		);
		const overflowBtn = screen.getByRole("button", { name: /more actions|overflow|\.\.\.|⋯/i });
		await user.click(overflowBtn);
		// The dropdown shows the action buttons; use getAllByText since dialog headings share text
		expect(screen.getAllByText(/pause/i).length).toBeGreaterThan(0);
		expect(screen.getAllByText(/adjust appetite/i).length).toBeGreaterThan(0);
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
		expect(screen.getByText(/progress/i)).toBeInTheDocument();
	});

	it("renders Budget spent stat card", () => {
		renderBet();
		expect(screen.getByText(/budget/i)).toBeInTheDocument();
	});

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

	it("renders an Edit button in the Pitch section", () => {
		renderBet();
		const pitchSection = document.querySelector("[data-testid='bet-pitch-section']");
		expect(pitchSection).not.toBeNull();
		const editBtn = pitchSection?.querySelector("button");
		expect(editBtn).not.toBeNull();
		expect(editBtn?.textContent).toMatch(/edit/i);
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

	it("clicking a task row navigates to task detail route", async () => {
		const user = userEvent.setup();
		const betWithTask = {
			...MOCK_BETS.b1,
			tasks: [
				{
					id: "t1",
					title: "Implement login",
					owner: "Dev Agent 1",
					state: "in_progress" as const,
					costActual: null,
				},
			],
		};

		render(
			<MemoryRouter initialEntries={[`/work/bet/${betWithTask.id}`]}>
				<Routes>
					<Route path="/work/bet/:betId" element={<WorkBet overrideBet={betWithTask} />} />
					<Route
						path="/work/bet/:betId/task/:taskId"
						element={<div data-testid="task-detail-page" />}
					/>
				</Routes>
			</MemoryRouter>,
		);

		const taskRow = document.querySelector("[data-testid='task-row']");
		if (taskRow) {
			await user.click(taskRow as HTMLElement);
		}
		// After clicking, MemoryRouter navigates to the task detail route
		expect(document.querySelector("[data-testid='task-detail-page']")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// AC-25: Bet detail content max-width 800px, centered
// ---------------------------------------------------------------------------
describe("W3 AC-25 — Bet detail max-width 800px", () => {
	it("bet detail body container has max-w-[800px] and mx-auto", () => {
		renderBet();
		const detailBody = document.querySelector("[data-testid='bet-detail-body']");
		expect(detailBody).not.toBeNull();
		expect(detailBody?.className).toMatch(/max-w-\[800px\]/);
		expect(detailBody?.className).toMatch(/mx-auto/);
	});
});
