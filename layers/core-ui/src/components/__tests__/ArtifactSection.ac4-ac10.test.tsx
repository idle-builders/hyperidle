/**
 * AC4 / AC10 — ArtifactSection with parented knowledge items.
 *
 * AC4: A knowledge item parented to a task appears on that task and never in
 * the knowledge tree/list. ArtifactSection must fetch from
 * GET /api/knowledge?parentKind=task&parentId=<id> rather than /api/artifacts.
 *
 * AC10: Clicking a produced item opens it in the split view.
 *
 * These tests fail until:
 *  1. ArtifactSection accepts parentKind+parentId instead of filter (ArtifactFilterAxis)
 *  2. ArtifactSection uses useParentedKnowledgeItems hook
 *  3. Clicking an item enters split mode and renders the item detail
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// The new hook ArtifactSection will call
vi.mock("../../hooks/useParentedKnowledgeItems", () => ({
	useParentedKnowledgeItems: vi.fn(),
}));

// useKnowledgeItem is called when an item is selected (split view detail)
vi.mock("../../hooks/useKnowledgeItem", () => ({
	useKnowledgeItem: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-router-dom")>();
	return { ...actual, useNavigate: () => vi.fn() };
});

import { useKnowledgeItem } from "../../hooks/useKnowledgeItem";
import { useParentedKnowledgeItems } from "../../hooks/useParentedKnowledgeItems";
import { ArtifactSection } from "../ArtifactSection";

const MOCK_ITEM = {
	id: "ki-produced-1",
	title: "Agent output file",
	body: "# What the agent produced",
	format: "markdown",
	status: "captured",
	version: 1,
	updatedBy: "agent:session-1",
	scopeKind: "factory",
	scopeId: null,
	topic: null,
	createdAt: "2026-09-02T00:00:00.000Z",
	updatedAt: "2026-09-02T00:00:00.000Z",
};

function renderSection(
	overrides: Partial<React.ComponentProps<typeof ArtifactSection>> = {},
): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<ArtifactSection parentKind="task" parentId="task-abc" heading="Artifacts" {...overrides} />
		</MemoryRouter>,
	);
}

describe("ArtifactSection — parented knowledge items (AC4 / AC10)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("calls useParentedKnowledgeItems with parentKind and parentId", () => {
		vi.mocked(useParentedKnowledgeItems).mockReturnValue({
			data: null,
			error: null,
			isLoading: true,
		});
		vi.mocked(useKnowledgeItem).mockReturnValue({ data: null, error: null, isLoading: false });

		renderSection({ parentKind: "task", parentId: "task-xyz" });

		expect(useParentedKnowledgeItems).toHaveBeenCalledWith("task", "task-xyz");
	});

	it("renders item title when data is loaded", () => {
		vi.mocked(useParentedKnowledgeItems).mockReturnValue({
			data: { items: [MOCK_ITEM] },
			error: null,
			isLoading: false,
		});
		vi.mocked(useKnowledgeItem).mockReturnValue({ data: null, error: null, isLoading: false });

		renderSection();

		expect(screen.getByText("Agent output file")).toBeInTheDocument();
	});

	it("shows empty state when no items (AC4: task has no produced items)", () => {
		vi.mocked(useParentedKnowledgeItems).mockReturnValue({
			data: { items: [] },
			error: null,
			isLoading: false,
		});
		vi.mocked(useKnowledgeItem).mockReturnValue({ data: null, error: null, isLoading: false });

		renderSection({ heading: "Artifacts" });

		expect(screen.getByTestId("empty-state")).toBeInTheDocument();
	});

	it("AC10: clicking an item renders the split detail pane", async () => {
		vi.mocked(useParentedKnowledgeItems).mockReturnValue({
			data: { items: [MOCK_ITEM] },
			error: null,
			isLoading: false,
		});
		// The detail pane fetches the full item via useKnowledgeItem
		vi.mocked(useKnowledgeItem).mockReturnValue({
			data: MOCK_ITEM,
			error: null,
			isLoading: false,
		});

		renderSection();

		// Before click: detail pane is not shown
		expect(screen.queryByTestId("artifact-section-detail")).toBeNull();

		// Click the item row
		fireEvent.click(screen.getByText("Agent output file"));

		// After click: SplitView enters split mode and detail pane renders
		await waitFor(() => {
			expect(screen.getByTestId("artifact-section-detail")).toBeInTheDocument();
		});
	});
});
