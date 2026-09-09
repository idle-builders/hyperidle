/**
 * @lore nested-knowledge-items AC1 — Curated tab is a real tree (collapse,
 * indent guides), not a flat list with └ dent markers.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeList } from "../KnowledgeList";

vi.mock("../../hooks/useFetch", () => ({
	useFetch: (url: string | null) => {
		if (url?.includes("/api/knowledge")) {
			return {
				data: {
					items: [
						{
							id: "k-parent",
							title: "Pricing",
							body: "Root knowledge item.",
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
							id: "k-child",
							title: "Objection handling",
							body: "Child knowledge item.",
							status: "active",
							scopeKind: "factory",
							role: "ordinary",
							parentKind: "knowledge_item",
							parentId: "k-parent",
							updatedAt: "2026-01-02T10:00:00.000Z",
							updatedBy: "u-founder",
							version: 1,
							format: "markdown",
						},
						{
							id: "k-orphan-child",
							title: "Orphaned but active",
							body: "Parent is not itself active, so it is not in this list.",
							status: "active",
							scopeKind: "factory",
							role: "ordinary",
							parentKind: "knowledge_item",
							parentId: "k-not-in-list",
							updatedAt: "2026-01-03T10:00:00.000Z",
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

describe("KnowledgeList Curated tab: a tree, not a flat list", () => {
	it("renders parent then child with collapse control — no └ dent marker", async () => {
		renderKnowledgeList();

		await screen.findByText("Pricing");
		const rows = screen.getAllByTestId("knowledge-row");
		const titles = rows.map((row) => within(row).getByText(/Pricing|Objection handling|Orphaned/));
		expect(titles.map((t) => t.textContent)).toEqual([
			"Orphaned but active",
			"Pricing",
			"Objection handling",
		]);
		expect(screen.queryByText(/└/)).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Collapse" })).toBeInTheDocument();
		expect(screen.getByTestId("knowledge-tree-list")).toBeInTheDocument();
	});

	it("collapses a parent so its child leaves the list", async () => {
		const user = userEvent.setup();
		renderKnowledgeList();
		await screen.findByText("Objection handling");
		await user.click(screen.getByRole("button", { name: "Collapse" }));
		expect(screen.queryByText("Objection handling")).not.toBeInTheDocument();
		expect(screen.getByText("Pricing")).toBeInTheDocument();
	});
});
