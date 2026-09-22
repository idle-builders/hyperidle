/**
 * U9 AC-6: DocumentList scope pills + Hearth styling.
 *
 * AD6: Scope pills are now static (All/Shared/Team/Private), NOT data-driven.
 * The "All" pill is always first; the others are always present regardless of
 * which scopeKind values appear in the item list.
 *
 * Verifies:
 * - Scope pill filter bar appears
 * - All 4 static pills (All/Shared/Team/Private) are always present
 * - Active scope pill uses data-active="true"
 * - Inactive scope pills use data-active="false"
 * - Triage/Curated tabs use aria-selected for active state
 * - "+ New" button is present
 * - Sort controls use aria-checked for active state
 *
 * @lore BC4: re-pointed onto DocumentList/useDocuments — the behaviour these
 * assertions cover (static scope pills, tab selection, sort state) survives
 * the rename unchanged.
 */
import type { DocumentRow } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DocumentList } from "../pages/DocumentList";

function makeDoc(overrides: Partial<DocumentRow> = {}): DocumentRow {
	return {
		id: "k1",
		title: "Untitled",
		body: "body",
		format: "markdown",
		status: "active",
		slot: "ordinary",
		scopeKind: "factory",
		scopeId: null,
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: "agent",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
		...overrides,
	};
}

vi.mock("../hooks/useDocuments.js", () => ({
	useDocuments: vi.fn().mockReturnValue({
		documents: [
			makeDoc({ id: "k1", title: "Auth Strategy Decision", scopeKind: "factory" }),
			makeDoc({
				id: "k2",
				title: "User Onboarding Flow",
				scopeKind: "user",
				updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
			}),
			makeDoc({
				id: "k3",
				title: "Agent Autonomy Policy",
				scopeKind: "team",
				updatedAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
			}),
		],
		status: "ready",
		error: null,
		retry: vi.fn(),
	}),
}));

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<DocumentList />
		</MemoryRouter>,
	);
}

describe("U9 AC-6: DocumentList scope pills", () => {
	it("renders scope pill filter bar", () => {
		renderPage();
		expect(screen.getByTestId("document-scope-pills")).toBeInTheDocument();
	});

	it('renders "All" scope pill', () => {
		renderPage();
		const scopePills = screen.getByTestId("document-scope-pills");
		expect(scopePills.querySelector('[data-testid="scope-pill-all"]')).not.toBeNull();
	});

	it('renders "Shared" static scope pill (AD6: replaces data-driven practice/product/factory)', () => {
		renderPage();
		const scopePills = screen.getByTestId("document-scope-pills");
		expect(scopePills.querySelector('[data-testid="scope-pill-shared"]')).not.toBeNull();
	});

	it('renders "Team" static scope pill', () => {
		renderPage();
		const scopePills = screen.getByTestId("document-scope-pills");
		expect(scopePills.querySelector('[data-testid="scope-pill-team"]')).not.toBeNull();
	});

	it('renders "Private" static scope pill', () => {
		renderPage();
		const scopePills = screen.getByTestId("document-scope-pills");
		expect(scopePills.querySelector('[data-testid="scope-pill-private"]')).not.toBeNull();
	});

	it("default active scope pill (All) has data-active=true", () => {
		renderPage();
		const allPill = screen.getByTestId("scope-pill-all");
		expect(allPill).toHaveAttribute("data-active", "true");
	});

	it("inactive scope pills have data-active=false", () => {
		renderPage();
		const sharedPill = screen.getByTestId("scope-pill-shared");
		expect(sharedPill).toHaveAttribute("data-active", "false");
	});

	it("clicking a scope pill makes it active (data-active=true)", async () => {
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByTestId("scope-pill-shared"));

		await waitFor(() => {
			const sharedPill = screen.getByTestId("scope-pill-shared");
			expect(sharedPill).toHaveAttribute("data-active", "true");
			const allPill = screen.getByTestId("scope-pill-all");
			expect(allPill).toHaveAttribute("data-active", "false");
		});
	});

	it("active tab has aria-selected=true", () => {
		renderPage();
		const tabs = screen.getByTestId("document-tabs");
		const activeTab = tabs.querySelector("[aria-selected='true']");
		expect(activeTab).not.toBeNull();
	});

	it("sort radio buttons use aria-checked for active state", async () => {
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByRole("tab", { name: /triage/i }));

		await waitFor(() => {
			const sortControls = screen.getByTestId("document-sort-bar");
			const activeSort = sortControls.querySelector("[aria-checked='true']");
			expect(activeSort).not.toBeNull();
		});
	});

	it('"+  New" button is present in the header', () => {
		renderPage();
		const newBtn = screen.getByRole("button", { name: /\+ new/i });
		expect(newBtn).toBeInTheDocument();
	});
});
