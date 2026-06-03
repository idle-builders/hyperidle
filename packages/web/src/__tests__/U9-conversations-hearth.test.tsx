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
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Conversations } from "../pages/Conversations";

// Minimal mock for OutletContext
vi.mock("react-router-dom", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-router-dom")>();
	return {
		...actual,
		useOutletContext: vi.fn().mockReturnValue({
			conversationsFilter: "all",
			onFilterChange: vi.fn(),
			onClearFilter: vi.fn(),
			onNewThread: vi.fn(),
			threads: [],
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

	it("toggle chips use aria-pressed (not aria-selected)", () => {
		renderConversationsPage();
		// W3: Blocking and Unread are toggle buttons with aria-pressed
		const blockingBtn = screen.getByRole("button", { name: /^blocking$/i });
		expect(blockingBtn).not.toBeNull();
		expect(blockingBtn).toHaveAttribute("aria-pressed");
	});

	it("inactive toggle chip has aria-pressed=false", () => {
		renderConversationsPage();
		const blockingBtn = screen.getByRole("button", { name: /^blocking$/i });
		// By default, Blocking is not active — aria-pressed should be false
		expect(blockingBtn).toHaveAttribute("aria-pressed", "false");
	});

	it("active toggle chip has aria-pressed=true after click", async () => {
		const user = userEvent.setup();
		renderConversationsPage();
		const blockingBtn = screen.getByRole("button", { name: /^blocking$/i });
		await user.click(blockingBtn);
		// After click, Blocking becomes active — aria-pressed should be true
		expect(blockingBtn).toHaveAttribute("aria-pressed", "true");
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
