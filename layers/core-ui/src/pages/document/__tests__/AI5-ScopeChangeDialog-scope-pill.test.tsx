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
	useCurrentUser: () => ({ user: { id: "user-1" } }),
}));

import { ScopeChangeDialog } from "../ScopeChangeDialog";

const BASE_PROPS = {
	open: true,
	onClose: vi.fn(),
	onSaved: vi.fn(),
	documentId: "doc-1",
	currentVersion: 1,
	currentScopeKind: "factory" as const,
};

describe("AI5: ScopeChangeDialog — scope-pill-change picker", () => {
	beforeEach(() => {
		vi.clearAllMocks();
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
});
