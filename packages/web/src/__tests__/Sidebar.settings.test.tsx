/**
 * U6 — Sidebar settings overlay tests.
 *
 * AC-8: Settings button opens settings overlay in sidebar (settingsNavItems
 *       replaces body content when settingsOpen=true).
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
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

function SettingsNavStub(): JSX.Element {
	return (
		<nav data-testid="settings-nav-stub">
			<button type="button">Profile</button>
			<button type="button">Appearance</button>
			<button type="button">Notifications</button>
		</nav>
	);
}

describe("Sidebar — AC-8: Settings overlay in sidebar", () => {
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

	it("renders settingsNavItems in the sidebar body when settingsOpen=true", () => {
		render(<Sidebar {...baseProps} settingsOpen={true} settingsNavItems={<SettingsNavStub />} />);
		expect(screen.getByTestId("settings-nav-stub")).toBeInTheDocument();
	});

	it("does NOT render settingsNavItems when settingsOpen=false", () => {
		render(<Sidebar {...baseProps} settingsOpen={false} settingsNavItems={<SettingsNavStub />} />);
		expect(screen.queryByTestId("settings-nav-stub")).not.toBeInTheDocument();
	});

	it("hides the normal section content (threads/teams/scopes) when settingsOpen=true", () => {
		const threads = [{ id: "t1", title: "Thread One", hasUnresolvedReview: false }];
		render(
			<Sidebar
				{...baseProps}
				settingsOpen={true}
				settingsNavItems={<SettingsNavStub />}
				threads={threads}
			/>,
		);
		// Normal section content should not be visible when settings is open
		expect(screen.queryByText("Thread One")).not.toBeInTheDocument();
	});

	it("shows 'Settings' heading in the sidebar body when settingsOpen=true", () => {
		render(<Sidebar {...baseProps} settingsOpen={true} settingsNavItems={<SettingsNavStub />} />);
		// Settings heading should be visible in the sidebar
		expect(screen.getByText(/^settings$/i)).toBeInTheDocument();
	});
});
