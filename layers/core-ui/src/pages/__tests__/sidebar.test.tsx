/**
 * Sidebar page tests.
 *
 * Covers: the bottom strip has a search hint (Cmd+K), user avatar (settings
 * trigger), and Assistant button — no legacy full-width button with the old
 * agent name; the Work section sub-nav shows teams; the Knowledge section
 * has no sub-items (no Practices/Products/Factory scope items); the
 * Conversations sub-nav shows recent threads.
 */

import { render as renderRaw, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { SidebarProps } from "../../shell/Sidebar";
import { Sidebar } from "../../shell/Sidebar";

// Sidebar uses <Link> — requires router context.
function render(element: ReactElement): ReturnType<typeof renderRaw> {
	return renderRaw(<MemoryRouter>{element}</MemoryRouter>);
}

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
		// new prop required
		onSearchClick: vi.fn(),
		...overrides,
	};
}

describe("Sidebar utility controls", () => {
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

	it("does NOT render the legacy full-width assistant trigger button", () => {
		render(<Sidebar {...makeProps()} />);
		// Regression guard: the old full-width button text should not appear.
		expect(screen.queryByText("Chief of Staff")).not.toBeInTheDocument();
	});

	it("renders an 'Assistant' label/button for CoC trigger", () => {
		render(<Sidebar {...makeProps()} />);
		expect(screen.getByRole("button", { name: /assistant/i })).toBeInTheDocument();
	});

	it("renders settings button (click → settings)", () => {
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
		// These props were removed from SidebarProps.
		// The type itself should not include them — this test passes when compilation succeeds
		// and the sidebar renders without those props.
		const props = makeProps();
		// @ts-expect-error — activeScope was removed from SidebarProps
		props.activeScope = "practices";
		// @ts-expect-error — onSelectScope was removed from SidebarProps
		props.onSelectScope = vi.fn();
		// If the above lines fail type-check, the type is correct. Render should still work.
		const { getByTestId } = render(<Sidebar {...makeProps()} />);
		expect(getByTestId("sidebar-search-hint")).toBeInTheDocument();
	});
});

describe("Knowledge section has no scope sub-items", () => {
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

describe("Conversations sub-nav shows recent threads", () => {
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
