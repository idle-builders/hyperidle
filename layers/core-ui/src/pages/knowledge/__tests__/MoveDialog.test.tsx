/**
 * MoveDialog — plan.md AC2, "a person can nest and move knowledge items, and
 * the tree keeps up". Mirrors ScopeChangeDialog's own test pattern: mock
 * apiFetch and useCurrentUser, assert on the PATCH body and on error
 * surfacing.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

vi.mock("../../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({ user: { id: "user-1" } }),
}));

vi.mock("../../../hooks/useFetch.js", () => ({
	useFetch: () => ({
		data: {
			items: [
				{ id: "root-a", title: "Root A", scopeKind: "factory", parentId: null, parentKind: null },
				{ id: "root-b", title: "Root B", scopeKind: "factory", parentId: null, parentKind: null },
				{
					id: "child-of-a",
					title: "Child of A",
					scopeKind: "factory",
					parentId: "root-a",
					parentKind: "knowledge_item",
				},
			],
		},
		isLoading: false,
		error: null,
	}),
}));

import { apiFetch } from "../../../services/api-fetch.js";
import { MoveDialog } from "../MoveDialog";

const BASE_PROPS = {
	open: true,
	onClose: vi.fn(),
	onSaved: vi.fn(),
	knowledgeId: "child-of-a",
	currentVersion: 3,
	currentParentId: "root-a",
	currentParentKind: "knowledge_item" as const,
	scopeKind: "factory",
};

function mockOk(): void {
	vi.mocked(apiFetch).mockResolvedValue({
		ok: true,
		json: async () => ({ id: "child-of-a" }),
	} as Response);
}

describe("MoveDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders the parent picker preselected to the item's current parent", () => {
		render(<MoveDialog {...BASE_PROPS} />);
		const select = screen.getByTestId("parent-picker") as HTMLSelectElement;
		expect(select.value).toBe("root-a");
	});

	it("disables Save when nothing has changed", () => {
		render(<MoveDialog {...BASE_PROPS} />);
		expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
	});

	it("moving to a different parent PATCHes with the new parentKind/parentId", async () => {
		mockOk();
		render(<MoveDialog {...BASE_PROPS} />);
		fireEvent.change(screen.getByTestId("parent-picker"), { target: { value: "root-b" } });
		fireEvent.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => expect(apiFetch).toHaveBeenCalled());
		const [url, options] = vi.mocked(apiFetch).mock.calls[0] as [string, RequestInit];
		expect(url).toBe("/api/knowledge/child-of-a");
		expect(options.method).toBe("PATCH");
		const body = JSON.parse(options.body as string);
		expect(body).toMatchObject({
			version: 3,
			updatedBy: "user-1",
			parentKind: "knowledge_item",
			parentId: "root-b",
		});
	});

	it("moving to the top level PATCHes with parentKind/parentId both null", async () => {
		mockOk();
		render(<MoveDialog {...BASE_PROPS} />);
		fireEvent.change(screen.getByTestId("parent-picker"), { target: { value: "" } });
		fireEvent.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => expect(apiFetch).toHaveBeenCalled());
		const [, options] = vi.mocked(apiFetch).mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(options.body as string);
		expect(body.parentKind).toBeNull();
		expect(body.parentId).toBeNull();
	});

	it("shows the server-named reason when the move is refused", async () => {
		vi.mocked(apiFetch).mockResolvedValue({
			ok: false,
			status: 400,
			json: async () => ({
				error: "reparent: parenting child-of-a under root-b would create a cycle",
				code: "VALIDATION_ERROR",
				details: { rule: "cycle" },
			}),
		} as Response);
		render(<MoveDialog {...BASE_PROPS} />);
		fireEvent.change(screen.getByTestId("parent-picker"), { target: { value: "root-b" } });
		fireEvent.click(screen.getByRole("button", { name: /save/i }));

		expect(await screen.findByRole("alert")).toHaveTextContent(/would create a cycle/);
	});
});
