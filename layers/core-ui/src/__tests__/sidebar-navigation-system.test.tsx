import { render as renderRaw, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
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
	onAssistantClick: vi.fn(),
	assistantOverlayOpen: false,
	onSettingsClick: vi.fn(),
	settingsOpen: false,
	onSearchClick: vi.fn(),
	onNotificationClick: vi.fn(),
	notificationPopoverOpen: false,
};

describe("sidebar navigation system", () => {
	test("renders product identity and the stable destinations in approved order", () => {
		const { container } = render(<Sidebar {...props} />);

		expect(screen.getByText("HyperIdle")).toBeVisible();
		expect(container.querySelector("aside")).toHaveClass("bg-transparent");
		expect(container.querySelector("aside")).not.toHaveClass("bg-[var(--surface-elevated)]");
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

	test("keeps the phone icon strip through 768px and touch targets through 1024px", () => {
		render(<Sidebar {...props} />);

		const primary = screen.getByRole("navigation", { name: "Main navigation" });
		expect(primary.className).toContain("min-[769px]:grid-cols-1");
		expect(primary.className).not.toContain("md:grid-cols-1");

		// UI-080: section headers are <Link> elements (role="link") now
		const conversations = screen.getByRole("link", { name: "Conversations" });
		expect(conversations.className).toContain("min-[1025px]:h-[36px]");
		expect(conversations.className).not.toContain("md:h-[36px]");
	});

	test("keeps the active domain navigator visible while Settings is open", () => {
		render(<Sidebar {...props} settingsOpen={true} />);

		// FastNavItem thread rows are <Link> (role="link") — UI-080
		expect(screen.getByRole("link", { name: "A complete conversation title" })).toBeVisible();
		// Section headers are <Link> (role="link") — UI-080
		expect(screen.getByRole("link", { name: "Conversations" })).toBeVisible();
	});

	test("exposes the complete label for a shortened navigator row", () => {
		render(<Sidebar {...props} />);

		// FastNavItem thread rows are <Link> (role="link") — UI-080
		const row = screen.getByRole("link", { name: "A complete conversation title" });
		expect(row).toHaveAttribute("title", "A complete conversation title");
	});
});
