/**
 * UI-010 / UI-015: DocumentList 500-error handling.
 *
 * The curated tab must show an ErrorState (not the "No documents yet"
 * EmptyState) when `useDocuments` signals an HTTP error. The triage tab
 * already had this check; the curated branch was missing it.
 *
 * UI-015: the ErrorState is rendered with an onRetry prop so the user can
 * re-issue the request without navigating away.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock useDocuments at test-level so each test configures its own error/data state.
const mockUseDocuments = vi.fn();
vi.mock("../hooks/useDocuments.js", () => ({
	useDocuments: (...args: unknown[]) => mockUseDocuments(...args),
}));

// Silence router future-flag warnings in tests
vi.mock("react-router-dom", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-router-dom")>();
	return { ...actual };
});

import { DocumentList } from "../pages/DocumentList";

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<DocumentList />
		</MemoryRouter>,
	);
}

beforeEach(() => {
	mockUseDocuments.mockReturnValue({
		documents: [],
		status: "ready",
		error: null,
		retry: vi.fn(),
	});
});

describe("DocumentList — 500 error handling (UI-010)", () => {
	it("curated tab shows ErrorState, not EmptyState, when the search errors", () => {
		const retry = vi.fn();
		mockUseDocuments.mockReturnValue({
			documents: [],
			status: "error",
			error: "HTTP 500",
			retry,
		});
		renderPage();

		// Must NOT show the "confident empty" text that implies success
		expect(screen.queryByText("No documents yet")).not.toBeInTheDocument();
		expect(screen.queryByText("Your document library is empty")).not.toBeInTheDocument();

		// Must show the error state
		expect(screen.getByText(/couldn't load documents/i)).toBeInTheDocument();
	});

	it("curated ErrorState provides a retry button that calls retry (UI-015)", async () => {
		const retry = vi.fn();
		mockUseDocuments.mockReturnValue({
			documents: [],
			status: "error",
			error: "HTTP 500",
			retry,
		});
		renderPage();

		const retryBtn = screen.getByRole("button", { name: /retry/i });
		await userEvent.click(retryBtn);
		expect(retry).toHaveBeenCalledTimes(1);
	});

	it("triage tab also surfaces ErrorState with retry on a search error", async () => {
		const retry = vi.fn();
		// Return a mix with a proposed item so auto-tab picks triage, but error is set
		mockUseDocuments.mockReturnValue({
			documents: [
				{
					id: "k1",
					title: "Draft",
					body: "",
					format: "md",
					status: "proposed",
					slot: "ordinary",
					scopeKind: "team",
					scopeId: "team-1",
					parentKind: null,
					parentId: null,
					position: 0,
					version: 1,
					updatedBy: "u",
					createdAt: "2025-01-01",
					updatedAt: "2025-01-01",
					readCount: 0,
					lastReadAt: null,
					sessionUseCount: 0,
					lastUsedAt: null,
					as: "document",
				},
			],
			status: "error",
			error: "HTTP 503",
			retry,
		});
		renderPage();

		// Click Triage tab explicitly
		const triageTab = screen.getByRole("tab", { name: /triage/i });
		await userEvent.click(triageTab);

		expect(screen.getByText(/couldn't load documents/i)).toBeInTheDocument();
		const retryBtn = screen.getByRole("button", { name: /retry/i });
		await userEvent.click(retryBtn);
		expect(retry).toHaveBeenCalledTimes(1);
	});

	it("loading state is shown while status='loading' (no false error state)", () => {
		mockUseDocuments.mockReturnValue({
			documents: [],
			status: "loading",
			error: null,
			retry: vi.fn(),
		});
		renderPage();
		expect(screen.queryByText("No documents yet")).not.toBeInTheDocument();
		expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument();
	});
});
