/**
 * AU19 §7.4 — the one genuine cross-process seam: `HarnessPort`.
 *
 * `agent-orchestration`'s `session-lifecycle`/`run-orchestration` must
 * dispatch a run to *some* execution (in-process on `desktop`, or a remote
 * worker on `remote-server`+`remote-worker`). `HarnessPort` is the named,
 * Application-visible abstraction both Services depend on instead of a
 * locally-declared ad-hoc interface — never on `@hyperidle/harness-registry`
 * directly (Mechanism C).
 *
 * @lore AU19 Increment 3i: §7.4's sketch is a single
 * `provisionAndRun(bundle): Promise<RunOutput>` call. Implementing that
 * literally would collapse `admitSession`+`runSession` into one opaque call,
 * losing the synchronous "know the sessionId immediately after admission"
 * requirement `run-orchestration`'s detached-execution path depends on
 * (`consumeAgentSessionRequest`'s `detachAfterAdmission` branch: the request
 * is marked "running" with the admitted `sessionId` BEFORE `runSession`
 * resolves, and the caller returns to the 1s poll loop without awaiting the
 * run to finish — see `@hyperidle/run-orchestration`'s
 * `agent-session-runtime.ts`). Preserving that real behavior requirement
 * without inventing new callback-based signaling (a genuine design
 * exercise, out of scope for a mechanical migration) means this interface
 * keeps the two-phase admit/run shape `run-orchestration` already had
 * (`RunOrchestrationSessionProvisioner`, Increment 3c) as the two
 * `HarnessPort` methods — a straight rename+relocation into the shared,
 * Application-visible abstraction §7.4 calls for, not a new one.
 *
 * RULED PERMANENT (founder-confirmed 2026-07-15, `plans/AU19/architecture.md`
 * §7.4 amendment): the two-method shape is the permanent `HarnessPort`
 * contract, not `provisionAndRun`. §7.4's original text is now corrected to
 * match — this is not an open deviation.
 *
 * `TDb` is generic because `@hyperidle/harness-protocol` has zero `@hyperidle/db`
 * dependency (a leaf package) — same pattern as `AgentWorkIntentRecorder`'s
 * `TTx`/`TDb` (`agent-work-intent-recorder.ts`). The composition root
 * instantiates this generic with the real `HyperIdleDb` type; the concrete
 * `@hyperidle/session-lifecycle` implementation is assigned unchanged (its
 * real `ProvisionSessionDeps`/`ProvisionSessionParams`/`AdmittedSession`/
 * `ProvisionSessionResult` shapes are structural supersets of the narrow
 * types below, so no adapter is needed — same idiom
 * `run-orchestration/src/ports.ts` already documents for these exact
 * fields).
 */

