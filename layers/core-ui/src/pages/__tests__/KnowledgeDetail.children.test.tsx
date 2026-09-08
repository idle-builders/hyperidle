/**
 * "A person opens Knowledge, sees a tree, clicks a
 * parent, and reads it as a knowledge item with its children listed on it."
 * (plan.md "Success looks like").
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeDetail } from "../../pages/KnowledgeDetail";

vi.mock("../../hooks/useKnowledgeItem.js", () => ({
	useKnowledgeItem: () => ({
		data: {
			id: "k-pricing",
			title: "Pricing",
			body: "How we think about pricing.",
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "u-founder",
			scopeKind: "factory",
			scopeId: null,
			topic: null,
			createdAt: "2026-01-01T10:00:00.000Z",
			updatedAt: "2026-01-01T10:00:00.000Z",
			children: [
				{ id: "k-objections", title: "Objections playbook" },
				{ id: "k-discounts", title: "Discount policy" },
			],
		},
		error: null,
		isLoading: false,
	}),
}));

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/knowledge/k-pricing"]}>
			<Routes>
				<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("KnowledgeDetail: a parent renders its children", () => {
	it("lists each child's title", () => {
		renderPage();
		expect(screen.getByText("Objections playbook")).toBeInTheDocument();
		expect(screen.getByText("Discount policy")).toBeInTheDocument();
	});
});
