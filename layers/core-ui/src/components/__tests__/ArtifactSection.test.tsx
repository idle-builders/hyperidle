/**
 * ArtifactSection unit tests.
 *
 * AC coverage:
 *  - loading: renders SkeletonList while fetch is in flight
 *  - error with heading: renders ErrorState
 *  - error without heading: renders null
 *  - empty with heading: renders EmptyState
 *  - empty without heading: renders null
 *  - emptyDescription prop forwarded to EmptyState
 *  - populated: renders one Row per item
 *  - heading rendered when provided
 *  - AC10: clicking a row enters split mode, renders detail pane
 *
 * @lore BC4: repointed off `useParentedKnowledgeItems`/`useKnowledgeItem` onto
 * `useDocuments`/`useDocument` (architecture.md §9.2, §5.2).
 */

import type { DocumentRow } from "@hyperidle/domain-model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../hooks/useDocuments.js", () => ({
	useDocuments: vi.fn(),
}));

vi.mock("../../hooks/useDocument.js", () => ({
	useDocument: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-router-dom")>();
	return { ...actual, useNavigate: () => vi.fn() };
});

import { useDocument } from "../../hooks/useDocument.js";
import { useDocuments } from "../../hooks/useDocuments.js";
import { ArtifactSection } from "../ArtifactSection";

const ITEM_A: DocumentRow = {
	id: "ki-test-a",
	title: "Agent output alpha",
	body: "# Output alpha",
	format: "markdown",
	status: "active",
	slot: "ordinary",
	scopeKind: "factory",
	scopeId: null,
	parentKind: "task",
	parentId: "task-test",
	position: 0,
	version: 1,
	updatedBy: "agent:sess-1",
	createdAt: "2026-09-01T00:00:00.000Z",
	updatedAt: "2026-09-01T00:00:00.000Z",
	readCount: 0,
	lastReadAt: null,
	sessionUseCount: 0,
	lastUsedAt: null,
	as: "artifact" as const,
};

const ITEM_B = { ...ITEM_A, id: "ki-test-b", title: "Agent output beta", body: "# Output beta" };
const ITEM_C = { ...ITEM_A, id: "ki-test-c", title: "Agent output gamma", body: "# Output gamma" };

function documentView(row: typeof ITEM_A): {
	document: typeof ITEM_A;
	ancestors: [];
	children: [];
	siblings: [];
	scopeName: string;
} {
	return { document: row, ancestors: [], children: [], siblings: [], scopeName: "Factory" };
}

function renderSection(
	overrides: Partial<React.ComponentProps<typeof ArtifactSection>> = {},
): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<ArtifactSection parentKind="task" parentId="task-test" heading="Artifacts" {...overrides} />
		</MemoryRouter>,
	);
}

