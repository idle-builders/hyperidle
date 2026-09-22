/**
 * DocumentDetail — Move, Change scope and Archive: exact `edit_document`
 * arguments, and the pure-invariant refusal that greys a control with its
 * own reason before the round trip (architecture.md §4.1).
 *
 * @lore BC4: replaces `KnowledgeDetail.move.test.tsx` and the archive cases
 * from `AD6-document-simplification.test.tsx`.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentDetail } from "../DocumentDetail";
import {
	makeCallRouter,
	makeDocumentRow,
	makeDocumentView,
} from "./document-detail-test-helpers.js";

const PARENT_CANDIDATE = makeDocumentRow({ id: "doc-root", title: "Product root" });

const callMock = vi.fn();
vi.mock("../../services/call.js", () => ({
	call: (...args: [string, unknown]) => callMock(...args),
}));

vi.mock("../../shell/HostThreadSection.js", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section" />,
}));

vi.mock("../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({ user: { id: "u-founder", name: "Founder" } }),
}));

vi.mock("../../hooks/useTeams.js", () => ({
	useTeams: () => ({ data: { teams: [] }, loading: false }),
}));

vi.mock("../../hooks/useDocuments.js", () => ({
	useDocuments: () => ({
		status: "ready",
		documents: [PARENT_CANDIDATE],
		error: null,
		retry: vi.fn(),
	}),
}));

function renderPage(id: string): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/documents/${id}`]}>
			<Routes>
				<Route path="/documents/:documentId" element={<DocumentDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

async function openOverflow(user: ReturnType<typeof userEvent.setup>): Promise<void> {
	await user.click(await screen.findByRole("button", { name: /more options/i }));
}

afterEach(() => {
	callMock.mockReset();
	vi.restoreAllMocks();
});

describe("DocumentDetail — Archive", () => {
	it("calls edit_document with { id, status: 'archived', version }", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", version: 2 });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				edit_document: async () => ({
					ok: true,
					data: makeDocumentView(makeDocumentRow({ ...row, status: "archived" })),
				}),
			}),
		);

		const user = userEvent.setup();
		renderPage("doc-1");
		await openOverflow(user);
		await user.click(screen.getByRole("menuitem", { name: /^archive$/i }));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_document", {
				id: "doc-1",
				status: "archived",
				version: 2,
			});
		});
	});

	it("navigates to /documents on success", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", version: 2 });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				edit_document: async () => ({
					ok: true,
					data: makeDocumentView(makeDocumentRow({ ...row, status: "archived" })),
				}),
			}),
		);

		const user = userEvent.setup();
		renderPage("doc-1");
		await openOverflow(user);
		await user.click(screen.getByRole("menuitem", { name: /^archive$/i }));

		await waitFor(() => {
			expect(screen.queryByTestId("document-detail-page")).not.toBeInTheDocument();
		});
	});

	it("shows the named error and stays on the page when the archive is refused", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", version: 2 });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				edit_document: async () => ({
					ok: false,
					problems: [{ code: "not_found", message: "Document doc-1 not found." }],
				}),
			}),
		);

		const user = userEvent.setup();
		renderPage("doc-1");
		await openOverflow(user);
		await user.click(screen.getByRole("menuitem", { name: /^archive$/i }));

		expect(await screen.findByTestId("archive-error")).toHaveTextContent(
			"Document doc-1 not found.",
		);
		expect(screen.getByTestId("document-detail-page")).toBeInTheDocument();
	});
});

describe("DocumentDetail — Change scope", () => {
	it("calls edit_document with { id, scopeKind, version }", async () => {
		// Given a parent — review-found defect: Private is disabled for a
		// parentless document (scoping a root document Private is a one-way
		// trapdoor into a memory), so this generic "scope change" mechanics
		// case now needs a parent for Private to stay a choosable target. A
		// private *tree* document is not a memory (architecture.md §3.6).
		const row = makeDocumentRow({
			id: "doc-1",
			title: "Runbook",
			scopeKind: "factory",
			parentKind: "document",
			parentId: "doc-root",
			version: 1,
		});
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				edit_document: async () => ({
					ok: true,
					data: makeDocumentView(makeDocumentRow({ ...row, scopeKind: "user" })),
				}),
			}),
		);

		const user = userEvent.setup();
		renderPage("doc-1");
		await user.click(await screen.findByTestId("document-scope-change-trigger"));
		await user.click(screen.getByTestId("scope-pill-change-private"));
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_document", {
				id: "doc-1",
				version: 1,
				scopeKind: "user",
			});
		});
	});
});

describe("DocumentDetail — Move", () => {
	it("calls edit_document with { id, parent, version }", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", version: 1 });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				edit_document: async () => ({ ok: true, data: makeDocumentView(row) }),
			}),
		);

		const user = userEvent.setup();
		renderPage("doc-1");
		await openOverflow(user);
		await user.click(screen.getByRole("menuitem", { name: /^move$/i }));
		await user.click(screen.getByRole("combobox", { name: "Parent" }));
		await user.click(screen.getByRole("option", { name: "Product root" }));
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_document", {
				id: "doc-1",
				version: 1,
				parent: { kind: "document", id: "doc-root" },
			});
		});
	});
});

describe("DocumentDetail — a pure-invariant refusal greys the control", () => {
	it("greys Move for a slotted document, with I10's own message", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "House rule", slot: "rule" });
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		const user = userEvent.setup();
		renderPage("doc-1");
		await openOverflow(user);

		const moveItem = screen.getByRole("menuitem", { name: /^move$/i });
		expect(moveItem).toBeDisabled();
		expect(moveItem).toHaveAttribute(
			"title",
			"A skill, rule, identity or prompt stays where it was attached.",
		);
	});

	it("does not grey Move for an ordinary document", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Notes", slot: "ordinary" });
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		const user = userEvent.setup();
		renderPage("doc-1");
		await openOverflow(user);

		expect(screen.getByRole("menuitem", { name: /^move$/i })).not.toBeDisabled();
	});

	it("hides Move and Change scope entirely for a read-only factory document", async () => {
		const row = makeDocumentRow({
			id: "doc-1",
			title: "Policy",
			scopeKind: "factory",
			updatedBy: "some-agent",
		});
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		const user = userEvent.setup();
		renderPage("doc-1");
		await openOverflow(user);

		expect(screen.queryByRole("menuitem", { name: /^move$/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("menuitem", { name: /^change scope$/i })).not.toBeInTheDocument();
	});
});
