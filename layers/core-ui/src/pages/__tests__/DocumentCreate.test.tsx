/**
 * DocumentCreate component tests.
 *
 * @lore: repointed off `apiFetch`/`POST /api/knowledge` onto `call("edit_document", …)`; ParentPicker's own read is `useDocuments`, not `useFetch` (architecture.md §9.2).
 *
 * @lore nested-knowledge-items, founder ruling: nesting under an existing item is ONE write — the chosen parent rides `edit_document`'s `parent` field. There is no follow-up call.
 *
 * @lore: vi.mock() calls are hoisted to top regardless of scope (describe/it/beforeEach). Multiple vi.mock() calls for the same module path in one file → LAST factory wins for ALL tests. This file uses a single file-level vi.mock per module, configured per-describe via mockReturnValue, to avoid that trap.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UseDocumentsResult } from "../../hooks/useDocuments.js";

vi.mock("../../ds", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../ds")>();
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

vi.mock("../../services/call.js", () => ({
	call: vi.fn(),
}));

vi.mock("../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: vi.fn(),
}));

vi.mock("../../hooks/useDocuments.js", () => ({
	useDocuments: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
	const original = await importOriginal<typeof import("react-router-dom")>();
	return { ...original, useNavigate: () => mockNavigate };
});

import { useCurrentUser } from "../../hooks/useCurrentUser.js";
import { useDocuments } from "../../hooks/useDocuments.js";
import { call } from "../../services/call.js";
import { DocumentCreate } from "../DocumentCreate.js";

function mockUser(overrides: { teamId?: string } = {}): void {
	vi.mocked(useCurrentUser).mockReturnValue({
		user: { id: "u1", name: "Founder", avatarUrl: null, ...overrides },
		status: "ready",
		error: null,
		retry: vi.fn(),
	});
}

function mockNoParentOptions(): void {
	vi.mocked(useDocuments).mockReturnValue({
		status: "ready",
		documents: [],
		error: null,
		retry: vi.fn(),
	});
}

function mockParentOptions(): void {
	vi.mocked(useDocuments).mockReturnValue({
		status: "ready",
		documents: [
			{ id: "root-a", title: "Root A", scopeKind: "factory", parentId: null, parentKind: null },
		] as unknown as UseDocumentsResult["documents"],
		error: null,
		retry: vi.fn(),
	});
}

async function pickParent(user: ReturnType<typeof userEvent.setup>, label: string): Promise<void> {
	await user.click(screen.getByRole("combobox", { name: "Parent" }));
	await user.click(screen.getByText(label));
}

function documentView(id: string): Awaited<ReturnType<typeof call>> {
	return {
		ok: true,
		data: { document: { id }, ancestors: [], children: [], siblings: [], scopeName: "Factory" },
	} as unknown as Awaited<ReturnType<typeof call>>;
}

async function fillAndSubmit(): Promise<ReturnType<typeof userEvent.setup>> {
	const user = userEvent.setup();
	render(
		<MemoryRouter initialEntries={["/documents/new"]}>
			<DocumentCreate />
		</MemoryRouter>,
	);
	await user.type(screen.getByTestId("document-create-title"), "A new item");
	await user.type(screen.getByTestId("body-editor-textarea"), "Some content");
	return user;
}

// ---------------------------------------------------------------------------
// Create payload includes status:"active"
// ---------------------------------------------------------------------------

describe("DocumentCreate sends status:active in create payload", () => {
	beforeEach(() => {
		mockUser();
		mockNoParentOptions();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("edit_document call includes status:active when Create is submitted", async () => {
		const mockCall = vi.mocked(call);
		mockCall.mockResolvedValue(documentView("new-item-id"));

		const user = userEvent.setup();
		render(
			<MemoryRouter initialEntries={["/documents/new"]}>
				<DocumentCreate />
			</MemoryRouter>,
		);

		await user.type(screen.getByTestId("document-create-title"), "My new item");
		await user.type(screen.getByTestId("body-editor-textarea"), "Some content");
		await user.click(screen.getByTestId("document-create-submit"));

		await waitFor(() => {
			expect(mockCall).toHaveBeenCalledWith(
				"edit_document",
				expect.objectContaining({ status: "active" }),
			);
		});
	});
});

// ---------------------------------------------------------------------------
// Parent picker
// ---------------------------------------------------------------------------

describe("DocumentCreate — parent picker", () => {
	beforeEach(() => {
		mockUser();
		mockParentOptions();
	});

	afterEach(() => {
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
		await user.click(screen.getByTestId("document-create-submit"));

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
		await user.click(screen.getByTestId("document-create-submit"));

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
		} as unknown as Awaited<ReturnType<typeof call>>);

		const user = await fillAndSubmit();
		await pickParent(user, "Root A");
		await user.click(screen.getByTestId("document-create-submit"));

		expect(await screen.findByTestId("document-create-error")).toHaveTextContent(
			"Documents nest 32 deep at most.",
		);
		expect(call).toHaveBeenCalledTimes(1);
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("picking a parent sends ONE edit_document call carrying parent:{kind,id} — no follow-up call", async () => {
		vi.mocked(useDocuments).mockReturnValue({
			status: "ready",
			documents: [
				{
					id: "ki-existing",
					title: "Existing parent",
					scopeKind: "factory",
					parentId: null,
					parentKind: null,
				},
			] as unknown as UseDocumentsResult["documents"],
			error: null,
			retry: vi.fn(),
		});
		vi.mocked(call).mockResolvedValue(documentView("new-nested-item-id"));

		const user = userEvent.setup();
		render(
			<MemoryRouter initialEntries={["/documents/new"]}>
				<DocumentCreate />
			</MemoryRouter>,
		);

		await user.type(screen.getByTestId("document-create-title"), "Nested item");
		await user.type(screen.getByTestId("body-editor-textarea"), "Some content");

		await pickParent(user, "Existing parent");
		await user.click(screen.getByTestId("document-create-submit"));

		await waitFor(() => {
			expect(call).toHaveBeenCalledTimes(1);
		});
		expect(call).toHaveBeenCalledWith(
			"edit_document",
			expect.objectContaining({ parent: { kind: "document", id: "ki-existing" } }),
		);
	});
});

// ---------------------------------------------------------------------------
// Parent preselected from the tree's "Add child" URL (?parentId=)
// ---------------------------------------------------------------------------

describe("DocumentCreate parentId from URL", () => {
	beforeEach(() => {
		mockUser();
		vi.mocked(useDocuments).mockReturnValue({
			status: "ready",
			documents: [
				{
					id: "ki-parent",
					title: "Pricing",
					scopeKind: "factory",
					parentId: null,
					parentKind: null,
				},
			] as unknown as UseDocumentsResult["documents"],
			error: null,
			retry: vi.fn(),
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

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

// ---------------------------------------------------------------------------
// Team scope pill is data-driven, not hardcoded
// ---------------------------------------------------------------------------

describe("Team scope pill is data-driven", () => {
	beforeEach(() => {
		mockNoParentOptions();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("Team pill is ENABLED when useCurrentUser returns a user with teamId", async () => {
		mockUser({ teamId: "t1" });

		render(
			<MemoryRouter>
				<DocumentCreate />
			</MemoryRouter>,
		);

		const teamPill = screen.getByTestId("scope-pill-create-team");
		expect(teamPill).not.toBeDisabled();
		expect(teamPill).not.toHaveAttribute("aria-disabled", "true");
	});

	it("Team pill is DISABLED when useCurrentUser returns a user without teamId", async () => {
		mockUser();

		render(
			<MemoryRouter>
				<DocumentCreate />
			</MemoryRouter>,
		);

		const teamPill = screen.getByTestId("scope-pill-create-team");
		expect(teamPill).toBeDisabled();
	});

	it("Team pill has tooltip when disabled", async () => {
		mockUser();

		render(
			<MemoryRouter>
				<DocumentCreate />
			</MemoryRouter>,
		);

		// disabledTitle is one shared tooltip for the whole picker (ScopePicker's
		// own contract), composed from whichever reasons apply — with no team
		// AND no parent chosen (this test picks neither), both the Team and the
		// Private reason are present (the Private-requires-a-parent describe
		// below covers the Private-specific reason).
		const teamPill = screen.getByTestId("scope-pill-create-team");
		expect(teamPill).toHaveAttribute(
			"title",
			"Join a team to use team-scoped documents. A root document scoped Private becomes a memory — create one from the assistant/agent instead.",
		);
	});

	it("clicking an enabled Team pill selects the Team scope", async () => {
		mockUser({ teamId: "t1" });

		const user = userEvent.setup();
		render(
			<MemoryRouter>
				<DocumentCreate />
			</MemoryRouter>,
		);

		const teamPill = screen.getByTestId("scope-pill-create-team");
		await user.click(teamPill);

		expect(teamPill).toHaveAttribute("aria-checked", "true");
	});
});

// ---------------------------------------------------------------------------
// Private requires a chosen parent
//
// Review-found defect: the create page offered "Private" with NO parent
// chosen, which writes a parentless user-scoped row through the document
// path — `documentAs` reads that shape back as a memory, and the detail
// dialog that then opens shows its own selected scope pill disabled (the
// ScopeChangeDialog trapdoor guard). A root private note is a memory, made
// through the assistant/agent path, not this create page. Private is
// offered here only once a parent is chosen; clearing the parent while
// Private is selected falls back to Team (or Shared with no team) rather
// than leaving an illegal combination selected.
// ---------------------------------------------------------------------------

describe("DocumentCreate — Private requires a chosen parent", () => {
	beforeEach(() => {
		mockUser({ teamId: "t1" });
		mockParentOptions();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("disables the Private pill with no parent chosen", () => {
		render(
			<MemoryRouter initialEntries={["/documents/new"]}>
				<DocumentCreate />
			</MemoryRouter>,
		);
		expect(screen.getByTestId("scope-pill-create-private")).toBeDisabled();
	});

	it("enables the Private pill once a parent is chosen", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter initialEntries={["/documents/new"]}>
				<DocumentCreate />
			</MemoryRouter>,
		);

		await pickParent(user, "Root A");

		expect(screen.getByTestId("scope-pill-create-private")).not.toBeDisabled();
	});

	it("falls back to Team when the parent is cleared while Private is selected (user has a team)", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter initialEntries={["/documents/new"]}>
				<DocumentCreate />
			</MemoryRouter>,
		);

		await pickParent(user, "Root A");
		await user.click(screen.getByTestId("scope-pill-create-private"));
		expect(screen.getByTestId("scope-pill-create-private")).toHaveAttribute("aria-checked", "true");

		await pickParent(user, "No parent (top level)");

		expect(screen.getByTestId("scope-pill-create-team")).toHaveAttribute("aria-checked", "true");
		expect(screen.getByTestId("scope-pill-create-private")).toBeDisabled();
	});

	it("falls back to Shared when the parent is cleared while Private is selected (no team)", async () => {
		mockUser();
		const user = userEvent.setup();
		render(
			<MemoryRouter initialEntries={["/documents/new"]}>
				<DocumentCreate />
			</MemoryRouter>,
		);

		await pickParent(user, "Root A");
		await user.click(screen.getByTestId("scope-pill-create-private"));

		await pickParent(user, "No parent (top level)");

		expect(screen.getByTestId("scope-pill-create-shared")).toHaveAttribute("aria-checked", "true");
	});
});
