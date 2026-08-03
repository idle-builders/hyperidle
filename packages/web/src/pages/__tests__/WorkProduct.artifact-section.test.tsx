/**
 * L12 — WorkTeam: ArtifactSection mount tests.
 *
 * AC coverage:
 *  - ArtifactSection replaces the placeholder at team-artifact-slot
 *  - filter has axis="product" and the teamId from route params
 *  - layout="stack", limit=10
 *  - heading "Artifacts" is rendered
 *
 * @lore U5: Renamed from WorkProduct → WorkTeam. File name kept for git history tracing.
 */

// @lore U1: ProductDetail → TeamDetail; `product` → `team`; `team` → `teamMembers`.
import type { TeamDetail } from "@hyperidle/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkTeam } from "../../pages/WorkTeam";

// AgentEditDialog (rendered inside WorkTeam) calls useToast on mount.
// These tests are about ArtifactSection mounting, not toasts — mock the hook
// to avoid the "must be used within <ToastRegion>" error.
// @lore AB3: Any WorkTeam render in tests needs either a <ToastRegion> wrapper
// or a useToast mock, because AgentEditDialog always mounts inside WorkTeam.
vi.mock("../../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../../shell/ToastRegion.js");
	return {
		...actual,
		useToast: vi.fn(() => ({ showToast: vi.fn() })),
	};
});

// Mock ArtifactSection to capture props.
// useArtifactOpen must also be exported since WorkTeamLoaded calls it.
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
			data-filter-team-id={filter.axis === "product" ? filter.teamId : ""}
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
const MOCK_TEAM: TeamDetail = {
	team: {
		id: "prod-l12",
		name: "L12 Test Team",
		// @lore U1: TeamStatus = "healthy"|"behind"|"blocked"; "active" is not valid.
		status: "healthy",
		phase: "build",
		leadAgentId: null,
	},
	teamMembers: { id: "tm-l12", formedAt: "2024-01-01T00:00:00.000Z", dissolvedAt: null },
	roster: [],
	burn: {
		activeBets: 1,
		capacity: 3,
	},
	activeBets: [],
};

function renderTeam(teamId = "prod-l12"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/product/${teamId}`]}>
			<Routes>
				<Route path="/work/product/:productId" element={<WorkTeam overrideData={MOCK_TEAM} />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkTeam ArtifactSection mount (L12)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("mounts ArtifactSection with product filter, stack layout, and limit 10", () => {
		renderTeam("prod-l12");

		const section = screen.getByTestId("artifact-section");
		expect(section).toBeInTheDocument();
		expect(section).toHaveAttribute("data-filter-axis", "product");
		expect(section).toHaveAttribute("data-filter-team-id", "prod-l12");
		expect(section).toHaveAttribute("data-layout", "stack");
		expect(section).toHaveAttribute("data-limit", "10");
	});

	it("passes heading='Artifacts' to ArtifactSection", () => {
		renderTeam("prod-l12");

		const section = screen.getByTestId("artifact-section");
		expect(section).toHaveAttribute("data-heading", "Artifacts");
	});

	it("old placeholder artifact slot does not exist (ArtifactSection renders inline)", () => {
		renderTeam("prod-l12");

		// The old empty placeholder no longer exists
		const placeholder = document.querySelector("section[data-testid='team-artifact-slot']:empty");
		expect(placeholder).toBeNull();
	});
});
