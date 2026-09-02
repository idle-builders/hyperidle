/**
 * ArtifactSection unit tests.
 *
 * AC coverage:
 *  - loading: renders SkeletonList while fetch is in flight
 *  - error with heading: renders ErrorState
 *  - error without heading: renders null
 *  - empty with heading: renders EmptyState
 *  - empty without heading: renders null
 *  - emptyDescription prop forwarded to EmptyState
 *  - populated: renders one Row per item
 *  - heading rendered when provided
 *  - AC10: clicking a row enters split mode, renders detail pane
 *
 * Migrated from the old filter/layout/useArtifacts API to parentKind/parentId/useParentedKnowledgeItems.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../hooks/useParentedKnowledgeItems", () => ({
	useParentedKnowledgeItems: vi.fn(),
}));

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

const ITEM_A = {
	id: "ki-test-a",
	title: "Agent output alpha",
	body: "# Output alpha",
	format: "markdown",
	status: "captured",
	version: 1,
	updatedBy: "agent:sess-1",
	scopeKind: "factory",
	scopeId: null,
	topic: null,
	createdAt: "2026-09-01T00:00:00.000Z",
	updatedAt: "2026-09-01T00:00:00.000Z",
};

const ITEM_B = { ...ITEM_A, id: "ki-test-b", title: "Agent output beta", body: "# Output beta" };
const ITEM_C = { ...ITEM_A, id: "ki-test-c", title: "Agent output gamma", body: "# Output gamma" };

function renderSection(
	overrides: Partial<React.ComponentProps<typeof ArtifactSection>> = {},
): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<ArtifactSection parentKind="task" parentId="task-test" heading="Artifacts" {...overrides} />
		</MemoryRouter>,
	);
}

describe("ArtifactSection", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ── Loading ───────────────────────────────────────────────────────────────

	it("renders SkeletonList while loading", () => {
		vi.mocked(useParentedKnowledgeItems).mockReturnValue({
			data: null,
			error: null,
			isLoading: true,
		});
		vi.mocked(useKnowledgeItem).mockReturnValue({ data: null, error: null, isLoading: false });

		renderSection();

		expect(screen.getByTestId("skeleton-list")).toBeInTheDocument();
	});

	// ── Error ─────────────────────────────────────────────────────────────────

	it("renders ErrorState when fetch fails and heading is provided", () => {
		vi.mocked(useParentedKnowledgeItems).mockReturnValue({
			data: null,
			error: "HTTP 500",
			isLoading: false,
		});
		vi.mocked(useKnowledgeItem).mockReturnValue({ data: null, error: null, isLoading: false });

		renderSection({ heading: "Artifacts" });

		expect(screen.getByTestId("error-state")).toBeInTheDocument();
	});

	it("renders null when fetch fails and no heading is provided", () => {
		vi.mocked(useParentedKnowledgeItems).mockReturnValue({
			data: null,
			error: "HTTP 500",
			isLoading: false,
		});
		vi.mocked(useKnowledgeItem).mockReturnValue({ data: null, error: null, isLoading: false });

		renderSection({ heading: undefined });

		// MemoryRouter is the firstChild; its content should be empty
		expect(screen.queryByTestId("artifact-section-container")).toBeNull();
	});

	// ── Empty ─────────────────────────────────────────────────────────────────

	it("renders EmptyState when data is empty and heading is provided", () => {
		vi.mocked(useParentedKnowledgeItems).mockReturnValue({
			data: { items: [] },
			error: null,
			isLoading: false,
		});
		vi.mocked(useKnowledgeItem).mockReturnValue({ data: null, error: null, isLoading: false });

		renderSection({ heading: "Artifacts" });

		expect(screen.getByTestId("empty-state")).toBeInTheDocument();
	});

	it("uses emptyDescription prop when provided", () => {
		vi.mocked(useParentedKnowledgeItems).mockReturnValue({
			data: { items: [] },
			error: null,
			isLoading: false,
		});
		vi.mocked(useKnowledgeItem).mockReturnValue({ data: null, error: null, isLoading: false });

		renderSection({
			heading: "Artifacts",
			emptyDescription: "Agents produce output here as tasks complete.",
		});

		expect(screen.getByText("Agents produce output here as tasks complete.")).toBeInTheDocument();
	});

	it("uses the generic fallback description when emptyDescription is not provided", () => {
		vi.mocked(useParentedKnowledgeItems).mockReturnValue({
			data: { items: [] },
			error: null,
			isLoading: false,
		});
		vi.mocked(useKnowledgeItem).mockReturnValue({ data: null, error: null, isLoading: false });

		renderSection({ heading: "Artifacts" });

		expect(
			screen.getByText("Artifacts will appear here once agents produce output for this context."),
		).toBeInTheDocument();
	});

	it("renders null when data is empty and no heading is provided", () => {
		vi.mocked(useParentedKnowledgeItems).mockReturnValue({
			data: { items: [] },
			error: null,
			isLoading: false,
		});
		vi.mocked(useKnowledgeItem).mockReturnValue({ data: null, error: null, isLoading: false });

		renderSection({ heading: undefined });

		expect(screen.queryByTestId("artifact-section-container")).toBeNull();
	});

	// ── Populated ─────────────────────────────────────────────────────────────

	it("renders one row per item when populated", () => {
		vi.mocked(useParentedKnowledgeItems).mockReturnValue({
			data: { items: [ITEM_A, ITEM_B, ITEM_C] },
			error: null,
			isLoading: false,
		});
		vi.mocked(useKnowledgeItem).mockReturnValue({ data: null, error: null, isLoading: false });

		renderSection({ heading: "Artifacts" });

		expect(screen.getByText("Agent output alpha")).toBeInTheDocument();
		expect(screen.getByText("Agent output beta")).toBeInTheDocument();
		expect(screen.getByText("Agent output gamma")).toBeInTheDocument();
	});

	it("renders heading when provided and items exist", () => {
		vi.mocked(useParentedKnowledgeItems).mockReturnValue({
			data: { items: [ITEM_A] },
			error: null,
			isLoading: false,
		});
		vi.mocked(useKnowledgeItem).mockReturnValue({ data: null, error: null, isLoading: false });

		renderSection({ heading: "My Artifacts" });

		expect(screen.getByText("My Artifacts")).toBeInTheDocument();
	});

	it("calls useParentedKnowledgeItems with the provided parentKind and parentId", () => {
		vi.mocked(useParentedKnowledgeItems).mockReturnValue({
			data: null,
			error: null,
			isLoading: true,
		});
		vi.mocked(useKnowledgeItem).mockReturnValue({ data: null, error: null, isLoading: false });

		renderSection({ parentKind: "thread", parentId: "thr-99" });

		expect(useParentedKnowledgeItems).toHaveBeenCalledWith("thread", "thr-99");
	});

	// ── AC10: click → split detail ────────────────────────────────────────────

	it("AC10: clicking an item row renders the split detail pane", async () => {
		vi.mocked(useParentedKnowledgeItems).mockReturnValue({
			data: { items: [ITEM_A] },
			error: null,
			isLoading: false,
		});
		vi.mocked(useKnowledgeItem).mockReturnValue({
			data: ITEM_A,
			error: null,
			isLoading: false,
		});

		renderSection();

		// Before click: detail pane absent
		expect(screen.queryByTestId("artifact-section-detail")).toBeNull();

		fireEvent.click(screen.getByText("Agent output alpha"));

		await waitFor(() => {
			expect(screen.getByTestId("artifact-section-detail")).toBeInTheDocument();
		});
	});
});
