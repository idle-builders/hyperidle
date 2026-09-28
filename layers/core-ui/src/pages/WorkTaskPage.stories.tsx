/**
 * WorkTaskPage stories — the recursive task detail page (BB1).
 *
 * Mocks window.fetch to provide `open_task`'s `ActionResult<TaskView>`
 * responses without a live server.
 *
 * Per visual-regression.md: stories render POPULATED real state only.
 * No skeleton or error states in an initial design.
 *
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
		threadId: string;
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
		threadId: overrides.threadId ?? `${overrides.id ?? "task-1"}-thread`,
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
		needsReview: false,
	};
}

/** A thread member — what `open_thread`'s `members` array holds. */
function makeIdentity(id: string, name: string, role: string, isAgent: boolean): object {
	return { id, name, role, isAgent };
}

/** One message row — `MessageSchema`'s shape. `payload` defaults to an empty plain body. */
function makeMessage(
	id: string,
	threadId: string,
	overrides: Partial<{
		senderId: string;
		text: string;
		blockId: string | null;
		createdAt: string;
	}> = {},
): object {
	return {
		id,
		threadId,
		senderId: overrides.senderId ?? "auth-agent",
		type: "plain",
		payload: { text: overrides.text ?? "" },
		clientKey: `ck-${id}`,
		blockId: overrides.blockId ?? null,
		resolvedAt: null,
		deletedAt: null,
		redactedAt: null,
		createdAt: overrides.createdAt ?? "2026-08-30T10:00:00.000Z",
	};
}

/**
 * A team-hosted `ThreadView` (`open_thread`'s output) for a task's own
 * discussion. A task's thread has no `"task"` host kind — it is hosted
 * on the task's team.
 */
function makeThreadView(
	threadId: string,
	teamId: string,
	members: object[],
	messages: object[],
): object {
	return {
		thread: {
			id: threadId,
			hostKind: "team",
			hostId: teamId,
			initiatorId: (members[0] as { id: string } | undefined)?.id ?? "agent-1",
			members: members.map((m) => (m as { id: string }).id),
			title: null,
			computedTitle: "Discussion",
			pinned: false,
			resolvedAt: null,
			deletedAt: null,
			lastActiveAt: "2026-08-30T10:00:00.000Z",
			createdAt: "2026-08-30T10:00:00.000Z",
		},
		members,
		messages,
		headMessageId: null,
		hostTitle: null,
	};
}

