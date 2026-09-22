/**
 * DocumentDetail — edit mode: open, auto-save through `edit_document`, the
 * version-clash banner, and the factory read-only gate.
 *
 * @lore BC4: replaces `KnowledgeDetail.edit.test.tsx`. Auto-save now goes
 * through `call("edit_document", …)`, not `PATCH /api/knowledge/:id`.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
	HostThreadSection: () => <div data-testid="host-thread-section" />,
}));

vi.mock("../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({ user: { id: "u-founder", name: "Founder" } }),
}));

vi.mock("../../hooks/useTeams.js", () => ({
	useTeams: () => ({ data: { teams: [] }, loading: false }),
}));

// BodyEditor — TipTap requires DOM APIs unavailable in JSDOM.
vi.mock("../../ds", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../ds")>();
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

function renderPage(id: string): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/documents/${id}`]}>
			<Routes>
				<Route path="/documents/:documentId" element={<DocumentDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

beforeEach(() => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
	callMock.mockReset();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("DocumentDetail — open", () => {
	it("calls open_document({ id })", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", body: "Steps." });
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		renderPage("doc-1");

		await screen.findByRole("heading", { name: "Runbook" });
		expect(callMock).toHaveBeenCalledWith("open_document", { id: "doc-1" });
	});
});

describe("DocumentDetail — auto-save through edit_document", () => {
	it("calls edit_document with { id, body, version }", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", body: "Steps.", version: 4 });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				edit_document: async () => ({
					ok: true,
					data: makeDocumentView(makeDocumentRow({ ...row, version: 5 })),
				}),
			}),
		);

		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		renderPage("doc-1");

		await user.click(await screen.findByRole("button", { name: /^edit$/i }));
		const textarea = screen.getByTestId("body-editor-textarea");
		await user.clear(textarea);
		await user.type(textarea, "New content");
		await vi.advanceTimersByTimeAsync(1600);

		await waitFor(() => {
			const editCalls = callMock.mock.calls.filter((c) => c[0] === "edit_document");
			expect(editCalls.length).toBeGreaterThan(0);
			expect(editCalls[0]?.[1]).toEqual({ id: "doc-1", body: "New content", version: 4 });
		});
	});

	it("shows Saving then Saved", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", body: "Steps.", version: 1 });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				edit_document: async () => ({ ok: true, data: makeDocumentView(row) }),
			}),
		);

		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		renderPage("doc-1");
		await user.click(await screen.findByRole("button", { name: /^edit$/i }));
		const textarea = screen.getByTestId("body-editor-textarea");
		await user.type(textarea, "!");
		await vi.advanceTimersByTimeAsync(1600);

		await waitFor(() => {
			expect(screen.getByTestId("save-indicator")).toHaveTextContent("Saved");
		});
	});
});

describe("DocumentDetail — the version-clash banner", () => {
	it("shows the exact `stale` message and does not overwrite the editor text", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", body: "Original.", version: 1 });
		const staleMessage = "The document changed since you read it — open it again and retry.";
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				edit_document: async () => ({
					ok: false,
					problems: [{ code: "stale", message: staleMessage }],
				}),
			}),
		);

		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		renderPage("doc-1");
		await user.click(await screen.findByRole("button", { name: /^edit$/i }));
		const textarea = screen.getByTestId("body-editor-textarea");
		await user.type(textarea, " edited");
		await vi.advanceTimersByTimeAsync(1600);

		const banner = await screen.findByTestId("conflict-banner");
		expect(banner).toHaveTextContent(staleMessage);

		// The editor's own draft is untouched — only a Reload can discard it.
		expect(screen.getByTestId("body-editor-textarea")).toHaveValue("Original. edited");
	});
});

describe("DocumentDetail — factory read-only gate", () => {
	it("does not show Edit for a factory item authored by someone else", async () => {
		const row = makeDocumentRow({
			id: "doc-factory",
			title: "Policy",
			body: "Rules.",
			scopeKind: "factory",
			updatedBy: "some-agent",
		});
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		renderPage("doc-factory");

		await screen.findByRole("heading", { name: "Policy" });
		expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
	});

	it("shows Edit for a factory item the viewer themselves authored", async () => {
		const row = makeDocumentRow({
			id: "doc-factory-mine",
			title: "My policy",
			body: "Rules.",
			scopeKind: "factory",
			updatedBy: "u-founder",
		});
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		renderPage("doc-factory-mine");

		expect(await screen.findByRole("button", { name: /^edit$/i })).toBeInTheDocument();
	});
});
