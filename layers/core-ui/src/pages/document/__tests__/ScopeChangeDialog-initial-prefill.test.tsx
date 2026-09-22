/**
 * ScopeChangeDialog — Scope ID prefill on initial render.
 *
 * Review-found defect: the dialog only prefilled the Scope ID the moment a
 * person freshly clicked the Team pill — opening it with Team already the
 * current scope showed an empty field even though the document already had
 * a team scopeId, and offered no way to tell Save was safe to press. On
 * mount with `currentScopeKind:"team"`, the field now prefills from the
 * document's own `currentScopeId` (falling back to the user's own team when
 * that is absent), and Save is gated only on the id being non-empty — not
 * on whether it differs from the id already stored.
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
	currentScopeKind: "team" as const,
	hasParent: true,
};

describe("ScopeChangeDialog — Scope ID prefill on initial render", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("prefills the Scope ID from the document's current scopeId when it opens with Team already selected", () => {
		mockUser({ teamId: "some-other-team" });
		render(<ScopeChangeDialog {...BASE_PROPS} currentScopeId="team-doc-owns" />);

		expect(screen.getByLabelText("Scope ID")).toHaveValue("team-doc-owns");
	});

	it("falls back to the user's own team when the document's current scopeId is absent", () => {
		mockUser({ teamId: "my-team" });
		render(<ScopeChangeDialog {...BASE_PROPS} currentScopeId={null} />);

		expect(screen.getByLabelText("Scope ID")).toHaveValue("my-team");
	});

	it("Save starts enabled — the prefilled id is already non-empty, and Save is gated only on emptiness", () => {
		mockUser({ teamId: "some-other-team" });
		render(<ScopeChangeDialog {...BASE_PROPS} currentScopeId="team-doc-owns" />);

		expect(screen.getByRole("button", { name: /^save$/i })).not.toBeDisabled();
	});

	it("Save disables when the prefilled id is cleared", async () => {
		mockUser({ teamId: "some-other-team" });
		const { default: userEvent } = await import("@testing-library/user-event");
		const user = userEvent.setup();
		render(<ScopeChangeDialog {...BASE_PROPS} currentScopeId="team-doc-owns" />);

		await user.clear(screen.getByLabelText("Scope ID"));

		expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
	});

	it("does not prefill for a non-team current scope", () => {
		mockUser({ teamId: "my-team" });
		render(<ScopeChangeDialog {...BASE_PROPS} currentScopeKind="factory" currentScopeId={null} />);

		expect(screen.queryByLabelText("Scope ID")).not.toBeInTheDocument();
	});
});
