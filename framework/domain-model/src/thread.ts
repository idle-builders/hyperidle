/**
 * Thread primitive — stub types and predicates.
 *
 * This file is the TDD red-phase stub. It exposes the type signatures the
 * L1 plan §4 promises so tests in this package and downstream packages
 * type-check. Every runtime export throws "Not implemented" so the test
 * runner shows red until the green phase fills the bodies in.
 *
 * @lore L1 step-1 (write-tests): the stub is intentionally throwing — it
 * exists ONLY so test files compile against the contract. Step 2
 * (write-code) replaces every body with the real implementation per
 * `plans/L1/architecture.md` §4.
 */

import type { BlockHostKind, BlockId } from "./blocks/types.js";

// ── Closed enums ────────────────────────────────────────────────

export const HOST_KINDS = [
	"bet",
	"task",
	"knowledge_item",
	"artifact",
	"agent",
	"user",
	"team",
	"factory",
] as const;
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

// The 5 ArtifactView renderer shapes (per docs/process-layer/artifact-primitive.md).
// Distinct from the L3 Artifact primitive's `kind` (function-agnostic type
// label). These describe HOW a review-message embed renders its preview;
// they are a sub-vocabulary inside the L3 review_message_embed layout, not
// the primitive itself. See HUMAN_INTERFACE_LAYER.md §4.7.
export const ARTIFACT_VIEW_SHAPES = [
	"text_diff",
	"content_preview",
	"visual_comparison",
	"action_summary",
	"data_metrics",
] as const;
export type ArtifactViewShape = (typeof ARTIFACT_VIEW_SHAPES)[number];

// ── Identity ────────────────────────────────────────────────────

// L1 plan §4 ⚠️ flag: keep ids as plain strings for the stub. Branding is
// opt-in and may be added in the green phase if it does not collide with
// Drizzle row inference at the boundary.
export type ThreadId = string;
export type MessageId = string;
export type IdentityId = string;

// ── Thread row ──────────────────────────────────────────────────

export interface Thread {
	readonly id: ThreadId;
	readonly hostKind: HostKind;
	readonly hostId: string;
	readonly initiatorId: IdentityId;
	readonly participants: ReadonlyArray<IdentityId>;
	readonly pinned: boolean;
	readonly resolvedAt: string | null;
	readonly lastActiveAt: string;
	readonly createdAt: string;
}

export interface AnchorRef {
	readonly artifactId: string;
	readonly blockId: BlockId;
	readonly spotLabel?: string;
}

// ── Message payloads (discriminated union) ──────────────────────

/**
 * T4: InlineRef is a discriminated union of EntityRef and BlockRef.
 * The discriminant is `kind` — entity refs use 5 entity kinds; block refs use "block".
 *
 * @lore T4: InlineRef was previously a flat interface (kind + id). Refactored to
 * discriminated union so block refs can carry the full (blockId, hostKind, hostId)
 * triple without optional fields on the entity path. Narrowing on `ref.kind !== "block"`
 * gives you an EntityRef with `id`; narrowing on `ref.kind === "block"` gives BlockRef.
 *
 * @lore AE5: InlineRef widened from 2 to 3 variants — MentionRef added as the 7th kind.
 * Any exhaustive switch on InlineRefKind must add a "mention" case. Known switch sites:
 * renderRefEmbedsForConversations (Conversations.tsx filters by kind, no switch needed),
 * CommentRow (uses segmentMentions to locate mention spans inline).
 */
export type InlineRefKind =
	| "knowledge_item"
	| "task"
	| "artifact"
	| "bet"
	| "message"
	| "block"
	| "mention";

export interface EntityRef {
	readonly kind: "knowledge_item" | "task" | "artifact" | "bet" | "message";
	readonly id: string;
}

export interface BlockRef {
	readonly kind: "block";
	readonly blockId: string;
	readonly hostKind: BlockHostKind;
	readonly hostId: string;
}

/**
 * AE5: MentionRef — inline attention-routing element in a PlainPayload message.
 * Resolves to an IdentityId; stores displayName for render-time use without lookup.
 * sourceText preserves the original @name token as written (round-trip fidelity).
 *
 * @lore AE5 (CRITICAL from arch-critique): sourceText is required on MentionRef.
 * Without it, segmentMentions cannot locate the exact spans to highlight — matching
 * by "@{displayName}" alone fails when the user typed a different casing or partial
 * name that still resolved to the same identity.
 */
export interface MentionRef {
	readonly kind: "mention";
	readonly identityId: IdentityId;
	readonly displayName: string;
	readonly sourceText: string;
}

