/**
 * WorkTaskPage — the recursive task page: render states, the 3-level
 * subtask tree with breadcrumb/depth, edit-and-save through `edit_task`,
 * subtask reorder, the dependency picker's exclusion rule, and the
 * session-viewer split pane.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTaskPage } from "../WorkTaskPage";

const mockApiFetch = vi.fn();
vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock("../../components/ArtifactSection.js", () => ({
	ArtifactSection: () => null,
}));

vi.mock("../../shell/HostThreadSection.js", () => ({
	HostThreadSection: ({ hostKind, hostId }: { hostKind?: string; hostId?: string }) => (
		<div data-testid="host-thread-section" data-host-kind={hostKind} data-host-id={hostId} />
	),
}));

vi.mock("../../shell/NavHistoryCluster.js", () => ({
	NavHistoryCluster: () => null,
}));

vi.mock("../../hooks/useViewportBreakpoint.js", () => ({
	useViewportBreakpoint: () => ({ sidebarMobile: false }),
}));

// The two save assertions follow a real async round trip (click → edit_task →
// state → render). Under the full suite a slow runner can starve the event
// loop past testing-library's 1s default; the assertion is unchanged, only
// the wait is long enough for a slow runner.
const SAVE_ROUND_TRIP_TIMEOUT_MS = 5000;

function makeTask(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
	return {
		id: "task-default",
		parentTaskId: null,
		teamId: "team-1",
		ownerAgentId: "agent-1",
		title: "Default task",
		description: "Description",
		doneCondition: null,
		state: "proposed",
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
		...overrides,
	};
}

/** Wraps a task/ancestors/children triple as `open_task`'s ActionResult<TaskView> body. */
function openTaskBody(
	task: Record<string, unknown>,
	ancestors: Record<string, unknown>[] = [],
	children: Record<string, unknown>[] = [],
): { ok: true; data: Record<string, unknown> } {
	return {
		ok: true,
		data: { task, ancestors, children, tokensActualRollup: null, threadId: null, attachments: [] },
	};
}

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

/** Default apiFetch router: open_task returns `task`, search_sessions is empty, everything else is a no-op ok. */
function setupApiFetch(
	task: Record<string, unknown>,
	overrides: Record<string, (init?: RequestInit) => unknown> = {},
): void {
	mockApiFetch.mockImplementation((url: string, init?: RequestInit) => {
		for (const [action, handler] of Object.entries(overrides)) {
			if (typeof url === "string" && url.includes(`/api/actions/${action}`)) {
				return Promise.resolve({ ok: true, json: () => Promise.resolve(handler(init)) });
			}
		}
		if (typeof url === "string" && url.includes("/api/actions/open_task")) {
			return Promise.resolve({ ok: true, json: () => Promise.resolve(openTaskBody(task)) });
		}
		if (typeof url === "string" && url.includes("/api/actions/search_sessions")) {
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
		}
		return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
	});
}

