/**
 * L18 — useArtifactThreadSummary hook tests.
 *
 * AC coverage:
 *  - fetches the bet's summary endpoint; refresh re-fires
 *  - returns { data, isLoading: false } on success
 *  - returns { error, isLoading: false } on failure
 *  - refresh() triggers a re-fetch
 */

import type { ArtifactThreadSummaryResponse } from "@hyperidle/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useArtifactThreadSummary } from "../../hooks/useArtifactThreadSummary";

const MOCK_RESPONSE: ArtifactThreadSummaryResponse = {
	summaries: [
		{
			artifactId: "art-1",
			artifactKind: "text_diff",
			artifactTitle: "auth-service.ts",
			threadId: "t-1",
			messageCount: 3,
			lastMessageAt: "2026-05-04T10:11:12Z",
			lastMessageSnippet: "Looks good but the cache TTL",
			hasUnresolvedReview: false,
		},
	],
	totalCount: 1,
	truncated: false,
};

function makeSuccessResponse(data: ArtifactThreadSummaryResponse): Response {
	return new Response(JSON.stringify(data), { status: 200 });
}

function makeErrorResponse(status: number): Response {
	return new Response(JSON.stringify({ error: "Not found" }), { status });
}

describe("useArtifactThreadSummary (L18)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		global.fetch = fetchSpy as unknown as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("fetches the bet's summary endpoint and returns data on success", async () => {
		fetchSpy.mockResolvedValueOnce(makeSuccessResponse(MOCK_RESPONSE));

		const { result } = renderHook(() => useArtifactThreadSummary("bet-001"));

		expect(result.current.isLoading).toBe(true);

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.data).not.toBeNull();
		expect(result.current.data?.summaries).toHaveLength(1);
		expect(result.current.data?.totalCount).toBe(1);
		expect(result.current.data?.truncated).toBe(false);
		expect(result.current.error).toBeNull();

		const [url] = fetchSpy.mock.calls[0] as [string];
		expect(url).toContain("/api/bets/bet-001/artifact-thread-summary");
	});

	it("returns error when fetch fails", async () => {
		fetchSpy.mockResolvedValueOnce(makeErrorResponse(500));

		const { result } = renderHook(() => useArtifactThreadSummary("bet-err"));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).not.toBeNull();
	});

	it("returns null data and no loading when betId is null", async () => {
		const { result } = renderHook(() => useArtifactThreadSummary(null));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("refresh() triggers a re-fetch of the summary", async () => {
		const updatedResponse: ArtifactThreadSummaryResponse = {
			summaries: [
				...MOCK_RESPONSE.summaries,
				{
					artifactId: "art-2",
					artifactKind: "code_diff",
					artifactTitle: "component.tsx",
					threadId: "t-2",
					messageCount: 1,
					lastMessageAt: "2026-05-04T11:00:00Z",
					lastMessageSnippet: "Updated",
					hasUnresolvedReview: false,
				},
			],
			totalCount: 2,
			truncated: false,
		};

		fetchSpy
			.mockResolvedValueOnce(makeSuccessResponse(MOCK_RESPONSE))
			.mockResolvedValueOnce(makeSuccessResponse(updatedResponse));

		const { result } = renderHook(() => useArtifactThreadSummary("bet-refresh"));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.data?.summaries).toHaveLength(1);

		act(() => {
			result.current.refresh();
		});

		await waitFor(() => {
			expect(result.current.data?.summaries).toHaveLength(2);
		});
	});
});
