/**
 * L12 — ArtifactSection unit tests.
 *
 * AC coverage:
 *  - loading: renders skeleton(s) matching layout (gallery=3, stack=2, single=1)
 *  - error: renders ErrorState
 *  - empty with heading: renders EmptyState
 *  - empty without heading (TaskSheet / single layout, no heading): renders null
 *  - populated gallery: renders ArtifactGalleryCard per item
 *  - populated stack: renders ArtifactStackItem per item
 *  - populated single: renders ArtifactPreview for items[0]
 *  - overflow: renders non-interactive "View all" span when nextCursor !== null
 *  - onOpen callback navigates to /artifacts/:id
 *  - limit param is forwarded to useArtifacts
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArtifactSection as ArtifactSectionType } from "../ArtifactSection";

// Mock useArtifacts so tests control the fetch state
vi.mock("../../hooks/useArtifacts", () => ({
	useArtifacts: vi.fn(),
}));

// Mock useNavigate so we can assert navigation calls
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-router-dom")>();
	return {
		...actual,
		useNavigate: () => mockNavigate,
	};
});

import { useArtifacts } from "../../hooks/useArtifacts";
import { ArtifactSection } from "../ArtifactSection";

/** Canonical Artifact fixture for tests */
const MOCK_ARTIFACT = {
	id: "art-l12-1",
	producingTaskId: "task-l12-1",
	producingTaskTitle: "Build feature X",
	kind: "code" as const,
	label: null,
	preview: {
		kind: "code" as const,
		path: "layers/core-ui/src/Foo.tsx",
		lang: "typescript",
		text: "// Foo.tsx",
	},
	threadCount: 0,
	createdAt: "2026-05-01T10:00:00.000Z",
};

const MOCK_ARTIFACT_2 = {
	...MOCK_ARTIFACT,
	id: "art-l12-2",
	producingTaskId: "task-l12-2",
	producingTaskTitle: "Build feature Y",
};

const MOCK_ARTIFACT_3 = {
	...MOCK_ARTIFACT,
	id: "art-l12-3",
	producingTaskId: "task-l12-3",
	producingTaskTitle: "Build feature Z",
};

function renderSection(
	props: Partial<React.ComponentProps<typeof ArtifactSectionType>> & {
		filter?: React.ComponentProps<typeof ArtifactSectionType>["filter"];
		layout?: React.ComponentProps<typeof ArtifactSectionType>["layout"];
	} = {},
): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<ArtifactSection
				filter={{ axis: "portfolio" }}
				layout="gallery"
				onOpen={vi.fn()}
				{...props}
			/>
		</MemoryRouter>,
	);
}