function setupFetchMock(
	taskView: object,
	sessions: object[] = [],
	threadView: object | null = null,
): void {
	if (typeof window === "undefined") return;

	window.fetch = async (url: RequestInfo | URL): Promise<Response> => {
		const urlStr = typeof url === "string" ? url : url.toString();

		if (urlStr.includes("/api/actions/open_task")) {
			return {
				ok: true,
				json: async () => ({ ok: true, data: taskView }),
			} as Response;
		}

		// `edit_task` (position reorder, save) — no interaction in a story, but
		// answered as a no-op success so nothing throws if one fires.
		if (urlStr.includes("/api/actions/edit_task")) {
			return {
				ok: true,
				json: async () => ({ ok: true, data: taskView }),
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

		if (urlStr.includes("/api/actions/open_thread")) {
			if (threadView === null) {
				return {
					ok: true,
					json: async () => ({
						ok: false,
						problems: [{ code: "not_found", message: "Thread not found" }],
					}),
				} as Response;
			}
			return {
				ok: true,
				json: async () => ({ ok: true, data: threadView }),
			} as Response;
		}

		return { ok: true, json: async () => ({}) } as Response;
	};
}

function PageWrapper({ taskId }: { taskId: string }): React.JSX.Element {
	return (
		<MemoryRouter initialEntries={[`/work/task/${taskId}`]}>
			<Routes>
				<Route path="/work/task/:taskId" element={<WorkTaskPage overrideTaskId={taskId} />} />
			</Routes>
		</MemoryRouter>
	);
}

const ROOT_TASK_THREAD_ID = "th-story-root-1";

/** Root task with two subtasks, one of which has a grandchild. */
export const RootTaskWithSubtasks = (): React.JSX.Element => {
	const rootTask = makeTask({
		id: ROOT_TASK_ID,
		title: "User authentication revamp",
		description: "Migrate auth to JWT with refresh rotation.",
		doneCondition: "All endpoints secured, existing sessions migrated.",
		state: "in_progress",
		ownerAgentId: "auth-agent",
		threadId: ROOT_TASK_THREAD_ID,
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

	const founder = makeIdentity("user-founder", "Founder", "founder", false);
	const authAgent = makeIdentity("auth-agent", "auth-agent", "builder", true);
	const threadView = makeThreadView(
		ROOT_TASK_THREAD_ID,
		"team-1",
		[founder, authAgent],
		[
			makeMessage("msg-2", ROOT_TASK_THREAD_ID, {
				senderId: "auth-agent",
				text: "Login endpoint is done, refresh rotation is next.",
				createdAt: "2026-08-30T11:05:00.000Z",
			}),
			makeMessage("msg-1", ROOT_TASK_THREAD_ID, {
				senderId: "user-founder",
				text: "How's the JWT migration going?",
				createdAt: "2026-08-30T11:00:00.000Z",
			}),
		],
	);

	setupFetchMock(
		{
			task: rootTask,
			ancestors: [],
			children: [
				{ ...childTask1, children: [{ ...grandchildTask, children: [] }] },
				{ ...childTask2, children: [] },
			],
			tokensActualRollup: 42000,
			threadId: ROOT_TASK_THREAD_ID,
			attachments: [],
		},
		[],
		threadView,
	);

	return <PageWrapper taskId={ROOT_TASK_ID} />;
};

const GRANDCHILD_TASK_THREAD_ID = "th-story-grandchild-1";

/** A nested subtask — ancestors array gives the breadcrumb its full depth. */
export const NestedSubtask = (): React.JSX.Element => {
	const grandchild = makeTask({
		id: GRANDCHILD_TASK_ID,
		parentTaskId: CHILD_TASK_ID,
		title: "Write login endpoint tests",
		description: "Unit + integration tests for the /auth/login route.",
		state: "review",
		ownerAgentId: "test-agent",
		threadId: GRANDCHILD_TASK_THREAD_ID,
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

	const testAgent = makeIdentity("test-agent", "test-agent", "builder", true);
	const threadView = makeThreadView(
		GRANDCHILD_TASK_THREAD_ID,
		"team-1",
		[testAgent],
		[
			makeMessage("msg-1", GRANDCHILD_TASK_THREAD_ID, {
				senderId: "test-agent",
				text: "Covering the happy path and the expired-token case.",
				createdAt: "2026-08-30T12:00:00.000Z",
			}),
		],
	);

	setupFetchMock(
		{
			task: grandchild,
			ancestors: [root, child],
			children: [],
			tokensActualRollup: 5000,
			threadId: GRANDCHILD_TASK_THREAD_ID,
			attachments: [],
		},
		[],
		threadView,
	);

	return <PageWrapper taskId={GRANDCHILD_TASK_ID} />;
};

const WITH_SESSIONS_THREAD_ID = "th-story-dashboard-1";

/** Root task with active sessions. */
export const WithSessions = (): React.JSX.Element => {
	const rootTask = makeTask({
		id: ROOT_TASK_ID,
		title: "Dashboard performance audit",
		state: "in_progress",
		ownerAgentId: "perf-agent",
		threadId: WITH_SESSIONS_THREAD_ID,
	});

	const perfAgent = makeIdentity("perf-agent", "perf-agent", "builder", true);
	const threadView = makeThreadView(
		WITH_SESSIONS_THREAD_ID,
		"team-1",
		[perfAgent],
		[
			makeMessage("msg-1", WITH_SESSIONS_THREAD_ID, {
				senderId: "perf-agent",
				text: "Baseline captured, profiling the dashboard queries now.",
				createdAt: "2026-08-30T13:00:00.000Z",
			}),
		],
	);

	setupFetchMock(
		{
			task: rootTask,
			ancestors: [],
			children: [],
			tokensActualRollup: 18000,
			threadId: WITH_SESSIONS_THREAD_ID,
			attachments: [],
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
		threadView,
	);

	return <PageWrapper taskId={ROOT_TASK_ID} />;
};
