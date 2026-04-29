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
 * `docs/work-packages/L1-plan.md` §4.
 */

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

export const ARTIFACT_KINDS = [
	"text_diff",
	"content_preview",
	"visual_comparison",
	"action_summary",
	"data_metrics",
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

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

// ── Message payloads (discriminated union) ──────────────────────

export interface InlineRef {
	readonly kind: "knowledge_item" | "task" | "artifact" | "bet";
	readonly id: string;
}

export interface ArtifactRef {
	readonly id: string;
	readonly kind: ArtifactKind;
}

export interface PlainPayload {
	readonly text: string;
	readonly refs?: ReadonlyArray<InlineRef>;
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

// ── Exhaustiveness helper ───────────────────────────────────────

export function exhaustiveAssert(value: never): never {
	throw new Error(`Unhandled message type: ${String(value)}`);
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

// ── Configuration classifier ────────────────────────────────────

export type ThreadConfiguration = "dm" | "coach" | "feed" | "attached";

/**
 * Plan §4: documentation-only classifier — never persisted. Used by the
 * docs/concept anchors to describe how a thread reads visually; the data
 * is the host_kind + pinned + participants tuple.
 */
export function classifyThreadConfiguration(thread: Thread): ThreadConfiguration {
	if (thread.hostKind === "user" && thread.pinned) return "coach";
	if (thread.hostKind === "team" || thread.hostKind === "factory") return "feed";
	if (
		(thread.hostKind === "agent" || thread.hostKind === "user") &&
		thread.participants.length === 2
	) {
		return "dm";
	}
	return "attached";
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
		if ((m.type === "review" || m.type === "questionnaire") && m.resolvedAt === null) {
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

// ── Zod schemas (boundary validation) ───────────────────────────

// The Zod schemas live in `packages/server/src/routes/threads-schema.ts`.
// `@hyperidle/shared` stays free of the runtime `zod` dependency on the
// type-only path.
