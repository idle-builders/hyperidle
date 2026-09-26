/**
 * Tree "Add child" navigates to /documents/new?parentId=… — create must
 * preselect that parent in the ParentPicker (init only).
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DocumentCreate } from "../DocumentCreate.js";

vi.mock("../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({
		user: { id: "u-founder", name: "Founder", avatarUrl: null },
		retry: vi.fn(),
	}),
}));

vi.mock("../../hooks/useDocuments.js", () => ({
	useDocuments: () => ({
		status: "ready",
		documents: [
			{
				id: "ki-parent",
				title: "Pricing",
				scopeKind: "factory",
				parentId: null,
				parentKind: null,
			},
		],
		error: null,
		retry: vi.fn(),
	}),
}));

vi.mock("../../ds", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../ds")>();
	return {
		...original,
		BodyEditor: () => <div data-testid="mock-body-editor" />,
	};
});

describe("DocumentCreate parentId from URL", () => {
	it("preselects ParentPicker from ?parentId=", () => {
		render(
			<MemoryRouter initialEntries={["/documents/new?parentId=ki-parent"]}>
				<Routes>
					<Route path="/documents/new" element={<DocumentCreate />} />
				</Routes>
			</MemoryRouter>,
		);

		const trigger = screen.getByRole("combobox", { name: "Parent" });
		expect(trigger).toHaveTextContent("Pricing");
	});
});
