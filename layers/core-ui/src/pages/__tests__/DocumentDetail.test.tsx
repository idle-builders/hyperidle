/**
 * DocumentDetail — basic rendering: honest empty/not-found state, the four
 * usage values in the metadata aside, date formatting, the discussion
 * section's host, and "Promote to task".
 *
 * @lore BC4: replaces `KnowledgeDetail.test.tsx` — the fixture fallback
 * (`LEGACY_DETAILS`/`FALLBACK_DETAIL`) this used to exercise is deleted.
 * With nothing returned the page renders an honest not-found state and
 * none of the old fixture strings.
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

const callMock = vi.fn();
vi.mock("../../services/call.js", () => ({
	call: (...args: [string, unknown]) => callMock(...args),
}));

vi.mock("../../shell/HostThreadSection.js", () => ({
	HostThreadSection: ({ host }: { host: { kind: string; id: string } }) => (
		<div data-testid="host-thread-section" data-host-kind={host.kind} data-host-id={host.id} />
	),
}));

vi.mock("../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({ user: { id: "u-founder", name: "Founder" } }),
}));

vi.mock("../../hooks/useTeams.js", () => ({
	useTeams: () => ({ data: { teams: [{ id: "team-1", name: "Team One" }] }, loading: false }),
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

afterEach(() => {
	callMock.mockReset();
	vi.restoreAllMocks();
});

describe("DocumentDetail — honest empty state", () => {
	it("renders no fixture title and an honest not-found message when the API returns nothing", async () => {
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({
					ok: false,
					problems: [{ code: "not_found", message: "Document doc-missing not found." }],
				}),
			}),
		);

		renderPage("doc-missing");

		await screen.findByText("Document not found");

		// The old fixture fallbacks must never render again.
		expect(screen.queryByText("Unknown Knowledge Item")).not.toBeInTheDocument();
		expect(screen.queryByText("This knowledge item was not found.")).not.toBeInTheDocument();
		expect(screen.queryByText("Architecture Decision: Auth Strategy")).not.toBeInTheDocument();
		expect(
			screen.queryByRole("heading", { name: "Unknown Knowledge Item" }),
		).not.toBeInTheDocument();
	});
});

describe("DocumentDetail — usage values in the metadata aside", () => {
	it("shows readCount and sessionUseCount from the row", async () => {
		const row = makeDocumentRow({
			id: "doc-1",
			title: "Runbook",
			body: "Steps to follow.",
			readCount: 7,
			lastReadAt: "2026-01-05T00:00:00.000Z",
			sessionUseCount: 3,
			lastUsedAt: "2026-01-04T00:00:00.000Z",
		});
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		renderPage("doc-1");

		const readRow = await screen.findByTestId("document-read-count");
		expect(readRow).toHaveTextContent("7");
		expect(screen.getByTestId("document-session-use-count")).toHaveTextContent("3");
	});
});

describe("DocumentDetail — discussion mounts with the document host", () => {
	it("passes host={kind:'document', id} to HostThreadSection", async () => {
		const row = makeDocumentRow({ id: "doc-2", title: "Playbook", body: "Content." });
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		renderPage("doc-2");

		const section = await screen.findByTestId("host-thread-section");
		expect(section).toHaveAttribute("data-host-kind", "document");
		expect(section).toHaveAttribute("data-host-id", "doc-2");
	});
});

describe("DocumentDetail — date formatting", () => {
	it("renders the absolute date, never the raw ISO string, in the Last edited row", async () => {
		const row = makeDocumentRow({
			id: "doc-3",
			title: "Notes",
			updatedAt: "2026-06-12T14:34:00.000Z",
		});
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		renderPage("doc-3");

		await screen.findByTestId("document-scope-row");
		expect(screen.queryByText("2026-06-12T14:34:00.000Z")).not.toBeInTheDocument();
		const lastEditedRow = screen.getByText("Last edited").closest("div");
		expect(lastEditedRow?.textContent).toMatch(/2026/);
	});
});

describe("DocumentDetail — Promote to task", () => {
	it("still calls edit_task with sourceKnowledgeItemId", async () => {
		const row = makeDocumentRow({ id: "doc-4", title: "Idea worth building", body: "Details." });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				edit_task: async () => ({ ok: true, data: { task: { id: "task-1" } } }),
			}),
		);

		const user = userEvent.setup();
		renderPage("doc-4");

		await user.click(await screen.findByRole("button", { name: /more options/i }));
		await user.click(screen.getByRole("menuitem", { name: /promote to task/i }));

		await waitFor(() => {
			const promoteCalls = callMock.mock.calls.filter((c) => c[0] === "edit_task");
			expect(promoteCalls).toHaveLength(1);
			expect(promoteCalls[0]?.[1]).toMatchObject({
				teamId: "team-1",
				title: "Idea worth building",
				sourceKnowledgeItemId: "doc-4",
			});
		});
	});
});
