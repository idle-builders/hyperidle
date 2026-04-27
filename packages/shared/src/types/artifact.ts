/**
 * L9 — Artifact-kind type contracts.
 *
 * Defines the four L9 review-item kinds and their per-kind payload shapes,
 * the extended metadata strip carried by every kind, and the supporting
 * unions (`SandboxResult`, `BlastRadius`).
 *
 * @lore L9: `ArtifactKind` is a different axis from J4's renderer `shape`.
 * `kind` describes the *semantic role* of a review item (deploy, skill change,
 * file lease, permission request); `shape` describes the *visual layout*
 * (text-diff, content-preview, etc.). They are orthogonal and dispatched
 * by separate components — see `packages/web/src/components/artifacts/
 * ArtifactKindRenderer.tsx` vs `packages/web/src/shell/ArtifactView.tsx`.
 */

import type { RiskTier } from "../types.js";
import type { AutonomyLevel } from "./autonomy.js";

export const ARTIFACT_KINDS = [
	"action_summary",
	"skill_change",
	"file_lease",
	"permission_request",
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const SANDBOX_RESULTS = ["passed", "failed", "n/a"] as const;
export type SandboxResult = (typeof SANDBOX_RESULTS)[number];

/**
 * Render-only blast-radius descriptor stored inside `items.attachments`
 * JSON under the `blast_radius` key. The L9 metadata strip surfaces it
 * implicitly via the risk-tier badge; the editable surface is deferred
 * (see plan §8 item 5).
 */
export interface BlastRadius {
	agents: string[];
	teams: string[];
	products: string[];
}

/**
 * Extended artifact metadata strip — the sole contract every L9 renderer
 * passes to <ArtifactShell>. Merges the J4 strip fields (status / sla /
 * routing) with the five new L9 fields.
 */
export interface ArtifactMetadataExtended {
	kind: ArtifactKind;
	riskTier: RiskTier;
	reversibility: boolean;
	costEstimate: number | null;
	blastRadius: BlastRadius;
	sandboxResult: SandboxResult | null;
	status: string;
	sla: string;
	routing: string;
}

/** ActionSummary — deploy / pricing / email blast, with explicit type-to-confirm. */
export interface ActionSummaryPayload {
	actionType: "deploy" | "pricing" | "email_blast";
	summary: string;
	impactList: Array<{ label: string; value: string }>;
	/** Token the user must type into the confirm input to enable Approve. */
	confirmToken: string;
}

/** SkillChange — diff + per-agent impact + rollout policy gate. */
export interface SkillChangePayload {
	skillId: string;
	diff: { before: string; after: string };
	agentImpacts: Array<{ agentName: string; behaviorChange: string }>;
	/** Required before approve commits. Null = not yet selected. */
	rolloutPolicy: { mode: "pin_version" | "rollback_window"; value: string } | null;
}

/** FileLease — collision resolution with side-by-side competing artifacts. */
export interface FileLeasePayload {
	filePath: string;
	agentA: { name: string; artifactSnippet: string };
	agentB: { name: string; artifactSnippet: string };
}

/** PermissionRequest — agent asks to raise its autonomy on a skill. */
export interface PermissionRequestPayload {
	requesterAgentId: string;
	requesterAgentName: string;
	skillId: string;
	currentLevel: AutonomyLevel;
	requestedLevel: AutonomyLevel;
	justification: string;
}

/**
 * L9: render-only override labels for the three primary verdicts
 * (approve / request-changes / reject). Used by FileLeaseView,
 * PermissionRequestView, and ReviewHeader. The underlying VerdictAction
 * emitted on click is unchanged — only the visible button label and
 * accessible name change.
 */
export interface VerdictVariants {
	approve: string;
	requestChanges: string;
	reject: string;
}

/**
 * L9 review (sec CRIT-1 + adv C4): when an L9 kind drives a verdict, the
 * wire payload distinguishes the variant from a generic approve so future
 * server-side enforcement (one-shot grant, lease-grant scope) can land
 * without breaking the contract. Today the server records the fields for
 * audit; enforcement is deferred — see TODO/lore in
 * `packages/server/src/routes/conversations.ts`.
 */
export interface L9VerdictExtras {
	/**
	 * permission_request: when the founder clicked the "Approve once"
	 * variant, this is `true`. A regular Approve (without an L9 variant)
	 * leaves it `null`.
	 */
	oneShot?: boolean | null;
	/**
	 * file_lease: which competing agent received the lease. `'a'` when
	 * approve was clicked (Grant lease to A), `'b'` when reject was
	 * clicked (Grant lease to B), `null` for the request-changes variant
	 * ("Ask both to coordinate").
	 */
	leaseGrantedTo?: "a" | "b" | null;
}
