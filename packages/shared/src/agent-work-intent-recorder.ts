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

/**
 * AU21 §6 Decision G (recorder unification) — widened from the AC-9 2-kind
 * (`assistant_turn`/`session_start`) scope to the FULL seven-kind
 * discriminated union, matching `agent_work_intents_kind_ck` +
 * `agent_work_intents_kind_source_compat_ck` (`packages/db/src/schema.ts`)
 * exactly. `work` (`bet_decomposition`/`task_run`) and `review`
 * (`reengagement`) used to re-declare their own narrower local mirrors of
 * this exact shape (`WorkAgentWorkIntentInput`/`ReviewAgentWorkIntentInput`)
 * purely because this union hadn't grown to cover their kinds yet — now that
 * it does, every caller imports this ONE type and the mirrors are deleted
 * (`tsc` enforces conformance mechanically, not by convention). See
 * `AGENT_WORK_INTENT_KINDS` below for the runtime-checkable kind list this
 * union's discriminant is built from.
 */
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
	  }
	| {
			readonly kind: "knowledge_action";
			readonly sourceKind: "knowledge_action";
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			/** See `BakedWorkIntentRequest`. Populated at emit time by the `knowledge` resolver (AU21 Increment 3). */
			readonly bakedRequest?: BakedWorkIntentRequest;
	  }
	| {
			readonly kind: "routine_run";
			readonly sourceKind: "routine_run";
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			/** See `BakedWorkIntentRequest`. Populated at emit time by `routine-service.ts`'s `resolveRoutineRunRequest` (AU21 Increment 4). */
			readonly bakedRequest?: BakedWorkIntentRequest;
	  }
	| {
			readonly kind: "bet_decomposition";
			readonly sourceKind: "bet";
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			/** See `BakedWorkIntentRequest`. Populated at emit time by `bet-decomposition.ts`'s `resolveBetDecompositionRequest` (AU21 Increment 3). */
			readonly bakedRequest?: BakedWorkIntentRequest;
	  }
	| {
			readonly kind: "task_run";
			readonly sourceKind: "task_dispatch_attempt";
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			/** See `BakedWorkIntentRequest`. Populated at emit time by `task-run-resolver.ts` (AU21 Increment 3). */
			readonly bakedRequest?: BakedWorkIntentRequest;
	  }
	| {
			readonly kind: "reengagement";
			readonly sourceKind: "proposed_call";
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			/** See `BakedWorkIntentRequest`. Populated at emit time by `proposed-call-workflow.ts`'s `resolveReengagementRequest` (AU21 Increment 3). */
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
