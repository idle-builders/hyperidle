import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalSearchPanel } from "../components/GlobalSearchPanel";

const mockConversations = [
	{
		id: "c1",
		title: "Deploy review",
		snippet: "Reviewing the deploy pipeline...",
		timestamp: "2 min ago",
		kind: "review" as const,
	},
	{
		id: "c2",
		title: "Standup chat",
		snippet: "Daily standup notes...",
		timestamp: "5 min ago",
		kind: "chat" as const,
	},
];

// @lore BB1: work items are now tasks — `state` replaces `status` + `appetite`.
const mockWork = [
	{
		id: "w1",
		title: "Mobile App V2",
		team: "HyperIdle",
		state: "in_progress" as const,
	},
];

const mockDocuments = [
	{
		id: "k1",
		title: "Rate Limiting Pattern",
		status: "active" as const,
		timestamp: "1 hour ago",
	},
];

// @lore BC4: the raw fetch payload keeps the `knowledge` wire key (owned by
// layers/core-api/src/routes/search.ts).
const mockSearchResults = {
	conversations: mockConversations,
	work: mockWork,
	documents: mockDocuments,
};

const emptyResults = {
	conversations: [],
	work: [],
	documents: [],
};

describe("GlobalSearchPanel", () => {
	const defaultProps = {
		open: true,
		onClose: vi.fn(),
		onNavigate: vi.fn(),
	};

	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(emptyResults),
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	// AC1: Modal opens when open=true
	it("renders modal when open is true", () => {
		render(<GlobalSearchPanel {...defaultProps} />);
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("does not render modal when open is false", () => {
		render(<GlobalSearchPanel {...defaultProps} open={false} />);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	// AC2: SearchField focused automatically
	it("auto-focuses the search input when opened", () => {
		render(<GlobalSearchPanel {...defaultProps} />);
		const input = screen.getByRole("textbox");
		expect(input).toHaveFocus();
	});

	// AC3: Typing filters results in real time
	it("calls search API when user types", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockSearchResults),
		});

		render(<GlobalSearchPanel {...defaultProps} />);
		const input = screen.getByRole("textbox");
		await user.type(input, "deploy");

		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledWith(
				expect.stringContaining("/api/search"),
				expect.anything(),
			);
		});
	});

	// AC4: Results grouped by type
	it("renders results grouped by Conversations, Work, Documents", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockSearchResults),
		});

		render(<GlobalSearchPanel {...defaultProps} />);
		await user.type(screen.getByRole("textbox"), "test");

		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		await waitFor(() => {
			expect(screen.getByText("Conversations")).toBeInTheDocument();
			expect(screen.getByText("Work")).toBeInTheDocument();
			expect(screen.getByText("Documents")).toBeInTheDocument();
		});
	});

	it("does not render empty group headings", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					conversations: mockConversations,
					work: [],
					documents: [],
				}),
		});

		render(<GlobalSearchPanel {...defaultProps} />);
		await user.type(screen.getByRole("textbox"), "test");

		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		await waitFor(() => {
			expect(screen.getByText("Conversations")).toBeInTheDocument();
		});
		expect(screen.queryByText("Work")).not.toBeInTheDocument();
		expect(screen.queryByText("Documents")).not.toBeInTheDocument();
	});

	// AC5: Arrow keys navigate, Enter selects, Esc closes
	it("Escape closes the panel", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const onClose = vi.fn();
		render(<GlobalSearchPanel {...defaultProps} onClose={onClose} />);
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("Enter on a result calls onNavigate with type and id", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const onNavigate = vi.fn();
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockSearchResults),
		});

		render(<GlobalSearchPanel {...defaultProps} onNavigate={onNavigate} />);
		await user.type(screen.getByRole("textbox"), "test");

		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		await waitFor(() => {
			expect(screen.getByText("Deploy review")).toBeInTheDocument();
		});

		// First result should be active, press Enter
		await user.keyboard("{Enter}");
		expect(onNavigate).toHaveBeenCalledWith("conversation", "c1");
	});

	it("ArrowDown and ArrowUp navigate through results", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const onNavigate = vi.fn();
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockSearchResults),
		});

		render(<GlobalSearchPanel {...defaultProps} onNavigate={onNavigate} />);
		await user.type(screen.getByRole("textbox"), "test");

		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		await waitFor(() => {
			expect(screen.getByText("Deploy review")).toBeInTheDocument();
		});

		// Navigate to second result (Standup chat) and select
		await user.keyboard("{ArrowDown}");
		await user.keyboard("{Enter}");
		expect(onNavigate).toHaveBeenCalledWith("conversation", "c2");
	});

	// AC6: Results rendered as ThreadRow, TaskCard (lite), DocRow
	// @lore BB1: BetCard replaced by TaskCard in GlobalSearchPanel.
	it("renders conversation results as ThreadRow components", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockSearchResults),
		});

		render(<GlobalSearchPanel {...defaultProps} />);
		await user.type(screen.getByRole("textbox"), "test");

		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		await waitFor(() => {
			// ThreadRow renders title with aria-label
			expect(screen.getByLabelText("Thread: Deploy review")).toBeInTheDocument();
			expect(screen.getByText("Reviewing the deploy pipeline...")).toBeInTheDocument();
		});
	});

	it("renders work results as TaskCard components", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockSearchResults),
		});

		render(<GlobalSearchPanel {...defaultProps} />);
		await user.type(screen.getByRole("textbox"), "test");

		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		await waitFor(() => {
			expect(screen.getByText("Mobile App V2")).toBeInTheDocument();
			// @lore BB1: TaskCard shows title and state; team maps to owner. Title is sufficient to confirm rendering.
		});
	});

	it("renders document results as DocRow components", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockSearchResults),
		});

		render(<GlobalSearchPanel {...defaultProps} />);
		await user.type(screen.getByRole("textbox"), "test");

		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		await waitFor(() => {
			expect(screen.getByLabelText("Document: Rate Limiting Pattern")).toBeInTheDocument();
		});
	});

	// AC7: No results shows empty state message
	it("shows empty state message when query has no results", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(emptyResults),
		});

		render(<GlobalSearchPanel {...defaultProps} />);
		await user.type(screen.getByRole("textbox"), "xyznonexistent");

		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		await waitFor(() => {
			expect(screen.getByTestId("search-empty")).toBeInTheDocument();
			expect(screen.getByText("No matches")).toBeInTheDocument();
		});
	});

	it("does not show empty state before user types", () => {
		render(<GlobalSearchPanel {...defaultProps} />);
		expect(screen.queryByTestId("search-empty")).not.toBeInTheDocument();
	});

	// AC8: Dialog layer carries data-dialog-layer="dialog" (AI2: DaisyUI .modal replaced by useDialogBehavior)
	// UI-001: panel is portalled into #overlay-root (sibling of #root), so use
	// document.querySelector instead of container.querySelector.
	it("renders with dialog layer attribute", () => {
		render(<GlobalSearchPanel {...defaultProps} />);
		const panel = document.querySelector('[data-dialog-layer="dialog"]');
		expect(panel).toBeInTheDocument();
	});

	// Additional integration behaviors
	it("clears search and results when panel closes and reopens", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockSearchResults),
		});

		const { rerender } = render(<GlobalSearchPanel {...defaultProps} />);
		await user.type(screen.getByRole("textbox"), "test");

		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		await waitFor(() => {
			expect(screen.getByText("Deploy review")).toBeInTheDocument();
		});

		// Close the panel
		rerender(<GlobalSearchPanel {...defaultProps} open={false} />);

		// Reopen the panel
		rerender(<GlobalSearchPanel {...defaultProps} open={true} />);

		// Search field should be empty
		const input = screen.getByRole("textbox");
		expect(input).toHaveValue("");
	});

	it("clicking a result calls onNavigate with correct type and id", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const onNavigate = vi.fn();
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockSearchResults),
		});

		render(<GlobalSearchPanel {...defaultProps} onNavigate={onNavigate} />);
		await user.type(screen.getByRole("textbox"), "test");

		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		await waitFor(() => {
			expect(screen.getByText("Mobile App V2")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Mobile App V2"));
		expect(onNavigate).toHaveBeenCalledWith("work", "w1");
	});
});
