import { render as renderRaw, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "../shell/Sidebar";

// UI-080: Sidebar uses <Link> — requires router context.
function render(element: ReactElement): ReturnType<typeof renderRaw> {
	return renderRaw(<MemoryRouter>{element}</MemoryRouter>);
}

const props = {
	activeView: "conversations" as const,
	onViewChange: vi.fn(),
	threads: [{ id: "thread-a", title: "A complete conversation title", hasUnresolvedReview: false }],
	selectedThreadId: null,
	onSelectThread: vi.fn(),
	teams: [],
	activeTeamId: null,
	onSelectTeam: vi.fn(),
	activeScope: null,
	onSelectScope: vi.fn(),
	onAssistantClick: vi.fn(),
	assistantOverlayOpen: false,
	onSettingsClick: vi.fn(),
	settingsOpen: false,
	onSearchClick: vi.fn(),
	onNotificationClick: vi.fn(),
	notificationPopoverOpen: false,
};

describe("sidebar navigation system", () => {
	it("renders product identity and the stable destinations in approved order", () => {
		render(<Sidebar {...props} />);

		expect(screen.getByText("HyperIdle")).toBeVisible();
		const primary = screen.getByRole("navigation", { name: "Main navigation" });
		// UI-080: Conversations/Work/Knowledge are now <Link> elements (role="link");
		// Notifications remains a button. Query all interactive items by aria-label.
		const navItems = [
			...within(primary).queryAllByRole("button"),
			...within(primary).queryAllByRole("link"),
		]
			.filter((el) => el.getAttribute("aria-label") !== null)
			.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
		expect(navItems.map((el) => el.getAttribute("aria-label"))).toEqual([
			"Notifications",
			"Conversations",
			"Work",
			"Knowledge",
		]);
	});

	it("exposes the complete label for a shortened navigator row via its title attribute", () => {
		render(<Sidebar {...props} />);

		// FastNavItem renders thread rows as <Link> with a title attr for the tooltip.
		const row = screen.getByRole("link", { name: "A complete conversation title" });
		expect(row).toHaveAttribute("title", "A complete conversation title");
	});

	it("keeps the active domain navigator visible while Settings is open", () => {
		render(<Sidebar {...props} settingsOpen={true} />);

		expect(screen.getByRole("link", { name: "A complete conversation title" })).toBeVisible();
		expect(screen.getByRole("link", { name: "Conversations" })).toBeVisible();
	});

	it("calls onSettingsClick when the Settings button is clicked", async () => {
		const user = userEvent.setup();
		const onSettingsClick = vi.fn();
		render(<Sidebar {...props} onSettingsClick={onSettingsClick} />);
		await user.click(screen.getByRole("button", { name: /settings/i }));
		expect(onSettingsClick).toHaveBeenCalledOnce();
	});

	it("marks the Settings utility as current when settingsOpen=true", () => {
		render(<Sidebar {...props} settingsOpen={true} />);
		expect(screen.getByRole("button", { name: /settings/i })).toHaveAttribute(
			"aria-current",
			"page",
		);
	});
});
