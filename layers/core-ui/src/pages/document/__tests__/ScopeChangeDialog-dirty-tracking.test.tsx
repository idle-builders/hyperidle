/**
 * ScopeChangeDialog — dirty tracking reflects the current scope, not the
 * mount-time prefill.
 *
 * Review-found defect: opening the dialog on a team document prefills Scope
 * ID from the document's own current scopeId
 * (ScopeChangeDialog-initial-prefill.test.tsx), but `isDirty` was
 * `scopeId.trim().length > 0` — true the instant that prefill lands, even
 * though nothing changed. That made the dialog open already "dirty": Esc
 * raised the discard-confirm guard on an untouched dialog, and `canSave`
 * (which OR's in `isDirty` for scopes with no id) could allow a no-op save.
 * Dirty now means "differs from the current scope": scope kind changed, or
 * (for a scope that names an entity) the id differs from what is already
 * stored.
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
	currentScopeId: "team-doc-owns",
	hasParent: true,
};

describe("ScopeChangeDialog — dirty tracking vs current scope", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUser({ teamId: "team-doc-owns" });
	});

	it("is not dirty on open — the prefilled id matches the document's current scope", () => {
		render(<ScopeChangeDialog {...BASE_PROPS} />);
		expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
	});

	it("becomes dirty and enables Save once the id is changed to differ from the current scope", async () => {
		const { default: userEvent } = await import("@testing-library/user-event");
		const user = userEvent.setup();
		render(<ScopeChangeDialog {...BASE_PROPS} />);

		const input = screen.getByLabelText("Scope ID");
		await user.clear(input);
		await user.type(input, "team-other");

		expect(screen.getByRole("button", { name: /^save$/i })).not.toBeDisabled();
	});

	it("Esc on an untouched (non-dirty) dialog closes immediately, no discard guard", async () => {
		const onClose = vi.fn();
		const { default: userEvent } = await import("@testing-library/user-event");
		const user = userEvent.setup();
		render(<ScopeChangeDialog {...BASE_PROPS} onClose={onClose} />);

		await user.keyboard("{Escape}");

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(screen.queryByText(/discard/i)).not.toBeInTheDocument();
	});
});
