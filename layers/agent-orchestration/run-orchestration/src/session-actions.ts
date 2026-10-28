/** Session actions: search_sessions, watch_session, stop_session. */

import type { HyperIdleDb, Session } from "@hyperidle/db";
import {
	type ActionDeclaration,
	type ActionResult,
	type ActivityEntry,
	type SearchSessionsInput,
	type SessionRow,
	type StopSessionInput,
	type StopSessionOutput,
	searchSessions as searchSessionsDeclaration,
	stopSession as stopSessionDeclaration,
	type WatchSessionInput,
	type WatchSessionOutput,
	watchSession as watchSessionDeclaration,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { SessionSearchFilter } from "./session-store.js";

/** Local structural mirror of the layer's ActionContext/Action — nested Service may not import the layer's own package. */
export interface ActionContext {
	readonly actor: string;
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly now: string;
	readonly caller?: {
		readonly sessionId: string;
		readonly taskId: string | null;
		readonly threadId: string | null;
	};
	readonly internal?: boolean;
}

export interface Action<I = unknown, O = unknown> {
	readonly declaration: ActionDeclaration<I, O>;
	readonly run: (ctx: ActionContext, input: I) => Promise<ActionResult<O>>;
}

/** Deps for session actions. `stop` and `activity` are cross-package — bound at the layer composition root, never imported here. */
export interface SessionActionsDeps {
	readonly sessions: {
		list(db: HyperIdleDb, filter: SessionSearchFilter): Promise<readonly Session[]>;
		getById(db: HyperIdleDb, id: string): Promise<Session | undefined>;
	};
	/** `stopSessionRun`, already bound to `abort`/the layer's own `eventBus`. */
	readonly stop: (sessionId: string) => Promise<"aborted" | "marked" | "already_ended">;
	/** The in-memory ring buffer, verbatim (never persisted) — `session-activity-buffer.ts`'s own reader. */
	readonly activity: (sessionId: string) => readonly ActivityEntry[];
}

const DEFAULT_SEARCH_LIMIT = 100;

/** The thread named in a session's source, which every thread-started session records. */
function threadOf(sourceCorrelationJson: string | null): string | null {
	const source = JSON.parse(sourceCorrelationJson ?? "null") as { threadId?: unknown } | null;
	return typeof source?.threadId === "string" ? source.threadId : null;
}

/** `Session` (the db row) to `SessionRow` (the declared wire shape): a structural copy, not a cast, so a real divergence fails at compile time on this function's own return type. */
function toSessionRow(row: Session): SessionRow {
	return {
		id: row.id,
		agentId: row.agentId,
		taskId: row.taskId,
		threadId: threadOf(row.sourceCorrelationJson),
		startedAt: row.startedAt,
		endedAt: row.endedAt,
		state: row.state,
		outcome: row.outcome,
		notes: row.notes,
		modelTier: row.modelTier as SessionRow["modelTier"],
		sourceKind: row.sourceKind as SessionRow["sourceKind"],
	};
}

export function createSessionActions(deps: SessionActionsDeps): readonly Action[] {
	// -----------------------------------------------------------------------
	// search_sessions
	// -----------------------------------------------------------------------
	async function searchSessionsRun(
		ctx: ActionContext,
		input: SearchSessionsInput,
	): Promise<ActionResult<SessionRow[]>> {
		const rows = await deps.sessions.list(ctx.db, {
			...(input.ids ? { ids: input.ids } : {}),
			...(input.taskId ? { taskId: input.taskId } : {}),
			...(input.agentIds ? { agentIds: input.agentIds } : {}),
			...(input.state ? { state: input.state } : {}),
			limit: input.limit ?? DEFAULT_SEARCH_LIMIT,
			...(input.offset !== undefined ? { offset: input.offset } : {}),
		});
		return { ok: true, data: rows.map(toSessionRow) };
	}

	// -----------------------------------------------------------------------
	// watch_session
	// -----------------------------------------------------------------------
	async function watchSessionRun(
		ctx: ActionContext,
		input: WatchSessionInput,
	): Promise<ActionResult<WatchSessionOutput>> {
		const row = await deps.sessions.getById(ctx.db, input.id);
		if (!row) {
			return {
				ok: false,
				problems: [{ code: "not_found", message: `Session ${input.id} not found` }],
			};
		}
		return {
			ok: true,
			data: { session: toSessionRow(row), activity: [...deps.activity(input.id)] },
		};
	}

	// -----------------------------------------------------------------------
	// stop_session — the row in the answer is the row as it stood the MOMENT
	// asked (pre-stop, on the abort path) — the terminal state arrives
	// later, by nudge, never in this response.
	// -----------------------------------------------------------------------
	async function stopSessionActionRun(
		ctx: ActionContext,
		input: StopSessionInput,
	): Promise<ActionResult<StopSessionOutput>> {
		const row = await deps.sessions.getById(ctx.db, input.id);
		if (!row) {
			return {
				ok: false,
				problems: [{ code: "not_found", message: `Session ${input.id} not found` }],
			};
		}
		const result = await deps.stop(input.id);
		return {
			ok: true,
			data: { session: toSessionRow(row), stopped: result !== "already_ended" },
		};
	}

	return [
		{ declaration: searchSessionsDeclaration, run: searchSessionsRun } as Action,
		{ declaration: watchSessionDeclaration, run: watchSessionRun } as Action,
		{ declaration: stopSessionDeclaration, run: stopSessionActionRun } as Action,
	];
}
