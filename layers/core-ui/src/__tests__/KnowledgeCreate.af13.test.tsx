/**
 * AF13 — KnowledgeCreate component tests (red phase).
 *
 * Covers:
 * - §1: create payload includes status:"active" (human create intent)
 * - §6 / WARNING 3: Team pill ENABLED when user has teamId (positive-path proof)
 *                   Team pill DISABLED when user has no teamId (existing behavior,
 *                   but now data-driven not hardcoded)
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// Mock apiFetch so we can inspect the POST payload
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

// @lore nested-knowledge-items: KnowledgeCreate now mounts ParentPicker, which
// fetches GET /api/knowledge via useFetch (itself built on apiFetch). Left
// unmocked, that call resolves to whatever apiFetch above is mocked to return
// for the POST assertions, consuming the same Response body handleCreate then
// tries to read again. Stub useFetch directly — these tests don't exercise
// the parent picker's own data unless a test overrides the return value (see
// the one-write nesting test below, which needs a real parent option to pick).
vi.mock("../hooks/useFetch.js", () => ({
	useFetch: vi.fn(() => ({ data: { items: [] }, isLoading: false, error: null, refetch: vi.fn() })),
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

describe("AF13 §1 — KnowledgeCreate sends status:active in create payload", () => {
	beforeEach(async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "u1", name: "Founder", email: "f@example.com", avatarUrl: null },
			status: "ready",
			error: null,
			retry: vi.fn(),
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("POST payload includes status:active when Create is submitted", async () => {
		const { apiFetch } = await import("../services/api-fetch.js");
		const mockFetch = vi.mocked(apiFetch);

		// Simulate successful create returning an id
		mockFetch.mockResolvedValue(
			new Response(JSON.stringify({ id: "new-item-id" }), {
				status: 201,
				headers: { "Content-Type": "application/json" },
			}),
		);

		const { KnowledgeCreate } = await import("../pages/KnowledgeCreate.js");
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/knowledge/new"]}>
				<KnowledgeCreate />
			</MemoryRouter>,
		);

		// Fill in title
		const titleInput = screen.getByTestId("knowledge-create-title");
		await user.type(titleInput, "My new item");

		// Fill in body via mocked BodyEditor
		const bodyTextarea = screen.getByTestId("body-editor-textarea");
		await user.type(bodyTextarea, "Some content");

		// Submit
		const createButton = screen.getByTestId("knowledge-create-submit");
		await user.click(createButton);

		// Assert the payload sent to apiFetch includes status:"active"
		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledWith(
				"/api/knowledge",
				expect.objectContaining({
					method: "POST",
					body: expect.stringContaining('"status":"active"'),
				}),
			);
		});
	});
});

// ---------------------------------------------------------------------------
// nested-knowledge-items — nesting under an existing item is ONE write
// ---------------------------------------------------------------------------

describe("nested-knowledge-items — KnowledgeCreate nests in one write", () => {
	beforeEach(async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "u1", name: "Founder", email: "f@example.com", avatarUrl: null },
			status: "ready",
			error: null,
			retry: vi.fn(),
		});
	});

	afterEach(async () => {
		vi.clearAllMocks();
		// Restore useFetch's default (no parent options) for every other
		// describe block in this file — mockReturnValue persists across
		// vi.clearAllMocks(), which only clears call history.
		const { useFetch } = await import("../hooks/useFetch.js");
		vi.mocked(useFetch).mockReturnValue({
			data: { items: [] },
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		});
	});

	it("picking a parent sends ONE POST carrying parentKind+parentId — no follow-up PATCH", async () => {
		const { useFetch } = await import("../hooks/useFetch.js");
		vi.mocked(useFetch).mockReturnValue({
			data: {
				items: [
					{ id: "ki-existing", title: "Existing parent", scopeKind: "factory", parentId: null },
				],
			},
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		});

		const { apiFetch } = await import("../services/api-fetch.js");
		const mockFetch = vi.mocked(apiFetch);
		mockFetch.mockResolvedValue(
			new Response(JSON.stringify({ id: "new-nested-item-id" }), {
				status: 201,
				headers: { "Content-Type": "application/json" },
			}),
		);

		const { KnowledgeCreate } = await import("../pages/KnowledgeCreate.js");
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/knowledge/new"]}>
				<KnowledgeCreate />
			</MemoryRouter>,
		);

		await user.type(screen.getByTestId("knowledge-create-title"), "Nested item");
		await user.type(screen.getByTestId("body-editor-textarea"), "Some content");

		await user.selectOptions(screen.getByTestId("parent-picker"), "ki-existing");

		await user.click(screen.getByTestId("knowledge-create-submit"));

		// Exactly one call to apiFetch — the create — carrying the parent.
		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});
		expect(mockFetch).toHaveBeenCalledWith(
			"/api/knowledge",
			expect.objectContaining({
				method: "POST",
				body: expect.stringContaining('"parentKind":"knowledge_item"'),
			}),
		);
		expect(mockFetch).toHaveBeenCalledWith(
			"/api/knowledge",
			expect.objectContaining({
				body: expect.stringContaining('"parentId":"ki-existing"'),
			}),
		);
	});
});

// ---------------------------------------------------------------------------
// §6 + WARNING 3 — Team pill selectability: data-driven, not hardcoded false
// ---------------------------------------------------------------------------

describe("AF13 §6 — Team scope pill is data-driven (WARNING 3 positive-path proof)", () => {
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
				email: "f@example.com",
				avatarUrl: null,
				teamId: "t1", // has a team
			},
			status: "ready",
			error: null,
			retry: vi.fn(),
		});

		const { KnowledgeCreate } = await import("../pages/KnowledgeCreate.js");

		render(
			<MemoryRouter>
				<KnowledgeCreate />
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
				email: "f@example.com",
				avatarUrl: null,
				// no teamId field
			},
			status: "ready",
			error: null,
			retry: vi.fn(),
		});

		const { KnowledgeCreate } = await import("../pages/KnowledgeCreate.js");

		render(
			<MemoryRouter>
				<KnowledgeCreate />
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
			user: { id: "u1", name: "Founder", email: "f@example.com", avatarUrl: null },
			status: "ready",
			error: null,
			retry: vi.fn(),
		});

		const { KnowledgeCreate } = await import("../pages/KnowledgeCreate.js");

		render(
			<MemoryRouter>
				<KnowledgeCreate />
			</MemoryRouter>,
		);

		const teamPill = screen.getByTestId("scope-pill-create-team");
		expect(teamPill).toHaveAttribute("title", "Join a team to use team-scoped knowledge");
	});

	it("clicking an enabled Team pill selects the Team scope", async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: {
				id: "u1",
				name: "Founder",
				email: "f@example.com",
				avatarUrl: null,
				teamId: "t1",
			},
			status: "ready",
			error: null,
			retry: vi.fn(),
		});

		const { KnowledgeCreate } = await import("../pages/KnowledgeCreate.js");
		const user = userEvent.setup();

		render(
			<MemoryRouter>
				<KnowledgeCreate />
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

describe("UI-127 — KnowledgeCreate editor card has no fixed minHeight cap", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("editor card wrapper has no hardcoded minHeight:300px inline style", async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "u1", name: "Founder", email: "f@example.com", avatarUrl: null },
			status: "ready",
			error: null,
			retry: vi.fn(),
		});

		const { KnowledgeCreate } = await import("../pages/KnowledgeCreate.js");

		render(
			<MemoryRouter>
				<KnowledgeCreate />
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
