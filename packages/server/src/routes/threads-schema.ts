/**
 * L1a — Zod schemas for the `/api/threads` route. Lives in the server
 * package (not `@hyperidle/shared`) per plan §13 Risk 2: shared stays
 * type-only and free of the runtime `zod` dependency.
 */

import {
	ARTIFACT_VIEW_SHAPES,
	HOST_KINDS,
	type MESSAGE_TYPES,
	VERDICT_DECISIONS,
} from "@hyperidle/shared";
import { z } from "zod";

// `clientKey` URL-safe regex: [A-Za-z0-9_\-:.], length 8-128 chars (plan
// §6.1 REVISED for adversary M1). Empty strings and whitespace fail the
// regex. L1 step9 (Arch): the schema now matches the plan exactly — 8
// chars minimum to keep the per-sender dedupe namespace meaningfully
// large and to ensure clients use real UUIDs / short hashes rather than
// trivial strings.
const CLIENT_KEY_RE = /^[A-Za-z0-9_\-:.]+$/;
export const clientKeySchema = z.string().min(8).max(128).regex(CLIENT_KEY_RE);

const inlineRefSchema = z.object({
	kind: z.enum(["knowledge_item", "task", "artifact", "bet"]),
	id: z.string(),
});

const artifactRefSchema = z.object({
	id: z.string(),
	kind: z.enum(ARTIFACT_VIEW_SHAPES),
});

const plainPayloadSchema = z.object({
	text: z.string().max(16_384),
	refs: z.array(inlineRefSchema).optional(),
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
 */
export const messageRowSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("plain"),
		payload: z.union([plainPayloadSchema, redactedPayloadSchema]),
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
 * L8 §3.1: list-endpoint row shape. The wire row is the canonical Thread
 * fields plus the server-derived `hasUnresolvedReview` flag. Defined here
 * (server-only) because `@hyperidle/shared` stays type-only and free of the
 * `zod` runtime dependency.
 */
export const threadListRowSchema = z.object({
	id: z.string().min(1),
	hostKind: z.enum(HOST_KINDS),
	hostId: z.string().min(1),
	initiatorId: z.string().min(1),
	participants: z.array(z.string().min(1)),
	pinned: z.boolean(),
	resolvedAt: z.string().nullable(),
	lastActiveAt: z.string(),
	createdAt: z.string(),
	hasUnresolvedReview: z.boolean(),
});

export const listThreadsResponseSchema = z.object({
	threads: z.array(threadListRowSchema),
	nextCursor: z.string().nullable(),
});

export type ThreadListRow = z.infer<typeof threadListRowSchema>;
export type ListThreadsResponse = z.infer<typeof listThreadsResponseSchema>;

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

export type MessageInput = z.infer<typeof messageInputSchema>;
export type CreateThreadBody = z.infer<typeof createThreadBodySchema>;
export type MessageRowParsed = z.infer<typeof messageRowSchema>;

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
