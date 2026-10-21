/**
 * Cross-layer seam: `agent_work_intents` is owned by the `agent-orchestration`
 * layer's `session-requests` service; a core-api route must not import it
 * directly — the composition root injects the concrete recorder/reader.
 *
 * `@hyperidle/work-intent-port` has zero `@hyperidle/db` dependency (leaf
 * package); the composition root instantiates with its own `HyperIdleDb` and
 * assigns `enqueueWorkIntent` unchanged — no adapter needed (structural superset).
 */

import type { DoneWhenLine, Reason } from "./actions/task.js";
import type { ChangeRow } from "./actions/user.js";
import type { AgentSessionSourceCorrelation, AgentSessionSourceKind } from "./session-request.js";

/**
 * The emit-time-resolved request a per-kind core-api resolver produces. Carried
 * on the `AgentWorkIntentRecorder` payload so the drain dispatches directly with
 * ZERO domain reads.
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
	/**
	 * The `assistant_turn` family's baked thread transcript.
	 * Absent for every other kind — `task_run`/`subscription_run` bake a `contextBundle` instead.
	 */
	readonly transcript?: ReadonlyArray<{
		readonly senderId: string;
		readonly payload: string;
		readonly type: string;
	}>;
	/**
	 * The `task_run`/`subscription_run` families' baked entity content plus ranked+budgeted
	 * documents, assembled at emit time so `run-orchestration` makes zero domain reads at
	 * session-launch time. Absent for `assistant_turn` (bakes `transcript` instead).
	 */
	readonly contextBundle?: BakedContextBundle;
	/**
	 * The target agent's runnable-config snapshot, baked at emit time by every per-kind
	 * resolver from the same `agent: User` row `requireRunnableAgent` loaded and validated.
	 * The runnability gate is never dropped, only its data source changes.
	 */
	readonly agentConfig?: BakedAgentRunnableConfig;
	/**
	 */
	/**
	 * Calling thread id, baked at emit time by resolvers that have a real thread host.
	 * `subscription_run` bakes none; its `reply` falls back to a direct thread with the sole human user.
	 * Carried on `AgentSessionRequest.payloadJson` so `reply` has somewhere to post with zero orchestration → core read.
	 */
	readonly callingThreadId?: string;
}

/**
 * The target agent's admission-relevant configuration, baked at emit time from
 * the same `agent: User` row `requireRunnableAgent` loads. Carries runnability
 * predicate (`kind`/`status`), `role` for prompt assembly, and home `teamId`.
 *
 */
export interface BakedAgentRunnableConfig {
	readonly kind: string;
	readonly status: string;
	readonly role: string;
	readonly teamId: string | null;
	/**
	 * The agent's identity — the body of the `agent_file` document
	 * bound to it, which becomes the "## Identity" section of the AGENTS.md its
	 * session reads.
	 *
	 * Baked here rather than read at provisioning time because it lives in
	 * `documents`, which belongs to the document service; the provisioner
	 * reads `agent_run_config`, which is orchestration's own. Every path bakes
	 * this config, including the assistant turn, which bakes no context bundle —
	 * so this is the one carrier that reaches all of them.
	 */
	readonly persona?: string | null;
}

/**
 * Map a resolver's already-loaded `agent: User` row (or any object structurally
 * satisfying `BakedAgentRunnableConfig`'s fields — `@hyperidle/work-intent-port` has zero
 * `@hyperidle/db` dependency, so this stays duck-typed, same idiom as
 * `SessionDocumentLike`) onto the exact whitelisted `BakedAgentRunnableConfig`
 * shape. A deliberate whitelist pick, not a spread — `User` carries other
 * columns (name, avatar, credentials, etc.) that must never ride onto the
 * baked `AgentSessionRequest.payloadJson`.
 */
export function bakeAgentRunnableConfig(
	agent: BakedAgentRunnableConfig,
	persona?: string | null,
): BakedAgentRunnableConfig {
	return {
		kind: agent.kind,
		status: agent.status,
		role: agent.role,
		teamId: agent.teamId,
		...(persona ? { persona } : {}),
	};
}

export interface BakedDocumentAncestor {
	readonly id: string;
	readonly title: string;
	readonly scopeKind: string;
	readonly version: number;
}

/** One ranked+budgeted document as baked onto a `BakedContextBundle`. */
export interface BakedContextDocument {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly format: string;
	readonly version: number;
	/**
	 */
	readonly parentChain: readonly BakedDocumentAncestor[];
	readonly scopeKind: string;
	/**
	 * Slot determines how context assembly materialises this item. Defaults to 'ordinary'.
	 * - ordinary: knowledge/... files
	 * - skill: .claude/skills/<title>/SKILL.md
	 * - rule: knowledge/rules/<title>
	 * - agent_file: AGENTS.md/CLAUDE.md, bound to the agent named by the parent slot
	 * - prompt: the run's instruction — never materialised as a sandbox file
	 */
	readonly slot: string;
	/** For slot='agent_file': the agentId the file is bound to; only that agent's session receives it. Derived from parentKind/parentId, not scopeId. */
	readonly agentBindingId: string | null;
}

