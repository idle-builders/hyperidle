// ── Closed enums ────────────────────────────────────────────────

export const HOST_KINDS = ["document", "agent", "user", "team", "factory"] as const;
export type HostKind = (typeof HOST_KINDS)[number];

export const MESSAGE_TYPES = ["plain", "review", "questionnaire", "verdict", "answer"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

/** A review is approved or rejected; asking for a change is a comment, not a verdict. */
export const VERDICT_DECISIONS = ["approve", "reject"] as const;
export type VerdictDecision = (typeof VERDICT_DECISIONS)[number];

// ── Identity ────────────────────────────────────────────────────

export type ThreadId = string;
export type MessageId = string;
export type IdentityId = string;

// ── Message payloads (discriminated union) ──────────────────────

/**
 * Derived from the union rather than restated — a hand-written list drifts when a member is added or removed.
 */
export type InlineRefKind = InlineRef["kind"];

export interface EntityRef {
	readonly kind: "document" | "task" | "message";
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

export type InlineRef = EntityRef | MentionRef;

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
 * VerdictPayload | AnswerPayload). Use after narrowing on `message.type` to access the
 * type-specific payload without unsafe `as` casts.
 */
export function isRedactedPayload(payload: unknown): payload is RedactedPayload {
	return (
		typeof payload === "object" &&
		payload !== null &&
		(payload as { redacted?: unknown }).redacted === true
	);
}
