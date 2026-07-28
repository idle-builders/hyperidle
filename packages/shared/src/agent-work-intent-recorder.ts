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
 * recorder (`@hyperidle/session-requests`'s `enqueueWorkIntent`) is
 * assigned unchanged — no adapter needed (its `AgentWorkIntentDb` param type
 * is a structural superset of `HyperIdleDb`).
 */

import type { AgentSessionSourceCorrelation, AgentSessionSourceKind } from "./session-request.js";

/**
 * AU21 §6 Decision B / §10 — the emit-time-resolved request a migrated
 * family's core-api resolver produces (the exact shape
 * `resolveIntentInputInternal` used to return per kind, minus the fields
 * trivially re-derivable from the intent row at drain time). Carried on the
 * `AgentWorkIntentRecorder` payload (Decision G: payload growth, not a new
 * edge) so the drain can dispatch it directly with ZERO domain reads.
 */
export interface BakedWorkIntentRequest {
	readonly defaultAgentId: string;
	readonly sourceKind: AgentSessionSourceKind;
	readonly sourceId: string;
	readonly streamId: string;
	readonly taskId?: string | null;
	readonly teamId?: string;
	readonly userId?: string;
	readonly sourceCorrelation: AgentSessionSourceCorrelation;
}

export type AgentWorkIntentRecorderInput =
	| {
			readonly kind: "assistant_turn";
			readonly sourceKind: "thread_message";
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			/** See `BakedWorkIntentRequest`. Populated at emit time by the `conversation` resolver (AU21 Increment 3). */
			readonly bakedRequest?: BakedWorkIntentRequest;
	  }
	| {
			readonly kind: "session_start";
			readonly sourceKind: "explicit_session_start";
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			/** See `BakedWorkIntentRequest`. Populated at emit time by the `work` resolver (AU21 Increment 3). */
			readonly bakedRequest?: BakedWorkIntentRequest;
	  };

/** Application-injected port for `session-requests`' durable `agent_work_intents` writer (Mechanism C, §11). */
export interface AgentWorkIntentRecorder<TTx = unknown> {
	record(
		tx: TTx,
		input: AgentWorkIntentRecorderInput,
	): Promise<{ readonly id: string; readonly idempotencyKey: string }>;
}

/** Application-injected port for `session-requests`' `agent_work_intents` reader (Mechanism C, §11). */
export interface AgentWorkIntentReader<TDb = unknown> {
	findByKindAndSource(
		db: TDb,
		kind: "assistant_turn" | "session_start",
		sourceId: string,
	): Promise<{ readonly id: string; readonly idempotencyKey: string } | undefined>;
}
