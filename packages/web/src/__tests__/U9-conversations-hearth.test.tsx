/**
 * U9 AC-1: Conversations page Hearth styling tests.
 *
 * Verifies:
 * - Active filter pill uses btn-primary (not btn-neutral)
 * - "New Thread" button is visible in the filter bar
 * - No old Lucid token class names in rendered output
 *
 * RED PHASE: these tests are written before implementation.
 */
import { render, screen } from "@testing-library/react";
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

describe("U9 AC-1: Conversations Hearth styling", () => {
	it("renders the filter pill bar with data-testid", () => {
		renderConversationsPage();
		expect(screen.getByTestId("conversations-filter-bar")).toBeInTheDocument();
	});

	it("active filter pill uses btn-primary (not btn-neutral)", () => {
		renderConversationsPage();
		// The "All" filter is active by default — it should use btn-primary
		const filterBar = screen.getByTestId("conversations-filter-bar");
		const activeButton = filterBar.querySelector("[aria-selected='true']");
		expect(activeButton).not.toBeNull();
		expect(activeButton?.className).toContain("btn-primary");
		expect(activeButton?.className).not.toContain("btn-neutral");
	});

	it("New Thread button is visible in the filter bar", () => {
		renderConversationsPage();
		// AC-1: "New Thread" button should be visible in the filter bar header
		const newThreadBtn = screen.getByRole("button", { name: /new thread/i });
		expect(newThreadBtn).toBeInTheDocument();
	});

	it("New Thread button has btn-primary class", () => {
		renderConversationsPage();
		const newThreadBtn = screen.getByRole("button", { name: /new thread/i });
		expect(newThreadBtn.className).toContain("btn-primary");
	});
});
