/**
 * Tree "Add child" navigates to /knowledge/new?parentId=… — create must
 * preselect that parent in the ParentPicker (init only).
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeCreate } from "../../KnowledgeCreate.js";

vi.mock("../../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({
		user: { id: "u-founder", name: "Founder", email: "f@x.com", avatarUrl: null },
		retry: vi.fn(),
	}),
}));

vi.mock("../../../hooks/useFetch.js", () => ({
	useFetch: () => ({
		data: {
			items: [
				{
					id: "ki-parent",
					title: "Pricing",
					scopeKind: "factory",
					parentId: null,
					parentKind: null,
				},
			],
		},
		isLoading: false,
		error: null,
	}),
}));

vi.mock("../../../ds", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../../ds")>();
	return {
		...original,
		BodyEditor: () => <div data-testid="mock-body-editor" />,
	};
});

describe("KnowledgeCreate parentId from URL", () => {
	it("preselects ParentPicker from ?parentId=", () => {
		render(
			<MemoryRouter initialEntries={["/knowledge/new?parentId=ki-parent"]}>
				<Routes>
					<Route path="/knowledge/new" element={<KnowledgeCreate />} />
				</Routes>
			</MemoryRouter>,
		);

		const trigger = screen.getAllByRole("combobox").find((c) => c.id === "knowledge-parent-picker");
		expect(trigger).toHaveTextContent("Pricing");
	});
});