export type InlineRef = EntityRef | BlockRef | MentionRef;

export interface ArtifactRef {
	readonly id: string;
	readonly kind: ArtifactViewShape;
}

/**
 * AD8b: ToolCallSummary — metadata for a single tool invocation by the assistant.
 * Stored on the plain message payload. Rendered as tinted rows in AssistantOverlay.
 */
export interface ToolCallSummary {
	readonly name: string;
	readonly input: Record<string, unknown>;
	readonly output: string;
	readonly status: "ok" | "error";
}

/**
 * AH3: Assistant notice discriminator. Extends PlainPayload with an optional
 * field so error/guidance messages share the same message type as normal chat
 * but render with special styling keyed on notice.kind.
 *
 * @lore AH3 §design-it-twice §B: New `assistant_notice` MessageType was rejected
 * because it would touch the message zod schema, all renderers, and the AF4
 * payload-drift lore — wide blast radius for three notice states. Optional field
 * on PlainPayload keeps the blast radius minimal; the overlay branches on
 * `payload.notice?.kind`.
 */
export interface AssistantNotice {
	readonly kind: "missing_key" | "missing_harness" | "provider_error";
	/** Non-sensitive provider code (e.g. "rate_limited"). Allowlisted — never raw error.message. */
	readonly code?: string;
}

export interface PlainPayload {
	readonly text: string;
	readonly refs?: ReadonlyArray<InlineRef>;
	/**
	 * AD8b: Optional tool-call metadata attached by the assistant session.
	 * Low/medium-risk actions include their results here; high-risk actions
	 * instead post a review message (not a plain message with toolCalls).
	 */
	readonly toolCalls?: ReadonlyArray<ToolCallSummary>;
	/**
	 * AH3: Optional notice discriminator for assistant error/guidance messages.
	 * When present, the overlay renders the message as a guidance card with an
	 * action affordance instead of a normal chat bubble.
	 *
	 * @lore AH3: notice is always absent on normal assistant replies. Its presence
	 * is the signal to switch from chat rendering to error-state rendering.
	 */
	readonly notice?: AssistantNotice;
}

export interface ReviewPayload {
	readonly title: string;
	readonly reasoning: ReadonlyArray<string>;
	readonly artifactRef: ArtifactRef;
}

export interface QuestionnairePayload {
	readonly title: string;
	readonly question: string;
	readonly options: ReadonlyArray<string>;
}

export interface VerdictPayload {
	readonly decision: VerdictDecision;
	readonly resolvesMessageId: MessageId;
	readonly note?: string;
}

export interface RedactedPayload {
	readonly redacted: true;
	readonly redactedBy: IdentityId;
	readonly redactedAt: string;
	readonly reason: string;
}

interface BaseMessage {
	readonly id: MessageId;
	readonly threadId: ThreadId;
	readonly senderId: IdentityId;
	readonly clientKey: string;
	readonly deletedAt: string | null;
	readonly redactedAt: string | null;
	readonly resolvedAt: string | null;
	readonly createdAt: string;
}

export type Message =
	| (BaseMessage & {
			readonly type: "plain";
			readonly payload: PlainPayload | RedactedPayload;
	  })
	| (BaseMessage & {
			readonly type: "review";
			readonly payload: ReviewPayload | RedactedPayload;
	  })
	| (BaseMessage & {
			readonly type: "questionnaire";
			readonly payload: QuestionnairePayload | RedactedPayload;
	  })
	| (BaseMessage & {
			readonly type: "verdict";
			readonly payload: VerdictPayload | RedactedPayload;
	  });

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
 * Plan §4 + approved.md §8 hard-rule 1: head mounts iff there exists a
 * message of type 'review' or 'questionnaire' whose resolvedAt is null AND
 * that message is the most recent of its kind in the thread.
 *
 * Pure: messages must be sorted by (createdAt, id) ascending. Returns the
 * id of the most-recent unresolved review/questionnaire by ordering, or
 * null when the head should collapse to chat-shape.
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
 * Concept §4.5.5: a thread is blocking iff the agent participating in the
 * thread cannot continue to work without an answer. Plan §4 derivation:
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

// ── Promotion rule (L11) ────────────────────────────────────────

/**
 * Approved.md §3 — promotion rule. Pure derivation over a thread's
 * messages. Returns the id of the SINGLE rich message that should
 * render as a card, or null when the thread has no candidate.
 *
 * @lore L11 plan §6.2 (CONFUSION-A resolution): the helper is a
 * one-arg pure function — sessionState was dropped. "Oldest unresolved
 * review or questionnaire wins". Blocking only lifts the danger
 * left-border, it does not gate promotion.
 *
 * @lore L11: oldest-first is the deterministic anchor — the FIFO of
 * pending decisions. Two simultaneous reviews resolve in arrival order;
 * the user can never lose track of which one came first.
 */
