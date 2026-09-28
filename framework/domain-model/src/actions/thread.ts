import { z } from "zod";
import {
	HOST_KINDS,
	type HostKind,
	MESSAGE_TYPES,
	REVIEW_CANVAS_KINDS,
	type RedactedPayload,
	VERDICT_DECISIONS,
} from "../thread.js";
import type { ActionDeclaration, Problem } from "./action.js";

export const entityRefSchema = z.object({
	kind: z.enum(["document", "task", "message"]),
	id: z.string(),
});

// `sourceText` is required — matches `thread.ts`'s `MentionRef.sourceText`.
// The one production writer (`mention-resolver.ts`'s `resolveMentionsForMessage`)
// always sets it, from `extractMentionCandidates`' `sourceText: `@${name}``.
export const mentionRefSchema = z.object({
	kind: z.literal("mention"),
	identityId: z.string().min(1),
	displayName: z.string().min(1),
	sourceText: z.string().min(1),
});

/**
 * Review canvas anchor ref — preserves `kind:"artifact"` on the wire so
 * `ReviewPage`'s `isArtifactEntityRef` guard can locate the anchor unchanged.
 * The id here is the id of
 * a `ReviewCanvasArtifact` inside a review message's `artifacts` array.
 */
export const canvasArtifactRefSchema = z.object({
	kind: z.literal("artifact"),
	id: z.string().min(1),
});

export const inlineRefSchema = z.discriminatedUnion("kind", [
	entityRefSchema,
	mentionRefSchema,
	canvasArtifactRefSchema,
]);

export const assistantNoticeSchema = z.object({
	kind: z.enum(["missing_key", "missing_harness", "provider_error"]),
	code: z.string().optional(),
});

const toolCallSummarySchema = z.object({
	name: z.string().min(1),
	input: z.record(z.string(), z.unknown()),
	output: z.string(),
	status: z.enum(["ok", "error"]),
});

const reviewCanvasArtifactSchema = z.object({
	id: z.string().min(1),
	tool: z.string().min(1),
	app: z.string().min(1),
	sourceHref: z.string().min(1),
	title: z.string().min(1),
	kind: z.enum(REVIEW_CANVAS_KINDS),
	payload: z.record(z.string(), z.unknown()),
});

const redactedPayloadSchema = z.object({
	redacted: z.literal(true),
	redactedBy: z.string().min(1),
	redactedAt: z.string().min(1),
	reason: z.string(),
});

/** Validates the JSON-encoded `participants` column on the threads row. */
export const threadParticipantsSchema = z.array(z.string().min(1));

// ── plain ────────────────────────────────────────────────────────────────
// `notice` drops off the WRITE side (nothing in
// production writes it); it stays on the READ side so historical rows still
// render, via `plainReadPayloadSchema` below.

export const plainPayloadSchema = z.object({
	text: z.string().max(16_384),
	refs: z.array(inlineRefSchema).optional(),
	blockId: z.string().max(128).optional(),
	spotLabel: z.string().max(128).optional(),
});
export type PlainPayload = z.infer<typeof plainPayloadSchema>;

/** Read-side only — carries `toolCalls`/`notice` for historical rows. */
export const plainReadPayloadSchema = plainPayloadSchema.extend({
	toolCalls: z.array(toolCallSummarySchema).optional(),
	notice: assistantNoticeSchema.optional(),
});
export type PlainReadPayload = z.infer<typeof plainReadPayloadSchema>;

// ── review ───────────────────────────────────────────────────────────────

export const reviewPayloadSchema = z.object({
	title: z.string().min(1).max(512),
	reasoning: z.array(z.string().max(1024)).max(16),
	producedItemId: z.string().optional(),
	artifacts: z.array(reviewCanvasArtifactSchema).optional(),
	// server-stamped from ctx.caller.taskId — never accepted from the caller; SendMessageInputSchema.review omits it so a smuggled taskId is stripped by validation
	taskId: z.string().optional(),
});
export type ReviewPayload = z.infer<typeof reviewPayloadSchema>;

// ── questionnaire ────────────────────────────────────────────────────────

