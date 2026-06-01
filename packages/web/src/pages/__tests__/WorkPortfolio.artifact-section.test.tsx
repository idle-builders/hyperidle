/**
 * L12 — WorkPortfolio: ArtifactSection mount tests.
 *
 * AC coverage:
 *  - ArtifactSection mounts with filter={axis:"portfolio"}, layout="gallery", limit=12
 *  - heading "Artifacts" is rendered
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkPortfolio } from "../../pages/WorkPortfolio";

// Mock useTeams so the page renders without API
vi.mock("../../hooks/useTeams", () => ({
	useTeams: vi.fn(() => ({ data: null, error: null, isLoading: false })),
}));

// @lore U9: useBets replaces useCanvasBets. Mock with empty bets so the
// page renders the empty state + ArtifactSection (not loading skeleton).
vi.mock("../../hooks/useBets", () => ({
	useBets: vi.fn(() => ({
		bets: [],
		loading: false,
		error: null,
		refresh: vi.fn(),
	})),
}));

// Mock useArtifacts — controlled state for ArtifactSection
vi.mock("../../hooks/useArtifacts", () => ({
	useArtifacts: vi.fn(() => ({
		data: { items: [], nextCursor: null },
		error: null,
		isLoading: false,
	})),
}));

// Mock ArtifactSection to capture props; prevents DS component complexity.
// useArtifactOpen must also be exported from the mock since WorkPortfolio calls it.
vi.mock("../../components/ArtifactSection", () => ({
	ArtifactSection: ({
		filter,
		layout,
		limit,
		heading,
	}: {
		filter: { axis: string };
		layout: string;
		limit?: number;
		heading?: string;
	}) => (
		<div
			data-testid="artifact-section"
			data-filter-axis={filter.axis}
			data-layout={layout}
			data-limit={limit !== undefined ? String(limit) : ""}
			data-heading={heading ?? ""}
		>
			ArtifactSection
		</div>
	),
	// WorkPortfolio calls useArtifactOpen() — must be present in the mock.
	useArtifactOpen: () => vi.fn(),
}));

function renderPortfolio(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<WorkPortfolio />
		</MemoryRouter>,
	);
}

describe("WorkPortfolio ArtifactSection mount (L12)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("mounts ArtifactSection with portfolio filter, gallery layout, and limit 12", () => {
		renderPortfolio();

		const section = screen.getByTestId("artifact-section");
		expect(section).toBeInTheDocument();
		expect(section).toHaveAttribute("data-filter-axis", "portfolio");
		expect(section).toHaveAttribute("data-layout", "gallery");
		expect(section).toHaveAttribute("data-limit", "12");
	});

	it("passes heading='Artifacts' to ArtifactSection", () => {
		renderPortfolio();

		const section = screen.getByTestId("artifact-section");
		expect(section).toHaveAttribute("data-heading", "Artifacts");
	});
});