export function promotedRichMessageId(messages: ReadonlyArray<Message>): MessageId | null {
	let bestId: MessageId | null = null;
	let bestCreatedAt: string | null = null;
	for (const m of messages) {
		if (m.type !== "review" && m.type !== "questionnaire") continue;
		if (m.resolvedAt !== null) continue;
		if (bestCreatedAt === null || m.createdAt < bestCreatedAt) {
			bestCreatedAt = m.createdAt;
			bestId = m.id;
		}
	}
	return bestId;
}

// ── Verdict vocabulary (display mapping) ────────────────────────

/**
 * Single source of truth for the verdict label vocabulary used by
 * RichMessageCard, CommentRow, and any other consumer that needs the
 * uppercase label form. Mapping: approve / approve-with-comments →
 * APPROVED; reject → REJECTED; request-changes → CHANGES REQUESTED;
 * edit → EDITED.
 *
 * @lore L11 step9 (S6): previously duplicated byte-identical in
 * RichMessageCard.tsx and CommentRow.tsx. Lifted here so adding a 6th
 * VerdictDecision triggers exactly one TypeScript narrowing failure.
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
 * Map a verdict decision to a `Status` chip token. Pairs with
 * `verdictDecisionLabel` — same source-of-truth concern.
 */
export function verdictDecisionToStatus(
	decision: VerdictDecision,
): "done" | "blocked" | "behind" | "paused" {
	switch (decision) {
		case "approve":
		case "approve-with-comments":
			return "done";
		case "reject":
			return "blocked";
		case "request-changes":
			return "behind";
		case "edit":
			return "paused";
	}
}

// ── Zod schemas (boundary validation) ───────────────────────────

// The Zod schemas live in `packages/server/src/routes/threads-schema.ts`.
// `@hyperidle/domain-model` stays free of the runtime `zod` dependency on the
// type-only path.

// ── L18: Artifact thread summary types ──────────────────────────

// @lore AE6: ArtifactKind import removed — artifactKind widened to string
// (open vocabulary: registered 6 fundamental kinds + unregistered kinds pass through).

/**
 * Per-artifact thread summary row returned by
 * `GET /api/bets/:id/artifact-thread-summary`.
 *
 * @lore L18: threadId is null when no thread exists for the artifact yet
 * (i.e. the artifact appears in the bet but has never had a message posted).
 * messageCount=0 means "exists but empty" (rare; never rendered in the summary
 * list because the endpoint filters to messageCount >= 1).
 */
export interface ArtifactThreadSummary {
	artifactId: string;
	/** @lore AE6: Widened from ArtifactKind (closed 13-member union) to string (open vocabulary). */
	artifactKind: string;
	/** Derived display label per artifactDisplayTitle() rules. */
	artifactTitle: string;
	/** Null when no thread exists yet for this artifact. */
	threadId: string | null;
	/** Count of messages in the artifact's thread (0 when no messages). */
	messageCount: number;
	/** ISO8601 timestamp of last message, null when no messages. */
	lastMessageAt: string | null;
	/** First ~80 chars of the last plain-message payload, null when no messages. */
	lastMessageSnippet: string | null;
	/** True when the thread has an unresolved review message. */
	hasUnresolvedReview: boolean;
}

/**
 * Response envelope for `GET /api/bets/:id/artifact-thread-summary`.
 * Server enforces a cap of 10 summaries; truncated=true when more exist.
 */
export interface ArtifactThreadSummaryResponse {
	summaries: ArtifactThreadSummary[];
	/** Total count of artifacts with at least one thread message (unbounded). */
	totalCount: number;
	/** True when totalCount > 10 (server-enforced cap). */
	truncated: boolean;
}

/**
 * L18: Extended plain payload that includes an optional blockId for
 * block-anchored discussions. blockId is opaque to the server — just a
 * string referencing a Block primitive id from the host surface.
 */
export interface PlainPayloadWithBlockId {
	readonly text: string;
	readonly refs?: ReadonlyArray<InlineRef>;
	/** L18: Optional block anchor — the id of the Block this message is anchored to. */
	readonly blockId?: string;
	/** AL4: Optional human-readable sub-block label (line/paragraph/region); opaque to the server. */
	readonly spotLabel?: string;
}
