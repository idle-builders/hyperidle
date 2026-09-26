/**
 * DocumentCreate — Private requires a parent.
 *
 * Review-found defect: the create page offered "Private" with NO parent
 * chosen, which writes a parentless user-scoped row through the document
 * path — `documentAs` reads that shape back as a memory, and the detail
 * dialog that then opens shows its own selected scope pill disabled (the
 * ScopeChangeDialog trapdoor guard, ScopeChangeDialog-private-root.test.tsx).
 * A root private note is a memory, made through the assistant/agent path,
 * not this create page. Private is offered here only once a parent is
 * chosen; clearing the parent while Private is selected falls back to Team
 * (or Shared with no team) rather than leaving an illegal combination
 * selected.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UseDocumentsResult } from "../../hooks/useDocuments.js";

vi.mock("../../ds", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../ds")>();
	return {
		...original,
		BodyEditor: () => <div data-testid="mock-body-editor" />,
	};
});

vi.mock("../../services/call.js", () => ({
	call: vi.fn(),
}));

vi.mock("../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: vi.fn(),
}));

vi.mock("../../hooks/useDocuments.js", () => ({
	useDocuments: vi.fn(),
}));

import { useCurrentUser } from "../../hooks/useCurrentUser.js";
import { useDocuments } from "../../hooks/useDocuments.js";
import { DocumentCreate } from "../DocumentCreate.js";

function mockUser(overrides: { teamId?: string } = {}): void {
	vi.mocked(useCurrentUser).mockReturnValue({
		user: { id: "u1", name: "Founder", avatarUrl: null, ...overrides },
		status: "ready",
		error: null,
		retry: vi.fn(),
	});
}

function mockParentOptions(): void {
	vi.mocked(useDocuments).mockReturnValue({
		status: "ready",
		documents: [
			{ id: "root-a", title: "Root A", scopeKind: "factory", parentId: null, parentKind: null },
		] as unknown as UseDocumentsResult["documents"],
		error: null,
		retry: vi.fn(),
	});
}

async function pickParent(user: ReturnType<typeof userEvent.setup>, label: string): Promise<void> {
	await user.click(screen.getByRole("combobox", { name: "Parent" }));
	await user.click(screen.getByText(label));
}

describe("DocumentCreate — Private requires a chosen parent", () => {
	beforeEach(() => {
		mockUser({ teamId: "t1" });
		mockParentOptions();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("disables the Private pill with no parent chosen", () => {
		render(
			<MemoryRouter initialEntries={["/documents/new"]}>
				<DocumentCreate />
			</MemoryRouter>,
		);
		expect(screen.getByTestId("scope-pill-create-private")).toBeDisabled();
	});

	it("enables the Private pill once a parent is chosen", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter initialEntries={["/documents/new"]}>
				<DocumentCreate />
			</MemoryRouter>,
		);

		await pickParent(user, "Root A");

		expect(screen.getByTestId("scope-pill-create-private")).not.toBeDisabled();
	});

	it("falls back to Team when the parent is cleared while Private is selected (user has a team)", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter initialEntries={["/documents/new"]}>
				<DocumentCreate />
			</MemoryRouter>,
		);

		await pickParent(user, "Root A");
		await user.click(screen.getByTestId("scope-pill-create-private"));
		expect(screen.getByTestId("scope-pill-create-private")).toHaveAttribute("data-active", "true");

		await pickParent(user, "No parent (top level)");

		expect(screen.getByTestId("scope-pill-create-team")).toHaveAttribute("data-active", "true");
		expect(screen.getByTestId("scope-pill-create-private")).toBeDisabled();
	});

	it("falls back to Shared when the parent is cleared while Private is selected (no team)", async () => {
		mockUser();
		const user = userEvent.setup();
		render(
			<MemoryRouter initialEntries={["/documents/new"]}>
				<DocumentCreate />
			</MemoryRouter>,
		);

		await pickParent(user, "Root A");
		await user.click(screen.getByTestId("scope-pill-create-private"));

		await pickParent(user, "No parent (top level)");

		expect(screen.getByTestId("scope-pill-create-shared")).toHaveAttribute("data-active", "true");
	});
});
