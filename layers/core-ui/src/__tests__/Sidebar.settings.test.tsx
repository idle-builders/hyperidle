/**
 * Settings keeps the primary shell and domain navigator intact.
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

const baseProps = {
	activeView: "conversations" as const,
	onViewChange: vi.fn(),
	threads: [] as SidebarThread[],
	selectedThreadId: null,
	onSelectThread: vi.fn(),
	teams: [] as SidebarTeam[],
	activeTeamId: null,
	onSelectTeam: vi.fn(),
	activeScope: null,
	onSelectScope: vi.fn(),
	onAssistantClick: vi.fn(),
	assistantOverlayOpen: false,
	onSettingsClick: vi.fn(),
	onSearchClick: vi.fn(),
	settingsOpen: false,
};

describe("Sidebar — persistent navigation while Settings is open", () => {
	it("Settings button is present in the bottom strip", () => {
		render(<Sidebar {...baseProps} />);
		expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
	});

	it("calls onSettingsClick when settings button is clicked", async () => {
		const user = userEvent.setup();
		const onSettingsClick = vi.fn();
		render(<Sidebar {...baseProps} onSettingsClick={onSettingsClick} />);
		await user.click(screen.getByRole("button", { name: /settings/i }));
		expect(onSettingsClick).toHaveBeenCalledOnce();
	});

	it("keeps the active domain navigator visible when settingsOpen=true", () => {
		const threads = [{ id: "t1", title: "Thread One", hasUnresolvedReview: false }];
		render(<Sidebar {...baseProps} settingsOpen={true} threads={threads} />);
		expect(screen.getByText("Thread One")).toBeInTheDocument();
		// UI-080: section headers are links now
		expect(screen.getByRole("link", { name: /^conversations$/i })).toBeInTheDocument();
	});

	it("marks the Settings utility as current without replacing the navigator", () => {
		render(<Sidebar {...baseProps} settingsOpen={true} />);
		expect(screen.getByRole("button", { name: /settings/i })).toHaveAttribute(
			"aria-current",
			"page",
		);
		expect(screen.queryByText(/^settings$/i)).not.toBeInTheDocument();
	});
});
