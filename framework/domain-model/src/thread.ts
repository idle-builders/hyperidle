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
 * (write-code) replaces every body with the real implementation.
 */

// @lore AU44-b8: BlockId and BlockHostKind were in domain-model/blocks/types.ts, which dissolved
// into layers/core-ui (batch 8). These two are wire types embedded in BlockRef/AnchorRef — domain-model
// cannot import from layers/core-ui, so they are inlined here.
// @lore BC3: type-only import of `Thread`/`Message` from `actions/thread.ts`,
// which itself imports the enum vocabulary (HOST_KINDS etc.) from THIS file as
// a value. A type-only import is erased at compile time, so this is not a
// runtime import cycle.
import type { Message, Thread } from "./actions/thread.js";

export type BlockId = string & { readonly __brand: "BlockId" };
// @lore BB1: `"bet"` removed — a bet is a task with no parent, and migration
// 0068 flipped every thread whose host_kind was "bet" to "task" (the host_id was
// already correct, since each bet kept its id as a root task).
export type BlockHostKind = "task" | "document" | "agent" | "user";

// ── Closed enums ────────────────────────────────────────────────

// @lore BC3: `"task"` removed — a task's thread is `team`-hosted (architecture.md
// §3.7, §3.9); there is no thread hosted by a task any more. `BlockHostKind`
// above keeps `"task"` — a block anchor's host is not a thread's host; do not
// conflate the two vocabularies.
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

/**
 * @lore `ARTIFACT_VIEW_SHAPES`/`ArtifactViewShape` — the pre-AM5 five-value
 * vocabulary this constant used to hold — is DELETED, not migrated. It had
 * zero overlap with the six consolidated `ArtifactKind` values
 * (`@hyperidle/domain-model`'s `kinds/registry.js`) that `create_artifact`
 * actually emits, so `ArtifactRef.kind` below is respelled onto that
 * vocabulary instead.
 *
 * The nine REVIEW-CANVAS kind names (a different axis — how a review
 * renders its evidence, not what an artifact fundamentally is) live here,
 * single-homed so `@hyperidle/tool-handlers` (which cannot import core-ui)
 * and core-ui's own `ReviewCanvasKind` both derive from one source. The
 * PAYLOAD contract per kind stays owned by each canvas's own type guard in
 * core-ui — only the kind names and the envelope shape move.
 */
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

// L1 plan §4 ⚠️ flag: keep ids as plain strings for the stub. Branding is
// opt-in and may be added in the green phase if it does not collide with
// Drizzle row inference at the boundary.
export type ThreadId = string;
export type MessageId = string;
export type IdentityId = string;

// ── Thread row ──────────────────────────────────────────────────
// @lore BC3: the hand-written `Thread` interface moved to `actions/thread.ts`
// as `z.infer<typeof ThreadSchema>` — see the top-of-file `@lore` and §3.1.

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
 * @lore T4: InlineRef is a discriminated union of EntityRef, MentionRef, and
 * CanvasArtifactRef on the "kind" discriminant. Entity refs use 3 entity kinds;
 * MentionRef uses "mention"; CanvasArtifactRef uses "artifact" to name a review
 * canvas payload, NOT a deleted artifacts-table row.
 *
 * @lore AE5: MentionRef added as a third union member. Any exhaustive switch on
 * InlineRefKind must include a "mention" case. Known switch sites:
 * renderRefEmbedsForConversations (Conversations.tsx filters by kind, no switch needed),
 * CommentRow (uses segmentMentions to locate mention spans inline).
 *
 * @lore artifacts-become-knowledge: "artifact" removed from EntityRef.kind and
 * InlineRefKind (no stored artifact row exists). CanvasArtifactRef preserves
 * kind:"artifact" on the wire so ReviewPage can still find the anchor ref written
 * by host-threads.ts without modification.
 */
/**
 * DERIVED from the union rather than restated. A hand-written list drifts the
 * moment a member is added or removed — this one already had, omitting the
 * `"artifact"` that `CanvasArtifactRef` contributes.
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
 * This is NOT a pointer to a deleted artifacts-table row. The artifactId here is
 * the id field of a ReviewCanvasArtifact from a review message's `artifacts` array.
 *
 * @lore artifacts-become-knowledge: separated from EntityRef so EntityRef.kind no
 * longer includes "artifact" (which named a stored row) while the wire format for
 * review anchors is preserved unchanged.
 */
export interface CanvasArtifactRef {
	readonly kind: "artifact";
	readonly id: string;
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

export type InlineRef = EntityRef | MentionRef | CanvasArtifactRef;

// `ArtifactRef` is DELETED. It pointed at a row in the `artifacts` table, and
// that table is gone — produced content is a document, referenced by its
// own id. `ReviewPayload.producedItemId` replaces it; the `kind` it carried is
// derived from the item's blocks at render time and is not stored anywhere.

/**
 * ToolCallSummary — metadata for a single tool invocation by the assistant.
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

// @lore BC3: `PlainPayload`, `ReviewPayload`, `QuestionnairePayload` and
// `VerdictPayload` — the hand-written message-payload interfaces — moved to
// `actions/thread.ts` (the zod schemas an action's `input`/`output` validate
// against) and are re-exported from the barrel under the SAME names. Declaring
// them a second time here would be the duplicate-vocabulary shape `CLAUDE.md`
// rule 2 forbids. Same for `Thread` and `Message` below.

export interface RedactedPayload {
	readonly redacted: true;
	readonly redactedBy: IdentityId;
	readonly redactedAt: string;
	readonly reason: string;
}

// @lore BC3: `Thread` and `Message` — the hand-written row interfaces — moved
// to `actions/thread.ts` as `z.infer`s of `ThreadSchema`/`MessageSchema` and
// are re-exported from the barrel under the same names (architecture.md §3.1).
// `headCollapsePredicate`/`isBlocking` below import them back — a type-only
// import, erased at compile time, so this is not a runtime cycle.

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

// ── Zod schemas (boundary validation) ───────────────────────────

// The Zod schemas live in `packages/server/src/routes/threads-schema.ts`.
// `@hyperidle/domain-model` stays free of the runtime `zod` dependency on the
// type-only path.

// ── L18: Artifact thread summary types ──────────────────────────

// @lore AE6: ArtifactKind import removed — artifactKind widened to string
// (open vocabulary: registered 6 fundamental kinds + unregistered kinds pass through).

// `ArtifactThreadSummary` and `ArtifactThreadSummaryResponse` are DELETED with
// the endpoint they described (`GET /api/bets/:id/artifact-thread-summary`) and the
// artifacts table behind it. Threads hang off the document itself now.

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
	/** Optional human-readable sub-block label (line/paragraph/region); opaque to the server. */
	readonly spotLabel?: string;
}