describe("ArtifactSection (L12)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		mockNavigate.mockReset();
	});

	// ── Loading states ────────────────────────────────────────────────────────

	it("gallery layout: renders 3 skeleton cards while loading", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: null,
			error: null,
			isLoading: true,
		});

		renderSection({ layout: "gallery" });

		const skeletons = screen.getAllByTestId("skeleton-card");
		expect(skeletons).toHaveLength(3);
	});

	it("stack layout: renders 2 skeleton rows while loading", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: null,
			error: null,
			isLoading: true,
		});

		renderSection({ layout: "stack" });

		// SkeletonList renders a single container with N rows inside
		const skeletonList = screen.getByTestId("skeleton-list");
		expect(skeletonList).toBeInTheDocument();
		const rows = screen.getAllByTestId("skeleton-row");
		expect(rows).toHaveLength(2);
	});

	it("single layout: renders 1 skeleton card while loading", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: null,
			error: null,
			isLoading: true,
		});

		renderSection({ layout: "single" });

		const skeletons = screen.getAllByTestId("skeleton-card");
		expect(skeletons).toHaveLength(1);
	});

	// ── Error state ───────────────────────────────────────────────────────────

	it("renders ErrorState when fetch fails and heading is provided", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: null,
			error: "HTTP 500",
			isLoading: false,
		});

		renderSection({ heading: "Artifacts" });

		expect(screen.getByTestId("error-state")).toBeInTheDocument();
	});

	it("renders null when fetch fails and heading is NOT provided (W-3: TaskSheet collapse)", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: null,
			error: "HTTP 500",
			isLoading: false,
		});

		// No heading prop — should collapse entirely on error
		const { container } = renderSection({ layout: "single" });
		expect(container.firstChild).toBeNull();
	});

	// ── Empty states ──────────────────────────────────────────────────────────

	it("with heading: renders EmptyState when data is empty", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: { items: [], nextCursor: null },
			error: null,
			isLoading: false,
		});

		renderSection({ heading: "Artifacts" });

		expect(screen.getByTestId("empty-state")).toBeInTheDocument();
	});

	it("uses emptyDescription prop in EmptyState when provided (W-4)", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: { items: [], nextCursor: null },
			error: null,
			isLoading: false,
		});

		renderSection({
			heading: "Artifacts",
			emptyDescription: "Artifacts appear here as agents complete tasks.",
		});

		expect(screen.getByText("Artifacts appear here as agents complete tasks.")).toBeInTheDocument();
	});

	it("falls back to generic description when emptyDescription is not provided", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: { items: [], nextCursor: null },
			error: null,
			isLoading: false,
		});

		renderSection({ heading: "Artifacts" });

		expect(
			screen.getByText("Artifacts will appear here once agents produce output for this context."),
		).toBeInTheDocument();
	});

	it("without heading: renders null when data is empty (TaskSheet pattern)", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: { items: [], nextCursor: null },
			error: null,
			isLoading: false,
		});

		const { container } = renderSection({ layout: "single" });

		// No heading → render null → container is empty (only MemoryRouter scaffold)
		expect(container.firstChild).toBeNull();
	});

	// ── Populated: gallery ────────────────────────────────────────────────────

	it("gallery layout: renders ArtifactGalleryCard per item", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: { items: [MOCK_ARTIFACT, MOCK_ARTIFACT_2], nextCursor: null },
			error: null,
			isLoading: false,
		});

		const { container } = renderSection({ layout: "gallery" });

		// ArtifactGalleryCard adds data-ds-component="ArtifactGalleryCard" via dsProps (B-2 fix)
		const cards = container.querySelectorAll("[data-ds-component='ArtifactGalleryCard']");
		expect(cards).toHaveLength(2);
	});

	it("gallery layout: uses data-ds-component='ArtifactGalleryCard' selector", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: { items: [MOCK_ARTIFACT], nextCursor: null },
			error: null,
			isLoading: false,
		});

		const { container } = renderSection({ layout: "gallery" });

		const cards = container.querySelectorAll("[data-ds-component='ArtifactGalleryCard']");
		expect(cards).toHaveLength(1);
	});

	// ── Populated: stack ──────────────────────────────────────────────────────

	it("stack layout: renders ArtifactStackItem per item", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: { items: [MOCK_ARTIFACT, MOCK_ARTIFACT_2], nextCursor: null },
			error: null,
			isLoading: false,
		});

		const { container } = renderSection({ layout: "stack" });

		const items = container.querySelectorAll("[data-ds-component='ArtifactStackItem']");
		expect(items).toHaveLength(2);
	});

	// ── Populated: single ─────────────────────────────────────────────────────

	it("single layout: renders ArtifactPreview for the first item", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: { items: [MOCK_ARTIFACT, MOCK_ARTIFACT_2], nextCursor: null },
			error: null,
			isLoading: false,
		});

		const { container } = renderSection({ layout: "single" });

		// ArtifactPreview renders with data-ds-component="ArtifactPreview"
		const previews = container.querySelectorAll("[data-ds-component='ArtifactPreview']");
		expect(previews).toHaveLength(1);
	});

	// ── Overflow "View all" ───────────────────────────────────────────────────

	it("renders non-interactive 'View all' span when nextCursor is not null", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: { items: [MOCK_ARTIFACT], nextCursor: "cursor-abc" },
			error: null,
			isLoading: false,
		});

		const { container } = renderSection({ layout: "gallery" });

		// Must be a <span>, NOT an <a> or <button>
		const viewAll = container.querySelector("span[data-testid='artifact-section-view-all']");
		expect(viewAll).not.toBeNull();
		// Confirm it's not a link
		expect(viewAll?.tagName.toLowerCase()).toBe("span");
		expect(viewAll?.closest("a")).toBeNull();
		expect(viewAll?.closest("button")).toBeNull();
	});

	it("does NOT render 'View all' when nextCursor is null", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: { items: [MOCK_ARTIFACT], nextCursor: null },
			error: null,
			isLoading: false,
		});

		const { container } = renderSection({ layout: "gallery" });

		const viewAll = container.querySelector("[data-testid='artifact-section-view-all']");
		expect(viewAll).toBeNull();
	});

	// ── onOpen / navigation ───────────────────────────────────────────────────

	// UI-080: ArtifactGalleryCard now renders as <a href> when href is provided.
	// ArtifactSection always passes href, so the card is a real link regardless of onOpen.
	it("renders artifact gallery card as an anchor link with correct href (UI-080)", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: { items: [MOCK_ARTIFACT], nextCursor: null },
			error: null,
			isLoading: false,
		});

		const { container } = render(
			<MemoryRouter>
				<ArtifactSection filter={{ axis: "portfolio" }} layout="gallery" />
			</MemoryRouter>,
		);

		const card = container.querySelector("[data-ds-component='ArtifactGalleryCard']");
		expect(card).not.toBeNull();
		expect(card?.tagName.toLowerCase()).toBe("a");
		expect(card?.getAttribute("href")).toBe("/artifacts/art-l12-1");
	});

	// ── limit prop forwarded to useArtifacts ─────────────────────────────────

	it("forwards limit to useArtifacts when provided", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: { items: [], nextCursor: null },
			error: null,
			isLoading: false,
		});

		renderSection({ layout: "gallery", limit: 12 });

		// useArtifacts should be called with the filter and { limit: 12 }
		expect(useArtifacts).toHaveBeenCalledWith({ axis: "portfolio" }, { limit: 12 });
	});

	it("calls useArtifacts without query when limit is not provided", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: { items: [], nextCursor: null },
			error: null,
			isLoading: false,
		});

		renderSection({ layout: "gallery" });

		// useArtifacts should be called without a second arg
		expect(useArtifacts).toHaveBeenCalledWith({ axis: "portfolio" }, undefined);
	});

	// ── Heading renders ───────────────────────────────────────────────────────

	it("renders heading when heading prop is provided", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: { items: [MOCK_ARTIFACT], nextCursor: null },
			error: null,
			isLoading: false,
		});

		renderSection({ layout: "gallery", heading: "Artifacts" });

		expect(screen.getByText("Artifacts")).toBeInTheDocument();
	});

	// ── Multiple items in gallery ─────────────────────────────────────────────

	it("gallery layout: renders all three mock artifacts", () => {
		vi.mocked(useArtifacts).mockReturnValue({
			data: { items: [MOCK_ARTIFACT, MOCK_ARTIFACT_2, MOCK_ARTIFACT_3], nextCursor: null },
			error: null,
			isLoading: false,
		});

		const { container } = renderSection({ layout: "gallery" });

		const cards = container.querySelectorAll("[data-ds-component='ArtifactGalleryCard']");
		expect(cards).toHaveLength(3);
	});
});
