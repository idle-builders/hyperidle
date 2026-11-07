import { createLogger } from "@hyperidle/diagnostics";
import {
	type BakedAgentRunnableConfig,
	type BakedContextBundle,
	bakeAgentRunnableConfig,
	type DocumentRow,
	type InboxRowView,
	type SessionResumeReply,
	type TaskView,
	type ThreadView,
	toBakedContextDocuments,
	type UserRow,
	type UserView,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import {
	buildVerdictMessage,
	endRunForHandoff,
	listSessions,
	readAgentRunConfig,
	recordReviewVerdict,
	requestRunStopForTasks,
} from "@hyperidle/run-orchestration";
import type { RunnerDb } from "@hyperidle/runner-db";
import {
	type BakedRunRequest,
	cancelPendingForTasks,
	countPendingRunsForAgent,
	listPendingByStream,
	queueResume,
	queueRun,
	sessionRunRegistry,
} from "@hyperidle/session-requests";
import type { CoreDoor } from "./core-door.js";

const logger = createLogger({ pkg: "agent-orchestration.runner" });

/** Task states a run may start from. */
const WORKABLE_TASK_STATES: ReadonlySet<string> = new Set(["ready", "accepted", "in_progress"]);

export interface InboxWorkDeps {
	readonly db: RunnerDb;
	readonly eventBus: EventBus;
	readonly door: CoreDoor;
}

/** One agent as its runner holds it: its key, and itself as it reads itself through the door. */
export interface HeldAgent {
	readonly key: string;
	readonly self: UserView;
}

/** What the agent was asked to act on is gone or no longer its to act on: the row is done. */
class NothingToDo extends Error {}

/** The row cannot be acted on yet (its task is paused): it stays unread and is looked at again. */
export class NotYet extends Error {}

function must<O>(
	result: Awaited<ReturnType<CoreDoor["call"]>>,
	what: string,
): asserts result is { readonly ok: true; readonly data: O } {
	if (!result.ok) {
		throw new NothingToDo(`${what}: ${result.problems.map((p) => p.message).join("; ")}`);
	}
}

function selfRow(agent: HeldAgent): UserRow {
	if (!agent.self.user) throw new NothingToDo("the agent is gone");
	return agent.self.user;
}

async function agentConfigOf(
	deps: InboxWorkDeps,
	agent: HeldAgent,
): Promise<BakedAgentRunnableConfig> {
	const me = selfRow(agent);
	const identity = await deps.door.call<DocumentRow[]>(agent.key, "search_documents", {
		parent: { kind: "agent", id: me.id },
		slot: "agent_file",
		status: "active",
	});
	const persona = identity.ok ? (identity.data[0]?.body ?? null) : null;
	return bakeAgentRunnableConfig(
		{
			kind: me.kind,
			status: me.status,
			role: me.role,
			teamId: me.teams[0]?.id ?? null,
			name: me.name,
		},
		persona,
	);
}

/** The documents a session reads, ranked for what it is about. */
async function documentsFor(
	deps: InboxWorkDeps,
	agent: HeldAgent,
	about: string,
	teamId: string | undefined,
): Promise<BakedContextBundle["documents"]> {
	const found = await deps.door.call<DocumentRow[]>(agent.key, "search_documents", {
		forSession: { about, ...(teamId ? { teamId } : {}) },
	});
	must<DocumentRow[]>(found, "documents for the session");
	return toBakedContextDocuments(
		found.data.map((d) => ({ ...d, parentChain: d.parentChain ?? [] })),
	);
}

async function queue(
	deps: InboxWorkDeps,
	baked: BakedRunRequest,
	row: InboxRowView,
): Promise<void> {
	await queueRun(deps.db, baked, `inbox:${row.id}`);
	if (baked.streamId.startsWith("thread:")) {
		// The waiting line in the thread shows at once.
		deps.eventBus.emit({
			type: "session_request_queued",
			streamId: baked.streamId,
			timestamp: Date.now(),
		});
	}
}

/** A turn in a thread: the agent reads the whole conversation and answers in it. */
async function queueThreadTurn(
	deps: InboxWorkDeps,
	agent: HeldAgent,
	row: InboxRowView,
	thread: ThreadView,
	messageId: string,
	senderId: string,
	/** Said to the agent after the conversation, in the words a resumed session reads. */
	said?: string,
): Promise<void> {
	const me = selfRow(agent);
	const threadId = thread.thread.id;
	await queue(
		deps,
		{
			defaultAgentId: me.id,
			sourceKind: "assistant",
			sourceId: messageId,
			streamId: `thread:${threadId}`,
			userId: senderId,
			sourceCorrelation: { threadId, messageId, userId: senderId, agentId: me.id },
			transcript: [
				...[...thread.messages].reverse().map((m) => ({
					senderId: m.senderId,
					payload: JSON.stringify(m.payload),
					type: m.type,
				})),
				...(said ? [{ senderId, payload: JSON.stringify({ text: said }), type: "plain" }] : []),
			],
			callingThreadId: threadId,
			agentConfig: await agentConfigOf(deps, agent),
		},
		row,
	);
}

async function openThread(
	deps: InboxWorkDeps,
	agent: HeldAgent,
	threadId: string,
): Promise<ThreadView> {
	const opened = await deps.door.call<ThreadView>(agent.key, "open_thread", { id: threadId });
	must<ThreadView>(opened, "the thread");
	return opened.data;
}

/** The message a change row carries, read without trusting its shape. */
function messageOf(row: InboxRowView): {
	readonly id: string;
	readonly type: unknown;
	readonly payload: Record<string, unknown>;
} {
	const after = row.change?.after;
	const id = after?.messageId;
	if (typeof id !== "string") throw new NothingToDo("the row names no message");
	const payload = after?.payload;
	return {
		id,
		type: after?.type,
		payload:
			typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {},
	};
}

/** A message for the agent: into its live run in that thread, or a new turn. */
async function actOnMessage(
	deps: InboxWorkDeps,
	agent: HeldAgent,
	row: InboxRowView,
): Promise<void> {
	const me = selfRow(agent);
	const threadId = row.objectId;
	const senderId = row.change?.actor;
	if (!(threadId && senderId)) throw new NothingToDo("the row names no thread");
	const message = messageOf(row);
	const thread = await openThread(deps, agent, threadId);
	const text = message.payload.text;
	if (message.type === "plain" && typeof text === "string") {
		const sender = thread.members.find((m) => m.id === senderId)?.name ?? senderId;
		const delivered = await sessionRunRegistry.deliverToConversation(
			me.id,
			threadId,
			`${sender} wrote in the conversation: ${text}`,
		);
		if (delivered === "delivered") return;
	}
	// Wait until the agent is free before queuing a new run, so the row stays unread
	// if the agent moves to another runner before the run starts.
	const { maxConcurrentSessions } = await readAgentRunConfig(deps.db, me.id);
	const active = await listSessions(deps.db, {
		agentIds: [me.id],
		state: "active",
		limit: maxConcurrentSessions,
	});
	const pendingCount = await countPendingRunsForAgent(deps.db, me.id);
	if (active.length + pendingCount >= maxConcurrentSessions)
		throw new NotYet("agent is at session limit");
	await queueThreadTurn(deps, agent, row, thread, message.id, senderId);
}

/** The person's verdict or answer, as the session that asked reads it. */
function replyOf(message: ReturnType<typeof messageOf>): SessionResumeReply {
	const { payload } = message;
	if (message.type === "verdict") {
		return {
			decision: payload.decision === "approve" ? "approve" : "decline",
			...(typeof payload.note === "string" ? { note: payload.note } : {}),
		};
	}
	const answer =
		typeof payload.option === "string"
			? { option: payload.option }
			: typeof payload.text === "string"
				? { text: payload.text }
				: undefined;
	return { decision: "answer", ...(answer ? { answer } : {}) };
}

/** An answer to the agent's review or question: back into the session that asked, or a new turn. */
async function actOnReviewAnswered(
	deps: InboxWorkDeps,
	agent: HeldAgent,
	row: InboxRowView,
): Promise<void> {
	const reviewMessageId = row.objectId;
	const threadId = row.change?.objectId;
	const decidedBy = row.change?.actor;
	if (!(reviewMessageId && threadId && decidedBy)) throw new NothingToDo("the row names no review");
	const reply = messageOf(row);
	const thread = await openThread(deps, agent, threadId);
	const asked = thread.messages.find((m) => m.id === reviewMessageId);
	const askedTaskId = (asked?.payload as { readonly taskId?: unknown } | undefined)?.taskId;
	const outcome = await recordReviewVerdict(
		deps.db,
		{
			...replyOf(reply),
			reviewMessageId,
			threadId,
			...(typeof askedTaskId === "string" ? { taskId: askedTaskId } : {}),
			agentConfig: await agentConfigOf(deps, agent),
		},
		(resume) => queueResume(deps.db, resume),
		(sessionId, text) => sessionRunRegistry.deliverToSession(sessionId, text),
	);
	if (outcome.status === "queued") return;
	// No session can take it back, so the agent reads the answer in a new turn.
	logger.info("answer starts a new turn", { reviewMessageId, outcome: outcome.status });
	// Core left an approved task open for the session that asked; with none coming back, the agent
	// closes it here — by core's own rule, only when every line of it is met.
	if (typeof askedTaskId === "string" && replyOf(reply).decision === "approve") {
		const asked = await deps.door.call<TaskView>(agent.key, "open_task", { id: askedTaskId });
		const allMet = asked.ok && asked.data.task.doneWhen.every((l) => l.state === "met");
		if (asked.ok && asked.data.task.state === "in_progress" && allMet) {
			const closed = await deps.door.call(agent.key, "edit_task", {
				id: askedTaskId,
				state: "done",
			});
			if (!closed.ok) {
				logger.info("approved task left open", { taskId: askedTaskId, problems: closed.problems });
			}
		}
	}
	await queueThreadTurn(
		deps,
		agent,
		row,
		thread,
		reply.id,
		decidedBy,
		buildVerdictMessage(replyOf(reply)),
	);
}

/** A task to work: the agent reads the task, its parents and its documents. */
async function actOnTaskRun(
	deps: InboxWorkDeps,
	agent: HeldAgent,
	row: InboxRowView,
): Promise<void> {
	const me = selfRow(agent);
	if (!row.objectId) throw new NothingToDo("the row names no task");
	const opened = await deps.door.call<TaskView>(agent.key, "open_task", { id: row.objectId });
	must<TaskView>(opened, "the task");
	const { task, ancestors } = opened.data;
	if (!WORKABLE_TASK_STATES.has(task.state)) throw new NothingToDo(`the task is ${task.state}`);
	if (task.ownerAgentId && task.ownerAgentId !== me.id) throw new NothingToDo("the task moved on");
	if (task.paused !== null) throw new NotYet("the task is paused");
	// The same start told twice (a restart and a row that waited) is one run. Only this agent's
	// waiting runs count: a run still running may be one a stop just ended.
	const queued = await listPendingByStream(deps.db, `task:${task.id}`);
	if (queued.some((r) => r.agentId === me.id))
		throw new NothingToDo("a run on the task is waiting");
	// Do not queue while the agent is at its session limit: the row stays unread so
	// another runner can pick it up after a move, or this runner retries once a slot frees.
	const { maxConcurrentSessions } = await readAgentRunConfig(deps.db, me.id);
	const active = await listSessions(deps.db, {
		agentIds: [me.id],
		state: "active",
		limit: maxConcurrentSessions,
	});
	const pendingCount = await countPendingRunsForAgent(deps.db, me.id);
	if (active.length + pendingCount >= maxConcurrentSessions)
		throw new NotYet("agent is at session limit");
	const team = me.teams.find((t) => t.id === task.teamId);
	const contextBundle: BakedContextBundle | undefined = team
		? {
				kind: "task",
				task: {
					id: task.id,
					title: task.title,
					description: task.description,
					state: task.state,
					doneWhen: task.doneWhen,
					reasons: task.reasons,
				},
				ancestors: ancestors.map((a) => ({
					id: a.id,
					title: a.title,
					description: a.description,
					doneWhen: a.doneWhen,
				})),
				agent: { id: me.id, name: me.name, role: me.role },
				team: { id: team.id, name: team.name },
				documents: await documentsFor(deps, agent, task.description ?? task.title, task.teamId),
			}
		: undefined;
	await queue(
		deps,
		{
			defaultAgentId: me.id,
			sourceKind: "task",
			sourceId: task.id,
			streamId: `task:${task.id}`,
			taskId: task.id,
			teamId: task.teamId,
			sourceCorrelation: { taskId: task.id, teamId: task.teamId },
			agentConfig: await agentConfigOf(deps, agent),
			callingThreadId: task.threadId,
			...(contextBundle ? { contextBundle } : {}),
		},
		row,
	);
}

/** A subscription firing: the agent reads its instruction and what changed. */
async function actOnSubscription(
	deps: InboxWorkDeps,
	agent: HeldAgent,
	row: InboxRowView,
): Promise<void> {
	const me = selfRow(agent);
	const sub = agent.self.subscriptions.find((s) => s.id === row.subscriptionId);
	if (!sub) throw new NothingToDo("the subscription is gone");
	const found = await deps.door.call<DocumentRow[]>(agent.key, "search_documents", {
		parent: { kind: "subscription", id: sub.id },
		slot: "prompt",
	});
	const prompt = found.ok ? (found.data[0]?.body ?? null) : null;
	const team = me.teams[0] ?? null;
	const sourceId = row.change ? `${sub.id}:${row.change.id}` : `${sub.id}:${row.createdAt}`;
	await queue(
		deps,
		{
			defaultAgentId: me.id,
			sourceKind: "subscription",
			sourceId,
			streamId: `subscription:${sub.id}`,
			...(team ? { teamId: team.id } : {}),
			...(me.ownerUserId ? { userId: me.ownerUserId } : {}),
			taskId: null,
			sourceCorrelation: {
				subscriptionId: sub.id,
				...(row.change ? { changeId: row.change.id } : {}),
				...(team ? { teamId: team.id } : {}),
			},
			contextBundle: {
				kind: "subscription",
				subscription: { id: sub.id, event: sub.event, schedule: sub.schedule },
				prompt,
				change: row.change,
				agent: { id: me.id, name: me.name, role: me.role },
				team,
				documents: await documentsFor(
					deps,
					agent,
					prompt ?? sub.event ?? sub.schedule ?? "",
					team?.id,
				),
			},
			agentConfig: await agentConfigOf(deps, agent),
		},
		row,
	);
}

/**
 * Stop this agent's run on a task. Handed to someone else, its run only ends — the new owner
 * carries the work on — otherwise (killed, paused to a stop) the run is stopped.
 */
async function actOnTaskStop(
	deps: InboxWorkDeps,
	agent: HeldAgent,
	row: InboxRowView,
): Promise<void> {
	const me = selfRow(agent);
	const taskId = row.objectId;
	if (!taskId) throw new NothingToDo("the row names no task");
	const opened = await deps.door.call<TaskView>(agent.key, "open_task", { id: taskId });
	const handedAway = opened.ok && opened.data.task.ownerAgentId !== me.id;
	if (handedAway) {
		const live = await listSessions(deps.db, {
			taskId,
			agentIds: [me.id],
			state: "active",
			limit: 10,
		});
		for (const session of live)
			await endRunForHandoff(deps.db, session.id, new Date().toISOString());
		await cancelPendingForTasks(deps.db, [taskId], new Date().toISOString(), me.id);
		return;
	}
	await cancelPendingForTasks(deps.db, [taskId], new Date().toISOString());
	await requestRunStopForTasks(deps.db, deps.eventBus, [taskId], (sessionId) =>
		sessionRunRegistry.abort(sessionId, "stop"),
	);
}

/**
 * Tell the people in the row's thread that the agent gave up on it after repeated failures.
 * The caller logs a failure to post it.
 */
export async function postFailureNotice(
	deps: InboxWorkDeps,
	agent: HeldAgent,
	row: InboxRowView,
): Promise<void> {
	let threadId: string | undefined;
	if (row.reason === "message") {
		threadId = row.objectId ?? undefined;
	} else if (row.reason === "review_answered") {
		threadId = row.change?.objectId;
	} else if (row.reason === "task_run") {
		if (!row.objectId) return;
		const opened = await deps.door.call<TaskView>(agent.key, "open_task", { id: row.objectId });
		threadId = opened.ok ? opened.data.task.threadId : undefined;
	} else {
		logger.error("inbox row given up, no thread to tell", {
			rowId: row.id,
			reason: row.reason,
		});
		return;
	}
	if (!threadId) return;
	await deps.door.call(agent.key, "send_message", {
		threadId,
		text: "I couldn't pick this up after several tries.",
	});
}

/**
 * Act on one inbox row as the agent. Resolves when the row is done — acted on, or nothing left to
 * act on — so the caller marks it read; throws when it should be tried again later.
 */
export async function actOnInboxRow(
	deps: InboxWorkDeps,
	agent: HeldAgent,
	row: InboxRowView,
): Promise<void> {
	try {
		switch (row.reason) {
			case "message":
				return await actOnMessage(deps, agent, row);
			case "review_answered":
				return await actOnReviewAnswered(deps, agent, row);
			case "task_run":
				return await actOnTaskRun(deps, agent, row);
			case "task_stop":
				return await actOnTaskStop(deps, agent, row);
			case "subscription":
				return await actOnSubscription(deps, agent, row);
		}
	} catch (error) {
		if (!(error instanceof NothingToDo)) throw error;
		logger.info("inbox row needs nothing", {
			agentId: agent.self.user?.id,
			rowId: row.id,
			reason: row.reason,
			why: error.message,
		});
	}
}
