/**
 * DocumentList splits items by status into two tabs: Triage (proposed) and
 * Curated (active). It auto-selects Triage when a proposed item exists,
 * else Curated.
 */

import type { DocumentRow, DocumentStatus } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentList } from "../pages/DocumentList";

const mockUseDocuments = vi.fn();
vi.mock("../hooks/useDocuments.js", () => ({
	useDocuments: (...args: unknown[]) => mockUseDocuments(...args),
}));

function mockDocuments(documents: DocumentRow[]): void {
	mockUseDocuments.mockReturnValue({
		documents,
		status: "ready",
		error: null,
		retry: vi.fn(),
	});
}

function makeItem(id: string, status: DocumentStatus, title: string): DocumentRow {
	return {
		id,
		title,
		body: "body",
		format: "markdown",
		status,
		slot: "ordinary",
		scopeKind: "team",
		scopeId: "team-1",
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: "agent:agent-r7",
		createdAt: "2026-05-30T00:00:00.000Z",
		updatedAt: "2026-05-30T00:00:00.000Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
	};
}

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/documents"]}>
			<DocumentList />
		</MemoryRouter>,
	);
}

describe("DocumentList tabs: status decides Triage vs Curated", () => {
	it("defaults to Triage and shows only proposed items when a draft exists", async () => {
		mockDocuments([
			makeItem("k-draft-1", "proposed", "Agent Pattern"),
			makeItem("k-active-1", "active", "Curated Pattern"),
		]);
		renderPage();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});
		expect(screen.getByText("Agent Pattern")).toBeInTheDocument();
		expect(screen.queryByText("Curated Pattern")).not.toBeInTheDocument();
	});

	it("defaults to Curated when no draft items exist", async () => {
		mockDocuments([makeItem("k-only-active", "active", "Only Active Item")]);
		renderPage();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /curated/i })).toHaveAttribute("aria-selected", "true");
		});
		expect(screen.getByText("Only Active Item")).toBeInTheDocument();
	});

	it("switching tabs shows the right subset of items in each direction", async () => {
		mockDocuments([
			makeItem("k-draft-a", "proposed", "Draft Alpha"),
			makeItem("k-active-a", "active", "Active Alpha"),
		]);
		const user = userEvent.setup();
		renderPage();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});
		expect(screen.getByText("Draft Alpha")).toBeInTheDocument();
		expect(screen.queryByText("Active Alpha")).not.toBeInTheDocument();

		await user.click(screen.getByRole("tab", { name: /curated/i }));

		await waitFor(() => {
			expect(screen.getByText("Active Alpha")).toBeInTheDocument();
		});
		expect(screen.queryByText("Draft Alpha")).not.toBeInTheDocument();
	});
});
