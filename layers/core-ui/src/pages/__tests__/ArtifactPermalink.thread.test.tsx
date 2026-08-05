/**
 * L18 — ArtifactPermalink thread tests.
 *
 * AC coverage:
 *  - thread renders below the artifact preview on the artifact detail page
 */

import type { Artifact } from "@hyperidle/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtifactPermalink } from "../../pages/ArtifactPermalink";

const MOCK_ARTIFACT: Artifact = {
	id: "art-permalink-001",
	producingTaskId: "task-001",
	producingTaskTitle: "Build the auth service",
	kind: "code",
	label: null,
	preview: { kind: "code", path: "auth-service.ts", lang: "typescript", text: "// auth service" },
	threadCount: 0,
	createdAt: "2026-05-05T09:00:00Z",
};

vi.mock("../../hooks/useArtifacts", () => ({
	useArtifact: vi.fn(() => ({
		data: MOCK_ARTIFACT,
		error: null,
		isLoading: false,
	})),
}));

vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: ({ hostKind, hostId }: { hostKind: string; hostId: string }) => (
		<div data-testid="host-thread-section" data-host-kind={hostKind} data-host-id={hostId}>
			Thread Section
		</div>
	),
}));

function renderArtifact(id = "art-permalink-001"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/artifacts/${id}`]}>
			<Routes>
				<Route path="/artifacts/:id" element={<ArtifactPermalink />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("ArtifactPermalink thread (L18)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("thread renders below the artifact preview", () => {
		renderArtifact();

		const threadSection = screen.getByTestId("host-thread-section");
		expect(threadSection).toBeInTheDocument();
		expect(threadSection).toHaveAttribute("data-host-kind", "artifact");
		expect(threadSection).toHaveAttribute("data-host-id", "art-permalink-001");
	});

	it("thread section renders with correct hostKind=artifact", () => {
		renderArtifact("art-permalink-001");

		const threadSection = screen.getByTestId("host-thread-section");
		expect(threadSection.getAttribute("data-host-kind")).toBe("artifact");
	});
});
