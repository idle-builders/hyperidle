/**
 * @lore nested-knowledge-items tree-ui — detail breadcrumb shows ancestry,
 * not scope; Children card always offers Add child.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeDetail } from "../KnowledgeDetail.js";

vi.mock("../../ds", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../ds")>();
	return {
		...original,
		BodyEditor: ({ initialContent }: { initialContent: string }) => (
			<div data-testid="mock-body-editor">{initialContent}</div>
		),
	};
});

vi.mock("../../shell/HostThreadSection.js", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section" />,
}));

vi.mock("../../hooks/useHostThread.js", () => ({
	useHostThread: () => ({ data: null, isLoading: false, error: null }),
}));

vi.mock("../../hooks/useAutoSave.js", () => ({
	useAutoSave: () => ({ status: "idle", save: vi.fn() }),
}));

vi.mock("../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({
		user: { id: "u-founder", name: "Founder", email: "f@x.com", avatarUrl: null },
		retry: vi.fn(),
	}),
}));

vi.mock("../../hooks/useTeams.js", () => ({
	useTeams: () => ({ data: { teams: [] }, isLoading: false, error: null }),
}));

vi.mock("../../hooks/useFetch.js", () => ({
	useFetch: () => ({ data: { items: [] }, isLoading: false, error: null }),
}));

vi.mock("../../hooks/useKnowledgeItem.js", () => ({
	useKnowledgeItem: vi.fn(),
}));

function renderDetail(knowledgeId = "k-pricing"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/knowledge/${knowledgeId}`]}>
			<Routes>
				<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("KnowledgeDetail ancestry breadcrumb + children", () => {
	beforeEach(async () => {
		const { useKnowledgeItem } = await import("../../hooks/useKnowledgeItem.js");
		vi.mocked(useKnowledgeItem).mockImplementation((id: string | undefined) => {
			if (id === "k-pricing") {
				return {
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
						scopeName: "Shared",
						parentId: "k-product",
						parentKind: "knowledge_item",
						createdAt: "2026-01-01T10:00:00.000Z",
						updatedAt: "2026-01-01T10:00:00.000Z",
						children: [{ id: "k-objections", title: "Objections playbook" }],
					},
					error: null,
					isLoading: false,
					refresh: vi.fn(),
				};
			}
			if (id === "k-product") {
				return {
					data: {
						id: "k-product",
						title: "Product",
						body: "Product root.",
						format: "markdown",
						status: "active",
						version: 1,
						updatedBy: "u-founder",
						scopeKind: "factory",
						scopeId: null,
						parentId: null,
						parentKind: null,
						createdAt: "2026-01-01T09:00:00.000Z",
						updatedAt: "2026-01-01T09:00:00.000Z",
						children: [],
					},
					error: null,
					isLoading: false,
					refresh: vi.fn(),
				};
			}
			return { data: null, error: null, isLoading: false, refresh: vi.fn() };
		});
	});

	it("shows the parent title in the breadcrumb instead of the scope label", () => {
		renderDetail();

		const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
		expect(nav).toHaveTextContent("Product");
		expect(nav).not.toHaveTextContent("Shared");
		expect(screen.getByRole("link", { name: "Product" })).toHaveAttribute(
			"href",
			"/knowledge/k-product",
		);
	});

	it("lists children and offers Add child", () => {
		renderDetail();

		expect(screen.getByText("Objections playbook")).toBeInTheDocument();
		expect(screen.getByTestId("knowledge-add-child")).toHaveAttribute(
			"href",
			"/knowledge/new?parentId=k-pricing",
		);
	});
});