import type {
	AgentSessionSourceCorrelation,
	AgentSessionSourceKind,
	ModelTier,
	ResolvedModel,
	SessionOutcome,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { BakedAgentRunnableConfig, BakedContextBundle } from "@hyperidle/work-intent-port";
import type { ConversationMessage, SessionMetrics } from "./harness/harness-adapter.js";

/** Deps `HarnessPort`'s two methods need. `TDb` is the composition root's real DB type. */
export interface HarnessPortDeps<TDb = unknown> {
	readonly db: TDb;
	readonly eventBus: EventBus;
	readonly onHarnessStarted?: () => void;
}

/**
 * Narrow mirror of `@hyperidle/session-lifecycle`'s `ProvisionSessionParams`
 * — every field `run-orchestration` constructs when dispatching a run.
 * `sessionWorkflow` is an opaque pass-through value bag `run-orchestration`
 * never inspects (only ever forwarded whole from its own caller's `options`).
 */
export interface RunContextBundle {
	readonly taskId: string | null;
	readonly agentId: string;
	readonly productId: string;
	readonly sandboxBasePath: string;
	readonly modelTier?: ModelTier;
	readonly resolvedModel?: ResolvedModel;
	readonly routineId?: string;
	readonly requestContext?: {
		readonly requestId: string;
		readonly sourceKind: AgentSessionSourceKind;
		readonly sourceId: string;
		readonly sourceCorrelation: AgentSessionSourceCorrelation;
		readonly triggerPromptOverride?: string;
	};
	/** Opaque pass-through — `session-lifecycle`-owned `RegistrySessionWorkflow` (destined for `tool-handlers`, Increment 4). Never inspected here. */
	readonly sessionWorkflow?: unknown;
	/**
	 * AU21 §9 Increment 12 (Decision H3) — the baked entity+knowledge bundle a
	 * `task_run`/`routine_run`/`reengagement` session's sandbox context (Phase
	 * 6) and prompt persona (Phase 8.5) are built from, sourced from the
	 * drained `AgentSessionRequest.payloadJson` (zero db read). Absent for
	 * `knowledge_action`/`session_start`/`assistant_turn` turns.
	 */
	readonly contextBundle?: BakedContextBundle;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E — the target agent's baked
	 * runnable-config snapshot (see `BakedAgentRunnableConfig`'s own doc
	 * comment) and the server's baked disabled-harness-types list, both
	 * sourced from the drained `AgentSessionRequest.payloadJson` — zero db
	 * read. Present for every durable session (all six intent kinds bake
	 * `agentConfig`); absent only on the `one-shot` mode (eval/test seam),
	 * whose caller supplies it directly.
	 */
	readonly agentConfig?: BakedAgentRunnableConfig;
	readonly harnessDisabled?: readonly string[];
	/**
	 * The session's calling thread id, baked at emit time by every per-kind
	 * resolver that has one (`assistant_turn` from the triggering message's
	 * thread; `task_run`/`session_start`/`proposed_call` from a resolve-or-
	 * create). Absent for `routine_run`/`knowledge_action`. Forwarded
	 * verbatim onto `ProvisionSessionParams` and then `ToolContext.threadId`
	 * — ZERO orchestration -> core read (AU21 AC #2).
	 */
	readonly callingThreadId?: string;
	/**
	 * The session's calling-thread transcript, mapped to generic chat
	 * messages at emit time — any kind that bakes a `transcript` gets the
	 * same generic delivery, no per-kind branch. Feeds both the
	 * `## Conversation` prompt section (every harness) and
	 * `SessionConfig.messages` (selects the builtin adapter's chat completion
	 * over the planning loop). Absent for a session with no transcript.
	 */
	readonly transcript?: readonly ConversationMessage[];
}

/** Narrow mirror of `@hyperidle/session-lifecycle`'s `AdmittedSession` — only the field `run-orchestration` reads directly; the rest flows through opaquely. */
export interface AdmittedRun {
	readonly sessionId: string;
	readonly sessionContext: { readonly taskId: string | null };
}

/**
 * Full mirror of `@hyperidle/session-lifecycle`'s `ProvisionSessionResult` — every field is already framework-typed, so this is a complete (non-opaque) structural equivalent.
 *
 * @lore AU21 (harness-telemetry narrowing): `totalCostCents` REMOVED — the
 * harness-adapter $-cost estimate machinery is narrowed to token usage only
 * (see `SessionMetrics`/`SessionResult` in `harness-adapter.ts`).
 */
export interface HarnessRunOutput {
	readonly sessionId: string;
	readonly outcome: SessionOutcome;
	readonly taskId: string | null;
	readonly returnVerdict?: "returned" | "not_returned";
	readonly forceReturnCount: number;
	readonly metrics?: SessionMetrics;
}

/**
 * Application-injected port for "dispatch a run to *some* execution" (§7.4).
 * `desktop` wires the in-process `@hyperidle/session-lifecycle` implementation;
 * `remote-server` wires a WS client to `remote-worker` (Increment 5). Today
 * (pre-Increment-5) `packages/server`'s composition root wires the one real
 * implementation.
 */
export interface HarnessPort<TDb = unknown> {
	admitSession(
		deps: HarnessPortDeps<TDb>,
		bundle: RunContextBundle,
		enforceResolvedModelGuard?: boolean,
	): Promise<AdmittedRun>;
	runSession(
		deps: HarnessPortDeps<TDb>,
		bundle: RunContextBundle,
		admitted: AdmittedRun,
		onHarnessStarted?: () => void,
	): Promise<HarnessRunOutput>;
}
