/**
 * BC4 architecture.md §9: "Memories" is a filter chip on DocumentList
 * (`as: "memory"`), not a page. Toggling it swaps the `search_documents`
 * filter `useDocuments` is called with.
 */
import type { DocumentRow } from "@hyperidle/domain-model";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentList } from "../pages/DocumentList";

const mockUseDocuments = vi.fn();
vi.mock("../hooks/useDocuments.js", () => ({
	useDocuments: (...args: unknown[]) => mockUseDocuments(...args),
}));

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<DocumentList />
		</MemoryRouter>,
	);
}

// A non-empty result — an empty result renders the top-level "library is
// empty" EmptyState instead of the body that carries the Memories chip.
const ONE_DOCUMENT: DocumentRow[] = [
	{
		id: "k1",
		title: "A document",
		body: "",
		format: "markdown",
		status: "active",
		slot: "ordinary",
		scopeKind: "team",
		scopeId: "team-1",
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: "agent",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
	},
];

describe("DocumentList — the Memories filter chip", () => {
	beforeEach(() => {
		mockUseDocuments.mockReturnValue({
			documents: ONE_DOCUMENT,
			status: "ready",
			error: null,
			retry: vi.fn(),
		});
	});

	it("calls useDocuments with {inTree:true} by default", async () => {
		renderPage();
		await screen.findByTestId("document-list-page");
		expect(mockUseDocuments).toHaveBeenLastCalledWith({ inTree: true });
	});

	it('clicking the Memories chip switches the filter to {as:"memory"}', async () => {
		const user = userEvent.setup();
		renderPage();
		const chip = await screen.findByTestId("memories-filter-chip");
		await user.click(chip);
		expect(mockUseDocuments).toHaveBeenLastCalledWith({ as: "memory" });
	});

	it("clicking the Memories chip again switches back to {inTree:true}", async () => {
		const user = userEvent.setup();
		renderPage();
		const chip = await screen.findByTestId("memories-filter-chip");
		await user.click(chip);
		await user.click(chip);
		expect(mockUseDocuments).toHaveBeenLastCalledWith({ inTree: true });
	});
});
