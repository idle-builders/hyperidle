/**
 * KnowledgeCreate — the nest-at-create-time half of plan.md AC2: "the create
 * flow picks a parent, defaulting to none (a root)."
 *
 * POST /api/knowledge never accepts a `knowledge_item` parent (see
 * routes/knowledge.ts's own `CLIENT_WRITABLE_PARENT_KINDS` doc comment —
 * nesting under an existing item is create-then-PATCH-reparent, not a
 * single create call). So a chosen parent is applied as a second PATCH
 * right after the create succeeds.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../ds", async (importOriginal) => {
	const original = await importOriginal<typeof import("../ds")>();
	return {
		...original,
		BodyEditor: ({ onChange }: { initialContent: string; onChange: (md: string) => void }) => (
			<div data-testid="mock-body-editor">
				<textarea
					data-testid="body-editor-textarea"
					onChange={(e) => onChange(e.target.value)}
					aria-label="Body editor"
				/>
			</div>
		),
	};
});

vi.mock("../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

vi.mock("../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({
		user: { id: "u1", name: "Founder", email: "f@example.com", avatarUrl: null },
		status: "ready",
		error: null,
		retry: vi.fn(),
	}),
}));

vi.mock("../hooks/useFetch.js", () => ({
	useFetch: () => ({
		data: {
			items: [
				{ id: "root-a", title: "Root A", scopeKind: "factory", parentId: null, parentKind: null },
			],
		},
		isLoading: false,
		error: null,
	}),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
	const original = await importOriginal<typeof import("react-router-dom")>();
	return { ...original, useNavigate: () => mockNavigate };
});

import { KnowledgeCreate } from "../pages/KnowledgeCreate.js";
import { apiFetch } from "../services/api-fetch.js";

async function fillAndSubmit(): Promise<ReturnType<typeof userEvent.setup>> {
	const user = userEvent.setup();
	render(
		<MemoryRouter initialEntries={["/knowledge/new"]}>
			<KnowledgeCreate />
		</MemoryRouter>,
	);
	await user.type(screen.getByTestId("knowledge-create-title"), "A new item");
	await user.type(screen.getByTestId("body-editor-textarea"), "Some content");
	return user;
}

describe("KnowledgeCreate — parent picker", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders a parent picker defaulting to no parent (a root)", () => {
		render(
			<MemoryRouter initialEntries={["/knowledge/new"]}>
				<KnowledgeCreate />
			</MemoryRouter>,
		);
		const select = screen.getByTestId("parent-picker") as HTMLSelectElement;
		expect(select.value).toBe("");
	});

	it("creating with no parent selected does not follow up with a PATCH", async () => {
		vi.mocked(apiFetch).mockResolvedValue({
			ok: true,
			json: async () => ({ id: "new-item-id" }),
		} as Response);
		const user = await fillAndSubmit();
		await user.click(screen.getByTestId("knowledge-create-submit"));

		await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/knowledge/new-item-id"));
		expect(apiFetch).toHaveBeenCalledTimes(1);
	});

	it("creating with a parent selected POSTs then PATCHes the new item under it", async () => {
		vi.mocked(apiFetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ id: "new-item-id" }),
		} as Response);
		vi.mocked(apiFetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ id: "new-item-id" }),
		} as Response);

		const user = await fillAndSubmit();
		await user.selectOptions(screen.getByTestId("parent-picker"), "root-a");
		await user.click(screen.getByTestId("knowledge-create-submit"));

		await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
		const [patchUrl, patchOptions] = vi.mocked(apiFetch).mock.calls[1] as [string, RequestInit];
		expect(patchUrl).toBe("/api/knowledge/new-item-id");
		expect(patchOptions.method).toBe("PATCH");
		const body = JSON.parse(patchOptions.body as string);
		expect(body).toMatchObject({ parentKind: "knowledge_item", parentId: "root-a", version: 1 });

		await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/knowledge/new-item-id"));
	});

	it("shows the server-named reason and does not navigate when nesting fails", async () => {
		vi.mocked(apiFetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ id: "new-item-id" }),
		} as Response);
		vi.mocked(apiFetch).mockResolvedValueOnce({
			ok: false,
			status: 400,
			json: async () => ({
				error: "reparent: resulting depth would exceed the maximum of 32",
				code: "VALIDATION_ERROR",
				details: { rule: "depth-exceeded" },
			}),
		} as Response);

		const user = await fillAndSubmit();
		await user.selectOptions(screen.getByTestId("parent-picker"), "root-a");
		await user.click(screen.getByTestId("knowledge-create-submit"));

		expect(await screen.findByTestId("knowledge-create-error")).toHaveTextContent(
			/exceed the maximum of 32/,
		);
		expect(mockNavigate).not.toHaveBeenCalled();
	});
});
