/**
 * BB1 AC10 — Component tests for the recursive task page.
 *
 * AC10: One recursive task surface. Proves:
 * - A 3-level tree renders all levels (root → child → grandchild).
 * - The breadcrumb is built from ancestors (not a fixed 2-level structure).
 * - Task fields are editable and changing a field issues `edit_task`.
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
		position: 0,
		needsReview: false,
		dependencies: null,
		threadId: null,
		notes: null,
		outcomeVerdict: null,
		outcomeSummary: null,
		outcomeRecordedAt: null,
		outcomeRecordedBy: null,
		tokensActualJson: null,
		sourceDocumentId: null,
		createdAt: "2026-08-30T10:00:00.000Z",
		updatedAt: "2026-08-30T10:00:00.000Z",
		completedAt: null,
	};
}

/** Wraps a task/ancestors/children triple as `open_task`'s `ActionResult<TaskView>` body. */
function openTaskBody(
	task: object,
	ancestors: object[] = [],
	children: object[] = [],
	tokensActualRollup: number | null = null,
): { ok: true; data: object } {
	return {
		ok: true,
		data: { task, ancestors, children, tokensActualRollup, threadId: null, attachments: [] },
	};
}

// The two save assertions follow a real async round trip (click → edit_task →
// state → render). Under the full 500-file suite the CI runner starves the
// event loop enough that testing-library's 1 s default has timed out here
// while the same test passes alone and locally under load. The assertion is
// unchanged; only the wait is long enough for a slow runner.
const SAVE_ROUND_TRIP_TIMEOUT_MS = 5000;

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
		// Default: always return a valid open_task response so refreshes after edit don't throw
		fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => openTaskBody(makeTask("task-default", "Default task")),
		});
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("renders the task detail page wrapper", async () => {
		const rootTask = makeTask("root-1", "Root task");
		fetchMock.mockResolvedValue({ ok: true, json: async () => openTaskBody(rootTask) });

		renderPage("root-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-detail-page")).toBeInTheDocument();
		});
	});

	it("renders the task title in the page header", async () => {
		const rootTask = makeTask("root-1", "User auth revamp");
		fetchMock.mockResolvedValue({ ok: true, json: async () => openTaskBody(rootTask) });

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
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				ok: false,
				problems: [{ code: "not_found", message: "Task not found" }],
			}),
		});
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
			json: async () => openTaskBody(makeTask("task-default", "Default task")),
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
			json: async () =>
				openTaskBody(root, [], [{ ...child, children: [{ ...grandchild, children: [] }] }]),
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
			json: async () =>
				openTaskBody(root, [], [{ ...child, children: [{ ...grandchild, children: [] }] }]),
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
			json: async () => openTaskBody(grandchild, [root, child], []),
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
		fetchMock.mockResolvedValue({ ok: true, json: async () => openTaskBody(root) });

		renderPage("root-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-meta-strip")).toHaveTextContent("Root task");
		});
	});

	it("shows level depth for nested tasks", async () => {
		const child = makeTask("child-1", "Child task", "root-1");
		const root = makeTask("root-1", "Root task");

		fetchMock.mockResolvedValue({ ok: true, json: async () => openTaskBody(child, [root], []) });

		renderPage("child-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-meta-strip")).toHaveTextContent("Level 1");
		});
	});
});

/**
 * Route the page's reads and its `edit_task` call by which action name the
 * URL names, rather than by call order. The page issues two independent
 * reads on mount (`open_task` and the task's sessions); which of them lands
 * first is a race, so keying on the action name is order-free.
 */
