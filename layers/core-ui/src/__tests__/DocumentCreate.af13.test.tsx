/**
 * DocumentCreate component tests (red phase).
 *
 * Covers:
 * - §1: create payload includes status:"active" (human create intent)
 * - §6 / WARNING 3: Team pill ENABLED when user has teamId (positive-path proof)
 *                   Team pill DISABLED when user has no teamId (existing behavior,
 *                   but now data-driven not hardcoded)
 *
 * @lore BC4: repointed off `apiFetch`/`POST /api/knowledge` onto
 * `call("edit_document", …)`; ParentPicker's own read is `useDocuments`, not
 * `useFetch` (architecture.md §9.2).
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UseDocumentsResult } from "../hooks/useDocuments.js";

// Mock BodyEditor — TipTap doesn't work in JSDOM
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

// Mock call() so we can inspect the edit_document arguments
vi.mock("../services/call.js", () => ({
	call: vi.fn(),
}));

// @lore BC4: DocumentCreate mounts ParentPicker, which reads through
// `useDocuments({ inTree: true })`. Stub it directly — these tests don't
// exercise the parent picker's own data unless a test overrides the return
// value (see the one-write nesting test below, which needs a real parent
// option to pick).
vi.mock("../hooks/useDocuments.js", () => ({
	useDocuments: vi.fn(() => ({ status: "ready", documents: [], error: null, retry: vi.fn() })),
}));

// @lore AF13: vi.mock() calls are hoisted to top regardless of scope (describe/it/beforeEach).
// Multiple vi.mock() calls for the same module path in one file → LAST factory wins for ALL tests.
// Fix: single file-level vi.mock with a vi.fn() stub; configure per-describe via mockReturnValue.
vi.mock("../hooks/useCurrentUser.js", () => ({
	useCurrentUser: vi.fn(),
}));

// ---------------------------------------------------------------------------
// §1 — Create payload includes status:"active"
// ---------------------------------------------------------------------------

describe("DocumentCreate sends status:active in create payload", () => {
	beforeEach(async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "u1", name: "Founder", avatarUrl: null },
			status: "ready",
			error: null,
			retry: vi.fn(),
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("edit_document call includes status:active when Create is submitted", async () => {
		const { call } = await import("../services/call.js");
		const mockCall = vi.mocked(call);

		// Simulate successful create returning an id
		mockCall.mockResolvedValue({
			ok: true,
			data: {
				document: { id: "new-item-id" },
				ancestors: [],
				children: [],
				siblings: [],
				scopeName: "Factory",
			},
		} as unknown as Awaited<ReturnType<typeof call>>);

		const { DocumentCreate } = await import("../pages/DocumentCreate.js");
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/documents/new"]}>
				<DocumentCreate />
			</MemoryRouter>,
		);

		// Fill in title
		const titleInput = screen.getByTestId("document-create-title");
		await user.type(titleInput, "My new item");

		// Fill in body via mocked BodyEditor
		const bodyTextarea = screen.getByTestId("body-editor-textarea");
		await user.type(bodyTextarea, "Some content");

		// Submit
		const createButton = screen.getByTestId("document-create-submit");
		await user.click(createButton);

		// Assert the arguments sent to edit_document include status:"active"
		await waitFor(() => {
			expect(mockCall).toHaveBeenCalledWith(
				"edit_document",
				expect.objectContaining({ status: "active" }),
			);
		});
	});
});

// ---------------------------------------------------------------------------
// Nesting under an existing item is ONE write
// @lore nested-knowledge-items: founder ruling — create accepts a parent
// ---------------------------------------------------------------------------

describe("DocumentCreate nests in one write", () => {
	beforeEach(async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "u1", name: "Founder", avatarUrl: null },
			status: "ready",
			error: null,
			retry: vi.fn(),
		});
	});

	afterEach(async () => {
		vi.clearAllMocks();
		// Restore useDocuments' default (no parent options) for every other
		// describe block in this file — mockReturnValue persists across
		// vi.clearAllMocks(), which only clears call history.
		const { useDocuments } = await import("../hooks/useDocuments.js");
		vi.mocked(useDocuments).mockReturnValue({
			status: "ready",
			documents: [],
			error: null,
			retry: vi.fn(),
		});
	});

	it("picking a parent sends ONE edit_document call carrying parent:{kind,id} — no follow-up call", async () => {
		const { useDocuments } = await import("../hooks/useDocuments.js");
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

		const { call } = await import("../services/call.js");
		const mockCall = vi.mocked(call);
		mockCall.mockResolvedValue({
			ok: true,
			data: {
				document: { id: "new-nested-item-id" },
				ancestors: [],
				children: [],
				siblings: [],
				scopeName: "Factory",
			},
		} as unknown as Awaited<ReturnType<typeof call>>);

		const { DocumentCreate } = await import("../pages/DocumentCreate.js");
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/documents/new"]}>
				<DocumentCreate />
			</MemoryRouter>,
		);

		await user.type(screen.getByTestId("document-create-title"), "Nested item");
		await user.type(screen.getByTestId("body-editor-textarea"), "Some content");

		await user.click(screen.getByRole("combobox", { name: "Parent" }));
		await user.click(screen.getByText("Existing parent"));

		await user.click(screen.getByTestId("document-create-submit"));

		// Exactly one call to edit_document — the create — carrying the parent.
		await waitFor(() => {
			expect(mockCall).toHaveBeenCalledTimes(1);
		});
		expect(mockCall).toHaveBeenCalledWith(
			"edit_document",
			expect.objectContaining({ parent: { kind: "document", id: "ki-existing" } }),
		);
	});
});

// ---------------------------------------------------------------------------
// §6 + WARNING 3 — Team pill selectability: data-driven, not hardcoded false
// ---------------------------------------------------------------------------

describe("Team scope pill is data-driven (WARNING 3 positive-path proof)", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("Team pill is ENABLED when useCurrentUser returns a user with teamId", async () => {
		// Positive-path: user has teamId — Team pill must not be disabled
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: {
				id: "u1",
				name: "Founder",
				avatarUrl: null,
				teamId: "t1", // has a team
			},
			status: "ready",
			error: null,
			retry: vi.fn(),
		});

		const { DocumentCreate } = await import("../pages/DocumentCreate.js");

		render(
			<MemoryRouter>
				<DocumentCreate />
			</MemoryRouter>,
		);

		const teamPill = screen.getByTestId("scope-pill-create-team");
		// After §6 fix: with teamId present, Team pill must NOT be disabled
		// This test fails until hasTeam = user?.teamId !== undefined (currently hardcoded false)
		expect(teamPill).not.toBeDisabled();
		expect(teamPill).not.toHaveAttribute("aria-disabled", "true");
	});

	it("Team pill is DISABLED when useCurrentUser returns a user without teamId", async () => {
		// Negative-path: user has no teamId — Team pill stays disabled (data-driven, not hardcoded)
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: {
				id: "u1",
				name: "Founder",
				avatarUrl: null,
				// no teamId field
			},
			status: "ready",
			error: null,
			retry: vi.fn(),
		});

		const { DocumentCreate } = await import("../pages/DocumentCreate.js");

		render(
			<MemoryRouter>
				<DocumentCreate />
			</MemoryRouter>,
		);

		const teamPill = screen.getByTestId("scope-pill-create-team");
		// When user has no teamId, the pill is correctly disabled
		// (this confirms the gate is data-driven; if teamId appears, it flips)
		expect(teamPill).toBeDisabled();
	});

	it("Team pill has tooltip when disabled", async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "u1", name: "Founder", avatarUrl: null },
			status: "ready",
			error: null,
			retry: vi.fn(),
		});

		const { DocumentCreate } = await import("../pages/DocumentCreate.js");

		render(
			<MemoryRouter>
				<DocumentCreate />
			</MemoryRouter>,
		);

		// disabledTitle is one shared tooltip for the whole picker (ScopePicker's
		// own contract), composed from whichever reasons apply — with no team
		// AND no parent chosen (this test picks neither), both the Team and the
		// Private reason are present (DocumentCreate-private-requires-parent.test.tsx
		// covers the Private-specific reason).
		const teamPill = screen.getByTestId("scope-pill-create-team");
		expect(teamPill).toHaveAttribute(
			"title",
			"Join a team to use team-scoped documents. A root document scoped Private becomes a memory — create one from the assistant/agent instead.",
		);
	});

	it("clicking an enabled Team pill selects the Team scope", async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: {
				id: "u1",
				name: "Founder",
				avatarUrl: null,
				teamId: "t1",
			},
			status: "ready",
			error: null,
			retry: vi.fn(),
		});

		const { DocumentCreate } = await import("../pages/DocumentCreate.js");
		const user = userEvent.setup();

		render(
			<MemoryRouter>
				<DocumentCreate />
			</MemoryRouter>,
		);

		const teamPill = screen.getByTestId("scope-pill-create-team");
		await user.click(teamPill);

		// Team pill should now be aria-checked=true after click
		expect(teamPill).toHaveAttribute("aria-checked", "true");
	});
});

// ---------------------------------------------------------------------------
// UI-127 — editor card must not cap its height at 300px
// ---------------------------------------------------------------------------
// The defect was a lone textarea on a vast empty canvas: the editor card had
// `style={{ minHeight: "300px" }}` which fixed it at a short height and left
// 461px of empty space below on a 900px viewport.
// Fix: removed the inline minHeight cap; the card uses flex-1 to grow instead.
//
// Visual verification of the actual fill (editor occupying the viewport)
// is not possible in jsdom — height is not computed. The coordinator visually
// verified the fix after this commit. The structural assertion below proves the
// height cap that caused the defect has been removed.

describe("UI-127 — DocumentCreate editor card has no fixed minHeight cap", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("editor card wrapper has no hardcoded minHeight:300px inline style", async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "u1", name: "Founder", avatarUrl: null },
			status: "ready",
			error: null,
			retry: vi.fn(),
		});

		const { DocumentCreate } = await import("../pages/DocumentCreate.js");

		render(
			<MemoryRouter>
				<DocumentCreate />
			</MemoryRouter>,
		);

		// The mock BodyEditor renders inside the editor card div. Before the fix
		// that div had style={{ minHeight: "300px" }} which capped its height and
		// produced 461px of empty space below the card. After the fix the inline
		// style is gone (card uses flex-1 to fill the column instead).
		const bodyEditor = screen.getByTestId("mock-body-editor");
		// parentElement is the editor card div
		const editorCard = bodyEditor.parentElement;
		expect(editorCard).not.toBeNull();
		// Would be "300px" before the fix; "" or undefined after
		expect(editorCard?.style.minHeight).not.toBe("300px");
	});
});
