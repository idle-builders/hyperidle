/**
 * nested-knowledge-items — KnowledgeList's `role !== "skill" && role !== "rule"`
 * filter (KnowledgeList.tsx:858) is REPLACED by the parent rule, not extended
 * (architecture.md §4): "Excluding non-knowledge_item parents removes them
 * structurally; delete the role filter rather than extending it."
 *
 * Reproduces the exact scenario architecture.md names as the live bug: an
 * agent identity (`role='agent_file'`, `parentKind='agent'`) and a routine
 * prompt (`role='prompt'`, `parentKind='routine'`) both pass today's role
 * filter (which only excludes `skill`/`rule`) and render under "General".
 * The parent rule must exclude them by their non-knowledge_item parent
 * instead.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeList } from "../../pages/KnowledgeList";

vi.mock("../../hooks/useFetch", () => ({
	useFetch: (url: string | null) => {
		if (url?.includes("/api/knowledge")) {
			return {
				data: {
					items: [
						{
							id: "k-ordinary",
							title: "Auth Strategy Decision",
							body: "We decided to use JWT.",
							topic: "Auth",
							status: "active",
							scopeKind: "factory",
							role: "ordinary",
							parentKind: null,
							parentId: null,
							updatedAt: "2026-01-01T10:00:00.000Z",
							updatedBy: "u-founder",
							version: 1,
							format: "markdown",
						},
						{
							id: "ki_af_agent-1",
							title: "Agent One — identity",
							body: "I am Agent One.",
							topic: null,
							status: "active",
							scopeKind: "user",
							role: "agent_file",
							parentKind: "agent",
							parentId: "agent-1",
							updatedAt: "2026-01-01T10:00:00.000Z",
							updatedBy: "u-founder",
							version: 1,
							format: "markdown",
						},
						{
							id: "ki_rp_routine-1",
							title: "Routine One — prompt",
							body: "Do the thing.",
							topic: null,
							status: "active",
							scopeKind: "factory",
							role: "prompt",
							parentKind: "routine",
							parentId: "routine-1",
							updatedAt: "2026-01-01T10:00:00.000Z",
							updatedBy: "u-founder",
							version: 1,
							format: "markdown",
						},
					],
				},
				loading: false,
				error: null,
				refresh: vi.fn(),
			};
		}
		return { data: null, loading: false, error: null, refresh: vi.fn() };
	},
}));

vi.mock("../../hooks/useCurrentUser", () => ({
	useCurrentUser: () => ({ data: { id: "u-founder", name: "Test Founder", avatarUrl: null } }),
}));

function renderKnowledgeList(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/knowledge"]}>
			<Routes>
				<Route path="/knowledge" element={<KnowledgeList />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("KnowledgeList: the parent rule replaces the role filter", () => {
	it("shows an ordinary root item but never an agent identity or a routine prompt", async () => {
		renderKnowledgeList();
		expect(await screen.findByText("Auth Strategy Decision")).toBeInTheDocument();
		expect(screen.queryByText("Agent One — identity")).not.toBeInTheDocument();
		expect(screen.queryByText("Routine One — prompt")).not.toBeInTheDocument();
	});
});
