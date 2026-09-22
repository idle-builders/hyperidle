/**
 * @lore nested-knowledge-items tree-ui — collapse/expand + add-child affordances.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { buildDocumentTree } from "../build-document-tree.js";
import { DocumentTreeList } from "../DocumentTreeList.js";

const items = [
	{
		id: "k-parent",
		title: "Pricing",
		body: "Root document.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "u-founder",
		scopeKind: "factory",
		createdAt: "2026-01-01T10:00:00.000Z",
		updatedAt: "2026-01-01T10:00:00.000Z",
		parentKind: null,
		parentId: null,
	},
	{
		id: "k-child",
		title: "Objection handling",
		body: "Child document.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "u-founder",
		scopeKind: "factory",
		createdAt: "2026-01-02T10:00:00.000Z",
		updatedAt: "2026-01-02T10:00:00.000Z",
		parentKind: "document",
		parentId: "k-parent",
	},
];

describe("DocumentTreeList", () => {
	it("renders parent then child with a collapse control — no └ dent marker", () => {
		const onNavigate = vi.fn();
		const onNewChild = vi.fn();
		render(
			<DocumentTreeList
				rows={buildDocumentTree(items)}
				onNavigate={onNavigate}
				onNewChild={onNewChild}
			/>,
		);

		const rows = screen.getAllByTestId("document-row");
		expect(rows).toHaveLength(2);
		expect(within(rows[0]!).getByText("Pricing")).toBeInTheDocument();
		expect(within(rows[1]!).getByText("Objection handling")).toBeInTheDocument();
		expect(screen.queryByText(/└/)).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Collapse" })).toBeInTheDocument();
	});

	it("collapses and expands children when the chevron is clicked", async () => {
		const user = userEvent.setup();
		render(
			<DocumentTreeList
				rows={buildDocumentTree(items)}
				onNavigate={vi.fn()}
				onNewChild={vi.fn()}
			/>,
		);

		expect(screen.getByText("Objection handling")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Collapse" }));
		expect(screen.queryByText("Objection handling")).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Expand" }));
		expect(screen.getByText("Objection handling")).toBeInTheDocument();
	});

	it("calls onNewChild with the row id from the add-child control", async () => {
		const user = userEvent.setup();
		const onNewChild = vi.fn();
		render(
			<DocumentTreeList
				rows={buildDocumentTree(items)}
				onNavigate={vi.fn()}
				onNewChild={onNewChild}
			/>,
		);

		await user.click(screen.getAllByRole("button", { name: "Add child item" })[0]!);
		expect(onNewChild).toHaveBeenCalledWith("k-parent");
	});
});