describe("ArtifactSection", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ── Loading ───────────────────────────────────────────────────────────────

	it("renders SkeletonList while loading", () => {
		vi.mocked(useDocuments).mockReturnValue({
			status: "loading",
			documents: [],
			error: null,
			retry: vi.fn(),
		});
		vi.mocked(useDocument).mockReturnValue({
			status: "idle",
			data: null,
			error: null,
			refresh: vi.fn(),
		});

		renderSection();

		expect(screen.getByTestId("skeleton-list")).toBeInTheDocument();
	});

	// ── Error ─────────────────────────────────────────────────────────────────

	it("renders ErrorState when fetch fails and heading is provided", () => {
		vi.mocked(useDocuments).mockReturnValue({
			status: "error",
			documents: [],
			error: "HTTP 500",
			retry: vi.fn(),
		});
		vi.mocked(useDocument).mockReturnValue({
			status: "idle",
			data: null,
			error: null,
			refresh: vi.fn(),
		});

		renderSection({ heading: "Artifacts" });

		expect(screen.getByTestId("error-state")).toBeInTheDocument();
	});

	it("renders null when fetch fails and no heading is provided", () => {
		vi.mocked(useDocuments).mockReturnValue({
			status: "error",
			documents: [],
			error: "HTTP 500",
			retry: vi.fn(),
		});
		vi.mocked(useDocument).mockReturnValue({
			status: "idle",
			data: null,
			error: null,
			refresh: vi.fn(),
		});

		renderSection({ heading: undefined });

		expect(screen.queryByTestId("artifact-section-container")).toBeNull();
	});

	// ── Empty ─────────────────────────────────────────────────────────────────

	it("renders EmptyState when data is empty and heading is provided", () => {
		vi.mocked(useDocuments).mockReturnValue({
			status: "ready",
			documents: [],
			error: null,
			retry: vi.fn(),
		});
		vi.mocked(useDocument).mockReturnValue({
			status: "idle",
			data: null,
			error: null,
			refresh: vi.fn(),
		});

		renderSection({ heading: "Artifacts" });

		expect(screen.getByTestId("empty-state")).toBeInTheDocument();
	});

	it("uses emptyDescription prop when provided", () => {
		vi.mocked(useDocuments).mockReturnValue({
			status: "ready",
			documents: [],
			error: null,
			retry: vi.fn(),
		});
		vi.mocked(useDocument).mockReturnValue({
			status: "idle",
			data: null,
			error: null,
			refresh: vi.fn(),
		});

		renderSection({
			heading: "Artifacts",
			emptyDescription: "Agents produce output here as tasks complete.",
		});

		expect(screen.getByText("Agents produce output here as tasks complete.")).toBeInTheDocument();
	});

	it("uses the generic fallback description when emptyDescription is not provided", () => {
		vi.mocked(useDocuments).mockReturnValue({
			status: "ready",
			documents: [],
			error: null,
			retry: vi.fn(),
		});
		vi.mocked(useDocument).mockReturnValue({
			status: "idle",
			data: null,
			error: null,
			refresh: vi.fn(),
		});

		renderSection({ heading: "Artifacts" });

		expect(
			screen.getByText("Artifacts will appear here once agents produce output for this context."),
		).toBeInTheDocument();
	});

	it("renders null when data is empty and no heading is provided", () => {
		vi.mocked(useDocuments).mockReturnValue({
			status: "ready",
			documents: [],
			error: null,
			retry: vi.fn(),
		});
		vi.mocked(useDocument).mockReturnValue({
			status: "idle",
			data: null,
			error: null,
			refresh: vi.fn(),
		});

		renderSection({ heading: undefined });

		expect(screen.queryByTestId("artifact-section-container")).toBeNull();
	});

	// ── Populated ─────────────────────────────────────────────────────────────

	it("renders one row per item when populated", () => {
		vi.mocked(useDocuments).mockReturnValue({
			status: "ready",
			documents: [ITEM_A, ITEM_B, ITEM_C],
			error: null,
			retry: vi.fn(),
		});
		vi.mocked(useDocument).mockReturnValue({
			status: "idle",
			data: null,
			error: null,
			refresh: vi.fn(),
		});

		renderSection({ heading: "Artifacts" });

		expect(screen.getByText("Agent output alpha")).toBeInTheDocument();
		expect(screen.getByText("Agent output beta")).toBeInTheDocument();
		expect(screen.getByText("Agent output gamma")).toBeInTheDocument();
	});

	it("renders heading when provided and items exist", () => {
		vi.mocked(useDocuments).mockReturnValue({
			status: "ready",
			documents: [ITEM_A],
			error: null,
			retry: vi.fn(),
		});
		vi.mocked(useDocument).mockReturnValue({
			status: "idle",
			data: null,
			error: null,
			refresh: vi.fn(),
		});

		renderSection({ heading: "My Artifacts" });

		expect(screen.getByText("My Artifacts")).toBeInTheDocument();
	});

	it("calls useDocuments with the parent+as:artifact filter for the provided parentKind/parentId", () => {
		vi.mocked(useDocuments).mockReturnValue({
			status: "loading",
			documents: [],
			error: null,
			retry: vi.fn(),
		});
		vi.mocked(useDocument).mockReturnValue({
			status: "idle",
			data: null,
			error: null,
			refresh: vi.fn(),
		});

		renderSection({ parentKind: "thread", parentId: "thr-99" });

		expect(useDocuments).toHaveBeenCalledWith({
			parent: { kind: "thread", id: "thr-99" },
			as: "artifact",
		});
	});

	// ── AC10: click → split detail ────────────────────────────────────────────

	it("clicking an item row renders the split detail pane", async () => {
		vi.mocked(useDocuments).mockReturnValue({
			status: "ready",
			documents: [ITEM_A],
			error: null,
			retry: vi.fn(),
		});
		vi.mocked(useDocument).mockReturnValue({
			status: "ready",
			data: documentView(ITEM_A),
			error: null,
			refresh: vi.fn(),
		});

		renderSection();

		// Before click: detail pane absent
		expect(screen.queryByTestId("artifact-section-detail")).toBeNull();

		fireEvent.click(screen.getByText("Agent output alpha"));

		await waitFor(() => {
			expect(screen.getByTestId("artifact-section-detail")).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// A produced item appears in the conversation it was produced in.
// ---------------------------------------------------------------------------
//
// This is the thread half of the parity requirement: a human and an agent put
// a document into a conversation the same way, and this is the surface where
// either one shows up.
//
// The conversation page already owns a `SplitView`, so the section hands the
// click back rather than splitting a second time inside it — two splits on one
// screen fight over the same gesture and the same width.

describe("produced items in a conversation", () => {
	beforeEach(() => {
		vi.mocked(useDocuments).mockImplementation(
			(filter) =>
				({
					status: "ready",
					documents: [
						{
							id: "ki-1",
							title: `Produced in ${filter?.parent?.kind} ${filter?.parent?.id}`,
							status: "active",
						},
					] as unknown as DocumentRow[],
					error: null,
					retry: vi.fn(),
				}) as ReturnType<typeof useDocuments>,
		);
		vi.mocked(useDocument).mockReturnValue({
			status: "loading",
			data: null,
			error: null,
			refresh: vi.fn(),
		});
	});

	it("lists an item parented to the thread", () => {
		render(
			<ArtifactSection parentKind="thread" parentId="thr-1" heading="Artifacts" onOpen={vi.fn()} />,
		);

		expect(screen.getByText("Produced in thread thr-1")).toBeInTheDocument();
	});

	it("hands the click to the caller instead of splitting inside itself", async () => {
		const onOpen = vi.fn();
		render(
			<ArtifactSection parentKind="thread" parentId="thr-1" heading="Artifacts" onOpen={onOpen} />,
		);

		await userEvent.click(screen.getByText("Produced in thread thr-1"));

		expect(onOpen).toHaveBeenCalledWith("ki-1");
		// The caller owns the split — this section must not have opened one.
		expect(screen.queryByTestId("artifact-section-detail")).toBeNull();
	});

	it("still owns its own split when no caller takes the click", async () => {
		render(<ArtifactSection parentKind="task" parentId="task-1" heading="Artifacts" />);

		await userEvent.click(screen.getByText("Produced in task task-1"));

		expect(screen.getByTestId("artifact-section-detail")).toBeInTheDocument();
	});
});
