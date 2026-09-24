/**
 * WorkTeam: ArtifactSection absence tests.
 *
 * Produced items are documents parented to tasks — there is no team-level
 * parent concept, so ArtifactSection does NOT appear on the WorkTeam page. Tasks
 * each surface their own produced items via ArtifactSection with parentKind="task".
 *
 * @lore U5: Renamed from WorkProduct → WorkTeam. File name kept for git history tracing.
 */

import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TeamPageData } from "../../hooks/useTeam.js";
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

// ArtifactSection is NOT rendered by WorkTeam — no mock needed.

// @lore U1: TeamDetail replaces ProductDetail. `team` (TeamSummary) replaces
// `product` (ProductSummary).
// @lore BC5 T9: TeamPageData replaces TeamDetail — team is id + name + a
// computed "healthy" | "blocked" status now (D-c7jgxy).
const MOCK_TEAM: TeamPageData = {
	team: {
		id: "prod-l12",
		name: "L12 Test Team",
		status: "healthy",
	},
	roster: [],
	tasksInProgress: [],
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

	it("does NOT render ArtifactSection — produced items are on tasks, not the team", () => {
		renderTeam("prod-l12");

		// WorkTeam has no team-level artifact section; produced items are task-parented.
		// ArtifactSection renders on individual task pages (WorkTaskPage), not here.
		const section = document.querySelector("[data-testid='artifact-section']");
		expect(section).toBeNull();
	});

	it("old placeholder artifact slot does not exist (ArtifactSection renders inline)", () => {
		renderTeam("prod-l12");

		// The old empty placeholder no longer exists
		const placeholder = document.querySelector("section[data-testid='team-artifact-slot']:empty");
		expect(placeholder).toBeNull();
	});
});
