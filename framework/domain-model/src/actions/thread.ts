import { z } from "zod";
import { FORMATS } from "../app-page.js";
import { anchorSchema, flagSchema, reviewInvariants, reviewPartSchema } from "../review.js";
import {
	HOST_KINDS,
	type HostKind,
	MESSAGE_TYPES,
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

export const inlineRefSchema = z.discriminatedUnion("kind", [entityRefSchema, mentionRefSchema]);

export const assistantNoticeSchema = z.object({
	kind: z.enum(["missing_harness", "provider_error"]),
	code: z.string().optional(),
});

const toolCallSummarySchema = z.object({
	name: z.string().min(1),
	input: z.record(z.string(), z.unknown()),
	output: z.string(),
	status: z.enum(["ok", "error"]),
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

/**
 * A change proposed inside a comment on a document: the text the comment covers as it was, and
 * as it should become. Anyone may apply or dismiss it, once; `settled` says who did, and when.
 */
export const proposedChangeSchema = z.object({
	from: z.string().max(16_384),
	to: z.string().max(16_384),
	settled: z
		.object({
			state: z.enum(["applied", "dismissed"]),
			by: z.string().min(1),
			at: z.string().min(1),
		})
		.optional(),
});
export type ProposedChange = z.infer<typeof proposedChangeSchema>;

/** The longest text message; an app's page may run to `APP_PAGE_MAX`. */
export const TEXT_MAX = 16_384;
export const APP_PAGE_MAX = 262_144;

export const plainPayloadSchema = z.object({
	text: z.string().max(APP_PAGE_MAX),
	/** `html`: the whole message is an app, its text one whole page. Absent means markdown. */
	format: z.enum(FORMATS).optional(),
	refs: z.array(inlineRefSchema).optional(),
	/** A comment on a review's part, or on a stretch of the text of the thread's document. */
	anchor: anchorSchema.optional(),
	change: proposedChangeSchema.optional(),
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
	/** What the sender says about it, a line each. */
	reasoning: z.array(z.string().max(1024)).max(16),
	/** Which stage of the work this reviews, in a word or two: "Design", "Final". */
	stage: z.string().min(1).max(64).optional(),
	/** What there is to look at, composed for the question. */
	parts: z.array(reviewPartSchema).max(12).optional(),
	/** The sender's own pointers to where to look. */
	flags: z.array(flagSchema).max(26).optional(),
	/** The round this one retries, after it was rejected; its open questions stay there. */
	previousReviewId: z.string().min(1).optional(),
	/** What changed since the previous round, a line each. */
	changed: z.array(z.string().min(1).max(512)).max(16).optional(),
	producedItemId: z.string().optional(),
	/** The person who reviews it; absent ⇒ anyone in the thread but its sender. */
	reviewer: z.string().min(1).optional(),
	// stamped by server from ctx.caller.taskId (task run) or supplied by agent from a conversation turn
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

// Resolves a review. A reject must say why in `note` — a pure invariant below.
export const verdictPayloadSchema = z.object({
	decision: z.enum(VERDICT_DECISIONS),
	resolvesMessageId: z.string(),
	note: z.string().max(2048).optional(),
});
export type VerdictPayload = z.infer<typeof verdictPayloadSchema>;

// ── answer ───────────────────────────────────────────────────────────────

// Resolves a questionnaire: exactly one of `option` (one of its options,
// verbatim) or `text` (the person's own words) — a pure invariant below.
export const answerPayloadSchema = z.object({
	resolvesMessageId: z.string(),
	option: z.string().optional(),
	text: z.string().max(2048).optional(),
});
export type AnswerPayload = z.infer<typeof answerPayloadSchema>;

export function parseMessagePayload(
	type: (typeof MESSAGE_TYPES)[number],
	payload: unknown,
):
	| PlainPayload
	| ReviewPayload
	| QuestionnairePayload
	| VerdictPayload
	| AnswerPayload
	| RedactedPayload {
	switch (type) {
		case "plain":
			return z.union([plainReadPayloadSchema, redactedPayloadSchema]).parse(payload);
		case "review":
			return z.union([reviewPayloadSchema, redactedPayloadSchema]).parse(payload);
		case "questionnaire":
			return z.union([questionnairePayloadSchema, redactedPayloadSchema]).parse(payload);
		case "verdict":
			return z.union([verdictPayloadSchema, redactedPayloadSchema]).parse(payload);
		case "answer":
			return z.union([answerPayloadSchema, redactedPayloadSchema]).parse(payload);
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
	payload: z.unknown(), // one of the five payload shapes, or the redacted variant
	clientKey: z.string(),
	resolvedAt: z.string().nullable(),
	deletedAt: z.string().nullable(),
	redactedAt: z.string().nullable(),
	createdAt: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

export const IdentitySchema = z.object({
	id: z.string(),
	name: z.string(),
	/** Someone's craft (see `users.discipline`), null when they have none. */
	discipline: z.string().nullable(),
	isAgent: z.boolean(),
});
export type Identity = z.infer<typeof IdentitySchema>;

export const SearchThreadsInputSchema = z
	.object({
		mine: z.boolean().optional(), // threads the actor is a member of
		/** The threads this user is in, each saying what it waits on from them — only those you can read. */
		member: z.string().min(1).optional(),
		host: z.object({ kind: z.enum(HOST_KINDS), id: z.string().min(1) }).optional(),
		text: z.string().min(1).optional(), // across message text and stored title
		ids: z.array(z.string()).optional(),
		limit: z.number().int().min(1).max(50).optional(),
	})
	.strict();
export type SearchThreadsInput = z.infer<typeof SearchThreadsInputSchema>;

export const ThreadListRowSchema = ThreadSchema.extend({
	/** What it waits on from the caller — `computeThreadNeed`; one batched query, never N+1. */
	need: z.enum(["stuck", "input", "review"]).nullable(),
	lastMessagePreview: z.string().nullable(),
	lastSenderId: z.string().nullable(),
	/** The newest message, from someone else, mentions the caller. */
	mentionsYou: z.boolean(),
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
		// exactly one of the five bodies below — a pure invariant, not a schema rule
		text: z.string().max(APP_PAGE_MAX).optional(),
		/** `html` sends the whole message as an app: the text is one whole page. Plain only. */
		format: z.enum(FORMATS).optional(),
		refs: z.array(inlineRefSchema).optional(), // plain only
		anchor: anchorSchema.optional(), // plain only
		/** A change to the document text the anchor covers; plain only. */
		change: proposedChangeSchema.omit({ settled: true }).optional(),
		// `taskId`: from a task-run session the server stamps it from ctx.caller.taskId;
		// from a conversation turn an agent names the task by passing it here.
		review: reviewPayloadSchema.optional(),
		questionnaire: questionnairePayloadSchema.optional(),
		verdict: verdictPayloadSchema.optional(),
		answer: answerPayloadSchema.optional(),
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
		"the conversation you were called from. Send text, a review (name its reviewer when one " +
		"person owns it), a question, a verdict on a " +
		"review (approve, or reject with the reason), or an answer to a question (one of its " +
		"options, or your own words). " +
		'A text message can be a whole app: say `format: "html"` and write one whole HTML page as ' +
		"the text, with its own styles and scripts and every image inside it (it runs sealed off " +
		"from the network). It shows as a card that opens the app beside the conversation. " +
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
		/** One message in it: resolve or reopen the comment it starts, apply or dismiss its change. */
		message: z
			.object({
				id: z.string().min(1),
				resolved: z.boolean().optional(),
				change: z.enum(["applied", "dismissed"]).optional(),
			})
			.strict()
			.optional(),
	})
	.strict();
export type AdjustThreadInput = z.infer<typeof AdjustThreadInputSchema>;

export const adjustThread: ActionDeclaration<AdjustThreadInput, ThreadView> = {
	name: "adjust_thread",
	sentence:
		"Adjust a conversation, new or existing: its title, who is in it, whether it is " +
		"resolved, pinned, or deleted; resolve or reopen a comment in it, or apply or dismiss the " +
		"change a message proposes.",
	input: AdjustThreadInputSchema,
	output: ThreadViewSchema, // same shape open_thread returns
};

export const MarkReviewOpenedInputSchema = z.object({
	/** The message id of the review to mark as opened. */
	reviewMessageId: z.string().min(1),
});
export type MarkReviewOpenedInput = z.infer<typeof MarkReviewOpenedInputSchema>;

export const markReviewOpened: ActionDeclaration<MarkReviewOpenedInput, Record<string, never>> = {
	name: "mark_review_opened",
	sentence: "Record that you have opened a review — it stops counting as waiting for you.",
	input: MarkReviewOpenedInputSchema,
	output: z.object({}),
};

export const THREAD_ACTIONS = {
	search_threads: searchThreads,
	open_thread: openThread,
	send_message: sendMessage,
	adjust_thread: adjustThread,
	mark_review_opened: markReviewOpened,
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
		input.answer !== undefined,
	].filter(Boolean).length;
	if (bodies === 0) {
		problems.push({
			code: "no_body",
			message: "Send text, a review, a question, a verdict or an answer.",
			path: "text",
		});
	} else if (bodies > 1) {
		problems.push({
			code: "two_bodies",
			message: "Send exactly one of text, a review, a question, a verdict or an answer.",
			path: "text",
		});
	}

	const hasText = input.text !== undefined;
	if (
		!hasText &&
		(input.refs !== undefined ||
			input.anchor !== undefined ||
			input.change !== undefined ||
			input.format !== undefined)
	) {
		problems.push({
			code: "plain_fields_on_non_plain",
			message: "refs, anchor, change and format only apply to a text message.",
			path: "text",
		});
	}
	if (input.format === "html" && hasText) {
		if (input.anchor !== undefined || input.change !== undefined)
			problems.push({
				code: "app_with_anchor",
				message: "An app is a message of its own: it cannot comment on a spot or propose a change.",
				path: "format",
			});
	} else if (hasText && (input.text?.length ?? 0) > TEXT_MAX) {
		problems.push({
			code: "text_too_long",
			message: `A text message is at most ${TEXT_MAX} characters; send a longer page as an app.`,
			path: "text",
		});
	}
	if (input.change !== undefined) {
		if (input.anchor === undefined || input.anchor.review !== undefined)
			problems.push({
				code: "change_needs_document_anchor",
				message: "A change is proposed on a stretch of a document's text: anchor it there.",
				path: "change",
			});
		else if (input.change.from === input.change.to)
			problems.push({
				code: "change_same",
				message: "The proposed text is the same as the text it would replace.",
				path: "change.to",
			});
	}
	if (input.review !== undefined)
		problems.push(
			...reviewInvariants(input.review).map((p) => ({ ...p, path: `review.${p.path}` })),
		);

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
	if (input.verdict?.decision === "reject" && (input.verdict.note ?? "").trim() === "") {
		problems.push({
			code: "reject_needs_reason",
			message: "Say why you reject it — the agent needs the reason to try another way.",
			path: "verdict.note",
		});
	}

	if (input.answer !== undefined) {
		if (hasRecipients) {
			problems.push({
				code: "answer_on_new_thread",
				message: "An answer cannot open a new thread.",
				path: "answer",
			});
		}
		const { option, text } = input.answer;
		if ((option === undefined) === (text === undefined)) {
			problems.push({
				code: "answer_needs_one",
				message: "Answer with one of the options or in your own words — exactly one of the two.",
				path: "answer",
			});
		} else if (text !== undefined && text.trim() === "") {
			problems.push({
				code: "answer_empty",
				message: "Your answer is empty.",
				path: "answer.text",
			});
		}
	}

	return problems;
}

/**
 * What a verdict or an answer may resolve, given the message it names: a
 * verdict resolves a review, an answer resolves a questionnaire, and a picked
 * option must be one the questionnaire offers.
 */
export function resolvesMessageInvariants(
	input: Pick<SendMessageInput, "verdict" | "answer">,
	target: { readonly type: string; readonly payload: unknown },
): Problem[] {
	if (input.verdict !== undefined && target.type !== "review") {
		return [
			{
				code: "verdict_not_review",
				message: "A verdict resolves a review. Answer a question with one of its options.",
				path: "verdict.resolvesMessageId",
			},
		];
	}
	if (input.answer === undefined) return [];
	if (target.type !== "questionnaire") {
		return [
			{
				code: "answer_not_questionnaire",
				message: "An answer resolves a question. Give a review a verdict.",
				path: "answer.resolvesMessageId",
			},
		];
	}
	const { option } = input.answer;
	if (option === undefined) return [];
	const asked = questionnairePayloadSchema.safeParse(target.payload);
	const options = asked.success ? asked.data.options : [];
	if (!options.includes(option)) {
		return [
			{
				code: "answer_unknown_option",
				message: `"${option}" is not one of the options. Pick one of them, or answer in your own words.`,
				path: "answer.option",
			},
		];
	}
	return [];
}

export function adjustThreadInvariants(input: AdjustThreadInput): Problem[] {
	const problems: Problem[] = [];

	const touchesAnyOtherField =
		input.title !== undefined ||
		input.members !== undefined ||
		input.resolved !== undefined ||
		input.pinned !== undefined ||
		input.deleted !== undefined ||
		input.message !== undefined ||
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
	if (input.message !== undefined && input.id === undefined) {
		problems.push({
			code: "adjust_message_needs_thread",
			message: "Name the thread the message is in.",
			path: "message",
		});
	}
	if (
		input.message !== undefined &&
		input.message.resolved === undefined &&
		input.message.change === undefined
	) {
		problems.push({
			code: "adjust_message_empty",
			message: "Resolve or reopen the comment, or apply or dismiss its change.",
			path: "message",
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
