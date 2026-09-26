/**
 * DocumentList scope pills: All/Shared/Team/Private are static — always
 * present regardless of which scopeKind values appear in the item list.
 */
import type { DocumentRow } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DocumentList } from "../pages/DocumentList";

function makeDoc(overrides: Partial<DocumentRow> = {}): DocumentRow {
	return {
		id: "k1",
		title: "Untitled",
		body: "body",
		format: "markdown",
		status: "active",
		slot: "ordinary",
		scopeKind: "factory",
		scopeId: null,
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: "agent",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
		...overrides,
	};
}

vi.mock("../hooks/useDocuments.js", () => ({
	useDocuments: vi.fn().mockReturnValue({
		documents: [
			makeDoc({ id: "k1", title: "Auth Strategy Decision", scopeKind: "factory" }),
			makeDoc({ id: "k2", title: "User Onboarding Flow", scopeKind: "user" }),
			makeDoc({ id: "k3", title: "Agent Autonomy Policy", scopeKind: "team" }),
		],
		status: "ready",
		error: null,
		retry: vi.fn(),
	}),
}));

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<DocumentList />
		</MemoryRouter>,
	);
}

describe("DocumentList scope pills", () => {
	it.each(["all", "shared", "team", "private"])(
		"renders the static '%s' scope pill regardless of which scopeKinds are present",
		(pill) => {
			renderPage();
			const scopePills = screen.getByTestId("document-scope-pills");
			expect(scopePills.querySelector(`[data-testid="scope-pill-${pill}"]`)).not.toBeNull();
		},
	);

	it("defaults to All active; clicking a pill makes it the active one", async () => {
		const user = userEvent.setup();
		renderPage();

		expect(screen.getByTestId("scope-pill-all")).toHaveAttribute("data-active", "true");
		expect(screen.getByTestId("scope-pill-shared")).toHaveAttribute("data-active", "false");

		await user.click(screen.getByTestId("scope-pill-shared"));

		await waitFor(() => {
			expect(screen.getByTestId("scope-pill-shared")).toHaveAttribute("data-active", "true");
			expect(screen.getByTestId("scope-pill-all")).toHaveAttribute("data-active", "false");
		});
	});

	it("sort controls expose the active sort via aria-checked", async () => {
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByRole("tab", { name: /triage/i }));

		await waitFor(() => {
			const sortControls = screen.getByTestId("document-sort-bar");
			expect(sortControls.querySelector("[aria-checked='true']")).not.toBeNull();
		});
	});

	it('shows the "+ New" button in the header', () => {
		renderPage();
		expect(screen.getByRole("button", { name: /\+ new/i })).toBeInTheDocument();
	});
});
