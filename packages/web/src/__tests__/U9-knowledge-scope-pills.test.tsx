/**
 * U9 AC-6: KnowledgeList scope pills + Hearth styling.
 *
 * W3 AC-33: Scope pills are data-driven — derived from unique scopeKind values
 * in the item list (not hardcoded Practices/Products/Factory). The "All" pill
 * is always first.
 *
 * Verifies:
 * - Scope pill filter bar appears above Triage/Curated tabs
 * - "All" pill is always present
 * - Additional pills appear based on scopeKind values in items
 * - Active scope pill uses btn-primary
 * - Inactive scope pills use btn-ghost
 * - Triage/Curated tabs use btn-primary for active (not btn-neutral)
 * - "+ New" button uses btn-primary
 * - Sort controls use btn-primary for active (not btn-neutral)
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeList } from "../pages/KnowledgeList";

// Stub useFetch with items that have scopeKind so data-driven pills appear
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
					scopeKind: "practice",
					version: 1,
					updatedBy: "agent",
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
					signals: null,
				},
				{
					id: "k2",
					topic: "Product",
					title: "User Onboarding Flow",
					body: "body",
					format: "markdown",
					status: "active",
					scopeKind: "product",
					version: 1,
					updatedBy: "agent",
					createdAt: "2024-01-02T00:00:00Z",
					updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
					signals: null,
				},
				{
					id: "k3",
					topic: "Factory",
					title: "Agent Autonomy Policy",
					body: "body",
					format: "markdown",
					status: "active",
					scopeKind: "factory",
					version: 1,
					updatedBy: "agent",
					createdAt: "2024-01-03T00:00:00Z",
					updatedAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
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
		const scopePills = screen.getByTestId("knowledge-scope-pills");
		expect(scopePills.querySelector('[data-testid="scope-pill-all"]')).not.toBeNull();
	});

	it('renders "practice" scope pill (data-driven from scopeKind)', () => {
		renderPage();
		const scopePills = screen.getByTestId("knowledge-scope-pills");
		// W3 AC-33: pill testid is scope-pill-<scopeKind.toLowerCase()>
		expect(scopePills.querySelector('[data-testid="scope-pill-practice"]')).not.toBeNull();
	});

	it('renders "product" scope pill (data-driven from scopeKind)', () => {
		renderPage();
		const scopePills = screen.getByTestId("knowledge-scope-pills");
		expect(scopePills.querySelector('[data-testid="scope-pill-product"]')).not.toBeNull();
	});

	it('renders "factory" scope pill (data-driven from scopeKind)', () => {
		renderPage();
		const scopePills = screen.getByTestId("knowledge-scope-pills");
		expect(scopePills.querySelector('[data-testid="scope-pill-factory"]')).not.toBeNull();
	});

	it("default active scope pill (All) uses btn-primary", () => {
		renderPage();
		const allPill = screen.getByTestId("scope-pill-all");
		expect(allPill.className).toContain("btn-primary");
	});

	it("inactive scope pills use btn-ghost", () => {
		renderPage();
		const practicePill = screen.getByTestId("scope-pill-practice");
		expect(practicePill.className).toContain("btn-ghost");
	});

	it("clicking a scope pill makes it active (btn-primary)", async () => {
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByTestId("scope-pill-practice"));

		await waitFor(() => {
			const practicePill = screen.getByTestId("scope-pill-practice");
			expect(practicePill.className).toContain("btn-primary");
			const allPill = screen.getByTestId("scope-pill-all");
			expect(allPill.className).toContain("btn-ghost");
		});
	});

	it("active Triage tab uses btn-primary (not btn-neutral)", () => {
		renderPage();
		// Check whichever tab is active uses btn-primary
		const tabs = screen.getByTestId("knowledge-tabs");
		const activeTab = tabs.querySelector("[aria-selected='true']");
		expect(activeTab).not.toBeNull();
		expect(activeTab?.className).toContain("btn-primary");
		expect(activeTab?.className).not.toContain("btn-neutral");
	});

	it("sort radio buttons use btn-primary for active (not btn-neutral)", async () => {
		const user = userEvent.setup();
		renderPage();

		// Switch to triage tab to see sort controls
		await user.click(screen.getByRole("tab", { name: /triage/i }));

		await waitFor(() => {
			// W3 AC-34: sort controls use data-testid="knowledge-sort-bar"
			const sortControls = screen.getByTestId("knowledge-sort-bar");
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
