/**
 * L1a — Zod schemas for the `/api/threads` route. Lives in the server
 * package (not `@hyperidle/domain-model`) per plan §13 Risk 2: the domain model stays
 * type-only and free of the runtime `zod` dependency.
 */

import {
	ARTIFACT_VIEW_SHAPES,
	BLOCK_HOST_KINDS,
	HOST_KINDS,
	type MESSAGE_TYPES,
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
 */
export const entityRefSchema = z.object({
	kind: z.enum(["knowledge_item", "task", "artifact", "bet", "message"]),
	id: z.string(),
});

/**
 * T4: blockRefSchema validates block refs (kind, blockId, hostKind, hostId).
 * Exported for testing.
 *
 * @lore T4: z.discriminatedUnion takes its options as a TUPLE (typed [A, B, ...]),
 * not a plain array — each member carries its own literal discriminator prop.
 * Both entityRefSchema (z.enum) and blockRefSchema (z.literal) use "kind".
 */
export const blockRefSchema = z.object({
	kind: z.literal("block"),
	blockId: z.string().min(1),
	hostKind: z.enum(BLOCK_HOST_KINDS),
	hostId: z.string().min(1),
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
 * Exported for testing.
 */
export const inlineRefSchema = z.discriminatedUnion("kind", [
	entityRefSchema,
	blockRefSchema,
	mentionRefSchema,
]);

const artifactRefSchema = z.object({
	id: z.string(),
	kind: z.enum(ARTIFACT_VIEW_SHAPES),
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

const reviewPayloadSchema = z.object({
	title: z.string().min(1).max(512),
	reasoning: z.array(z.string().max(1024)).max(16),
	artifactRef: artifactRefSchema,
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

export const createThreadBodySchema = z.object({
	hostKind: z.enum(HOST_KINDS),
	hostId: z.string().min(1),
	participants: z.array(z.string().min(1)).min(1),
	pinned: z.boolean().optional(),
	initialMessage: messageInputSchema,
});

/**
 * AU21 §9 Increment 2: `POST /threads/scaffold`'s validated request body — a
 * bare thread with no initial message (see `CoreApiConversationPort.insertThread`'s
 * doc comment in `@hyperidle/api-contract`).
 */
export const insertThreadBodySchema = z.object({
	hostKind: z.enum(HOST_KINDS),
	hostId: z.string().min(1),
	participants: z.array(z.string().min(1)).min(1),
	pinned: z.boolean().optional(),
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
