/**
 * KnowledgeCreate — the nest-at-create-time half of plan.md AC2: "the create
 * flow picks a parent, defaulting to none (a root)."
 *
 * @lore nested-knowledge-items, founder ruling: nesting under an existing
 * item is ONE write — the chosen parent rides POST /api/knowledge as
 * parentKind/parentId. There is no follow-up PATCH.
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

/** Opens the ParentPicker combobox and picks the option with this label. */
async function pickParent(user: ReturnType<typeof userEvent.setup>, label: string): Promise<void> {
	await user.click(screen.getByRole("combobox", { name: "Parent" }));
	await user.click(screen.getByText(label));
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
		const trigger = screen.getByRole("combobox", { name: "Parent" });
		expect(trigger).toHaveTextContent("No parent (top level)");
	});

	it("creating with no parent selected omits parentKind and parentId from the POST", async () => {
		vi.mocked(apiFetch).mockResolvedValue({
			ok: true,
			json: async () => ({ id: "new-item-id" }),
		} as Response);
		const user = await fillAndSubmit();
		await user.click(screen.getByTestId("knowledge-create-submit"));

		await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/knowledge/new-item-id"));
		expect(apiFetch).toHaveBeenCalledTimes(1);
		const [url, options] = vi.mocked(apiFetch).mock.calls[0] as [string, RequestInit];
		expect(url).toBe("/api/knowledge");
		expect(options.method).toBe("POST");
		const body = JSON.parse(options.body as string) as Record<string, unknown>;
		expect(body).not.toHaveProperty("parentKind");
		expect(body).not.toHaveProperty("parentId");
	});

	it("creating with a parent selected sends ONE POST carrying parentKind+parentId — no follow-up PATCH", async () => {
		vi.mocked(apiFetch).mockResolvedValue({
			ok: true,
			json: async () => ({ id: "new-item-id" }),
		} as Response);

		const user = await fillAndSubmit();
		await pickParent(user, "Root A");
		await user.click(screen.getByTestId("knowledge-create-submit"));

		await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
		const [url, options] = vi.mocked(apiFetch).mock.calls[0] as [string, RequestInit];
		expect(url).toBe("/api/knowledge");
		expect(options.method).toBe("POST");
		const body = JSON.parse(options.body as string);
		expect(body).toMatchObject({ parentKind: "knowledge_item", parentId: "root-a" });

		await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/knowledge/new-item-id"));
	});

	it("shows the server-named reason and does not navigate when nesting fails on create", async () => {
		vi.mocked(apiFetch).mockResolvedValue({
			ok: false,
			status: 400,
			json: async () => ({
				error: "reparent: resulting depth would exceed the maximum of 32",
				code: "VALIDATION_ERROR",
				details: { rule: "depth-exceeded" },
			}),
		} as Response);

		const user = await fillAndSubmit();
		await pickParent(user, "Root A");
		await user.click(screen.getByTestId("knowledge-create-submit"));

		expect(await screen.findByTestId("knowledge-create-error")).toHaveTextContent(
			/exceed the maximum of 32/,
		);
		expect(apiFetch).toHaveBeenCalledTimes(1);
		expect(mockNavigate).not.toHaveBeenCalled();
	});
});
