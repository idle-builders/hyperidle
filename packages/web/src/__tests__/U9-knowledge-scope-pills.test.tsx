/**
 * U9 AC-6: KnowledgeList scope pills + Hearth styling.
 *
 * Verifies:
 * - Scope pill filter bar appears above Triage/Curated tabs
 * - Scope pills: "All", "Practices", "Products", "Factory"
 * - Active scope pill uses btn-primary
 * - Inactive scope pills use btn-ghost
 * - Triage/Curated tabs use btn-primary for active (not btn-neutral)
 * - "+ New" button uses btn-primary
 *
 * RED PHASE: these tests are written before implementation.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeList } from "../pages/KnowledgeList";

// Stub useFetch so we don't need a real API
vi.mock("../hooks/useFetch", () => ({
	useFetch: vi.fn().mockReturnValue({
		data: {
			items: [
				{
					id: "k1",
					topic: "Architecture",
					title: "Auth Strategy Decision",
					body: "body",
					format: "markdown",
					status: "active",
					version: 1,
					updatedBy: "agent",
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
					signals: null,
				},
			],
		},
		isLoading: false,
		error: null,
	}),
}));

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<KnowledgeList />
		</MemoryRouter>,
	);
}

describe("U9 AC-6: KnowledgeList scope pills", () => {
	it("renders scope pill filter bar", () => {
		renderPage();
		expect(screen.getByTestId("knowledge-scope-pills")).toBeInTheDocument();
	});

	it('renders "All" scope pill', () => {
		renderPage();
		// "All" pill should be visible in the scope filter bar
		const scopePills = screen.getByTestId("knowledge-scope-pills");
		expect(scopePills.querySelector('[data-testid="scope-pill-all"]')).not.toBeNull();
	});

	it('renders "Practices" scope pill', () => {
		renderPage();
		const scopePills = screen.getByTestId("knowledge-scope-pills");
		expect(scopePills.querySelector('[data-testid="scope-pill-practices"]')).not.toBeNull();
	});

	it('renders "Products" scope pill', () => {
		renderPage();
		const scopePills = screen.getByTestId("knowledge-scope-pills");
		expect(scopePills.querySelector('[data-testid="scope-pill-products"]')).not.toBeNull();
	});

	it('renders "Factory" scope pill', () => {
		renderPage();
		const scopePills = screen.getByTestId("knowledge-scope-pills");
		expect(scopePills.querySelector('[data-testid="scope-pill-factory"]')).not.toBeNull();
	});

	it("default active scope pill (All) uses btn-primary", () => {
		renderPage();
		// Default should be "All" active
		const allPill = screen.getByTestId("scope-pill-all");
		expect(allPill.className).toContain("btn-primary");
	});

	it("inactive scope pills use btn-ghost", () => {
		renderPage();
		const practicesPill = screen.getByTestId("scope-pill-practices");
		expect(practicesPill.className).toContain("btn-ghost");
	});

	it("clicking a scope pill makes it active (btn-primary)", async () => {
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByTestId("scope-pill-practices"));

		await waitFor(() => {
			const practicesPill = screen.getByTestId("scope-pill-practices");
			expect(practicesPill.className).toContain("btn-primary");
			const allPill = screen.getByTestId("scope-pill-all");
			expect(allPill.className).toContain("btn-ghost");
		});
	});

	it("active Triage tab uses btn-primary (not btn-neutral)", () => {
		renderPage();
		// Triage is the default active tab (has draft items mock has active items → curated is default)
		// Check whichever tab is active uses btn-primary
		const tabs = screen.getByTestId("knowledge-tabs");
		const activeTab = tabs.querySelector("[aria-selected='true']");
		expect(activeTab).not.toBeNull();
		expect(activeTab?.className).toContain("btn-primary");
		expect(activeTab?.className).not.toContain("btn-neutral");
	});

	it("sort radio buttons use btn-primary for active (not btn-neutral)", async () => {
		// We need triage to be active to see sort controls
		// The mock returns only active items so curated is default
		// We'll force triage by clicking it
		const user = userEvent.setup();
		renderPage();

		// Switch to triage tab to see sort controls
		await user.click(screen.getByRole("tab", { name: /triage/i }));

		await waitFor(() => {
			const sortControls = screen.getByTestId("knowledge-sort-controls");
			const activeSort = sortControls.querySelector("[aria-checked='true']");
			expect(activeSort).not.toBeNull();
			expect(activeSort?.className).toContain("btn-primary");
			expect(activeSort?.className).not.toContain("btn-neutral");
		});
	});

	it('"+  New" button uses btn-primary class', () => {
		renderPage();
		const newBtn = screen.getByRole("button", { name: /\+ new/i });
		expect(newBtn).toBeInTheDocument();
		expect(newBtn.className).toContain("btn-primary");
	});
});
