/**
 * F1 + F2 (POLISH-060) — WorkTeam: flush lists + create-bet button.
 *
 * F1: routines and agents ItemLists use variant="flush" (no grey container);
 *     active bets use Row/ItemList flush (no hand-rolled grey BetRow button);
 *     StatTile drops bg-[var(--surface-container)] (uses border instead).
 *
 * F2: Active Bets SectionLabel has a "+ New bet" button that navigates to /work/bet/new.
 */

import type { TeamDetail } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTeam } from "../WorkTeam";

vi.mock("../../components/ArtifactSection.js", () => ({
	ArtifactSection: () => null,
	useArtifactOpen: () => vi.fn(),
}));

const mockApiFetch = vi.fn();
vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock("../../shell/ToastRegion.js", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEAM_WITH_BETS: TeamDetail = {
	team: {
		id: "f1-team-1",
		name: "F1 Test Team",
		phase: "build",
		status: "healthy",
		leadAgentId: null,
	},
	teamMembers: {
		id: "tm-f1",
		formedAt: "2026-01-01T00:00:00.000Z",
		dissolvedAt: null,
	},
	roster: [],
	burn: {
		capacity: 3,
	},
	tasksInProgress: [
		{
			id: "bet-1",
			title: "Ship the MVP",
			state: "in_progress" as const,
			progressDone: 2,
			progressTotal: 5,
		},
	],
};

const TEAM_EMPTY: TeamDetail = {
	...TEAM_WITH_BETS,
	tasksInProgress: [],
	roster: [],
	burn: { ...TEAM_WITH_BETS.burn },
};

function renderWithRouter(ui: ReactNode, path = "/work/team/f1-team-1"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<Routes>
				<Route path="/work/team/:teamId" element={ui} />
				{/* @lore BB1: bet route replaced by task route */}
				<Route path="/work/task/new" element={<div data-testid="task-new-page">New Task</div>} />
				<Route path="*" element={ui} />
			</Routes>
		</MemoryRouter>,
	);
}

function makeHintResponse(): Response {
	return new Response(JSON.stringify({ dismissed: [] }), { status: 200 });
}

function makeAgentsResponse(): Response {
	return new Response(JSON.stringify([]), { status: 200 });
}

// ---------------------------------------------------------------------------
// F1 — flush variant: no grey container on routines/agents/bets
// ---------------------------------------------------------------------------

describe("WorkTeam lists use flush variant (no grey container)", () => {
	beforeEach(() => {
		mockApiFetch.mockImplementation(() => {
			return Promise.resolve(makeHintResponse());
		});
		global.fetch = vi.fn().mockResolvedValue(makeHintResponse());
	});

	afterEach(() => {
		vi.restoreAllMocks();
		mockApiFetch.mockReset();
	});

	it("routines section renders an ItemList (present in DOM)", async () => {
		mockApiFetch.mockReturnValue(Promise.resolve(makeAgentsResponse()));
		renderWithRouter(<WorkTeam overrideData={TEAM_EMPTY} skipArtifacts />);
		await waitFor(() => {
			expect(screen.getByTestId("team-routines")).toBeInTheDocument();
		});
	});

	it("agents section renders (present in DOM)", async () => {
		mockApiFetch.mockReturnValue(Promise.resolve(makeAgentsResponse()));
		renderWithRouter(<WorkTeam overrideData={TEAM_EMPTY} skipArtifacts />);
		await waitFor(() => {
			expect(screen.getByTestId("team-agents")).toBeInTheDocument();
		});
	});

	it("active bet row renders the bet title (Row-based, not grey button)", async () => {
		mockApiFetch.mockReturnValue(Promise.resolve(makeAgentsResponse()));
		renderWithRouter(<WorkTeam overrideData={TEAM_WITH_BETS} skipArtifacts />);
		await waitFor(() => {
			expect(screen.getByText("Ship the MVP")).toBeInTheDocument();
		});
		// The bet row must NOT be a hand-rolled button with surface-container class
		const betTitle = screen.getByText("Ship the MVP");
		// Walk up to find the row element — it should not have bg-[var(--surface-container)]
		const rowEl = betTitle.closest("[class]");
		// The design-system Row does not use surface-container
		expect(rowEl?.className).not.toContain("surface-container");
	});

	it("StatTile does NOT use surface-container background", async () => {
		mockApiFetch.mockReturnValue(Promise.resolve(makeAgentsResponse()));
		renderWithRouter(<WorkTeam overrideData={TEAM_WITH_BETS} skipArtifacts />);
		await waitFor(() => {
			expect(screen.getAllByTestId("stat-tile").length).toBeGreaterThan(0);
		});
		const tiles = screen.getAllByTestId("stat-tile");
		for (const tile of tiles) {
			expect(tile.className).not.toContain("surface-container");
		}
	});
});

// ---------------------------------------------------------------------------
// @lore BB1: "+ New bet" renamed to "+ New task" — root tasks replace bets
// F2 — "+ New task" button in Active Bets section
// ---------------------------------------------------------------------------

describe("Active Bets SectionLabel has a + New task button (BB1: was New bet)", () => {
	beforeEach(() => {
		mockApiFetch.mockReturnValue(Promise.resolve(makeAgentsResponse()));
		global.fetch = vi.fn().mockResolvedValue(makeHintResponse());
	});

	afterEach(() => {
		vi.restoreAllMocks();
		mockApiFetch.mockReset();
	});

	it("renders '+ New task' button in the Active Bets section (BB1: was New bet)", async () => {
		renderWithRouter(<WorkTeam overrideData={TEAM_EMPTY} skipArtifacts />);
		await waitFor(() => {
			expect(screen.getByTestId("new-bet-btn")).toBeInTheDocument();
		});
		expect(screen.getByTestId("new-bet-btn").textContent).toMatch(/\+ new task/i);
	});

	it("clicking '+ New task' navigates to /work/task/new (BB1: was /work/bet/new)", async () => {
		const user = userEvent.setup();
		renderWithRouter(<WorkTeam overrideData={TEAM_EMPTY} skipArtifacts />);
		await waitFor(() => {
			expect(screen.getByTestId("new-bet-btn")).toBeInTheDocument();
		});
		await user.click(screen.getByTestId("new-bet-btn"));
		await waitFor(() => {
			expect(screen.getByTestId("task-new-page")).toBeInTheDocument();
		});
	});
});
