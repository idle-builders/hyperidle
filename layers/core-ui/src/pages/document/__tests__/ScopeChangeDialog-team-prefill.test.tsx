/**
 * ScopeChangeDialog — Scope ID prefill when "Team" is chosen.
 *
 * @lore BC4 gate-walk finding: widening a private tree document to Team
 * requires a `scopeId`. The person's own team is already carried from
 * `/auth/me` (`useCurrentUser`), so the field prefills with it instead of
 * asking the person to know and type their own team's id — the field stays
 * editable, this is a default, not a lock.
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
	currentScopeKind: "user" as const,
	// This suite is about the Team pill's prefill, not Private; hasParent:true
	// keeps Private enabled so it is not what makes the Team clicks under test.
	hasParent: true,
};

describe("ScopeChangeDialog — Team scope id prefill", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("prefills the Scope ID with the user's own team when Team is chosen", async () => {
		mockUser({ teamId: "team-9" });
		const { default: userEvent } = await import("@testing-library/user-event");
		const user = userEvent.setup();
		render(<ScopeChangeDialog {...BASE_PROPS} />);

		await user.click(screen.getByTestId("scope-pill-change-team"));

		expect(screen.getByLabelText("Scope ID")).toHaveValue("team-9");
	});

	it("leaves the Scope ID field editable — a typed value is not overwritten", async () => {
		mockUser({ teamId: "team-9" });
		const { default: userEvent } = await import("@testing-library/user-event");
		const user = userEvent.setup();
		render(<ScopeChangeDialog {...BASE_PROPS} />);

		await user.click(screen.getByTestId("scope-pill-change-team"));
		const input = screen.getByLabelText("Scope ID");
		await user.clear(input);
		await user.type(input, "team-other");

		expect(input).toHaveValue("team-other");
	});

	it("does not prefill the Scope ID when the user has no team", async () => {
		mockUser();
		const { default: userEvent } = await import("@testing-library/user-event");
		const user = userEvent.setup();
		render(<ScopeChangeDialog {...BASE_PROPS} />);

		// The Team pill is disabled with no teamId — click is a no-op, the
		// field stays absent (Private needs no scope id).
		await user.click(screen.getByTestId("scope-pill-change-team"));
		expect(screen.queryByLabelText("Scope ID")).not.toBeInTheDocument();
	});
});
