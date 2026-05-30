/**
 * L12 — WorkProduct: ArtifactSection mount tests.
 *
 * AC coverage:
 *  - ArtifactSection replaces the placeholder at product-artifact-slot
 *  - filter has axis="product" and the productId from route params
 *  - layout="stack", limit=10
 *  - heading "Artifacts" is rendered
 */

// @lore U1: ProductDetail → TeamDetail; `product` → `team`; `team` → `teamMembers`.
import type { TeamDetail } from "@hyperidle/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkProduct } from "../../pages/WorkProduct";

// Mock ArtifactSection to capture props.
// useArtifactOpen must also be exported since WorkProductLoaded calls it.
// @lore U1: ArtifactFilterAxis for "product" axis uses `teamId` (not `productId`).
vi.mock("../../components/ArtifactSection", () => ({
	ArtifactSection: ({
		filter,
		layout,
		limit,
		heading,
	}: {
		filter: { axis: string; teamId?: string };
		layout: string;
		limit?: number;
		heading?: string;
	}) => (
		<div
			data-testid="artifact-section"
			data-filter-axis={filter.axis}
			data-filter-product-id={filter.axis === "product" ? filter.teamId : ""}
			data-layout={layout}
			data-limit={limit !== undefined ? String(limit) : ""}
			data-heading={heading ?? ""}
		>
			ArtifactSection
		</div>
	),
	useArtifactOpen: () => vi.fn(),
}));

// @lore U1: TeamDetail replaces ProductDetail. `team` (TeamSummary) replaces
// `product` (ProductSummary). `teamMembers` replaces `team` (membership group).
const MOCK_PRODUCT: TeamDetail = {
	team: {
		id: "prod-l12",
		name: "L12 Test Product",
		// @lore U1: TeamStatus = "healthy"|"behind"|"blocked"; "active" is not valid.
		status: "healthy",
		phase: "build",
		leadAgentId: null,
	},
	teamMembers: { id: "tm-l12", formedAt: "2024-01-01T00:00:00.000Z", dissolvedAt: null },
	roster: [],
	burn: {
		costActual: { minor: 100, currency: "USD" },
		costCap: { minor: 1000, currency: "USD" },
		activeBets: 1,
		capacity: 3,
	},
	activeBets: [],
};

function renderProduct(productId = "prod-l12"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/product/${productId}`]}>
			<Routes>
				<Route
					path="/work/product/:productId"
					element={<WorkProduct overrideData={MOCK_PRODUCT} />}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkProduct ArtifactSection mount (L12)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("mounts ArtifactSection with product filter, stack layout, and limit 10", () => {
		renderProduct("prod-l12");

		const section = screen.getByTestId("artifact-section");
		expect(section).toBeInTheDocument();
		expect(section).toHaveAttribute("data-filter-axis", "product");
		expect(section).toHaveAttribute("data-filter-product-id", "prod-l12");
		expect(section).toHaveAttribute("data-layout", "stack");
		expect(section).toHaveAttribute("data-limit", "10");
	});

	it("passes heading='Artifacts' to ArtifactSection", () => {
		renderProduct("prod-l12");

		const section = screen.getByTestId("artifact-section");
		expect(section).toHaveAttribute("data-heading", "Artifacts");
	});

	it("artifact-slot placeholder is replaced by ArtifactSection", () => {
		renderProduct("prod-l12");

		// The old empty placeholder was data-testid="product-artifact-slot"
		// It must no longer exist as an empty section
		const placeholder = document.querySelector(
			"section[data-testid='product-artifact-slot']:empty",
		);
		expect(placeholder).toBeNull();
	});
});
