/**
 * AU19 §11 (AC-9) — the cross-Layer `AgentWorkIntentRecorder`/`AgentWorkIntentReader`
 * seam. `agent_work_intents` is owned by the `agent-orchestration` Layer's
 * `session-requests` Service; `routes/threads.ts` and `routes/sessions-routes.ts`
 * are core-api-Layer code (still physically in `packages/server` pending
 * Increment 5's route relocation, but logically core-api). A core-api route
 * must not import an orchestration Service directly — the Application
 * (`createApp(deps)`) obtains the concrete recorder/reader from the
 * `agent-orchestration` Layer and injects it, matching §11's design exactly.
 *
 * `threads.ts`'s AC-9 accessor needs the write to stay atomic with its own
 * message insert (`tx`-carrying) — hence the generic `TTx` type param rather
 * than a fixed db type: `@hyperidle/shared` has zero `@hyperidle/db`
 * dependency (a leaf package), so it cannot name `HyperIdleDb`/`WriteExecutor`
 * directly. The composition root (`packages/server`) instantiates this
 * generic with its own concrete `HyperIdleDb` type; the real concrete
 * recorder (`@hyperidle/session-requests`'s `recordAgentWorkIntent`) is
 * assigned unchanged — no adapter needed (its `AgentWorkIntentDb` param type
 * is a structural superset of `HyperIdleDb`).
 */

/** Narrow mirror of `@hyperidle/session-requests`'s `AgentWorkIntentKind` — the two kinds these two routes record. */
export type AgentWorkIntentRecorderKind = "assistant_turn" | "session_start";

export interface AgentWorkIntentRecorderInput {
	readonly kind: AgentWorkIntentRecorderKind;
	readonly sourceKind: string;
	readonly sourceId: string;
	readonly requestedBy?: string;
	readonly idempotencyKey: string;
}

/** Narrow mirror of `@hyperidle/session-requests`'s `AgentWorkIntent` row — only the fields these two routes read. */
export interface AgentWorkIntentRecord {
	readonly id: string;
	readonly idempotencyKey: string;
}

/** Application-injected port for `session-requests`' durable `agent_work_intents` writer (Mechanism C, §11). */
export interface AgentWorkIntentRecorder<TTx = unknown> {
	record(tx: TTx, input: AgentWorkIntentRecorderInput): Promise<AgentWorkIntentRecord>;
}

/** Application-injected port for `session-requests`' `agent_work_intents` reader (Mechanism C, §11). */
export interface AgentWorkIntentReader<TDb = unknown> {
	findByKindAndSource(
		db: TDb,
		kind: AgentWorkIntentRecorderKind,
		sourceId: string,
	): Promise<AgentWorkIntentRecord | undefined>;
}
