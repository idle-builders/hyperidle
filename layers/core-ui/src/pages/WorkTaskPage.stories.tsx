/**
 * WorkTaskPage stories — the recursive task detail page (BB1).
 *
 * Mocks window.fetch to provide GET /api/tasks/:id/tree responses
 * without a live server.
 *
 * Per visual-regression.md: stories render POPULATED real state only.
 * No skeleton or error states in an initial design.
 */

import { MemoryRouter, Route, Routes } from "react-router-dom";
import { WorkTaskPage } from "./WorkTaskPage";

export default { title: "Page: Work/Task" };

const ROOT_TASK_ID = "story-root-1";
const CHILD_TASK_ID = "story-child-1";
const GRANDCHILD_TASK_ID = "story-grandchild-1";

/** Minimal Task row shape matching the wire type */
function makeTask(
	overrides: Partial<{
		id: string;
		parentTaskId: string | null;
		title: string;
		description: string;
		doneCondition: string;
		state: string;
		ownerAgentId: string;
		teamId: string;
		position: number;
	}> = {},
): object {
	return {
		id: overrides.id ?? "task-1",
		parentTaskId: overrides.parentTaskId ?? null,
		teamId: overrides.teamId ?? "team-1",
		ownerAgentId: overrides.ownerAgentId ?? "agent-1",
		title: overrides.title ?? "Untitled task",
		description: overrides.description ?? null,
		doneCondition: overrides.doneCondition ?? null,
		state: overrides.state ?? "proposed",
		position: overrides.position ?? 0,
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

function setupFetchMock(
	treePayload: object,
	sessions: object[] = [],
): void {
	if (typeof window === "undefined") return;

	window.fetch = async (url: RequestInfo | URL): Promise<Response> => {
		const urlStr = typeof url === "string" ? url : url.toString();

		if (urlStr.includes("/tree")) {
			return {
				ok: true,
				json: async () => treePayload,
			} as Response;
		}

		if (urlStr.includes("/sessions")) {
			return {
				ok: true,
				json: async () => ({ sessions }),
			} as Response;
		}

		if (urlStr.includes("/api/artifacts")) {
			return {
				ok: true,
				json: async () => ({ items: [], nextCursor: null }),
			} as Response;
		}

		if (urlStr.includes("/api/threads")) {
			return {
				ok: true,
				json: async () => ({
					thread: { id: "th-1", hostKind: "task", hostId: ROOT_TASK_ID, resolvedAt: null },
					messages: [],
					identities: {},
				}),
			} as Response;
		}

		// PATCH /api/tasks/:id — return 200
		if (urlStr.includes("/api/tasks/") && !urlStr.includes("/tree") && !urlStr.includes("/sessions")) {
			return {
				ok: true,
				json: async () => ({}),
			} as Response;
		}

		return { ok: true, json: async () => ({}) } as Response;
	};
}

function PageWrapper({ taskId }: { taskId: string }): React.JSX.Element {
	return (
		<MemoryRouter initialEntries={[`/work/task/${taskId}`]}>
			<Routes>
				<Route
					path="/work/task/:taskId"
					element={<WorkTaskPage overrideTaskId={taskId} />}
				/>
			</Routes>
		</MemoryRouter>
	);
}

/** Root task with two subtasks, one of which has a grandchild. */
export const RootTaskWithSubtasks = (): React.JSX.Element => {
	const rootTask = makeTask({
		id: ROOT_TASK_ID,
		title: "User authentication revamp",
		description: "Migrate auth to JWT with refresh rotation.",
		doneCondition: "All endpoints secured, existing sessions migrated.",
		state: "in_progress",
		ownerAgentId: "auth-agent",
	});

	const childTask1 = makeTask({
		id: CHILD_TASK_ID,
		parentTaskId: ROOT_TASK_ID,
		title: "Implement login endpoint",
		state: "done",
		ownerAgentId: "auth-agent",
	});

	const grandchildTask = makeTask({
		id: GRANDCHILD_TASK_ID,
		parentTaskId: CHILD_TASK_ID,
		title: "Write login endpoint tests",
		state: "review",
		ownerAgentId: "auth-agent",
	});

	const childTask2 = makeTask({
		id: "story-child-2",
		parentTaskId: ROOT_TASK_ID,
		title: "JWT refresh rotation",
		state: "in_progress",
		ownerAgentId: "auth-agent",
	});

	setupFetchMock({
		task: rootTask,
		ancestors: [],
		children: [
			{
				task: childTask1,
				children: [{ task: grandchildTask, children: [] }],
			},
			{ task: childTask2, children: [] },
		],
		tokensActualRollup: 42000,
	});

	return <PageWrapper taskId={ROOT_TASK_ID} />;
};

/** A nested subtask — ancestors array gives the breadcrumb its full depth. */
export const NestedSubtask = (): React.JSX.Element => {
	const grandchild = makeTask({
		id: GRANDCHILD_TASK_ID,
		parentTaskId: CHILD_TASK_ID,
		title: "Write login endpoint tests",
		description: "Unit + integration tests for the /auth/login route.",
		state: "review",
		ownerAgentId: "test-agent",
	});

	const root = makeTask({
		id: ROOT_TASK_ID,
		title: "User authentication revamp",
		state: "in_progress",
	});

	const child = makeTask({
		id: CHILD_TASK_ID,
		parentTaskId: ROOT_TASK_ID,
		title: "Implement login endpoint",
		state: "done",
	});

	setupFetchMock({
		task: grandchild,
		ancestors: [root, child],
		children: [],
		tokensActualRollup: 5000,
	});

	return <PageWrapper taskId={GRANDCHILD_TASK_ID} />;
};

/** Root task with active sessions. */
export const WithSessions = (): React.JSX.Element => {
	const rootTask = makeTask({
		id: ROOT_TASK_ID,
		title: "Dashboard performance audit",
		state: "in_progress",
		ownerAgentId: "perf-agent",
	});

	setupFetchMock(
		{
			task: rootTask,
			ancestors: [],
			children: [],
			tokensActualRollup: 18000,
		},
		[
			{
				id: "sess-1",
				title: "Initial performance profiling",
				agent: "perf-agent",
				status: "active",
				harnessUrl: null,
				effectivenessScore: null,
			},
			{
				id: "sess-2",
				title: "Baseline measurement",
				agent: "perf-agent",
				status: "done",
				harnessUrl: null,
				effectivenessScore: 0.82,
			},
		],
	);

	return <PageWrapper taskId={ROOT_TASK_ID} />;
};
