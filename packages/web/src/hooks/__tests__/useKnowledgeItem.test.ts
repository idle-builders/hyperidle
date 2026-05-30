/**
 * useKnowledgeItem hook — unit tests (T2 red phase).
 *
 * Covers:
 *   - Fetches from /api/knowledge/:id with the correct URL
 *   - Returns typed item data on success
 *   - Returns error on 404 response
 *   - Returns null data when id is undefined (no fetch triggered)
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

import type { KnowledgeItemData } from "../useKnowledgeItem";
import { useKnowledgeItem } from "../useKnowledgeItem";

const MOCK_ITEM: KnowledgeItemData = {
	id: "k-abc",
	title: "Test Knowledge Item",
	body: "# Test\n\nSome body text.",
	format: "markdown",
	status: "active",
	version: 3,
	updatedBy: "user-1",
	scopeKind: "practice",
	scopeId: null,
	topic: "Testing",
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-02T00:00:00Z",
};

describe("useKnowledgeItem", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../../services/api-fetch.js");
		fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts in loading state when id is defined", () => {
		fetchSpy.mockImplementation(() => new Promise(() => {})); // never resolves
		const { result } = renderHook(() => useKnowledgeItem("k-abc"));
		expect(result.current.isLoading).toBe(true);
		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("fetches from /api/knowledge/:id with the correct URL", async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_ITEM), { status: 200 }));

		renderHook(() => useKnowledgeItem("k-abc"));

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledWith("/api/knowledge/k-abc");
		});
	});

	it("returns typed item data on success", async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_ITEM), { status: 200 }));

		const { result } = renderHook(() => useKnowledgeItem("k-abc"));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.data).toMatchObject({
			id: "k-abc",
			title: "Test Knowledge Item",
			version: 3,
			scopeKind: "practice",
		});
		expect(result.current.error).toBeNull();
	});

	it("returns error on 404 response", async () => {
		fetchSpy.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

		const { result } = renderHook(() => useKnowledgeItem("k-missing"));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toMatch(/404/);
	});

	it("returns null data and isLoading=false when id is undefined", async () => {
		const { result } = renderHook(() => useKnowledgeItem(undefined));

		expect(result.current.isLoading).toBe(false);
		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
