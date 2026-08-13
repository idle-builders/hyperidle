import { render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { Sidebar } from "../shell/Sidebar";

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
		render(<Sidebar {...props} />);

		expect(screen.getByText("HyperIdle")).toBeVisible();
		const primary = screen.getByRole("navigation", { name: "Main navigation" });
		expect(
			within(primary)
				.getAllByRole("button")
				.map((button) => button.getAttribute("aria-label")),
		).toEqual(["Notifications", "Conversations", "Work", "Knowledge"]);
	});

	test("keeps the phone icon strip through 768px and touch targets through 1024px", () => {
		render(<Sidebar {...props} />);

		const primary = screen.getByRole("navigation", { name: "Main navigation" });
		expect(primary.className).toContain("min-[769px]:grid-cols-1");
		expect(primary.className).not.toContain("md:grid-cols-1");

		const conversations = screen.getByRole("button", { name: "Conversations" });
		expect(conversations.className).toContain("min-[1025px]:h-[36px]");
		expect(conversations.className).not.toContain("md:h-[36px]");
	});

	test("keeps the active domain navigator visible while Settings is open", () => {
		render(<Sidebar {...props} settingsOpen={true} />);

		expect(screen.getByRole("button", { name: "A complete conversation title" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Conversations" })).toBeVisible();
	});

	test("exposes the complete label for a shortened navigator row", () => {
		render(<Sidebar {...props} />);

		const row = screen.getByRole("button", { name: "A complete conversation title" });
		expect(row).toHaveAttribute("title", "A complete conversation title");
	});
});
