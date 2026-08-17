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
vi.mock("@hyperidle/design-system", async (importOriginal) => {
	const original = await importOriginal<typeof import("@hyperidle/design-system")>();
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
// UI-127 — title input AND body editor both rendered (not lone textarea)
// ---------------------------------------------------------------------------

describe("UI-127 — KnowledgeCreate renders title input and body editor together", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("title input and mock body editor are both present in the rendered form", async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "u1", name: "Founder", email: "f@example.com", avatarUrl: null },
			status: "ready",
			error: null,
		});

		const { KnowledgeCreate } = await import("../pages/KnowledgeCreate.js");

		render(
			<MemoryRouter>
				<KnowledgeCreate />
			</MemoryRouter>,
		);

		// Both the title input and the body editor must be present simultaneously —
		// UI-127 was: KnowledgeCreate rendered only a lone textarea instead of the
		// full two-field layout (title + BodyEditor).
		expect(screen.getByTestId("knowledge-create-title")).toBeInTheDocument();
		expect(screen.getByTestId("mock-body-editor")).toBeInTheDocument();
	});
});
