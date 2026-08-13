/**
 * Settings keeps the primary shell and domain navigator intact.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "../shell/Sidebar";

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
		expect(screen.getByRole("button", { name: /^conversations$/i })).toBeInTheDocument();
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
