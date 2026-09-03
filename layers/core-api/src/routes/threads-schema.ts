/**
 * L1a — Zod schemas for the `/api/threads` route. Lives in the server
 * package (not `@hyperidle/domain-model`) per plan §13 Risk 2: the domain model stays
 * type-only and free of the runtime `zod` dependency.
 */

import {
	HOST_KINDS,
	type MESSAGE_TYPES,
	REVIEW_CANVAS_KINDS,
	VERDICT_DECISIONS,
} from "@hyperidle/domain-model";

import z from "zod";

// `clientKey` URL-safe regex: [A-Za-z0-9_\-:.], length 8-128 chars (plan
// §6.1 REVISED for adversary M1). Empty strings and whitespace fail the
// regex. L1 step9 (Arch): the schema now matches the plan exactly — 8
// chars minimum to keep the per-sender dedupe namespace meaningfully
// large and to ensure clients use real UUIDs / short hashes rather than
// trivial strings.
const CLIENT_KEY_RE = /^[A-Za-z0-9_\-:.]+$/;
const clientKeySchema = z.string().min(8).max(128).regex(CLIENT_KEY_RE);

/**
 * T4: entityRefSchema validates entity refs (kind, id).
 * Exported for testing.
 *
 * @lore artifacts-become-knowledge: "artifact" removed — no stored artifact row
 * exists; review canvas anchors use canvasArtifactRefSchema below.
 * @lore BB1: "bet" removed — a bet is a task; the bets table was deleted.
 */
export const entityRefSchema = z.object({
	kind: z.enum(["knowledge_item", "task", "message"]),
	id: z.string(),
});

/**
 * Review canvas anchor ref — preserves kind:"artifact" on the wire so
 * ReviewPage's isArtifactEntityRef guard can locate the anchor without change.
 * This is NOT a pointer to a deleted artifacts-table row; the id here is the
 * id of a ReviewCanvasArtifact inside a review message's `artifacts` array.
 *
 * @lore artifacts-become-knowledge: kept separate from entityRefSchema so the
 * entity enum no longer includes "artifact" while the wire format for review
 * anchors (written by host-threads.ts's postPlainHostMessage) stays unchanged.
 */
const canvasArtifactRefSchema = z.object({
	kind: z.literal("artifact"),
	id: z.string().min(1),
});

/**
 * AE5: mentionRefSchema validates mention refs (kind, identityId, displayName).
 * Exported for testing.
 *
 * @lore AE5: sourceText is NOT validated at the Zod boundary — clients send raw text
 * in payload.text; the server parses @name tokens and constructs MentionRef entries
 * including sourceText server-side. Client-submitted MentionRefs (round-trip) carry
 * sourceText as-is. z.string().min(1) guards against empty values.
 */
export const mentionRefSchema = z.object({
	kind: z.literal("mention"),
	identityId: z.string().min(1),
	displayName: z.string().min(1),
	sourceText: z.string().optional(),
});

/**
 * T4: inlineRefSchema is a discriminated union on "kind".
 * AE5: Extended to include mentionRefSchema as the third member.
 * artifacts-become-knowledge: Extended to include canvasArtifactRefSchema so
 * review anchor refs (kind:"artifact") pass wire validation.
 * Exported for testing.
 */
export const inlineRefSchema = z.discriminatedUnion("kind", [
	entityRefSchema,
	mentionRefSchema,
	canvasArtifactRefSchema,
]);

/*
 * The two `artifactRef` schemas are DELETED, write arm and read arm both. They
 * validated a pointer at a row in the `artifacts` table, which no longer exists.
 *
 * A review now names the produced item under review by its knowledge item id —
 * `producedItemId`, a plain string. The `kind` the ref carried is gone with no
 * replacement: an item's kind is derived from its own blocks at render time, so
 * there is nothing to validate and nothing that could drift. The read arm's
 * whole reason for existing — tolerating a stale `kind` a row already carried —
 * goes with it.
 */

/**
 * The canvas-envelope channel: `submit_review`'s primary path for
 * attaching evidence, no stored artifact required. `kind` is validated
 * against the nine `REVIEW_CANVAS_KINDS`; `payload` stays opaque (malformed
 * payloads are discovered at render, by the per-canvas fallback, not
 * rejected here).
 */
const reviewCanvasArtifactSchema = z.object({
	id: z.string().min(1),
	tool: z.string().min(1),
	app: z.string().min(1),
	sourceHref: z.string().min(1),
	title: z.string().min(1),
	kind: z.enum(REVIEW_CANVAS_KINDS),
	payload: z.record(z.string(), z.unknown()),
});

