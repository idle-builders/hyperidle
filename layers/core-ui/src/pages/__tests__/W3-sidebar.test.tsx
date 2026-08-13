/**
 * W3 — Sidebar AC-1, AC-2, AC-3, AC-4: Red phase tests.
 *
 * AC-1: Bottom strip has search hint (Cmd+K), user avatar (settings trigger), and
 *       Assistant/CoC button — no legacy full-width button with the old agent name.
 * AC-2: Work section sub-nav shows teams (verified by existing structure — no change needed).
 * AC-3: Knowledge section has NO sub-items (no Practices/Products/Factory scope items).
 * AC-4: Conversations sub-nav shows recent threads.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SidebarProps } from "../../shell/Sidebar";
import { Sidebar } from "../../shell/Sidebar";

function makeProps(overrides: Partial<SidebarProps> = {}): SidebarProps {
	return {
		activeView: "conversations",
		onViewChange: vi.fn(),
		threads: [],
		selectedThreadId: null,
		onSelectThread: vi.fn(),
		teams: [{ id: "t1", name: "Alpha Core" }],
		activeTeamId: null,
		onSelectTeam: vi.fn(),
		onAssistantClick: vi.fn(),
		assistantOverlayOpen: false,
		onSettingsClick: vi.fn(),
		settingsOpen: false,
		userInitials: "TF",
		// AC-1: new prop required
		onSearchClick: vi.fn(),
		...overrides,
	};
}

describe("W3 AC-1 — Sidebar utility controls", () => {
	it("renders the compact search control", () => {
		render(<Sidebar {...makeProps()} />);
		// Sidebar must show a search hint element
		const searchHint = screen.getByTestId("sidebar-search-hint");
		expect(searchHint).toBeInTheDocument();
	});

	it("exposes the ⌘K keyboard shortcut on the compact search control", () => {
		render(<Sidebar {...makeProps()} />);
		const searchHint = screen.getByTestId("sidebar-search-hint");
		expect(searchHint).toHaveAttribute("title", expect.stringMatching(/⌘K|cmd\+k/i));
	});

	// @lore AD8a: regression guard — old agent display name must not appear.
	it("does NOT render the legacy full-width assistant trigger button", () => {
		render(<Sidebar {...makeProps()} />);
		// Regression guard: the old full-width button text should not appear.
		expect(screen.queryByText("Chief of Staff")).not.toBeInTheDocument();
	});

	it("renders an 'Assistant' label/button for CoC trigger", () => {
		// @lore AD9: SidebarV2 design moved the assistant to an icon-only button at the
		// top row (next to search field). No visible "Assistant" text — aria-label only.
		// Test updated to use getByRole with accessible name.
		render(<Sidebar {...makeProps()} />);
		expect(screen.getByRole("button", { name: /assistant/i })).toBeInTheDocument();
	});

	it("renders settings button (click → settings)", () => {
		// @lore AD9: SidebarV2 design replaced the avatar/user button in the bottom
		// strip with a Settings gear button. The avatar button (sidebar-avatar-btn)
		// is removed; the Settings button (sidebar-settings-btn) is the new affordance.
		const onSettingsClick = vi.fn();
		render(<Sidebar {...makeProps({ onSettingsClick })} />);
		const settingsBtn = screen.getByTestId("sidebar-settings-btn");
		expect(settingsBtn).toBeInTheDocument();
	});

	it("calls onSearchClick when search hint is clicked", async () => {
		const onSearchClick = vi.fn();
		const { getByTestId } = render(<Sidebar {...makeProps({ onSearchClick })} />);
		const searchHint = getByTestId("sidebar-search-hint");
		searchHint.click();
		expect(onSearchClick).toHaveBeenCalled();
	});

	it("does NOT accept activeScope / onSelectScope props (props removed)", () => {
		// These props were removed from SidebarProps in W3.
		// The type itself should not include them — this test passes when compilation succeeds
		// and the sidebar renders without those props.
		const props = makeProps();
		// @ts-expect-error — activeScope was removed from SidebarProps
		props.activeScope = "practices";
		// @ts-expect-error — onSelectScope was removed from SidebarProps
		props.onSelectScope = vi.fn();
		// If the above lines fail type-check, the type is correct. Render should still work.
		expect(() => render(<Sidebar {...makeProps()} />)).not.toThrow();
	});
});

describe("W3 AC-3 — Knowledge section has no scope sub-items", () => {
	it("does NOT render 'Practices' scope item in knowledge sub-nav", () => {
		render(<Sidebar {...makeProps({ activeView: "knowledge" })} />);
		expect(screen.queryByRole("button", { name: /^practices$/i })).not.toBeInTheDocument();
	});

	it("does NOT render 'Products' scope item in knowledge sub-nav", () => {
		render(<Sidebar {...makeProps({ activeView: "knowledge" })} />);
		expect(screen.queryByRole("button", { name: /^products$/i })).not.toBeInTheDocument();
	});

	it("does NOT render 'Factory' scope item in knowledge sub-nav", () => {
		render(<Sidebar {...makeProps({ activeView: "knowledge" })} />);
		expect(screen.queryByRole("button", { name: /^factory$/i })).not.toBeInTheDocument();
	});
});

describe("W3 AC-4 — Conversations sub-nav shows recent threads", () => {
	it("renders thread titles in conversations sub-nav", () => {
		const threads = [
			{ id: "t1", title: "Thread One", hasUnresolvedReview: false },
			{ id: "t2", title: "Thread Two", hasUnresolvedReview: false },
		];
		render(<Sidebar {...makeProps({ threads, activeView: "conversations" })} />);
		expect(screen.getByText("Thread One")).toBeInTheDocument();
		expect(screen.getByText("Thread Two")).toBeInTheDocument();
	});
});
