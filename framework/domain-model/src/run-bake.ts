/**
 * What a run is started from: the agent's runnable config, the context bundle, and what a resume
 * carries back. The runner builds these from what it reads through the door.
 */

import type { DoneWhenLine, Reason } from "./actions/task.js";
import type { ChangeRow } from "./actions/user.js";

/**
 * The target agent's admission-relevant configuration, baked when the inbox row is written from
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
 * Map an already-loaded `agent: User` row (or any object structurally
 * satisfying `BakedAgentRunnableConfig`'s fields — duck-typed so callers carry
 * zero `@hyperidle/db` dependency, same idiom as `SessionDocumentLike`) onto the
 * exact whitelisted `BakedAgentRunnableConfig` shape. A deliberate whitelist
 * pick, not a spread — `User` carries other columns (name, avatar, credentials,
 * etc.) that must never ride onto the baked `AgentSessionRequest.payloadJson`.
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
 * `assembleSessionDocuments`. Callers type their injected dependency here so
 * they need no direct import of `@hyperidle/document`.
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
 * one shared mapper so each run-bake path doesn't reimplement the same field-pick.
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
			/** The subscriber's team, or null for a factory-wide agent. */
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
 * What the person said back to the agent's review or question — the part of a
 * resume the agent reads.
 */
export interface SessionResumeReply {
	/** Approve or decline a review, or answer a question. A decline resumes too, carrying the reason back. */
	readonly decision: "approve" | "decline" | "answer";
	/** The person's words with a verdict. On a decline, why. */
	readonly note?: string;
	/** On an answer: the option the person picked, or their own words. */
	readonly answer?: { readonly option: string } | { readonly text: string };
}

/**
 * What a resume needs, baked when the verdict or answer is recorded.
 *
 */
export interface BakedSessionResumeRequest extends SessionResumeReply {
	/** The HyperIdle session to bring back. */
	readonly sessionId: string;
	/**
	 * The harness's own id for that session. Absent when the harness never
	 * reported one, which means the session cannot be resumed — the drain surfaces
	 * that to the human rather than silently doing nothing.
	 */
	readonly harnessSessionId?: string | null;
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
	 * like every other run-bake variant — `admitSession` treats an absent bake as a
	 * deactivated agent and refuses the run.
	 */
	readonly agentConfig?: BakedAgentRunnableConfig;
	/** The task the review belongs to; the resumed session carries it, so its ending can close the task. */
	readonly taskId?: string;
}