/**
 * AH3: Assistant notice schema — mirrors AssistantNotice in @hyperidle/domain-model.
 *
 * @lore AH3 H2: This schema MUST be present on the READ path (plainPayloadSchemaWithToolCalls).
 * Zod strips unknown keys by default; without this field the `notice` written by
 * persistTurnFailure is silently dropped on DB read-back, making the overlay's
 * noticeMessages filter find nothing. Same class of bug as AD8b's toolCalls addition.
 *
 * @lore AU21 §9 Increment 2: also declared on the WRITE side (`plainPayloadSchema`
 * below) now that `dispatch`'s own assistant-turn `insertMessage` writes route
 * through this SAME `POST /threads/:id/messages` door (the seam, reusing the
 * human-facing route rather than a raw DI insert). Structural acceptance alone
 * would reopen the exact spoof vector this field's WRITE-side omission used to
 * close — `threads.ts`'s `sanitizeNoticeForSender` strips a non-assistant
 * sender's `notice` before persistence, so only a genuine `ast-*` actor (thread
 * a real authenticated identity, never client-supplied) can make it land.
 */
export const assistantNoticeSchema = z.object({
	kind: z.enum(["missing_key", "missing_harness", "provider_error"]),
	code: z.string().optional(),
});

const plainPayloadSchema = z.object({
	text: z.string().max(16_384),
	refs: z.array(inlineRefSchema).optional(),
	/** L18: Optional block anchor — opaque Block primitive id from the host surface. */
	blockId: z.string().max(128).optional(),
	/** AL4: Optional human-readable sub-block label (line/paragraph/region) — opaque to the server. */
	spotLabel: z.string().max(128).optional(),
	/**
	 * @lore AU21 §9 Increment 2: accepted structurally on the WRITE side now
	 * (see `assistantNoticeSchema`'s own `@lore` above) — sanitized at the
	 * persistence boundary (`threads.ts`'s `sanitizeNoticeForSender`), not the
	 * schema layer.
	 */
	notice: assistantNoticeSchema.optional(),
});

/**
 * AD8b: ToolCallSummary schema — validates a single tool-call record.
 * Mirrors the ToolCallSummary type in @hyperidle/domain-model.
 */
const toolCallSummarySchema = z.object({
	name: z.string().min(1),
	// @lore AF4/§4c: zod v4 requires record(keyType, valueType). Same wire shape.
	input: z.record(z.string(), z.unknown()),
	output: z.string(),
	status: z.enum(["ok", "error"]),
});

/**
 * AD8b: Plain payload with optional tool-call metadata attached by the assistant.
 * Extends plainPayloadSchema with an optional `toolCalls` array.
 * AH3: Also extends with optional `notice` so assistant notice messages survive DB read-back.
 *
 * @lore AD8b: Low/medium-risk assistant tool results are embedded as toolCalls
 * on the plain message payload. High-risk tools post a review message instead
 * and never appear as toolCalls on a plain message.
 * @lore AH3 H2: `notice` is server-authored only; clients never send it directly.
 * The WRITE schema (`plainPayloadSchema`) now also declares it structurally
 * (AU21 §9 Increment 2, see that field's own `@lore`) — this READ schema's
 * redundant `.extend({notice: ...})` is a harmless no-op kept for clarity.
 * A non-assistant sender's `notice` is stripped before persistence
 * (`threads.ts`'s `sanitizeNoticeForSender`), not at this schema layer.
 */
export const plainPayloadSchemaWithToolCalls = plainPayloadSchema.extend({
	toolCalls: z.array(toolCallSummarySchema).optional(),
	notice: assistantNoticeSchema.optional(),
});

/**
 * `producedItemId` is optional (a canvas-only review names no produced item)
 * and `artifacts` is DECLARED — a bare `z.object` strips unknown keys by
 * default, which would otherwise silently drop the array on write.
 *
 * There is no separate read arm any more. The write and read arms differed only
 * in how tolerant they were of a stale `artifactRef.kind`; with no stored kind
 * to be stale, one schema serves both directions.
 */
const reviewPayloadSchema = z.object({
	title: z.string().min(1).max(512),
	reasoning: z.array(z.string().max(1024)).max(16),
	producedItemId: z.string().optional(),
	artifacts: z.array(reviewCanvasArtifactSchema).optional(),
});