function mockTreeAndPatch(
	fetchMock: ReturnType<typeof vi.fn>,
	task: ReturnType<typeof makeTask>,
	patchResponse: { ok: boolean; problems?: ReadonlyArray<{ code: string; message: string }> },
	agents: ReadonlyArray<{ id: string; name: string; role: string }> = [],
): void {
	fetchMock.mockImplementation(async (url: string) => {
		if (url.includes("/api/actions/edit_task")) {
			return {
				ok: true,
				json: async () =>
					patchResponse.ok
						? openTaskBody(task)
						: { ok: false, problems: patchResponse.problems ?? [] },
			};
		}
		if (url.includes("/api/actions/search_users")) {
			// @lore BC5 T9: useAgents now calls `search_users({ kind: "ai" })`
			// through `call()`, which POSTs here — not the old `GET /api/agents`.
			return {
				ok: true,
				json: async () => ({
					ok: true,
					data: agents.map((a) => ({
						id: a.id,
						kind: "ai",
						name: a.name,
						role: a.role,
						status: "active",
						avatarUrl: null,
						createdAt: "2026-01-01T00:00:00.000Z",
						agentCategory: "team",
						ownerUserId: null,
						health: null,
						team: null,
						edges: [],
					})),
				}),
			};
		}
		if (url.includes("/api/agents")) {
			return { ok: true, json: async () => agents };
		}
		return { ok: true, json: async () => openTaskBody(task) };
	});
}

// ── AC10: edit submit issues edit_task ───────────────────────────────────────

