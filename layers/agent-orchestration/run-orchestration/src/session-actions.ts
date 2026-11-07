/** Session actions: stop_session. */

import {
	type ActionDeclaration,
	type ActionResult,
	type SessionRow,
	type StopSessionInput,
	type StopSessionOutput,
	stopSession as stopSessionDeclaration,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { RunnerDb, Session } from "@hyperidle/runner-db";

/** Local structural mirror of the layer's ActionContext/Action — nested Service may not import the layer's own package. */
export interface ActionContext {
	readonly actor: string;
	readonly db: RunnerDb;
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

/** Deps for session actions. `stop` is cross-package — bound at the layer composition root, never imported here. */
export interface SessionActionsDeps {
	readonly sessions: {
		getById(db: RunnerDb, id: string): Promise<Session | undefined>;
	};
	/** `stopSessionRun`, already bound to `abort`/the layer's own `eventBus`. */
	readonly stop: (sessionId: string) => Promise<"aborted" | "marked" | "already_ended">;
}

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

	return [{ declaration: stopSessionDeclaration, run: stopSessionActionRun } as Action];
}
