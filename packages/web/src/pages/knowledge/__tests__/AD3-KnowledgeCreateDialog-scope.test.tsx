/**
 * AD3 → AD6: KnowledgeCreateDialog scope picker.
 *
 * AD6 supersedes AD3's single-team dropdown with a 3-pill segmented control.
 * Always shows 3 pills (Shared / Team / Private) regardless of team count.
 * Team pill is disabled when no teamId is available.
 * Locked scope shows a read-only tag (unchanged from AD3).
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@hyperidle/design-system", async (importOriginal) => {
	const original = await importOriginal<typeof import("@hyperidle/design-system")>();
	return {
		...original,
		BodyEditor: ({
			initialContent,
			onChange,
		}: {
			initialContent: string;
			onChange: (md: string) => void;
		}) => (
			<textarea
				data-testid="body-editor-textarea"
				defaultValue={initialContent}
				onChange={(e) => onChange(e.target.value)}
				aria-label="Body editor"
			/>
		),
	};
});

vi.mock("../../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

vi.mock("../../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({ user: { id: "user-1" } }),
}));

import { KnowledgeCreateDialog } from "../KnowledgeCreateDialog";

const BASE_PROPS = {
	open: true,
	onClose: vi.fn(),
	onCreated: vi.fn(),
};

describe("AD6: KnowledgeCreateDialog — 3-pill scope picker", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("shows scope pills including Role and Filesystem when not locked", () => {
		render(<KnowledgeCreateDialog {...BASE_PROPS} />);
		expect(screen.getByTestId("scope-pill-dialog-shared")).toBeInTheDocument();
		expect(screen.getByTestId("scope-pill-dialog-team")).toBeInTheDocument();
		expect(screen.getByTestId("scope-pill-dialog-private")).toBeInTheDocument();
		expect(screen.getByTestId("scope-pill-dialog-role")).toBeInTheDocument();
		expect(screen.getByTestId("scope-pill-dialog-filesystem")).toBeInTheDocument();
	});

	it("does not show a combobox dropdown (AD6 replaced with pills)", () => {
		render(<KnowledgeCreateDialog {...BASE_PROPS} />);
		expect(screen.queryByRole("combobox", { name: /scope kind/i })).not.toBeInTheDocument();
	});

	it("Team pill is disabled when no teamId is available", () => {
		render(<KnowledgeCreateDialog {...BASE_PROPS} />);
		const teamPill = screen.getByTestId("scope-pill-dialog-team");
		expect(teamPill).toBeDisabled();
	});

	it("does NOT render scope pills when scope is locked (existing behavior)", () => {
		render(<KnowledgeCreateDialog {...BASE_PROPS} lockedScopeKind="factory" />);
		expect(screen.queryByTestId("scope-pill-dialog-shared")).not.toBeInTheDocument();
		expect(screen.getByText("factory")).toBeInTheDocument();
	});

	it("submits Role scope with typed scopeId", async () => {
		const { apiFetch } = await import("../../../services/api-fetch.js");
		const fetchMock = vi.mocked(apiFetch);
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "k-role" }), { status: 201 }));
		const user = userEvent.setup();

		render(<KnowledgeCreateDialog {...BASE_PROPS} />);
		await user.type(screen.getByLabelText(/title/i), "Role note");
		await user.type(screen.getByLabelText(/body editor/i), "Role body");
		await user.click(screen.getByTestId("scope-pill-dialog-role"));
		await user.type(screen.getByLabelText(/scope id/i), "product_manager");
		await user.click(screen.getByRole("button", { name: /create/i }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		const options = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
		const payload = JSON.parse(String(options.body)) as { scopeKind: string; scopeId: string };
		expect(payload.scopeKind).toBe("practice");
		expect(payload.scopeId).toBe("product_manager");
	});
});
