/**
 * L15 — Lazy materialization of `host_kind='task'` threads.
 *
 * @lore L15 plan §5.3 + CONFUSION-A: L15 ships the lazy SELECT-or-INSERT
 * path so request menu / open-thread surfaces work BEFORE L18 lands its
 * eager `tasks.create`-time materialization. When L18 ships, this helper
 * becomes effectively dead code — the eager creator wins the race and the
 * SELECT path always returns. Marked here so the future agent doesn't
 * delete it without auditing the call-sites in `routes/task-thread.ts`.
 *
 * @lore L15 security review F1 / F2: GET is now NON-MUTATING — it only
 * SELECTs an existing thread (404 if absent). Materialization happens only
 * via `materializeTaskThread`, called from the POST path AFTER the caller
 * has been authorized as a participant. Per F1 (option a), participants are
 * derived from the task's owning team's members + the founder, not from
 * the caller — so the first toucher cannot grant themselves access.
 */

import {
	type Task as DbTask,
	type Thread as DbThread,
	type HyperIdleDb,
	tasks as tasksTable,
	teams as teamsTable,
	threads,
} from "@hyperidle/db";
import type { ApiErrorResponse, EventBus, Thread, ThreadCreatedEvent } from "@hyperidle/shared";
import { HOST_KINDS } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { threadParticipantsSchema } from "../routes/threads-schema.js";

const TASK_HOST_KIND = "task" as const;
const DEFAULT_FOUNDER_ID = "u-founder";
const hostKindSchema = z.enum(HOST_KINDS);
const teamMembersSchema = z.array(z.string().min(1));

export interface FoundTaskThread {
	thread: Thread;
	threadRow: DbThread;
}

export interface TaskNotFoundError {
	error: ApiErrorResponse;
	status: 404;
}

export interface ThreadNotFoundError {
	error: ApiErrorResponse;
	status: 404;
}

export interface ForbiddenError {
	error: ApiErrorResponse;
	status: 403;
}

export function rowToThread(row: DbThread): Thread {
	const participants = threadParticipantsSchema.parse(JSON.parse(row.participants));
	return {
		id: row.id,
		hostKind: hostKindSchema.parse(row.hostKind),
		hostId: row.hostId,
		initiatorId: row.initiatorId,
		participants,
		pinned: row.pinned === 1,
		resolvedAt: row.resolvedAt,
		lastActiveAt: row.lastActiveAt,
		createdAt: row.createdAt,
	};
}

function findTaskRow(db: HyperIdleDb, taskId: string): DbTask | undefined {
	return db.select().from(tasksTable).where(eq(tasksTable.id, taskId)).get();
}

function findExistingThread(db: HyperIdleDb, taskId: string): DbThread | undefined {
	return db
		.select()
		.from(threads)
		.where(and(eq(threads.hostKind, TASK_HOST_KIND), eq(threads.hostId, taskId)))
		.get();
}

/**
 * Derive the canonical participant set for a task's thread: the founder plus
 * any members declared on the task's owning team. Falls back to the founder
 * alone if the team has no `members` column (legacy / unconfigured rows).
 */
function deriveTaskParticipants(db: HyperIdleDb, task: DbTask): readonly string[] {
	const team = db.select().from(teamsTable).where(eq(teamsTable.id, task.teamId)).get();
	const members: string[] = [];
	if (team?.members) {
		try {
			const parsed = teamMembersSchema.parse(JSON.parse(team.members));
			members.push(...parsed);
		} catch {
			// Malformed `members` JSON: ignore and fall back to founder-only.
		}
	}
	if (team?.leadAgentId) members.push(team.leadAgentId);
	if (task.ownerAgentId) members.push(task.ownerAgentId);
	const all = new Set<string>([DEFAULT_FOUNDER_ID, ...members]);
	return [...all].sort();
}

/**
 * Look up the thread for a task WITHOUT mutating. Returns 404 if either the
 * task or the thread is absent. This is the GET path (F1/F2).
 */
export function findTaskThread(
	db: HyperIdleDb,
	args: { taskId: string },
): FoundTaskThread | TaskNotFoundError | ThreadNotFoundError {
	const taskRow = findTaskRow(db, args.taskId);
	if (!taskRow) {
		return { error: { error: "Task not found", code: "not_found" }, status: 404 };
	}
	const existing = findExistingThread(db, args.taskId);
	if (!existing) {
		return { error: { error: "Thread not found", code: "not_found" }, status: 404 };
	}
	return { thread: rowToThread(existing), threadRow: existing };
}

/**
 * Authorize a caller against the task's canonical participant set, then
 * either return the existing thread or materialize a new one. The caller's
 * id is NOT auto-added to the participant set — they must already be in it
 * (the founder, the team lead, an explicit team member, or the task owner).
 *
 * @lore L15 F1 / F3: this is the only path that creates a `host_kind='task'`
 * thread. GET is read-only.
 */
export function ensureTaskThreadForSender(
	db: HyperIdleDb,
	args: { taskId: string; senderId: string; eventBus: EventBus },
): FoundTaskThread | TaskNotFoundError | ForbiddenError {
	const taskRow = findTaskRow(db, args.taskId);
	if (!taskRow) {
		return { error: { error: "Task not found", code: "not_found" }, status: 404 };
	}
	const participants = deriveTaskParticipants(db, taskRow);
	if (!participants.includes(args.senderId)) {
		return {
			error: { error: "Sender is not a participant", code: "forbidden" },
			status: 403,
		};
	}
	const existing = findExistingThread(db, args.taskId);
	if (existing) {
		return { thread: rowToThread(existing), threadRow: existing };
	}

	const now = new Date().toISOString();
	const threadId = crypto.randomUUID();
	db.insert(threads)
		.values({
			id: threadId,
			hostKind: TASK_HOST_KIND,
			hostId: args.taskId,
			initiatorId: args.senderId,
			participants: JSON.stringify(participants),
			pinned: 0,
			lastActiveAt: now,
			createdAt: now,
		})
		.run();
	const inserted = db.select().from(threads).where(eq(threads.id, threadId)).get();
	if (!inserted) {
		throw new Error(
			`ensureTaskThreadForSender: materialized thread ${threadId} missing after insert`,
		);
	}
	const createdEvent: ThreadCreatedEvent = {
		type: "thread_created",
		streamId: threadId,
		threadId,
		hostKind: TASK_HOST_KIND,
		hostId: args.taskId,
		initiatorId: args.senderId,
		timestamp: Date.now(),
	};
	args.eventBus.emit(createdEvent);
	return { thread: rowToThread(inserted), threadRow: inserted };
}