export const questionnairePayloadSchema = z.object({
	title: z.string().min(1).max(512),
	question: z.string().max(2048),
	options: z.array(z.string()).max(16),
});
export type QuestionnairePayload = z.infer<typeof questionnairePayloadSchema>;

// ── verdict ──────────────────────────────────────────────────────────────

export const verdictPayloadSchema = z.object({
	decision: z.enum(VERDICT_DECISIONS),
	resolvesMessageId: z.string(),
	note: z.string().max(2048).optional(),
});
export type VerdictPayload = z.infer<typeof verdictPayloadSchema>;

export function parseMessagePayload(
	type: (typeof MESSAGE_TYPES)[number],
	payload: unknown,
): PlainPayload | ReviewPayload | QuestionnairePayload | VerdictPayload | RedactedPayload {
	switch (type) {
		case "plain":
			return z.union([plainReadPayloadSchema, redactedPayloadSchema]).parse(payload);
		case "review":
			return z.union([reviewPayloadSchema, redactedPayloadSchema]).parse(payload);
		case "questionnaire":
			return z.union([questionnairePayloadSchema, redactedPayloadSchema]).parse(payload);
		case "verdict":
			return z.union([verdictPayloadSchema, redactedPayloadSchema]).parse(payload);
	}
}

export const ThreadSchema = z.object({
	id: z.string(),
	hostKind: z.enum(HOST_KINDS),
	hostId: z.string(),
	initiatorId: z.string(),
	members: z.array(z.string()), // parsed `participants` JSON column
	title: z.string().nullable(), // stored column; null ⇒ use computedTitle
	computedTitle: z.string(), // viewer-relative, never empty
	pinned: z.boolean(),
	resolvedAt: z.string().nullable(),
	deletedAt: z.string().nullable(),
	lastActiveAt: z.string(),
	createdAt: z.string(),
});
export type Thread = z.infer<typeof ThreadSchema>;

