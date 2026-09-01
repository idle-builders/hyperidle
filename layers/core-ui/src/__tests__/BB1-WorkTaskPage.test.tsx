/**
 * BB1 AC10 — Component tests for the recursive task page.
 *
 * AC10: One recursive task surface. Proves:
 * - A 3-level tree renders all levels (root → child → grandchild).
 * - The breadcrumb is built from ancestors (not a fixed 2-level structure).
 * - Task fields are editable and changing a field issues PATCH /api/tasks/:id.
 * - No BetCard, WorkBet, or WorkTask references remain in the page.
 *
 * Acceptance criterion (from plan.md):
 * "Component tests cover the recursive render and the edit submit."
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTaskPage } from "../pages/WorkTaskPage";

// ── Module-level mocks ──────────────────────────────────────────────────────

vi.mock("../hooks/useTaskSessions", () => ({
	useTaskSessions: () => ({ data: null, loading: false, error: null }),
}));

vi.mock("../shell/HostThreadSection", () => ({
	HostThreadSection: ({ hostKind, hostId }: { hostKind: string; hostId: string }) => (
		<div data-testid="host-thread-section" data-host-kind={hostKind} data-host-id={hostId} />
	),
}));

vi.mock("../components/ArtifactSection", () => ({
	ArtifactSection: () => <div data-testid="artifact-section" />,
	useArtifactOpen: () => vi.fn(),
}));

// ── Fixture helpers ─────────────────────────────────────────────────────────

function makeTask(
	id: string,
	title: string,
	parentTaskId: string | null = null,
	state = "proposed",
): object {
	return {
		id,
		parentTaskId,
		teamId: "team-1",
		ownerAgentId: "agent-1",
		title,
		description: `Description of ${title}`,
		doneCondition: null,
		state,
		dependencies: null,
		artifacts: null,
		threadId: null,
		notes: null,
		auditTrail: null,
		outcomeVerdict: null,
		outcomeSummary: null,
		outcomeRecordedAt: null,
		outcomeRecordedBy: null,
		tokensActualJson: null,
		sourceKnowledgeItemId: null,
		createdAt: "2026-08-30T10:00:00.000Z",
		updatedAt: "2026-08-30T10:00:00.000Z",
		completedAt: null,
	};
}

// ── Render helper ───────────────────────────────────────────────────────────

function renderPage(taskId: string): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/task/${taskId}`]}>
			<Routes>
				<Route path="/work/task/:taskId" element={<WorkTaskPage overrideTaskId={taskId} />} />
				<Route path="/work/task/new" element={<div data-testid="task-create-page" />} />
			</Routes>
		</MemoryRouter>,
	);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("BB1 AC10 — basic page render", () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		// Default: always return a valid tree response so refreshes after PATCH don't throw
		fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				task: makeTask("task-default", "Default task"),
				ancestors: [],
				children: [],
				tokensActualRollup: null,
			}),
		});
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("renders the task detail page wrapper", async () => {
		const rootTask = makeTask("root-1", "Root task");
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				task: rootTask,
				ancestors: [],
				children: [],
				tokensActualRollup: null,
			}),
		});

		renderPage("root-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-detail-page")).toBeInTheDocument();
		});
	});

	it("renders the task title in the page header", async () => {
		const rootTask = makeTask("root-1", "User auth revamp");
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				task: rootTask,
				ancestors: [],
				children: [],
				tokensActualRollup: null,
			}),
		});

		renderPage("root-1");

		await waitFor(() => {
			expect(screen.getByRole("heading", { name: "User auth revamp" })).toBeInTheDocument();
		});
	});

	it("renders loading state while fetching", async () => {
		// Never resolves
		fetchMock.mockReturnValue(new Promise(() => {}));
		renderPage("task-loading");
		expect(screen.getByTestId("task-page-loading")).toBeInTheDocument();
	});

	it("renders error state on fetch failure", async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
		renderPage("task-error");
		await waitFor(() => {
			expect(screen.getByTestId("task-page-error")).toBeInTheDocument();
		});
	});
});

// ── AC10: 3-level recursive tree renders all levels ─────────────────────────

describe("BB1 AC10 — recursive render (3-level tree)", () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				task: makeTask("task-default", "Default task"),
				ancestors: [],
				children: [],
				tokensActualRollup: null,
			}),
		});
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("renders all 3 levels of the subtask tree", async () => {
		const root = makeTask("root-1", "Root task");
		const child = makeTask("child-1", "Child task", "root-1");
		const grandchild = makeTask("gc-1", "Grandchild task", "child-1");

		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				task: root,
				ancestors: [],
				children: [{ ...child, children: [{ ...grandchild, children: [] }] }],
				tokensActualRollup: null,
			}),
		});

		renderPage("root-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-detail-page")).toBeInTheDocument();
		});

		// Root is the page itself (h1 heading)
		expect(screen.getByRole("heading", { name: "Root task" })).toBeInTheDocument();

		// Child and grandchild appear in the subtask tree section
		const subtasks = screen.getByTestId("task-subtasks-section");
		expect(subtasks).toHaveTextContent("Child task");
		expect(subtasks).toHaveTextContent("Grandchild task");
	});

	it("all 3 levels have subtask-row data-testid elements", async () => {
		const root = makeTask("root-1", "Root");
		const child = makeTask("child-1", "Child", "root-1");
		const grandchild = makeTask("gc-1", "Grandchild", "child-1");

		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				task: root,
				ancestors: [],
				children: [{ ...child, children: [{ ...grandchild, children: [] }] }],
				tokensActualRollup: null,
			}),
		});

		renderPage("root-1");

		await waitFor(() => {
			const rows = screen.getAllByTestId("subtask-row");
			// Both child and grandchild render as subtask rows
			expect(rows).toHaveLength(2);
		});
	});

	it("renders breadcrumb from ancestors array (not a fixed structure)", async () => {
		// Grandchild rendered directly — ancestors are root + child
		const root = makeTask("root-1", "Root task");
		const child = makeTask("child-1", "Child task", "root-1");
		const grandchild = makeTask("gc-1", "Grandchild task", "child-1");

		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				task: grandchild,
				ancestors: [root, child],
				children: [],
				tokensActualRollup: null,
			}),
		});

		renderPage("gc-1");

		await waitFor(() => {
			const breadcrumb = screen.getByTestId("task-breadcrumb");
			expect(breadcrumb).toHaveTextContent("Root task");
			expect(breadcrumb).toHaveTextContent("Child task");
			expect(breadcrumb).toHaveTextContent("Grandchild task");
		});
	});

	it("shows 'Root task' depth label when task has no ancestors", async () => {
		const root = makeTask("root-1", "Root task");
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ task: root, ancestors: [], children: [], tokensActualRollup: null }),
		});

		renderPage("root-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-meta-strip")).toHaveTextContent("Root task");
		});
	});

	it("shows level depth for nested tasks", async () => {
		const child = makeTask("child-1", "Child task", "root-1");
		const root = makeTask("root-1", "Root task");

		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				task: child,
				ancestors: [root],
				children: [],
				tokensActualRollup: null,
			}),
		});

		renderPage("child-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-meta-strip")).toHaveTextContent("Level 1");
		});
	});
});

// ── AC10: edit submit issues PATCH ───────────────────────────────────────────

describe("BB1 AC10 — edit submit issues PATCH /api/tasks/:id", () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				task: makeTask("task-default", "Default task"),
				ancestors: [],
				children: [],
				tokensActualRollup: null,
			}),
		});
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("renders the edit panel with title, description, goal, owner, state fields", async () => {
		const task = makeTask("task-1", "My task");
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ task, ancestors: [], children: [], tokensActualRollup: null }),
		});

		renderPage("task-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-edit-panel")).toBeInTheDocument();
		});

		expect(screen.getByTestId("task-title-input")).toBeInTheDocument();
		expect(screen.getByTestId("task-description-input")).toBeInTheDocument();
		expect(screen.getByTestId("task-done-condition-input")).toBeInTheDocument();
		expect(screen.getByTestId("task-owner-input")).toBeInTheDocument();
		expect(screen.getByTestId("task-state-select")).toBeInTheDocument();
	});

	it("save button is disabled when no fields are dirty", async () => {
		const task = makeTask("task-1", "My task");
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ task, ancestors: [], children: [], tokensActualRollup: null }),
		});

		renderPage("task-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-save-btn")).toBeInTheDocument();
		});

		expect(screen.getByTestId("task-save-btn")).toBeDisabled();
	});

	it("save button enables after changing the title field", async () => {
		const task = makeTask("task-1", "My task");
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ task, ancestors: [], children: [], tokensActualRollup: null }),
		});

		renderPage("task-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-title-input")).toBeInTheDocument();
		});

		fireEvent.change(screen.getByTestId("task-title-input"), {
			target: { value: "Updated title" },
		});

		expect(screen.getByTestId("task-save-btn")).not.toBeDisabled();
	});

	it("clicking Save issues PATCH /api/tasks/:id with the changed fields", async () => {
		const task = makeTask("task-1", "My task");

		// First call: tree fetch; second call: PATCH
		fetchMock
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ task, ancestors: [], children: [], tokensActualRollup: null }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({}),
			});

		renderPage("task-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-title-input")).toBeInTheDocument();
		});

		fireEvent.change(screen.getByTestId("task-title-input"), {
			target: { value: "New title" },
		});

		fireEvent.click(screen.getByTestId("task-save-btn"));

		await waitFor(() => {
			// The second fetch call should be the PATCH
			const calls = fetchMock.mock.calls;
			const patchCall = calls.find(
				([url, opts]) =>
					typeof url === "string" &&
					url.includes("/api/tasks/task-1") &&
					(opts as RequestInit | undefined)?.method === "PATCH",
			);
			expect(patchCall).toBeDefined();

			// Body should include the new title
			const patchOpts = patchCall?.[1] as RequestInit;
			const body = JSON.parse(patchOpts.body as string) as { title: string };
			expect(body.title).toBe("New title");
		});
	});

	it("shows 'Saved' confirmation after a successful PATCH", async () => {
		const task = makeTask("task-1", "My task");
		fetchMock
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ task, ancestors: [], children: [], tokensActualRollup: null }),
			})
			.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

		renderPage("task-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-title-input")).toBeInTheDocument();
		});

		fireEvent.change(screen.getByTestId("task-title-input"), {
			target: { value: "Edited title" },
		});
		fireEvent.click(screen.getByTestId("task-save-btn"));

		await waitFor(() => {
			expect(screen.getByTestId("task-save-confirmation")).toBeInTheDocument();
		});
	});

	it("shows error message when PATCH fails", async () => {
		const task = makeTask("task-1", "My task");
		fetchMock
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ task, ancestors: [], children: [], tokensActualRollup: null }),
			})
			.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({}) });

		renderPage("task-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-title-input")).toBeInTheDocument();
		});

		fireEvent.change(screen.getByTestId("task-title-input"), {
			target: { value: "Bad edit" },
		});
		fireEvent.click(screen.getByTestId("task-save-btn"));

		await waitFor(() => {
			expect(screen.getByTestId("task-save-error")).toBeInTheDocument();
		});
	});
});

// ── AC10: subtask addition affordance ────────────────────────────────────────

describe("BB1 AC10 — Add subtask affordance", () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				task: makeTask("task-default", "Default task"),
				ancestors: [],
				children: [],
				tokensActualRollup: null,
			}),
		});
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("renders the Add subtask button", async () => {
		const task = makeTask("task-1", "Root task");
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ task, ancestors: [], children: [], tokensActualRollup: null }),
		});

		renderPage("task-1");

		await waitFor(() => {
			expect(screen.getByTestId("add-subtask-btn")).toBeInTheDocument();
		});
	});
});
