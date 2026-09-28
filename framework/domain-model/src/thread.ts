import type { Message, Thread } from "./actions/thread.js";

export type BlockId = string & { readonly __brand: "BlockId" };
export type BlockHostKind = "task" | "document" | "agent" | "user";

// ── Closed enums ────────────────────────────────────────────────

export const HOST_KINDS = ["document", "agent", "user", "team", "factory"] as const;
export type HostKind = (typeof HOST_KINDS)[number];

export const MESSAGE_TYPES = ["plain", "review", "questionnaire", "verdict"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const VERDICT_DECISIONS = [
	"approve",
	"approve-with-comments",
	"request-changes",
	"edit",
	"reject",
] as const;
export type VerdictDecision = (typeof VERDICT_DECISIONS)[number];

export const REVIEW_CANVAS_KINDS = [
	"outcome_summary",
	"field_change_set",
	"action_operation",
	"rendered_in_context",
	"metrics_moved",
	"visual_diff",
	"code_diff",
	"batch",
	"browser_preview",
] as const;
export type ReviewCanvasKind = (typeof REVIEW_CANVAS_KINDS)[number];

/**
 * The canvas-envelope shape `submit_review`'s `artifacts` field validates —
 * `payload` stays `unknown` on the wire (opaque-payload trade; each
 * canvas's own type guard is the only reader that trusts its shape).
 */
export interface ReviewCanvasArtifact {
	readonly id: string;
	readonly tool: string;
	readonly app: string;
	readonly sourceHref: string;
	readonly title: string;
	readonly kind: ReviewCanvasKind;
	readonly payload: unknown;
}

// ── Identity ────────────────────────────────────────────────────

export type ThreadId = string;
export type MessageId = string;
export type IdentityId = string;

// ── Thread row ──────────────────────────────────────────────────

export interface AnchorRef {
	readonly artifactId: string;
	readonly blockId: BlockId;
	readonly spotLabel?: string;
}

// ── Message payloads (discriminated union) ──────────────────────

/**
 * Derived from the union rather than restated — a hand-written list drifts when a member is added or removed.
 *
 * @lore: InlineRef — exhaustive switch must include "mention" and "artifact" cases; "artifact" is a ReviewCanvasArtifact id, NOT an artifacts-table id
 */
export type InlineRefKind = InlineRef["kind"];

export interface EntityRef {
	readonly kind: "document" | "task" | "message";
	readonly id: string;
}

/**
 * Review canvas anchor ref — points to a ReviewCanvasArtifact (inside a review
 * message payload) by id. The kind "artifact" is kept on the wire so ReviewPage's
 * `isArtifactEntityRef` guard can identify the anchor without modification.
 *
 * The artifactId here is
 * the id field of a ReviewCanvasArtifact from a review message's `artifacts` array.
 */
export interface CanvasArtifactRef {
	readonly kind: "artifact";
	readonly id: string;
}

/**
 * MentionRef — inline attention-routing element in a PlainPayload message.
 * Resolves to an IdentityId; stores displayName for render-time use without lookup.
 * sourceText preserves the original @name token as written (round-trip fidelity).
 *
 */
export interface MentionRef {
	readonly kind: "mention";
	readonly identityId: IdentityId;
	readonly displayName: string;
	readonly sourceText: string;
}

export type InlineRef = EntityRef | MentionRef | CanvasArtifactRef;

/**
 * Assistant notice discriminator. Extends PlainPayload with an optional
 * field so error/guidance messages share the same message type as normal chat
 * but render with special styling keyed on notice.kind.
 *
 */
export interface AssistantNotice {
	readonly kind: "missing_harness" | "provider_error";
	/** Non-sensitive provider code (e.g. "rate_limited"). Allowlisted — never raw error.message. */
	readonly code?: string;
}

export interface RedactedPayload {
	readonly redacted: true;
	readonly redactedBy: IdentityId;
	readonly redactedAt: string;
	readonly reason: string;
}

// ── Payload narrowing helper ─────────────────────────────────────

/**
 * Type guard separating the redacted-payload variant from the type-specific
 * payload variants (PlainPayload | ReviewPayload | QuestionnairePayload |
 * VerdictPayload). Use after narrowing on `message.type` to access the
 * type-specific payload without unsafe `as` casts.
 */
export function isRedactedPayload(payload: unknown): payload is RedactedPayload {
	return (
		typeof payload === "object" &&
		payload !== null &&
		(payload as { redacted?: unknown }).redacted === true
	);
}

// ── Predicates ──────────────────────────────────────────────────

export interface HeadCollapseResult {
	readonly headMessageId: MessageId | null;
}

/**
 * Head mounts iff there exists a message of type 'review' or 'questionnaire'
 * whose resolvedAt is null AND that message is the most recent of its kind in
 * the thread. Pure: messages must be sorted by (createdAt, id) ascending.
 * Returns the id of the most-recent unresolved review/questionnaire, or null
 * when the head should collapse to chat-shape.
 */
export function headCollapsePredicate(messages: ReadonlyArray<Message>): HeadCollapseResult {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (
			m !== undefined &&
			(m.type === "review" || m.type === "questionnaire") &&
			m.resolvedAt === null
		) {
			return { headMessageId: m.id };
		}
	}
	return { headMessageId: null };
}

export interface AgentSessionStateSnapshot {
	readonly pausedOnThreadId: ThreadId | null;
	readonly activeForThreadId: ThreadId | null;
}

/**
 * A thread is blocking iff the agent participating in the
 * thread cannot continue to work without an answer. Derivation:
 *  - With an unresolved review/questionnaire HEAD: blocking iff the agent
 *    has a session active for this thread.
 *  - Without a HEAD (plain quick-question case): blocking iff the agent
 *    has explicitly paused on this thread.
 */
export function isBlocking(
	thread: Thread,
	messages: ReadonlyArray<Message>,
	agentSessionState: AgentSessionStateSnapshot,
): boolean {
	const head = headCollapsePredicate(messages);
	if (head.headMessageId === null) {
		return agentSessionState.pausedOnThreadId === thread.id;
	}
	return agentSessionState.activeForThreadId === thread.id;
}

// ── Verdict vocabulary (display mapping) ────────────────────────

/**
 * Single source of truth for the verdict label vocabulary used by
 * RichMessageCard, CommentRow, and any other consumer that needs the
 * uppercase label form. Mapping: approve / approve-with-comments →
 * APPROVED; reject → REJECTED; request-changes → CHANGES REQUESTED;
 * edit → EDITED.
 *
 */
export function verdictDecisionLabel(decision: VerdictDecision): string {
	switch (decision) {
		case "approve":
		case "approve-with-comments":
			return "APPROVED";
		case "reject":
			return "REJECTED";
		case "request-changes":
			return "CHANGES REQUESTED";
		case "edit":
			return "EDITED";
	}
}

/**
 * Extended plain payload that includes an optional blockId for block-anchored
 * discussions. blockId is opaque to the server — references a Block primitive
 * id from the host surface.
 */
export interface PlainPayloadWithBlockId {
	readonly text: string;
	readonly refs?: ReadonlyArray<InlineRef>;
	/** Optional block anchor — the id of the Block this message is anchored to. */
	readonly blockId?: string;
	/** Optional human-readable sub-block label (line/paragraph/region); opaque to the server. */
	readonly spotLabel?: string;
}
