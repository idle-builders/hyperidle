/**
 * L18 — ArtifactThreadsSummary component tests.
 *
 * AC coverage:
 *  - renders a row per summary including snippet and relative time
 *  - renders the empty stub when bet has artifacts but zero summaries
 *  - hides entirely when bet has zero artifacts (no summaries, totalCount=0)
 *  - renders +N more affordance when truncated
 */

import type { ArtifactThreadSummaryResponse } from "@hyperidle/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtifactThreadsSummary } from "../../components/ArtifactThreadsSummary";

vi.mock("../../hooks/useArtifactThreadSummary", () => ({
	useArtifactThreadSummary: vi.fn(),
}));

import { useArtifactThreadSummary } from "../../hooks/useArtifactThreadSummary";

function makeResponse(
	summaries: ArtifactThreadSummaryResponse["summaries"],
	totalCount: number,
	truncated = false,
): ArtifactThreadSummaryResponse {
	return { summaries, totalCount, truncated };
}

function renderComponent(betId: string): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<ArtifactThreadsSummary betId={betId} />
		</MemoryRouter>,
	);
}

describe("ArtifactThreadsSummary (L18)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders a row per summary including snippet and relative time", () => {
		vi.mocked(useArtifactThreadSummary).mockReturnValue({
			data: makeResponse(
				[
					{
						artifactId: "art-1",
						artifactKind: "text_diff",
						artifactTitle: "auth-service.ts",
						threadId: "t-1",
						messageCount: 3,
						lastMessageAt: "2026-05-04T10:11:12Z",
						lastMessageSnippet: "Looks good but the cache TTL is too long",
						hasUnresolvedReview: false,
					},
					{
						artifactId: "art-2",
						artifactKind: "code_diff",
						artifactTitle: "component.tsx",
						threadId: "t-2",
						messageCount: 1,
						lastMessageAt: "2026-05-04T09:00:00Z",
						lastMessageSnippet: "Needs a minor fix",
						hasUnresolvedReview: true,
					},
				],
				2,
			),
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		renderComponent("bet-test");

		// Both artifact titles should be visible
		expect(screen.getByText("auth-service.ts")).toBeInTheDocument();
		expect(screen.getByText("component.tsx")).toBeInTheDocument();

		// Snippets should appear
		expect(screen.getByText(/Looks good but the cache TTL/)).toBeInTheDocument();
		expect(screen.getByText(/Needs a minor fix/)).toBeInTheDocument();

		// Message counts should be visible — use getAllByText since relative time
		// strings may also contain the same digits; we verify at least one match exists.
		expect(screen.getAllByText(/\b3\b/).length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText(/\b1\b/).length).toBeGreaterThanOrEqual(1);
	});

	it("renders the empty stub when bet has artifacts but zero summaries", () => {
		vi.mocked(useArtifactThreadSummary).mockReturnValue({
			data: makeResponse([], 0),
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		renderComponent("bet-empty");

		// Should render the section header but with an empty stub
		expect(screen.getByTestId("artifact-threads-summary")).toBeInTheDocument();
		expect(screen.getByTestId("artifact-threads-summary-empty")).toBeInTheDocument();
	});

	it("hides entirely when data is null (bet has zero artifacts)", () => {
		vi.mocked(useArtifactThreadSummary).mockReturnValue({
			data: null,
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		renderComponent("bet-no-artifacts");

		// Section should not render at all
		expect(screen.queryByTestId("artifact-threads-summary")).not.toBeInTheDocument();
	});

	it("renders View all (N more) affordance when truncated", () => {
		vi.mocked(useArtifactThreadSummary).mockReturnValue({
			data: makeResponse(
				new Array(10).fill(null).map((_, i) => ({
					artifactId: `art-${i}`,
					artifactKind: "text_diff",
					artifactTitle: `file-${i}.ts`,
					threadId: `t-${i}`,
					messageCount: 1,
					lastMessageAt: "2026-05-04T10:00:00Z",
					lastMessageSnippet: "snippet",
					hasUnresolvedReview: false,
				})),
				12,
				true,
			),
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		renderComponent("bet-many");

		// The "+N more" affordance should appear
		expect(screen.getByTestId("artifact-threads-summary-more")).toBeInTheDocument();
		// It should show "+2 more artifact discussions →" (12 total - 10 shown = 2)
		expect(screen.getByText(/\+2 more/)).toBeInTheDocument();
	});

	it("renders error state when hook errors", () => {
		vi.mocked(useArtifactThreadSummary).mockReturnValue({
			data: null,
			error: "HTTP 500",
			isLoading: false,
			refresh: vi.fn(),
		});

		renderComponent("bet-error");

		expect(screen.getByTestId("artifact-threads-summary")).toBeInTheDocument();
		expect(screen.getByTestId("artifact-threads-summary-error")).toBeInTheDocument();
		expect(screen.getByText(/Could not load artifact discussion/)).toBeInTheDocument();
	});

	it("renders loading state", () => {
		vi.mocked(useArtifactThreadSummary).mockReturnValue({
			data: null,
			error: null,
			isLoading: true,
			refresh: vi.fn(),
		});

		renderComponent("bet-loading");

		// Should render loading placeholder or skeleton
		expect(screen.getByTestId("artifact-threads-summary-loading")).toBeInTheDocument();
	});
});