const questionnairePayloadSchema = z.object({
	title: z.string().min(1).max(512),
	question: z.string().max(2048),
	options: z.array(z.string()).max(16),
});

const verdictPayloadSchema = z.object({
	decision: z.enum(VERDICT_DECISIONS),
	resolvesMessageId: z.string(),
	note: z.string().max(2048).optional(),
});

const redactedPayloadSchema = z.object({
	redacted: z.literal(true),
	redactedBy: z.string().min(1),
	redactedAt: z.string().min(1),
	reason: z.string(),
});

/** Validates `{ type, payload, clientKey }` for both create-thread and append-message. */
export const messageInputSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("plain"),
		payload: plainPayloadSchema,
		clientKey: clientKeySchema,
	}),
	z.object({
		type: z.literal("review"),
		payload: reviewPayloadSchema,
		clientKey: clientKeySchema,
	}),
	z.object({
		type: z.literal("questionnaire"),
		payload: questionnairePayloadSchema,
		clientKey: clientKeySchema,
	}),
	z.object({
		type: z.literal("verdict"),
		payload: verdictPayloadSchema,
		clientKey: clientKeySchema,
	}),
]);

/**
 * Validates a message row read back from the DB. Each branch accepts the
 * type-specific payload OR the redacted-payload variant — the type guard
 * `isRedactedPayload` then narrows in the consumer (plan §4 / SL-C2).
 *
 * AD8b B3.2: plain messages use plainPayloadSchemaWithToolCalls so that
 * toolCalls survive DB read-back. Using plainPayloadSchema here would strip
 * the toolCalls field from messages written by the assistant agent.
 */
export const messageRowSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("plain"),
		payload: z.union([plainPayloadSchemaWithToolCalls, redactedPayloadSchema]),
	}),
	z.object({
		type: z.literal("review"),
		payload: z.union([reviewPayloadSchema, redactedPayloadSchema]),
	}),
	z.object({
		type: z.literal("questionnaire"),
		payload: z.union([questionnairePayloadSchema, redactedPayloadSchema]),
	}),
	z.object({
		type: z.literal("verdict"),
		payload: z.union([verdictPayloadSchema, redactedPayloadSchema]),
	}),
]);

/** Validates the JSON-encoded `participants` column on the threads row. */
export const threadParticipantsSchema = z.array(z.string().min(1));

/**
 * @lore AU44 batch 4: initialMessage is optional — POST /threads now handles
 * both bare-thread creation (no initialMessage, equivalent to old
 * POST /threads/scaffold) and full creation (with initialMessage). The
 * insertThreadBodySchema and POST /threads/scaffold route are deleted.
 */
export const createThreadBodySchema = z.object({
	hostKind: z.enum(HOST_KINDS),
	hostId: z.string().min(1),
	participants: z.array(z.string().min(1)).min(1),
	pinned: z.boolean().optional(),
	initialMessage: messageInputSchema.optional(),
});

/**
 * AU21 §9 Increment 2: `PATCH /threads/:id`'s validated request body — the
 * narrow field set real call sites set today, not a general thread-patch
 * surface.
 */
export const updateThreadBodySchema = z.object({
	participants: z.array(z.string().min(1)).optional(),
	lastActiveAt: z.string().optional(),
	pinned: z.boolean().optional(),
});

/** AU21 §9 Increment 2: `POST /threads/direct`'s validated request body. */
export const directThreadBodySchema = z.object({
	recipientId: z.string().min(1),
});

/** AU21 §9 Increment 2: `GET /threads/inbox`'s validated query params. */
export const inboxQuerySchema = z.object({
	limit: z
		.string()
		.optional()
		.transform((v) => (v ? Number(v) : 50))
		.pipe(z.number().int().min(1).max(200)),
});

export const listThreadsQuerySchema = z.object({
	host_kind: z.enum(HOST_KINDS).optional(),
	host_id: z.string().optional(),
	participant_id: z.string().optional(),
	cursor: z.string().optional(),
	limit: z
		.string()
		.optional()
		.transform((v) => (v ? Number(v) : 50))
		.pipe(z.number().int().min(1).max(50)),
});

/**
 * Build-time assertion that `MESSAGE_TYPES` matches the message-input
 * discriminator exactly. If a new type is added to one and not the other,
 * the `satisfies` check fails to compile.
 */
const MessageTypesCovered: { [K in (typeof MESSAGE_TYPES)[number]]: true } = {
	plain: true,
	review: true,
	questionnaire: true,
	verdict: true,
};
void MessageTypesCovered;
