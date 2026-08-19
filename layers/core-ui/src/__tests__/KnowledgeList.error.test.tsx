/**
 * UI-010 / UI-015: KnowledgeList 500-error handling.
 *
 * The curated tab must show an ErrorState (not the "No knowledge items yet"
 * EmptyState) when useFetch signals an HTTP error. The triage tab already
 * had this check; the curated branch was missing it.
 *
 * UI-015: the ErrorState is rendered with an onRetry prop so the user can
 * re-issue the request without navigating away.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock useFetch at test-level so each test configures its own error/data state.
const mockUseFetch = vi.fn();
vi.mock("../hooks/useFetch", () => ({
	useFetch: (...args: unknown[]) => mockUseFetch(...args),
}));

// Silence router future-flag warnings in tests
vi.mock("react-router-dom", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-router-dom")>();
	return { ...actual };
});

import { KnowledgeList } from "../pages/KnowledgeList";

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<KnowledgeList />
		</MemoryRouter>,
	);
}

beforeEach(() => {
	mockUseFetch.mockReturnValue({
		data: null,
		error: null,
		isLoading: false,
		refetch: vi.fn(),
	});
});

describe("KnowledgeList — 500 error handling (UI-010)", () => {
	it("curated tab shows ErrorState, not EmptyState, when API returns 500", () => {
		const refetch = vi.fn();
		mockUseFetch.mockReturnValue({
			data: null,
			error: "HTTP 500",
			isLoading: false,
			refetch,
		});
		renderPage();

		// Must NOT show the "confident empty" text that implies success
		expect(screen.queryByText("No knowledge items yet")).not.toBeInTheDocument();
		expect(screen.queryByText("Your knowledge base is empty")).not.toBeInTheDocument();

		// Must show the error state
		expect(screen.getByText(/couldn't load knowledge/i)).toBeInTheDocument();
	});

	it("curated ErrorState provides a retry button that calls refetch (UI-015)", async () => {
		const refetch = vi.fn();
		mockUseFetch.mockReturnValue({
			data: null,
			error: "HTTP 500",
			isLoading: false,
			refetch,
		});
		renderPage();

		const retryBtn = screen.getByRole("button", { name: /retry/i });
		await userEvent.click(retryBtn);
		expect(refetch).toHaveBeenCalledTimes(1);
	});

	it("triage tab also surfaces ErrorState with retry on API error", async () => {
		const refetch = vi.fn();
		// Return a mix with a draft item so auto-tab picks triage, but error is set
		mockUseFetch.mockReturnValue({
			data: {
				items: [
					{
						id: "k1",
						title: "Draft",
						body: "",
						format: "md",
						status: "draft",
						version: 1,
						updatedBy: "u",
						topic: null,
						createdAt: "2025-01-01",
						updatedAt: "2025-01-01",
					},
				],
			},
			error: "HTTP 503",
			isLoading: false,
			refetch,
		});
		renderPage();

		// Click Triage tab explicitly
		const triageTab = screen.getByRole("tab", { name: /triage/i });
		await userEvent.click(triageTab);

		expect(screen.getByText(/couldn't load knowledge/i)).toBeInTheDocument();
		const retryBtn = screen.getByRole("button", { name: /retry/i });
		await userEvent.click(retryBtn);
		expect(refetch).toHaveBeenCalledTimes(1);
	});

	it("loading state is shown while isLoading=true (no false error state)", () => {
		mockUseFetch.mockReturnValue({
			data: null,
			error: null,
			isLoading: true,
			refetch: vi.fn(),
		});
		renderPage();
		expect(screen.queryByText("No knowledge items yet")).not.toBeInTheDocument();
		expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument();
	});
});
