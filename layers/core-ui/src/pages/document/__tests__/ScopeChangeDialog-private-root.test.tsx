/**
 * ScopeChangeDialog — Private is not offered for a parentless (root) document.
 *
 * Review-found defect: scoping a root document "Private" is a one-way
 * trapdoor — a parentless, user-scoped row reads back as a memory
 * (`documentAs`), and widening it away from Private is then refused
 * (`memory_scope_fixed`). The dialog now disables the Private pill whenever
 * the document has no parent, so the trapdoor can never be entered through
 * this door — a root private note is made through the Memories path
 * instead. A document WITH a parent is unaffected: a private *tree*
 * document is not a memory (architecture.md §3.6).
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
		user: { id: "user-1", name: "User", email: "u@x.com", avatarUrl: null, ...overrides },
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
	currentScopeId: null,
};

describe("ScopeChangeDialog — Private disabled for a parentless document", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUser({ teamId: "t1" });
	});

	it("disables the Private pill for a root (parentless) document", () => {
		render(<ScopeChangeDialog {...BASE_PROPS} hasParent={false} />);
		expect(screen.getByTestId("scope-pill-change-private")).toBeDisabled();
	});

	it("enables the Private pill for a document that has a parent", () => {
		render(<ScopeChangeDialog {...BASE_PROPS} hasParent={true} />);
		expect(screen.getByTestId("scope-pill-change-private")).not.toBeDisabled();
	});

	it("clicking a disabled Private pill on a root document is a no-op — Shared stays selected", async () => {
		const { default: userEvent } = await import("@testing-library/user-event");
		const user = userEvent.setup();
		render(<ScopeChangeDialog {...BASE_PROPS} hasParent={false} />);

		await user.click(screen.getByTestId("scope-pill-change-private"));

		expect(screen.getByTestId("scope-pill-change-shared")).toHaveAttribute("data-active", "true");
		expect(screen.getByTestId("scope-pill-change-private")).toHaveAttribute("data-active", "false");
	});
});