beforeEach(() => {
	mockApiFetch.mockReset();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("WorkTaskPage — basic page render", () => {
	it("renders the task detail page wrapper with the title heading", async () => {
		const rootTask = makeTask({ id: "root-1", title: "User auth revamp" });
		setupApiFetch(rootTask);

		renderPage("root-1");

		await waitFor(() => {
			expect(screen.getByTestId("task-detail-page")).toBeInTheDocument();
			expect(screen.getByRole("heading", { name: "User auth revamp" })).toBeInTheDocument();
		});
	});

	it("renders loading state while fetching", () => {
		mockApiFetch.mockReturnValue(new Promise(() => {}));
		renderPage("task-loading");
		expect(screen.getByTestId("task-page-loading")).toBeInTheDocument();
	});

	it("renders error state on fetch failure", async () => {
		mockApiFetch.mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
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

describe("WorkTaskPage — recursive render (3-level tree)", () => {
	it("renders all 3 levels of the subtask tree as subtask-row elements", async () => {
		const root = makeTask({ id: "root-1", title: "Root task" });
		const child = makeTask({ id: "child-1", title: "Child task", parentTaskId: "root-1" });
		const grandchild = makeTask({ id: "gc-1", title: "Grandchild task", parentTaskId: "child-1" });
		mockApiFetch.mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve(
					openTaskBody(root, [], [{ ...child, children: [{ ...grandchild, children: [] }] }]),
				),
		});

		renderPage("root-1");

		await waitFor(() => {
			expect(screen.getByRole("heading", { name: "Root task" })).toBeInTheDocument();
		});
		const subtasks = screen.getByTestId("task-subtasks-section");
		expect(subtasks).toHaveTextContent("Child task");
		expect(subtasks).toHaveTextContent("Grandchild task");
		expect(screen.getAllByTestId("subtask-row")).toHaveLength(2);
	});

	it("builds the breadcrumb from the ancestors array, root-first", async () => {
		const root = makeTask({ id: "root-1", title: "Root task" });
		const child = makeTask({ id: "child-1", title: "Child task", parentTaskId: "root-1" });
		const grandchild = makeTask({ id: "gc-1", title: "Grandchild task", parentTaskId: "child-1" });
		mockApiFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(openTaskBody(grandchild, [root, child], [])),
		});

		renderPage("gc-1");

		await waitFor(() => {
			const breadcrumb = screen.getByTestId("task-breadcrumb");
			expect(breadcrumb).toHaveTextContent("Root task");
			expect(breadcrumb).toHaveTextContent("Child task");
			expect(breadcrumb).toHaveTextContent("Grandchild task");
		});
	});

	it("shows the depth label: 'Root task' with no ancestors, 'Level N' with some", async () => {
		const root = makeTask({ id: "root-1", title: "Root task" });
		setupApiFetch(root);
		renderPage("root-1");
		await waitFor(() => {
			expect(screen.getByTestId("task-meta-strip")).toHaveTextContent("Root task");
		});
		cleanup();

		const child = makeTask({ id: "child-1", title: "Child task", parentTaskId: "root-1" });
		mockApiFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(openTaskBody(child, [root], [])),
		});
		renderPage("child-1");
		await waitFor(() => {
			expect(screen.getByTestId("task-meta-strip")).toHaveTextContent("Level 1");
		});
	});
});

