/**
 * AI5 E4 migration — ScopeChangeDialog scope picker (RED phase).
 *
 * ScopeChangeDialog is the ONLY scope site that uses a DaisyUI <Select> today.
 * AI5 migrates it to the canonical ScopePicker pill group with a NEW
 * `scope-pill-change` testid prefix (none exists today). These assertions fail
 * now because the Select renders a combobox, not pills.
 *
 * Mirrors the AD3 KnowledgeCreateDialog scope-pill behavioral contract.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../services/call.js", () => ({
	call: vi.fn(),
}));

vi.mock("../../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: vi.fn(),
}));

import { useCurrentUser } from "../../../hooks/useCurrentUser.js";
import { ScopeChangeDialog } from "../ScopeChangeDialog";

function mockUser(overrides: { teamId?: string } = {}): void {
	vi.mocked(useCurrentUser).mockReturnValue({
		user: { id: "user-1", name: "User", avatarUrl: null, ...overrides },
		status: "ready",
		error: null,
		retry: vi.fn(),
	});
}

const BASE_PROPS = {
	open: true,
	onClose: vi.fn(),
	onSaved: vi.fn(),
	documentId: "doc-1",
	currentVersion: 1,
	currentScopeKind: "factory" as const,
	// factory has no id to prefill; the initial-render prefill is covered in
	// ScopeChangeDialog-initial-prefill.test.tsx.
	currentScopeId: null,
	// This suite is about the Shared/Team pill mechanics; hasParent:true
	// keeps Private enabled so those cases are unaffected. Private's own
	// disabled-for-a-root-document behavior is covered in
	// ScopeChangeDialog-private-root.test.tsx.
	hasParent: true,
};

describe("ScopeChangeDialog — scope-pill-change picker", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUser();
	});

	it("renders scope pills with the scope-pill-change prefix", () => {
		render(<ScopeChangeDialog {...BASE_PROPS} />);
		expect(screen.getByTestId("scope-pill-change-shared")).toBeInTheDocument();
		expect(screen.getByTestId("scope-pill-change-team")).toBeInTheDocument();
		expect(screen.getByTestId("scope-pill-change-private")).toBeInTheDocument();
		// AU26 F2 (founder ruling): the Filesystem scope is gone.
		expect(screen.queryByTestId("scope-pill-change-filesystem")).not.toBeInTheDocument();
		// @lore nested-knowledge-items: the Role option (scopeKind: "practice")
		// is gone with the practice scope value.
		expect(screen.queryByTestId("scope-pill-change-role")).not.toBeInTheDocument();
	});

	it("does not render a Select combobox (replaced by the pill group)", () => {
		render(<ScopeChangeDialog {...BASE_PROPS} />);
		expect(screen.queryByRole("combobox", { name: /scope kind/i })).not.toBeInTheDocument();
	});

	it("marks the current scope pill active via data-active", () => {
		// currentScopeKind "factory" resolves to the "Shared" option.
		render(<ScopeChangeDialog {...BASE_PROPS} />);
		expect(screen.getByTestId("scope-pill-change-shared")).toHaveAttribute("data-active", "true");
	});

	it("disables the Team pill when the user has no teamId", () => {
		render(<ScopeChangeDialog {...BASE_PROPS} />);
		expect(screen.getByTestId("scope-pill-change-team")).toBeDisabled();
	});

	it("enables the Team pill when the user has a teamId", () => {
		mockUser({ teamId: "t1" });
		render(<ScopeChangeDialog {...BASE_PROPS} />);
		expect(screen.getByTestId("scope-pill-change-team")).not.toBeDisabled();
	});

	it("marks the Team pill active when currentScopeKind is team", () => {
		render(<ScopeChangeDialog {...BASE_PROPS} currentScopeKind="team" />);
		expect(screen.getByTestId("scope-pill-change-team")).toHaveAttribute("data-active", "true");
	});
});
