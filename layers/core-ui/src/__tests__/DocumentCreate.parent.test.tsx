/**
 * DocumentCreate — the nest-at-create-time half of plan.md AC2: "the create
 * flow picks a parent, defaulting to none (a root)."
 *
 * @lore nested-knowledge-items, founder ruling: nesting under an existing
 * item is ONE write — the chosen parent rides `edit_document`'s `parent`
 * field. There is no follow-up call.
 *
 * @lore BC4: repointed off `apiFetch`/`POST /api/knowledge` onto
 * `call("edit_document", …)`. The refused-create case is this block's named
 * red-first case, substituted per the block brief: the version-clash banner
 * belongs to the detail page (a different owner); this page's equivalent is
 * showing `problems[0].message` on a refused create.
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

vi.mock("../services/call.js", () => ({
	call: vi.fn(),
}));

vi.mock("../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({
		user: { id: "u1", name: "Founder", email: "f@example.com", avatarUrl: null },
		status: "ready",
		error: null,
		retry: vi.fn(),
	}),
}));

vi.mock("../hooks/useDocuments.js", () => ({
	useDocuments: () => ({
		status: "ready",
		documents: [
			{ id: "root-a", title: "Root A", scopeKind: "factory", parentId: null, parentKind: null },
		],
		error: null,
		retry: vi.fn(),
	}),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
	const original = await importOriginal<typeof import("react-router-dom")>();
	return { ...original, useNavigate: () => mockNavigate };
});

import { DocumentCreate } from "../pages/DocumentCreate.js";
import { call } from "../services/call.js";

function documentView(id: string): Awaited<ReturnType<typeof call>> {
	return {
		ok: true,
		data: { document: { id }, ancestors: [], children: [], siblings: [], scopeName: "Factory" },
	} as Awaited<ReturnType<typeof call>>;
}

async function fillAndSubmit(): Promise<ReturnType<typeof userEvent.setup>> {
	const user = userEvent.setup();
	render(
		<MemoryRouter initialEntries={["/documents/new"]}>
			<DocumentCreate />
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

describe("DocumentCreate — parent picker", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders a parent picker defaulting to no parent (a root)", () => {
		render(
			<MemoryRouter initialEntries={["/documents/new"]}>
				<DocumentCreate />
			</MemoryRouter>,
		);
		const trigger = screen.getByRole("combobox", { name: "Parent" });
		expect(trigger).toHaveTextContent("No parent (top level)");
	});

	it("creating with no parent selected calls edit_document with exact arguments and no parent field", async () => {
		vi.mocked(call).mockResolvedValue(documentView("new-item-id"));
		const user = await fillAndSubmit();
		await user.click(screen.getByTestId("knowledge-create-submit"));

		await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/documents/new-item-id"));
		expect(call).toHaveBeenCalledTimes(1);
		expect(call).toHaveBeenCalledWith("edit_document", {
			title: "A new item",
			body: "Some content",
			format: "markdown",
			status: "active",
			scopeKind: "factory",
		});
	});

	it("creating with a parent selected sends ONE edit_document call carrying parent:{kind,id} — no follow-up call", async () => {
		vi.mocked(call).mockResolvedValue(documentView("new-item-id"));

		const user = await fillAndSubmit();
		await pickParent(user, "Root A");
		await user.click(screen.getByTestId("knowledge-create-submit"));

		await waitFor(() => expect(call).toHaveBeenCalledTimes(1));
		expect(call).toHaveBeenCalledWith("edit_document", {
			title: "A new item",
			body: "Some content",
			format: "markdown",
			status: "active",
			scopeKind: "factory",
			parent: { kind: "document", id: "root-a" },
		});

		await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/documents/new-item-id"));
	});

	// Red first (this block's named case, substituted per brief): shows
	// problems[0].message on a refused create — the version-clash banner
	// itself belongs to DocumentDetail, a different owner.
	it("shows problems[0].message and does not navigate when the create is refused", async () => {
		vi.mocked(call).mockResolvedValue({
			ok: false,
			problems: [
				{
					code: "depth_exceeded",
					message: "Documents nest 32 deep at most.",
					path: "parent",
				},
			],
		} as Awaited<ReturnType<typeof call>>);

		const user = await fillAndSubmit();
		await pickParent(user, "Root A");
		await user.click(screen.getByTestId("knowledge-create-submit"));

		expect(await screen.findByTestId("knowledge-create-error")).toHaveTextContent(
			"Documents nest 32 deep at most.",
		);
		expect(call).toHaveBeenCalledTimes(1);
		expect(mockNavigate).not.toHaveBeenCalled();
	});
});
