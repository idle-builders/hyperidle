import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileTabBar } from "../MobileTabBar";

describe("MobileTabBar (L5)", () => {
	it("renders 4 tabs: Conversations, Work, Knowledge, Settings", () => {
		render(<MobileTabBar activeTab="conversations" onTabChange={() => {}} />);
		expect(screen.getByTestId("mobile-tab-conversations")).toBeInTheDocument();
		expect(screen.getByTestId("mobile-tab-work")).toBeInTheDocument();
		expect(screen.getByTestId("mobile-tab-knowledge")).toBeInTheDocument();
		expect(screen.getByTestId("mobile-tab-settings")).toBeInTheDocument();
	});

	it("marks active tab with aria-current=page", () => {
		render(<MobileTabBar activeTab="work" onTabChange={() => {}} />);
		expect(screen.getByTestId("mobile-tab-work")).toHaveAttribute("aria-current", "page");
		expect(screen.getByTestId("mobile-tab-conversations")).not.toHaveAttribute("aria-current");
	});

	it("calls onTabChange when a tab is clicked", () => {
		const onTabChange = vi.fn();
		render(<MobileTabBar activeTab="conversations" onTabChange={onTabChange} />);
		fireEvent.click(screen.getByTestId("mobile-tab-knowledge"));
		expect(onTabChange).toHaveBeenCalledWith("knowledge");
	});

	it("each tab button has min-h-[44px] and min-w-[44px] classes (AQ-015)", () => {
		render(<MobileTabBar activeTab="conversations" onTabChange={() => {}} />);
		const btn = screen.getByTestId("mobile-tab-work");
		expect(btn.className).toMatch(/min-h-\[44px\]/);
		expect(btn.className).toMatch(/min-w-\[44px\]/);
	});

	it("renders unread dot + plural aria-label when count > 1 on inactive tab", () => {
		render(
			<MobileTabBar
				activeTab="work"
				onTabChange={() => {}}
				badgeCountByTab={{ conversations: 5 }}
			/>,
		);
		const tab = screen.getByTestId("mobile-tab-conversations");
		expect(tab).toHaveAttribute("aria-label", "Conversations - 5 items");
	});

	it("renders singular noun for count of 1", () => {
		render(
			<MobileTabBar activeTab="work" onTabChange={() => {}} badgeCountByTab={{ knowledge: 1 }} />,
		);
		expect(screen.getByTestId("mobile-tab-knowledge")).toHaveAttribute(
			"aria-label",
			"Knowledge - 1 item",
		);
	});

	it("hides badge on the active tab even when count > 0", () => {
		render(
			<MobileTabBar
				activeTab="conversations"
				onTabChange={() => {}}
				badgeCountByTab={{ conversations: 5 }}
			/>,
		);
		// active tab uses bare label only
		expect(screen.getByTestId("mobile-tab-conversations")).toHaveAttribute(
			"aria-label",
			"Conversations",
		);
	});

	it("caps very high counts at 99+ in aria-label", () => {
		render(
			<MobileTabBar
				activeTab="conversations"
				onTabChange={() => {}}
				badgeCountByTab={{ work: 250 }}
			/>,
		);
		expect(screen.getByTestId("mobile-tab-work")).toHaveAttribute("aria-label", "Work - 99+ items");
	});
});