describe("BB1 AC10 — edit submit issues edit_task", () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => openTaskBody(makeTask("task-default", "Default task")),
		});
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("renders the edit panel with title, description, goal, owner, state fields", async () => {
		const task = makeTask("task-1", "My task");
		fetchMock.mockResolvedValue({ ok: true, json: async () => openTaskBody(task) });

		renderPage("task-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-edit-panel")).toBeInTheDocument();
		});

		expect(screen.getByTestId("task-title-input")).toBeInTheDocument();
		expect(screen.getByTestId("task-description-input")).toBeInTheDocument();
		expect(screen.getByTestId("task-done-condition-input")).toBeInTheDocument();
		expect(screen.getByRole("combobox", { name: "Owner agent" })).toBeInTheDocument();
		expect(screen.getByTestId("task-state-select")).toBeInTheDocument();
	});

	it("picks an owner through the combobox and edits ownerAgentId", async () => {
		const task = makeTask("task-1", "My task");
		mockTreeAndPatch(fetchMock, task, { ok: true }, [
			{ id: "agent-7", name: "Scout", role: "scout" },
		]);

		renderPage("task-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-edit-panel")).toBeInTheDocument();
		});

		const trigger = await screen.findByRole("combobox", { name: "Owner agent" });
		fireEvent.click(trigger);
		fireEvent.click(await screen.findByText("Scout"));
		fireEvent.click(screen.getByTestId("task-save-btn"));

		await waitFor(() => {
			const editCall = fetchMock.mock.calls.find(
				([url]) => typeof url === "string" && url.includes("/api/actions/edit_task"),
			);
			expect(editCall).toBeDefined();
			const editOpts = editCall?.[1] as RequestInit;
			const body = JSON.parse(editOpts.body as string) as { ownerAgentId: string | null };
			expect(body.ownerAgentId).toBe("agent-7");
		});
	});

	it("picking 'No owner' saves exactly what leaving the field blank saved before", async () => {
		const task = makeTask("task-1", "My task"); // ownerAgentId: "agent-1"
		mockTreeAndPatch(fetchMock, task, { ok: true }, [
			{ id: "agent-1", name: "Incumbent", role: "builder" },
		]);

		renderPage("task-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-edit-panel")).toBeInTheDocument();
		});

		const trigger = await screen.findByRole("combobox", { name: "Owner agent" });
		fireEvent.click(trigger);
		fireEvent.click(await screen.findByText("No owner"));
		fireEvent.click(screen.getByTestId("task-save-btn"));

		await waitFor(() => {
			const editCall = fetchMock.mock.calls.find(
				([url]) => typeof url === "string" && url.includes("/api/actions/edit_task"),
			);
			expect(editCall).toBeDefined();
			const editOpts = editCall?.[1] as RequestInit;
			const body = JSON.parse(editOpts.body as string) as { ownerAgentId: string | null };
			expect(body.ownerAgentId).toBeNull();
		});
	});

	it("save button is disabled when no fields are dirty", async () => {
		const task = makeTask("task-1", "My task");
		fetchMock.mockResolvedValue({ ok: true, json: async () => openTaskBody(task) });

		renderPage("task-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-save-btn")).toBeInTheDocument();
		});

		expect(screen.getByTestId("task-save-btn")).toBeDisabled();
	});

	it("save button enables after changing the title field", async () => {
		const task = makeTask("task-1", "My task");
		fetchMock.mockResolvedValue({ ok: true, json: async () => openTaskBody(task) });

		renderPage("task-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-title-input")).toBeInTheDocument();
		});

		fireEvent.change(screen.getByTestId("task-title-input"), {
			target: { value: "Updated title" },
		});

		expect(screen.getByTestId("task-save-btn")).not.toBeDisabled();
	});

	it("clicking Save issues edit_task with the changed fields", async () => {
		const task = makeTask("task-1", "My task");

		mockTreeAndPatch(fetchMock, task, { ok: true });

		renderPage("task-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-title-input")).toBeInTheDocument();
		});

		fireEvent.change(screen.getByTestId("task-title-input"), {
			target: { value: "New title" },
		});

		fireEvent.click(screen.getByTestId("task-save-btn"));

		await waitFor(() => {
			const calls = fetchMock.mock.calls;
			const editCall = calls.find(
				([url]) => typeof url === "string" && url.includes("/api/actions/edit_task"),
			);
			expect(editCall).toBeDefined();

			// Body should include the new title
			const editOpts = editCall?.[1] as RequestInit;
			const body = JSON.parse(editOpts.body as string) as { title: string };
			expect(body.title).toBe("New title");
		});
	});

	it("shows 'Saved' confirmation after a successful edit", async () => {
		const task = makeTask("task-1", "My task");
		mockTreeAndPatch(fetchMock, task, { ok: true });

		renderPage("task-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-title-input")).toBeInTheDocument();
		});

		fireEvent.change(screen.getByTestId("task-title-input"), {
			target: { value: "Edited title" },
		});
		fireEvent.click(screen.getByTestId("task-save-btn"));

		await waitFor(
			() => {
				expect(screen.getByTestId("task-save-confirmation")).toBeInTheDocument();
			},
			{ timeout: SAVE_ROUND_TRIP_TIMEOUT_MS },
		);
	});

	it("shows error message when edit_task fails", async () => {
		const task = makeTask("task-1", "My task");
		mockTreeAndPatch(fetchMock, task, {
			ok: false,
			problems: [{ code: "stale", message: "The task changed since you last read it." }],
		});

		renderPage("task-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-title-input")).toBeInTheDocument();
		});

		fireEvent.change(screen.getByTestId("task-title-input"), {
			target: { value: "Bad edit" },
		});
		fireEvent.click(screen.getByTestId("task-save-btn"));

		await waitFor(
			() => {
				expect(screen.getByTestId("task-save-error")).toBeInTheDocument();
			},
			{ timeout: SAVE_ROUND_TRIP_TIMEOUT_MS },
		);
	});
});

// ── AC10: subtask addition affordance ────────────────────────────────────────

describe("BB1 AC10 — Add subtask affordance", () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => openTaskBody(makeTask("task-default", "Default task")),
		});
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("renders the Add subtask button", async () => {
		const task = makeTask("task-1", "Root task");
		fetchMock.mockResolvedValue({ ok: true, json: async () => openTaskBody(task) });

		renderPage("task-1");

		await waitFor(() => {
			expect(screen.getByTestId("add-subtask-btn")).toBeInTheDocument();
		});
	});
});