/**
 * Duck-typed shape of `SessionDocument` from `@hyperidle/document`'s
 * `assembleSessionDocuments`. Per-kind resolvers type their injected dependency
 * here so they need no direct import of `@hyperidle/document`.
 *
 * @lore: parentChain and scopeKind REQUIRED — ?? [] causes flat placement; missing scopeKind routes to wrong scope; callers must resolve via resolveParentChain
 */
export interface SessionDocumentLike {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly format: string;
	readonly version: number;
	/** See `BakedContextDocument.parentChain` — required, not optional; a silent fallback causes flat placement. */
	readonly parentChain: readonly BakedDocumentAncestor[];
	/** See `BakedContextDocument.scopeKind` — required for manifest entries. */
	readonly scopeKind: string;
	/** Kernel table column, NOT NULL DEFAULT 'ordinary'. Required; every DB row carries a non-null slot. */
	readonly slot: string;
	/** Kernel table columns, nullable. `toBakedContextDocuments` derives agentBindingId: `parentKind === "agent"` means `parentId` names the bound agent. */
	readonly parentKind: string | null;
	readonly parentId: string | null;
}

/**
 * Map `assembleSessionDocuments`'s ranked+budgeted output onto the
 * `BakedContextDocument[]` shape every `contextBundle` variant carries —
 * one shared mapper so `task-run-resolver.ts`/the subscription-wake resolver
 * doesn't reimplement the same field-pick.
 */
export function toBakedContextDocuments(
	items: readonly SessionDocumentLike[],
): readonly BakedContextDocument[] {
	return items.map((item) => ({
		id: item.id,
		title: item.title,
		body: item.body,
		format: item.format,
		version: item.version,
		parentChain: item.parentChain,
		scopeKind: item.scopeKind,
		slot: item.slot,
		// binding is the parent, not the scope — always derived from parentKind/parentId, never set explicitly; null means UNBOUND (delivered to every session in reach)
		agentBindingId: item.parentKind === "agent" ? item.parentId : null,
	}));
}

/**
 * The baked entity content a
 * `task_run` session needs (`kind:"task"`, matching
 * `context.ts`'s `SessionContextData`), a `subscription_run` session needs
 * (`kind:"subscription"`, matching `SubscriptionSessionContextData`), or a
 * flagged-item review needs (`kind:"knowledge"` — the flagged item itself,
 * since a review turn has no task or subscription), plus the shared
 * ranked+budgeted `documents` bundle every variant carries.
 */
export type BakedContextBundle =
	| {
			readonly kind: "task";
			readonly task: {
				readonly id: string;
				readonly title: string;
				readonly description: string | null;
				readonly state: string;
				readonly doneWhen: readonly DoneWhenLine[];
				readonly reasons: readonly Reason[];
			};
			/** Containing work, root first, down to the immediate parent. Empty for a root task. */
			readonly ancestors: readonly {
				readonly id: string;
				readonly title: string;
				readonly description: string | null;
				readonly doneWhen: readonly DoneWhenLine[];
			}[];
			readonly agent: { readonly id: string; readonly name: string; readonly role: string };
			readonly team: { readonly id: string; readonly name: string };
			readonly documents: readonly BakedContextDocument[];
	  }
	| {
			/** A subscription's wake. `change` is the row that fired an event subscription, absent for a schedule tick. */
			readonly kind: "subscription";
			readonly subscription: {
				readonly id: string;
				readonly event: string | null;
				readonly schedule: string | null;
			};
			/** The subscription's own instruction — the `prompt` document's body, or null when it carries none. */
			readonly prompt: string | null;
			/** The change that woke this subscription, or null for a schedule tick. */
			readonly change: ChangeRow | null;
			readonly agent: { readonly id: string; readonly name: string; readonly role: string };
			/** The subscriber's effective team, or null for a factory-wide agent. */
			readonly team: { readonly id: string; readonly name: string } | null;
			readonly documents: readonly BakedContextDocument[];
	  }
	| {
			readonly kind: "knowledge";
			readonly item: {
				readonly id: string;
				readonly title: string;
				readonly body: string;
				readonly format: string;
				readonly version: number;
			};
			readonly agent: { readonly id: string; readonly name: string; readonly role: string };
			readonly documents: readonly BakedContextDocument[];
	  };

/**
 * The one discriminated union every emitter of an `agent_work_intents` row
 * imports — matching `agent_work_intents_kind_ck` +
 * `agent_work_intents_kind_source_compat_ck` (`framework/db/src/schema.ts`)
 * exactly. See `AGENT_WORK_INTENT_KINDS` below for the runtime-checkable kind
 * list this union's discriminant is built from.
 */
