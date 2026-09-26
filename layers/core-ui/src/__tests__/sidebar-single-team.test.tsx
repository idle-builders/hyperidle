/**
 * AD3 — AC-1: Sidebar single-team conditional rendering.
 *
 * When there is exactly 1 team:
 *   - The team list (ul with team sub-items) is NOT rendered in the sidebar Work section.
 *
 * Reviewer note: The existing Sidebar.test.tsx AC-4 uses 1-team scenarios for
 * onSelectTeam testing. Those tests use a single team but assert on click behavior,
 * not on whether the list renders. These AD3 tests assert on the conditional rendering
 * specifically — the list should be suppressed with 1 team.
 */

import { render as renderRaw, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "../shell/Sidebar";

// UI-080: Sidebar uses <Link> — requires router context.
function render(element: ReactElement): ReturnType<typeof renderRaw> {
	return renderRaw(<MemoryRouter>{element}</MemoryRouter>);
}

type SidebarThread = { id: string; title: string; hasUnresolvedReview: boolean };
type SidebarTeam = { id: string; name: string };

const BASE_PROPS = {
	activeView: "work" as const,
	onViewChange: vi.fn(),
	threads: [] as SidebarThread[],
	selectedThreadId: null,
	onSelectThread: vi.fn(),
	activeTeamId: null,
	onSelectTeam: vi.fn(),
	onAssistantClick: vi.fn(),
	assistantOverlayOpen: false,
	onSettingsClick: vi.fn(),
	settingsOpen: false,
	onSearchClick: vi.fn(),
};

function mkTeam(id: string, name: string): SidebarTeam {
	return { id, name };
}

describe("AD3 AC-1: Sidebar — single-team hides team list", () => {
	it("does NOT render the team sub-list when there is exactly 1 team", () => {
		const teams = [mkTeam("team-1", "Alpha Team")];
		render(<Sidebar {...BASE_PROPS} teams={teams} activeView="work" />);
		// With 1 team, no team list items should appear
		expect(screen.queryByText("Alpha Team")).not.toBeInTheDocument();
	});

	it("renders team sub-list when there are 2 or more teams", () => {
		const teams = [mkTeam("team-1", "Alpha Team"), mkTeam("team-2", "Beta Team")];
		render(<Sidebar {...BASE_PROPS} teams={teams} activeView="work" />);
		expect(screen.getByText("Alpha Team")).toBeInTheDocument();
		expect(screen.getByText("Beta Team")).toBeInTheDocument();
	});

	it("renders team sub-list when there are 3 teams", () => {
		const teams = [
			mkTeam("team-1", "Alpha Team"),
			mkTeam("team-2", "Beta Team"),
			mkTeam("team-3", "Gamma Team"),
		];
		render(<Sidebar {...BASE_PROPS} teams={teams} activeView="work" />);
		expect(screen.getByText("Alpha Team")).toBeInTheDocument();
		expect(screen.getByText("Beta Team")).toBeInTheDocument();
		expect(screen.getByText("Gamma Team")).toBeInTheDocument();
	});

	it("does NOT render team list when teams is empty", () => {
		render(<Sidebar {...BASE_PROPS} teams={[]} activeView="work" />);
		// No team items expected — no crash
		expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
	});

	it("still calls onSelectTeam when 2+ teams exist and one is clicked", async () => {
		const user = userEvent.setup();
		const onSelectTeam = vi.fn();
		const teams = [mkTeam("team-a", "Alpha Team"), mkTeam("team-b", "Beta Team")];
		render(<Sidebar {...BASE_PROPS} teams={teams} onSelectTeam={onSelectTeam} activeView="work" />);
		await user.click(screen.getByText("Alpha Team"));
		expect(onSelectTeam).toHaveBeenCalledWith("team-a");
	});
});
