/**
 * The session action list — `search_sessions` / `watch_session` /
 * `stop_session`. This Service owns `sessions` (`table-owners.json`), so it
 * declares the runs itself — architecture.md §2. `Action`/`ActionContext`
 * below are a local structural mirror of `layers/agent-orchestration/src/
 * actions/action.ts`'s own pair, the same reason `@hyperidle/document`/
 * `@hyperidle/task`/`@hyperidle/thread` each declare their own: a nested
 * Service may not import the layer's own package.
 */

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

/**
 * Local structural mirror of `layers/agent-orchestration/src/actions/
 * action.ts`'s `ActionContext`/`Action` — same idiom `@hyperidle/document`'s
 * `action-types.ts` uses and explains at length.
 */
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

/**
 * The session module's outward-facing deps — architecture.md §2. `sessions`
 * is this package's own table (in-package — the two accessors below are
 * `session-store.ts`'s own `listSessions`/`findSessionById`, injected rather
 * than imported directly only for the same uniform-shape reason the
 * document/task/thread modules take a deps bag at all); `stop` and `activity`
 * are genuine crossings (`@hyperidle/session-requests`'s abort registry, and
 * the activity buffer that lives at the agent-orchestration layer root) —
 * both bound at the layer's own composition root
 * (`services/run-orchestration-composition.ts`), never imported here.
 */
export interface SessionActionsDeps {
	readonly sessions: {
		list(db: HyperIdleDb, filter: SessionSearchFilter): Promise<readonly Session[]>;
		getById(db: HyperIdleDb, id: string): Promise<Session | undefined>;
	};
	/** architecture.md §3 — `stopSessionRun`, already bound to `abort`/the layer's own `eventBus`. */
	readonly stop: (sessionId: string) => Promise<"aborted" | "marked" | "already_ended">;
	/** The in-memory ring buffer, verbatim (never persisted) — `session-activity-buffer.ts`'s own reader. */
	readonly activity: (sessionId: string) => readonly ActivityEntry[];
}

const DEFAULT_SEARCH_LIMIT = 100;

/** `Session` (the db row) and `SessionRow` (the declared wire shape) already share every field name — a structural copy, not a cast, so a real divergence fails at compile time on this function's own return type. */
function toSessionRow(row: Session): SessionRow {
	return {
		id: row.id,
		agentId: row.agentId,
		taskId: row.taskId,
		startedAt: row.startedAt,
		endedAt: row.endedAt,
		state: row.state,
		outcome: row.outcome,
		effectivenessScore: row.effectivenessScore,
		routineId: row.routineId,
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
			...(input.routineId ? { routineId: input.routineId } : {}),
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
	// stop_session — architecture.md §3, §12 F1: the row in the answer is the
	// row as it stood the MOMENT asked (pre-stop, on the abort path) — the
	// terminal state arrives later, by nudge, never in this response.
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