export const MessageSchema = z.object({
	id: z.string(),
	threadId: z.string(),
	senderId: z.string(),
	type: z.enum(MESSAGE_TYPES),
	payload: z.unknown(), // one of the four payload shapes, or the redacted variant
	clientKey: z.string(),
	blockId: z.string().nullable(),
	resolvedAt: z.string().nullable(),
	deletedAt: z.string().nullable(),
	redactedAt: z.string().nullable(),
	createdAt: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

export const IdentitySchema = z.object({
	id: z.string(),
	name: z.string(),
	role: z.string(),
	isAgent: z.boolean(),
});
export type Identity = z.infer<typeof IdentitySchema>;

export const SearchThreadsInputSchema = z
	.object({
		mine: z.boolean().optional(), // threads the actor is a member of
		host: z.object({ kind: z.enum(HOST_KINDS), id: z.string().min(1) }).optional(),
		text: z.string().min(1).optional(), // across message text and stored title
		ids: z.array(z.string()).optional(),
		limit: z.number().int().min(1).max(50).optional(),
	})
	.strict();
export type SearchThreadsInput = z.infer<typeof SearchThreadsInputSchema>;

export const ThreadListRowSchema = ThreadSchema.extend({
	hasUnresolvedReview: z.boolean(), // sidebar badge; one batched query, never N+1
	lastMessagePreview: z.string().nullable(),
});
export type ThreadListRow = z.infer<typeof ThreadListRowSchema>;

export const searchThreads: ActionDeclaration<SearchThreadsInput, ThreadListRow[]> = {
	name: "search_threads",
	sentence: "Search conversations. No parameter lists the ones you are in; filter by host or text.",
	input: SearchThreadsInputSchema,
	output: z.array(ThreadListRowSchema),
};

export const OpenThreadInputSchema = z
	.object({
		id: z.string().min(1),
		blockId: z.string().min(1).max(128).optional(), // the block-anchored comment filter, unchanged
	})
	.strict();
export type OpenThreadInput = z.infer<typeof OpenThreadInputSchema>;

export const ThreadViewSchema = z.object({
	thread: ThreadSchema,
	members: z.array(IdentitySchema),
	messages: z.array(MessageSchema), // createdAt DESC, id tiebreak
	headMessageId: z.string().nullable(),
	hostTitle: z.string().nullable(),
});
export type ThreadView = z.infer<typeof ThreadViewSchema>;

export const openThread: ActionDeclaration<OpenThreadInput, ThreadView> = {
	name: "open_thread",
	sentence: "Open a conversation: its members and every message in it, newest first.",
	input: OpenThreadInputSchema,
	output: ThreadViewSchema,
};

// FLAT object, never a discriminated union — a top-level
// `z.discriminatedUnion` emits `anyOf` with no top-level `properties`, so the
// Anthropic direct-API tool spec would ship an empty schema.
export const SendMessageInputSchema = z
	.object({
		threadId: z.string().min(1).optional(),
		recipients: z.array(z.string().min(1)).min(1).optional(),
		/** Present ⇒ overwrite that message instead of creating one. */
		messageId: z.string().min(1).optional(),
		/** Create-only retry key, unique per (thread, sender). Generated when absent. */
		clientKey: z
			.string()
			.min(8)
			.max(128)
			.regex(/^[A-Za-z0-9_\-:.]+$/)
			.optional(),
		// exactly one of the four bodies below — a pure invariant, not a schema rule
		text: z.string().max(16_384).optional(),
		refs: z.array(inlineRefSchema).optional(), // plain only
		blockId: z.string().max(128).optional(), // plain only
		spotLabel: z.string().max(128).optional(), // plain only
		// `taskId` is server-stamped from `ctx.caller.taskId`, never caller
		// input — omitted here so a smuggled `taskId` in the request body is
		// stripped by validation rather than stored.
		review: reviewPayloadSchema.omit({ taskId: true }).optional(),
		questionnaire: questionnairePayloadSchema.optional(),
		verdict: verdictPayloadSchema.optional(),
	})
	.strict();
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

export const SendMessageOutputSchema = z.object({
	message: MessageSchema,
	thread: ThreadSchema,
});
export type SendMessageOutput = z.infer<typeof SendMessageOutputSchema>;

export const sendMessage: ActionDeclaration<SendMessageInput, SendMessageOutput> = {
	name: "send_message",
	sentence:
		"Send a message. Name a thread, or name recipients to start one; leave both out to answer in " +
		"the conversation you were called from. Send text, a review, a question or a verdict. " +
		"Give a message id to replace what you already sent.",
	input: SendMessageInputSchema,
	output: SendMessageOutputSchema,
};

export const AdjustThreadInputSchema = z
	.object({
		id: z.string().min(1).optional(), // absent ⇒ create an empty thread
		host: z.object({ kind: z.enum(HOST_KINDS), id: z.string().min(1) }).optional(), // create only
		title: z.string().max(512).nullable().optional(), // null clears the stored title
		members: z.array(z.string().min(1)).min(1).optional(), // full replacement list
		resolved: z.boolean().optional(), // true ⇒ resolvedAt = now; false ⇒ reopen
		pinned: z.boolean().optional(),
		deleted: z.boolean().optional(), // true ⇒ deletedAt = now; false ⇒ restore
	})
	.strict();
export type AdjustThreadInput = z.infer<typeof AdjustThreadInputSchema>;

export const adjustThread: ActionDeclaration<AdjustThreadInput, ThreadView> = {
	name: "adjust_thread",
	sentence:
		"Adjust a conversation, new or existing: its title, who is in it, whether it is " +
		"resolved, pinned, or deleted.",
	input: AdjustThreadInputSchema,
	output: ThreadViewSchema, // same shape open_thread returns
};

export const THREAD_ACTIONS = {
	search_threads: searchThreads,
	open_thread: openThread,
	send_message: sendMessage,
	adjust_thread: adjustThread,
} as const;

// Pure invariants — run in the browser and on the server; no database.

export function sendMessageInvariants(
	input: SendMessageInput,
	caller: { readonly hasCallingThread: boolean },
): Problem[] {
	const problems: Problem[] = [];

	const hasThreadId = input.threadId !== undefined;
	const hasRecipients = input.recipients !== undefined;
	if (hasThreadId && hasRecipients) {
		problems.push({
			code: "two_targets",
			message: "Give either a thread or recipients, not both.",
			path: "threadId",
		});
	} else if (!(hasThreadId || hasRecipients || caller.hasCallingThread)) {
		// resolvable later via the agent fallback (server invariant) —
		// this pure check only refuses an HTTP caller (no `caller` at all), which
		// `sendMessage.run` mirrors by passing `hasCallingThread: false` for it.
		problems.push({
			code: "no_target",
			message: "Name a thread or recipients to send to.",
			path: "threadId",
		});
	}

	const bodies = [
		input.text !== undefined,
		input.review !== undefined,
		input.questionnaire !== undefined,
		input.verdict !== undefined,
	].filter(Boolean).length;
	if (bodies === 0) {
		problems.push({
			code: "no_body",
			message: "Send text, a review, a question or a verdict.",
			path: "text",
		});
	} else if (bodies > 1) {
		problems.push({
			code: "two_bodies",
			message: "Send exactly one of text, a review, a question or a verdict.",
			path: "text",
		});
	}

	const hasText = input.text !== undefined;
	if (
		!hasText &&
		(input.refs !== undefined || input.blockId !== undefined || input.spotLabel !== undefined)
	) {
		problems.push({
			code: "plain_fields_on_non_plain",
			message: "refs/blockId/spotLabel only apply to a text message.",
			path: "text",
		});
	}

	if (input.messageId !== undefined && !hasThreadId) {
		problems.push({
			code: "overwrite_needs_thread",
			message: "Overwriting a message requires its thread id.",
			path: "messageId",
		});
	}
	if (input.messageId !== undefined && hasRecipients) {
		problems.push({
			code: "overwrite_with_recipients",
			message: "An overwrite cannot also open a thread.",
			path: "messageId",
		});
	}
	if (input.verdict !== undefined && hasRecipients) {
		problems.push({
			code: "verdict_on_new_thread",
			message: "A verdict cannot open a new thread.",
			path: "verdict",
		});
	}

	return problems;
}

export function adjustThreadInvariants(input: AdjustThreadInput): Problem[] {
	const problems: Problem[] = [];

	const touchesAnyOtherField =
		input.title !== undefined ||
		input.members !== undefined ||
		input.resolved !== undefined ||
		input.pinned !== undefined ||
		input.deleted !== undefined ||
		input.host !== undefined;
	if (input.id !== undefined && !touchesAnyOtherField) {
		problems.push({
			code: "adjust_empty",
			message: "Adjust must change something.",
			path: "id",
		});
	}
	if (input.id !== undefined && input.host !== undefined) {
		problems.push({
			code: "adjust_host_on_existing",
			message: "Host may only be set when creating a thread.",
			path: "host",
		});
	}
	if (input.members !== undefined && input.members.length === 0) {
		problems.push({
			code: "members_empty",
			message: "A thread needs at least one member.",
			path: "members",
		});
	}

	return problems;
}

const HOST_SCOPED: ReadonlySet<HostKind> = new Set(["team", "document", "factory"]);

export function canReadThread(
	actor: string,
	thread: { readonly hostKind: HostKind; readonly members: readonly string[] },
): boolean {
	if (HOST_SCOPED.has(thread.hostKind)) return true; // a shared surface: any signed-in principal
	return thread.members.includes(actor); // `user`/`agent` hosts — every DM: members only
}

export const canWriteThread = canReadThread;

export function agentsToWake(input: {
	readonly members: readonly string[]; // after the send's mention-adds
	readonly senderId: string;
	readonly mentionedIds: readonly string[]; // resolved from the message text, this send only
	readonly isAgent: (id: string) => boolean;
}): readonly string[] {
	const woken = new Set<string>();
	for (const id of input.mentionedIds) if (input.isAgent(id)) woken.add(id);
	if (input.members.length === 2) {
		const other = input.members.find((m) => m !== input.senderId);
		if (other !== undefined && input.isAgent(other)) woken.add(other);
	}
	woken.delete(input.senderId);
	return [...woken];
}
