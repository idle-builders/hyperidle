/**
 * MoveDialog — plan.md AC2, "a person can nest and move knowledge items, and
 * the tree keeps up". Mocks `call` and `useDocuments`, asserts on the
 * `edit_document` input and on error surfacing.
 */

import type { ActionResult, DocumentRow, DocumentView } from "@hyperidle/domain-model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../services/call.js", () => ({
	call: vi.fn(),
}));

function makeRow(overrides: Partial<DocumentRow> & Pick<DocumentRow, "id" | "title">): DocumentRow {
	return {
		body: "",
		format: "markdown",
		status: "active",
		slot: "ordinary",
		scopeKind: "factory",
		scopeId: null,
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: "user-1",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
		...overrides,
	};
}

vi.mock("../../../hooks/useDocuments.js", () => ({
	useDocuments: () => ({
		status: "ready",
		documents: [
			makeRow({ id: "root-a", title: "Root A" }),
			makeRow({ id: "root-b", title: "Root B" }),
			makeRow({ id: "child-of-a", title: "Child of A", parentId: "root-a", parentKind: "document" }),
		],
		error: null,
		retry: vi.fn(),
	}),
}));

import { call } from "../../../services/call.js";
import { MoveDialog } from "../MoveDialog";

const BASE_PROPS = {
	open: true,
	onClose: vi.fn(),
	onSaved: vi.fn(),
	documentId: "child-of-a",
	currentVersion: 3,
	currentParentId: "root-a",
	currentParentKind: "document" as const,
	scopeKind: "factory",
};

function mockOk(): void {
	vi.mocked(call).mockResolvedValue({
		ok: true,
		data: { document: makeRow({ id: "child-of-a" }) } as unknown as DocumentView,
	} satisfies ActionResult<DocumentView>);
}

describe("MoveDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders the parent picker preselected to the document's current parent", () => {
		render(<MoveDialog {...BASE_PROPS} />);
		const trigger = screen.getByRole("combobox", { name: "Parent" });
		expect(trigger).toHaveTextContent("Root A");
	});

	it("disables Save when nothing has changed", () => {
		render(<MoveDialog {...BASE_PROPS} />);
		expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
	});

	it("moving to a different parent calls edit_document with the new parent", async () => {
		mockOk();
		render(<MoveDialog {...BASE_PROPS} />);
		fireEvent.click(screen.getByRole("combobox", { name: "Parent" }));
		fireEvent.click(screen.getByText("Root B"));
		fireEvent.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => expect(call).toHaveBeenCalled());
		expect(call).toHaveBeenCalledWith("edit_document", {
			id: "child-of-a",
			version: 3,
			parent: { kind: "document", id: "root-b" },
		});
	});

	it("moving to the top level calls edit_document with parent: null", async () => {
		mockOk();
		render(<MoveDialog {...BASE_PROPS} />);
		fireEvent.click(screen.getByRole("combobox", { name: "Parent" }));
		fireEvent.click(screen.getByText("No parent (top level)"));
		fireEvent.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => expect(call).toHaveBeenCalled());
		expect(call).toHaveBeenCalledWith("edit_document", {
			id: "child-of-a",
			version: 3,
			parent: null,
		});
	});

	it("shows the server-named reason when the move is refused", async () => {
		vi.mocked(call).mockResolvedValue({
			ok: false,
			problems: [{ code: "cycle", message: "That would put the document inside itself." }],
		} satisfies ActionResult<DocumentView>);
		render(<MoveDialog {...BASE_PROPS} />);
		fireEvent.click(screen.getByRole("combobox", { name: "Parent" }));
		fireEvent.click(screen.getByText("Root B"));
		fireEvent.click(screen.getByRole("button", { name: /save/i }));

		expect(await screen.findByRole("alert")).toHaveTextContent(/inside itself/);
	});
});