export type AgentWorkIntentRecorderInput =
	| {
			readonly kind: "thread_turn";
			readonly sourceKind: "thread_message";
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			/** See `BakedWorkIntentRequest`. Populated at emit time by the `thread` module's wake rule. */
			readonly bakedRequest?: BakedWorkIntentRequest;
	  }
	| {
			readonly kind: "task_run";
			readonly sourceKind: "task_dispatch_attempt";
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			/** See `BakedWorkIntentRequest`. Populated at emit time by `task-run-resolver.ts`. */
			readonly bakedRequest?: BakedWorkIntentRequest;
	  }
	| {
			/** Does NOT start a session — no agent to resolve, no context to assemble, no prompt. Everything a resume needs is the session to return to and what to tell it. */
			readonly kind: "session_resume";
			readonly sourceKind: "review_verdict";
			/** The review message the human decided on. */
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			readonly resume: BakedSessionResumeRequest;
	  }
	| {
			/**
			 * A subscription's wake. `sourceKind` is `"subscription"`, not
			 * `"subscription_run"` — matching `agent_work_intents_kind_source_
			 * compat_ck`'s pairing exactly.
			 */
			readonly kind: "subscription_run";
			readonly sourceKind: "subscription";
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			/** See `BakedWorkIntentRequest`. Populated at emit time by the user module's subscription fire. */
			readonly bakedRequest?: BakedWorkIntentRequest;
	  };

/**
 * The canonical runtime-checkable list `AgentWorkIntentRecorderInput`'s `kind`
 * discriminant is built from — kept in lockstep with `agent_work_intents_kind_ck`
 * (`framework/db/src/schema.ts`) so a kind-set drift test can derive its
 * accept-list mechanically from this single source.
 *
 */
export const AGENT_WORK_INTENT_KINDS = [
	"thread_turn",
	"task_run",
	"session_resume",
	"subscription_run",
] as const;

export type AgentWorkIntentKind = (typeof AGENT_WORK_INTENT_KINDS)[number];

/**
 * What a resume needs, baked when the verdict is recorded.
 *
 */
export interface BakedSessionResumeRequest {
	/** The HyperIdle session to bring back. */
	readonly sessionId: string;
	/**
	 * The harness's own id for that session. Absent when the harness never
	 * reported one, which means the session cannot be resumed — the drain surfaces
	 * that to the human rather than silently doing nothing.
	 */
	readonly harnessSessionId?: string | null;
	/** What the human decided. A decline resumes too, carrying the reasoning back. */
	readonly decision: "approve" | "decline";
	/**
	 * The working directory the original session ran in.
	 */
	readonly sandboxPath?: string | null;
	/** The thread the review lives in, where a failure has to be reported. */
	readonly threadId: string;
	/** The agent whose session this is. */
	readonly agentId: string;
	/**
	 * The asking agent's runnable-config snapshot. Baked when the human decides,
	 * like every other intent kind — `admitSession` treats an absent bake as a
	 * deactivated agent and refuses the run.
	 */
	readonly agentConfig?: BakedAgentRunnableConfig;
}

/**
 * Function type for recording work intents. Seam calls never join a caller's
 * transaction — this is a plain async function, not a transactional interface.
 */
export type AgentWorkIntentRecorderFn = (
	input: AgentWorkIntentRecorderInput,
) => Promise<{ readonly id: string; readonly idempotencyKey: string }>;

/**
 * What happened when a verdict tried to send an agent back to its work.
 *
 */
export type ReviewVerdictOutcome =
	/** The resume is queued. The agent will be brought back. */
	| { readonly status: "queued" }
	/** No session filed this review. Nothing to resume, and nothing wrong. */
	| { readonly status: "not_a_review_session" }
	/** A session filed it but cannot be brought back. The human has to be told. */
	| { readonly status: "not_resumable"; readonly reason: string };

/**
 * Records a human's verdict on a review an agent filed, and queues the resume
 * that carries it back to the agent.
 *
 * Injected into the core-api thread route the same way `AgentWorkIntentRecorderFn`
 * is, and for the same reason: `review_sessions` belongs to the agent-orchestration
 * layer, and a core-api route may not read it.
 */
export type ReviewVerdictRecorderFn = (input: {
	/** The review message the verdict resolved. */
	readonly reviewMessageId: string;
	readonly decision: "approve" | "decline";
	/** The human who decided. */
	readonly decidedBy: string;
	/** The thread the review lives in — where a failure has to be reported. */
	readonly threadId: string;
	/** The asking agent's runnable-config snapshot, baked by the caller (core state). */
	readonly agentConfig?: BakedAgentRunnableConfig;
}) => Promise<ReviewVerdictOutcome>;