describe("WorkTaskPage — edit submit issues edit_task", () => {
	it("renders the edit panel with title, description, goal, owner, and state fields", async () => {
		setupApiFetch(makeTask({ id: "task-1", title: "My task" }));
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

	it("picking an owner through the combobox edits ownerAgentId; picking 'No owner' clears it", async () => {
		const task = makeTask({ id: "task-1", title: "My task" });
		setupApiFetch(task, {
			edit_task: () => openTaskBody(task),
			search_users: () => ({
				ok: true,
				data: [
					{
						id: "agent-7",
						kind: "ai",
						name: "Scout",
						role: "scout",
						status: "active",
						avatarUrl: null,
						createdAt: "2026-01-01T00:00:00.000Z",
						agentCategory: "team",
						ownerUserId: null,
						health: null,
						team: null,
						edges: [],
					},
				],
			}),
		});

		renderPage("task-1");
		await waitFor(() => expect(screen.getByTestId("task-edit-panel")).toBeInTheDocument());

		fireEvent.click(await screen.findByRole("combobox", { name: "Owner agent" }));
		fireEvent.click(await screen.findByText("Scout"));
		fireEvent.click(screen.getByTestId("task-save-btn"));

		await waitFor(() => {
			const editCall = mockApiFetch.mock.calls.find(
				([url]) => typeof url === "string" && url.includes("/api/actions/edit_task"),
			);
			const body = JSON.parse(String((editCall![1] as RequestInit).body)) as {
				ownerAgentId: string | null;
			};
			expect(body.ownerAgentId).toBe("agent-7");
		});

		fireEvent.click(await screen.findByRole("combobox", { name: "Owner agent" }));
		fireEvent.click(await screen.findByText("No owner"));
		fireEvent.click(screen.getByTestId("task-save-btn"));

		await waitFor(() => {
			const editCalls = mockApiFetch.mock.calls.filter(
				([url]) => typeof url === "string" && url.includes("/api/actions/edit_task"),
			);
			const body = JSON.parse(String((editCalls.at(-1)![1] as RequestInit).body)) as {
				ownerAgentId: string | null;
			};
			expect(body.ownerAgentId).toBeNull();
		});
	});

	it("Save is disabled until a field is dirty, then issues edit_task with the changed fields", async () => {
		const task = makeTask({ id: "task-1", title: "My task" });
		setupApiFetch(task, { edit_task: () => openTaskBody(task) });

		renderPage("task-1");
		await waitFor(() => expect(screen.getByTestId("task-title-input")).toBeInTheDocument());
		expect(screen.getByTestId("task-save-btn")).toBeDisabled();

		fireEvent.change(screen.getByTestId("task-title-input"), { target: { value: "New title" } });
		expect(screen.getByTestId("task-save-btn")).not.toBeDisabled();

		fireEvent.click(screen.getByTestId("task-save-btn"));

		await waitFor(() => {
			const editCall = mockApiFetch.mock.calls.find(
				([url]) => typeof url === "string" && url.includes("/api/actions/edit_task"),
			);
			const body = JSON.parse(String((editCall![1] as RequestInit).body)) as { title: string };
			expect(body.title).toBe("New title");
		});
	});

	it("shows 'Saved' confirmation after a successful edit", async () => {
		const task = makeTask({ id: "task-1", title: "My task" });
		setupApiFetch(task, { edit_task: () => openTaskBody(task) });
		renderPage("task-1");
		await waitFor(() => expect(screen.getByTestId("task-title-input")).toBeInTheDocument());
		fireEvent.change(screen.getByTestId("task-title-input"), { target: { value: "Edited title" } });
		fireEvent.click(screen.getByTestId("task-save-btn"));
		await waitFor(() => expect(screen.getByTestId("task-save-confirmation")).toBeInTheDocument(), {
			timeout: SAVE_ROUND_TRIP_TIMEOUT_MS,
		});
	});

	it("shows the named error when edit_task is refused", async () => {
		const task2 = makeTask({ id: "task-2", title: "Another task" });
		setupApiFetch(task2, {
			edit_task: () => ({
				ok: false,
				problems: [{ code: "stale", message: "The task changed since you last read it." }],
			}),
		});
		renderPage("task-2");
		await waitFor(() => expect(screen.getByTestId("task-title-input")).toBeInTheDocument());
		fireEvent.change(screen.getByTestId("task-title-input"), { target: { value: "Bad edit" } });
		fireEvent.click(screen.getByTestId("task-save-btn"));
		await waitFor(() => expect(screen.getByTestId("task-save-error")).toBeInTheDocument(), {
			timeout: SAVE_ROUND_TRIP_TIMEOUT_MS,
		});
	});
});

describe("WorkTaskPage — Add subtask affordance", () => {
	it("renders the Add subtask button", async () => {
		setupApiFetch(makeTask({ id: "task-1", title: "Root task" }));
		renderPage("task-1");
		await waitFor(() => {
			expect(screen.getByTestId("add-subtask-btn")).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// Subtask reorder controls
// ---------------------------------------------------------------------------

describe("WorkTaskPage subtask reorder controls", () => {
	const ROOT_ID = "bb1-root";
	const CHILD_A_ID = "bb1-child-a";
	const CHILD_B_ID = "bb1-child-b";
	const CHILD_C_ID = "bb1-child-c";
	const GRANDCHILD_X_ID = "bb1-grandchild-x";
	const GRANDCHILD_Y_ID = "bb1-grandchild-y";

	const rootTask = makeTask({ id: ROOT_ID, title: "Root task" });
	const childA = makeTask({ id: CHILD_A_ID, parentTaskId: ROOT_ID, title: "Child A" });
	const childB = makeTask({ id: CHILD_B_ID, parentTaskId: ROOT_ID, title: "Child B" });
	const childC = makeTask({ id: CHILD_C_ID, parentTaskId: ROOT_ID, title: "Child C" });
	const grandchildX = makeTask({
		id: GRANDCHILD_X_ID,
		parentTaskId: CHILD_A_ID,
		title: "Grandchild X",
	});
	const grandchildY = makeTask({
		id: GRANDCHILD_Y_ID,
		parentTaskId: CHILD_A_ID,
		title: "Grandchild Y",
	});

	const INITIAL_TREE = openTaskBody(
		rootTask,
		[],
		[
			{
				...childA,
				children: [
					{ ...grandchildX, children: [] },
					{ ...grandchildY, children: [] },
				],
			},
			{ ...childB, children: [] },
			{ ...childC, children: [] },
		],
	);
	const AFTER_MOVE_A_DOWN = openTaskBody(
		rootTask,
		[],
		[
			{ ...childB, children: [] },
			{
				...childA,
				children: [
					{ ...grandchildX, children: [] },
					{ ...grandchildY, children: [] },
				],
			},
			{ ...childC, children: [] },
		],
	);
	const AFTER_MOVE_X_DOWN = openTaskBody(
		rootTask,
		[],
		[
			{
				...childA,
				children: [
					{ ...grandchildY, children: [] },
					{ ...grandchildX, children: [] },
				],
			},
			{ ...childB, children: [] },
			{ ...childC, children: [] },
		],
	);

	/** open_task returns `initial` first, `after` on every re-read (following edit_task's refresh). */
	function setupReorderFetch(
		initial: unknown,
		after: unknown,
	): Array<{ id: string; body: unknown }> {
		const editCalls: Array<{ id: string; body: unknown }> = [];
		let openCallCount = 0;
		mockApiFetch.mockImplementation((url: string, init?: RequestInit) => {
			if (url.includes("/api/actions/open_task")) {
				const payload = openCallCount === 0 ? initial : after;
				openCallCount++;
				return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
			}
			if (url.includes("/api/actions/edit_task")) {
				const body = JSON.parse(String(init?.body ?? "{}")) as { id?: string };
				editCalls.push({ id: body.id ?? "", body });
				return Promise.resolve({ ok: true, json: () => Promise.resolve(after) });
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
		});
		return editCalls;
	}

	it("renders move-up/move-down per sibling, disabled at the ends", async () => {
		setupReorderFetch(INITIAL_TREE, INITIAL_TREE);
		renderPage(ROOT_ID);

		await waitFor(() => expect(screen.getByTestId(`move-up-${CHILD_A_ID}`)).toBeInTheDocument());
		for (const id of [CHILD_A_ID, CHILD_B_ID, CHILD_C_ID]) {
			expect(screen.getByTestId(`move-up-${id}`)).toBeInTheDocument();
			expect(screen.getByTestId(`move-down-${id}`)).toBeInTheDocument();
		}
		expect(screen.getByTestId(`move-up-${CHILD_A_ID}`)).toBeDisabled();
		expect(screen.getByTestId(`move-down-${CHILD_A_ID}`)).not.toBeDisabled();
		expect(screen.getByTestId(`move-up-${CHILD_B_ID}`)).not.toBeDisabled();
		expect(screen.getByTestId(`move-down-${CHILD_B_ID}`)).not.toBeDisabled();
		expect(screen.getByTestId(`move-down-${CHILD_C_ID}`)).toBeDisabled();
	});

	it("clicking Move down issues edit_task with the target position, then re-reads the server's order", async () => {
		const editCalls = setupReorderFetch(INITIAL_TREE, AFTER_MOVE_A_DOWN);
		renderPage(ROOT_ID);

		await waitFor(() => expect(screen.getByTestId(`move-down-${CHILD_A_ID}`)).toBeInTheDocument());
		const user = userEvent.setup();
		await user.click(screen.getByTestId(`move-down-${CHILD_A_ID}`));

		await waitFor(() => expect(editCalls).toHaveLength(1));
		expect(editCalls[0]!.id).toBe(CHILD_A_ID);
		expect(editCalls[0]!.body).toMatchObject({ position: 1 });

		await waitFor(() => {
			expect(screen.getAllByTestId("subtask-row")[0]).toHaveTextContent("Child B");
		});
	});

	it("reorder controls work at grandchild depth", async () => {
		const editCalls = setupReorderFetch(INITIAL_TREE, AFTER_MOVE_X_DOWN);
		renderPage(ROOT_ID);

		await waitFor(() =>
			expect(screen.getByTestId(`move-down-${GRANDCHILD_X_ID}`)).toBeInTheDocument(),
		);
		expect(screen.getByTestId(`move-up-${GRANDCHILD_X_ID}`)).toBeDisabled();

		const user = userEvent.setup();
		await user.click(screen.getByTestId(`move-down-${GRANDCHILD_X_ID}`));

		await waitFor(() => expect(editCalls).toHaveLength(1));
		expect(editCalls[0]!.id).toBe(GRANDCHILD_X_ID);
		expect(editCalls[0]!.body).toMatchObject({ position: 1 });
	});
});

// ---------------------------------------------------------------------------
// Dependency picker exclusion
// ---------------------------------------------------------------------------

describe("WorkTaskPage — dependency picker exclusion", () => {
	it("does not offer the task being edited or an already-picked task in search results", async () => {
		const rootId = "dep-excl-root";
		const pickedId = "dep-excl-picked";
		const rootTask = makeTask({
			id: rootId,
			title: "Root task",
			dependencies: JSON.stringify([pickedId]),
		});

		mockApiFetch.mockImplementation((url: string, init?: RequestInit) => {
			if (url.includes("/api/actions/open_task")) {
				return Promise.resolve({ ok: true, json: () => Promise.resolve(openTaskBody(rootTask)) });
			}
			if (url.includes("/api/actions/search_tasks")) {
				const body = init?.body ? (JSON.parse(String(init.body)) as { ids?: string[] }) : {};
				if (body.ids) {
					return Promise.resolve({
						ok: true,
						json: () =>
							Promise.resolve({ ok: true, data: [{ id: pickedId, title: "Already picked" }] }),
					});
				}
				return Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve({
							ok: true,
							data: [{ id: "dep-excl-fresh", title: "A fresh candidate" }],
						}),
				});
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
		});

		renderPage(rootId);
		await waitFor(() => {
			expect(screen.getByRole("combobox", { name: /depends on/i })).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole("combobox", { name: /depends on/i }));
		const input = await screen.findByRole("textbox", { name: /search tasks by title/i });
		fireEvent.change(input, { target: { value: "task" } });

		await screen.findByRole("option", { name: "A fresh candidate" });
		expect(screen.queryByRole("option", { name: "Root task" })).toBeNull();
		expect(screen.queryByRole("option", { name: "Already picked" })).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Session viewer door
// ---------------------------------------------------------------------------

describe("WorkTaskPage session viewer door", () => {
	it("clicking a session row opens the session view in the split pane; closing it returns to the task pane", async () => {
		const taskId = "task-with-session";
		const sessionRow = {
			id: "sess-open-me",
			agentId: "agent-1",
			taskId,
			startedAt: "2026-09-01T00:01:00.000Z",
			endedAt: null,
			state: "active",
			outcome: null,
			effectivenessScore: null,
			routineId: null,
			notes: null,
			modelTier: "workhorse",
			sourceKind: null,
		};
		setupApiFetch(makeTask({ id: taskId, title: "A task with a session", state: "in_progress" }), {
			search_sessions: () => ({ ok: true, data: [sessionRow] }),
			watch_session: () => ({ ok: true, data: { session: sessionRow, activity: [] } }),
		});

		renderPage(taskId);

		const row = await screen.findByTestId("session-row");
		expect(screen.queryByTestId("close-session-view")).not.toBeInTheDocument();

		const user = userEvent.setup();
		await user.click(row);

		await waitFor(() => expect(screen.getByTestId("close-session-view")).toBeInTheDocument());
		expect(mockApiFetch).toHaveBeenCalledWith(
			expect.stringContaining("/api/actions/watch_session"),
			expect.anything(),
		);

		await user.click(screen.getByTestId("close-session-view"));
		await waitFor(() => expect(screen.queryByTestId("close-session-view")).not.toBeInTheDocument());
	});
});
