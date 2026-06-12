/**
 * U9 AC-1: Conversations page Hearth styling tests.
 *
 * W3 implementation: Conversations State A uses a header with "New thread" button
 * and ThreadSections with toggle chips (Blocking, Unread) using aria-pressed.
 * The old FilterPillBar (role="tab", aria-selected) was removed in W3.
 *
 * Verifies:
 * - Toggle chips use aria-pressed (not aria-selected)
 * - Inactive toggle chip uses btn-ghost (not btn-primary)
 * - Active toggle chip uses btn-primary after click
 * - "New thread" button is visible in the page header
 * - "New thread" button has btn-primary class
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Conversations } from "../pages/Conversations";

// Minimal mock for OutletContext
// @lore visual-parity: filter chips (Blocking, Unread) and "New thread" button are hidden
// in empty state. Provide at least one thread so these controls are visible.
// MOCK_THREAD must be defined inline (not as a const) because vi.mock is hoisted.
vi.mock("react-router-dom", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-router-dom")>();
	return {
		...actual,
		useOutletContext: vi.fn().mockReturnValue({
			conversationsFilter: "all",
			onFilterChange: vi.fn(),
			onClearFilter: vi.fn(),
			onNewThread: vi.fn(),
			threads: [
				{
					id: "t-hearth-test",
					hostKind: "task",
					hostId: "h-1",
					initiatorId: "u-test",
					participants: ["u-test", "agent-1"],
					pinned: false,
					resolvedAt: null,
					lastActiveAt: "2026-04-30T12:00:00.000Z",
					createdAt: "2026-04-30T12:00:00.000Z",
					hasUnresolvedReview: false,
				},
			],
			threadsStatus: "idle",
			threadsError: null,
			onRetryThreads: vi.fn(),
			selectedThreadId: null,
		}),
	};
});

function renderConversationsPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/conversations"]}>
			<Routes>
				<Route path="/conversations" element={<Conversations />} />
				<Route path="/conversations/:threadId" element={<Conversations />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("U9 AC-1: Conversations Hearth styling (W3 toggle-button pattern)", () => {
	it("renders the conversations page wrapper", () => {
		renderConversationsPage();
		expect(screen.getByTestId("conversations-page")).toBeInTheDocument();
	});

	it("AF14 AC4: Blocking chip NOT rendered (chips removed by AF14)", () => {
		renderConversationsPage();
		// AF14 AC4 supersedes W3 AC-6: chips removed from Conversations flat list.
		expect(screen.queryByRole("button", { name: /^blocking$/i })).not.toBeInTheDocument();
	});

	it("AF14 AC4: Unread chip NOT rendered (chips removed by AF14)", () => {
		renderConversationsPage();
		expect(screen.queryByRole("button", { name: /^unread$/i })).not.toBeInTheDocument();
	});

	it("AF14 AC4: no aria-pressed buttons in flat list (no chip bar)", () => {
		renderConversationsPage();
		// No chip bar = no aria-pressed buttons
		const pressed = document.querySelectorAll("[aria-pressed]");
		expect(pressed.length).toBe(0);
	});

	it("New thread button is visible in the page", () => {
		renderConversationsPage();
		// AC-1: "New thread" button should be visible in the header
		const newThreadBtn = screen.getByRole("button", { name: /new thread/i });
		expect(newThreadBtn).toBeInTheDocument();
	});

	it("New thread button has accent-primary background styling", () => {
		renderConversationsPage();
		const newThreadBtn = screen.getByRole("button", { name: /new thread/i });
		// Visual parity: uses custom accent-primary background (not DaisyUI btn-primary)
		expect(newThreadBtn.className).toContain("accent-primary");
	});
});
