import { randomUUID } from "node:crypto";
import type { HyperIdleDb, NewChange, NewMessage, NewThread, Team, User, WriteExecutor } from "@hyperidle/db";
import {
	type AdjustThreadInput,
	adjustThread as adjustThreadDeclaration,
	adjustThreadInvariants,
	type AgentWorkIntentRecorderFn,
	type AgentWorkIntentRecorderInput,
	agentsToWake,
	bakeAgentRunnableConfig,
	canReadThread,
	canWriteThread,
	type HostKind,
	type Identity,
	IdentitySchema,
	type Message,
	MessageSchema,
	openThread as openThreadDeclaration,
	type OpenThreadInput,
	type Problem,
	type ReviewVerdictOutcome,
	type ReviewVerdictRecorderFn,
	searchThreads as searchThreadsDeclaration,
	type SearchThreadsInput,
	sendMessage as sendMessageDeclaration,
	type SendMessageInput,
	type SendMessageOutput,
	sendMessageInvariants,
	threadParticipantsSchema,
	type Thread,
	type ThreadListRow,
	type ThreadView,
} from "@hyperidle/domain-model";
import type { Action, ActionContext } from "./action-types.js";
import { resolveMentionsForMessage } from "./mention-resolver.js";
import * as store from "./thread-service.js";
import { resolveThreadTitles } from "./title-ladder.js";
import { resolveThreadTurnRequest } from "./thread-turn-resolver.js";

/**
 * The thread module's outward-facing deps — every one a sibling Service, the
 * seam, or the websocket hub. architecture.md §3.3.
 */
export interface ThreadActionsDeps {
	readonly changes: {
		appendChange(exec: WriteExecutor, row: NewChange): Promise<unknown>;
	};
	readonly users: {
		getUserById(exec: WriteExecutor, id: string): Promise<User | undefined>;
		listByIds(exec: WriteExecutor, ids: readonly string[]): Promise<readonly User[]>;
		/**
		 * The one human an agent answers to when it has no thread and named no
		 * recipient. Team's humans first, then any human; first by
		 * (createdAt, id).
		 */
		soleHumanForAgent(exec: WriteExecutor, agentId: string): Promise<User | undefined>;
		/**
		 * Builder addition (architecture.md §3.3 leaves "query shapes" to the
		 * builder): the team-scoped read `resolveMentionsForMessage` needs —
		 * AE5's "mention any agent in the team, not only who is in the thread"
		 * rule. A nested Service may not import `@hyperidle/users` directly.
		 */
		listByTeamIds(exec: WriteExecutor, teamIds: readonly string[]): Promise<readonly User[]>;
	};
	readonly knowledge: {
		getItemById(
			exec: WriteExecutor,
			id: string,
		): Promise<{ readonly id: string; readonly title: string } | null>;
		findParent(
			exec: WriteExecutor,
			id: string,
		): Promise<{ readonly parentKind: string; readonly parentId: string } | undefined>;
	};
	readonly org: { getTeam(exec: WriteExecutor, q: { id: string }): Promise<Team | undefined> };
	readonly settings: {
		readServerConfig(db: HyperIdleDb): Promise<{ readonly harnessDisabled: readonly string[] }>;
	};
	readonly agents: {
		requireRunnableAgent(db: HyperIdleDb, agentId: string): Promise<User>;
		getAgentIdentity(db: HyperIdleDb, agentId: string): Promise<string | null>;
	};
	readonly agentWorkIntentRecorder: AgentWorkIntentRecorderFn;
	readonly reviewVerdictRecorder: ReviewVerdictRecorderFn;
	readonly linkReviewToSession: (sessionId: string, reviewMessageId: string) => Promise<void>;
	readonly wsPush?: (topic: string, envelope: unknown) => void;
}

// ---------------------------------------------------------------------------
// Row <-> domain mapping
// ---------------------------------------------------------------------------

function parseParticipants(raw: string): string[] {
	try {
		return threadParticipantsSchema.parse(JSON.parse(raw));
	} catch {
		return [];
	}
}

function rowToThread(row: {
	id: string;
	hostKind: string;
	hostId: string;
	initiatorId: string;
	participants: string;
	title: string | null;
	pinned: boolean;
	resolvedAt: string | null;
	deletedAt: string | null;
	lastActiveAt: string;
	createdAt: string;
}, computedTitle: string): Thread {
	return {
		id: row.id,
		hostKind: row.hostKind as HostKind,
		hostId: row.hostId,
		initiatorId: row.initiatorId,
		members: parseParticipants(row.participants),
		title: row.title,
		computedTitle,
		pinned: row.pinned,
		resolvedAt: row.resolvedAt,
		deletedAt: row.deletedAt,
		lastActiveAt: row.lastActiveAt,
		createdAt: row.createdAt,
	};
}

function rowToMessage(row: {
	id: string;
	threadId: string;
	senderId: string;
	type: string;
	payload: string;
	clientKey: string;
	blockId: string | null;
	resolvedAt: string | null;
	deletedAt: string | null;
	redactedAt: string | null;
	createdAt: string;
}): Message {
	return MessageSchema.parse({
		id: row.id,
		threadId: row.threadId,
		senderId: row.senderId,
		type: row.type,
		payload: JSON.parse(row.payload) as unknown,
		clientKey: row.clientKey,
		blockId: row.blockId,
		resolvedAt: row.resolvedAt,
		deletedAt: row.deletedAt,
		redactedAt: row.redactedAt,
		createdAt: row.createdAt,
	});
}

function toIdentity(user: User): Identity {
	return IdentitySchema.parse({
		id: user.id,
		name: user.name,
		role: user.role,
		isAgent: user.kind === "ai",
	});
}

async function computeComputedTitle(
	db: HyperIdleDb,
	row: Parameters<typeof rowToThread>[0],
	actor: string,
	deps: ThreadActionsDeps,
): Promise<string> {
	const titles = await resolveThreadTitles(db, [row as never], actor, {
		listUserNames: async (d, ids) => {
			const rows = await deps.users.listByIds(d, ids);
			return new Map(rows.map((r) => [r.id, r.name]));
		},
		getKnowledgeItemTitle: async (d, id) => {
			const item = await deps.knowledge.getItemById(d, id);
			return item?.title ?? null;
		},
	});
	return titles.get(row.id) ?? "Untitled conversation";
}

/** Only the fields that differ (plus `id`) — the `changes` row's diff shape. */
function diffFields(
	id: string,
	before: Record<string, unknown> | null,
	after: Record<string, unknown>,
): { before: Record<string, unknown> | null; after: Record<string, unknown> } {
	if (before === null) return { before: null, after: { id, ...after } };
	const beforeOut: Record<string, unknown> = {};
	const afterOut: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(after)) {
		if (before[key] !== value) {
			beforeOut[key] = before[key];
			afterOut[key] = value;
		}
	}
	return { before: { id, ...beforeOut }, after: { id, ...afterOut } };
}

class VerdictRaceConflict extends Error {}

export function createThreadActions(deps: ThreadActionsDeps): readonly Action[] {
	/**
	 * Assembles the `ThreadView` for an already-loaded, already-permission-
	 * checked row — no `not_found`/`canReadThread` guard here. `openThreadRun`
	 * applies that guard itself, before calling this; `adjustThreadRun`'s
	 * with-id branch calls this directly on the row IT just wrote, because
	 * `adjustThreadRun({id, deleted:true})` must still return the ThreadView
	 * it just produced — routing that through `openThreadRun`'s own guard
	 * would make a successful delete answer its own caller with `not_found`
	 * (§3.7 "Returns open_thread.run(ctx,{id})" is bounded to the READ door;
	 * it is not asking adjust to refuse its own write's result).
	 */
	async function assembleThreadView(
		ctx: ActionContext,
		row: Parameters<typeof rowToThread>[0],
		blockId?: string,
	): Promise<ThreadView> {
		const members = parseParticipants(row.participants);
		const messageRows = await store.listMessages(ctx.db, {
			threadId: row.id,
			...(blockId !== undefined ? { blockId } : {}),
			order: "createdAt",
			dir: "desc",
			tiebreakId: true,
		});
		const messages = messageRows.map(rowToMessage);
		// `messages` is createdAt DESC, so the first unresolved review/
		// questionnaire IS the most recent by ordering — no need to reverse.
		const headMessage = messages.find(
			(m) => (m.type === "review" || m.type === "questionnaire") && m.resolvedAt === null,
		);
		const headMessageId = headMessage?.id ?? null;

		const identityRows = await deps.users.listByIds(ctx.db, members);
		const identityById = new Map(identityRows.map((u) => [u.id, toIdentity(u)]));
		const memberIdentities = members.flatMap((id) => {
			const identity = identityById.get(id);
			return identity ? [identity] : [];
		});

		let hostTitle: string | null = null;
		if (row.hostKind === "knowledge_item") {
			const item = await deps.knowledge.getItemById(ctx.db, row.hostId);
			hostTitle = item?.title ?? null;
		}

		const computedTitle = await computeComputedTitle(ctx.db, row, ctx.actor, deps);

		return {
			thread: rowToThread(row, computedTitle),
			members: memberIdentities,
			messages,
			headMessageId,
			hostTitle,
		};
	}

	// -----------------------------------------------------------------------
	// open_thread
	// -----------------------------------------------------------------------
	async function openThreadRun(
		ctx: ActionContext,
		input: OpenThreadInput,
	): Promise<{ ok: true; data: ThreadView } | { ok: false; problems: readonly Problem[] }> {
		const row = await store.findThread(ctx.db, { id: input.id });
		const members = row ? parseParticipants(row.participants) : [];
		if (!row || row.deletedAt !== null || !canReadThread(ctx.actor, { hostKind: row.hostKind as HostKind, members })) {
			return { ok: false, problems: [{ code: "not_found", message: `Thread ${input.id} not found` }] };
		}

		return { ok: true, data: await assembleThreadView(ctx, row, input.blockId) };
	}

	// -----------------------------------------------------------------------
	// search_threads
	// -----------------------------------------------------------------------
	async function searchThreadsRun(
		ctx: ActionContext,
		input: SearchThreadsInput,
	): Promise<{ ok: true; data: ThreadListRow[] } | { ok: false; problems: readonly Problem[] }> {
		let rows: Awaited<ReturnType<typeof store.listThreads>>;
		if (input.ids !== undefined) {
			rows = input.ids.length > 0 ? await store.listThreads(ctx.db, { ids: input.ids, includeDeleted: false }) : [];
		} else if (input.host !== undefined) {
			rows = await store.listThreads(ctx.db, { host: input.host, order: "lastActive", includeDeleted: false });
		} else if (input.text !== undefined) {
			const participantProbe = `%${JSON.stringify(ctx.actor).replace(/[\\%_]/g, "\\$&")}%`;
			const messagePattern = `%${input.text.replace(/[\\%_]/g, "\\$&")}%`;
			const byMessage = await store.searchConversations(
				ctx.db,
				participantProbe,
				messagePattern,
				input.limit ?? 50,
			);
			const byTitle = await store.searchThreadsByTitle(ctx.db, `%${input.text}%`, input.limit ?? 50);
			const ids = [...new Set([...byMessage.map((r) => r.id), ...byTitle.map((r) => r.id)])];
			rows = ids.length > 0 ? await store.listThreads(ctx.db, { ids, includeDeleted: false }) : [];
		} else if (input.mine === true) {
			const probe = `%${JSON.stringify(ctx.actor).replace(/[\\%_]/g, "\\$&")}%`;
			const raw = await store.listThreads(ctx.db, {
				participantProbe: probe,
				order: "lastActive",
				includeDeleted: false,
				...(input.limit !== undefined ? { limit: input.limit } : {}),
			});
			rows = raw.filter((r) => parseParticipants(r.participants).includes(ctx.actor));
		} else {
			rows = [];
		}

		const readable = rows.filter((r) =>
			canReadThread(ctx.actor, { hostKind: r.hostKind as HostKind, members: parseParticipants(r.participants) }),
		);
		if (readable.length === 0) return { ok: true, data: [] };

		const threadIds = readable.map((r) => r.id);
		const unresolvedMsgs = await store.listMessages(ctx.db, {
			threadIds,
			types: ["review", "questionnaire"],
			unresolved: true,
		});
		const unresolvedThreadIds = new Set(unresolvedMsgs.map((m) => m.threadId));

		const lastMessages = await Promise.all(
			threadIds.map(async (id) => {
				const rows2 = await store.listMessages(ctx.db, { threadId: id, order: "createdAt", dir: "desc", limit: 1 });
				return [id, rows2[0]] as const;
			}),
		);
		const lastMessageById = new Map(lastMessages);

		const titles = await resolveThreadTitles(ctx.db, readable, ctx.actor, {
			listUserNames: async (d, ids) => {
				const users2 = await deps.users.listByIds(d, ids);
				return new Map(users2.map((u) => [u.id, u.name]));
			},
			getKnowledgeItemTitle: async (d, id) => {
				const item = await deps.knowledge.getItemById(d, id);
				return item?.title ?? null;
			},
		});

		const data: ThreadListRow[] = readable.map((row) => {
			const thread = rowToThread(row, titles.get(row.id) ?? "Untitled conversation");
			const last = lastMessageById.get(row.id);
			let preview: string | null = null;
			if (last) {
				try {
					const payload = JSON.parse(last.payload) as { text?: string; title?: string };
					preview = payload.text ?? payload.title ?? null;
				} catch {
					preview = null;
				}
			}
			return { ...thread, hasUnresolvedReview: unresolvedThreadIds.has(row.id), lastMessagePreview: preview };
		});
		return { ok: true, data };
	}

	// -----------------------------------------------------------------------
	// send_message
	// -----------------------------------------------------------------------
	async function sendMessageRun(
		ctx: ActionContext,
		input: SendMessageInput,
	): Promise<{ ok: true; data: SendMessageOutput } | { ok: false; problems: readonly Problem[] }> {
		// -- 1. pure invariants ---------------------------------------------
		// Builder decision (see this item's report): `hasCallingThread` here
		// means "a session is calling" (any fallback MIGHT exist), not
		// literally `caller.threadId != null` — an agent with a caller but no
		// calling thread must still reach the server-side sole-human fallback
		// (§9's own test requires this), not be pre-empted here.
		const pureProblems = sendMessageInvariants(input, { hasCallingThread: ctx.caller !== undefined });
		if (pureProblems.length > 0) return { ok: false, problems: pureProblems };

		// -- 2. resolve the thread -------------------------------------------
		let threadId: string | undefined = input.threadId;
		let creatingThread: { hostKind: HostKind; hostId: string; members: string[] } | undefined;

		if (threadId === undefined && input.recipients !== undefined) {
			if (input.recipients.length === 1) {
				const recipientId = input.recipients[0] as string;
				const recipient = await deps.users.getUserById(ctx.db, recipientId);
				if (!recipient) {
					return {
						ok: false,
						problems: [{ code: "recipient_not_found", message: `User ${recipientId} not found`, path: "recipients" }],
					};
				}
				const directKey = `${[ctx.actor, recipientId].sort().join(":")}:${recipient.kind === "ai" ? "agent" : "user"}`;
				const existing = await store.findThread(ctx.db, { directKey });
				if (existing) {
					threadId = existing.id;
				} else {
					creatingThread = {
						hostKind: recipient.kind === "ai" ? "agent" : "user",
						hostId: recipientId,
						members: [ctx.actor, recipientId],
					};
				}
			} else {
				for (const recipientId of input.recipients) {
					const recipient = await deps.users.getUserById(ctx.db, recipientId);
					if (!recipient) {
						return {
							ok: false,
							problems: [{ code: "recipient_not_found", message: `User ${recipientId} not found`, path: "recipients" }],
						};
					}
				}
				creatingThread = {
					hostKind: "user",
					hostId: ctx.actor,
					members: [...new Set([ctx.actor, ...input.recipients])],
				};
			}
		} else if (threadId === undefined && ctx.caller?.threadId != null) {
			threadId = ctx.caller.threadId;
		} else if (threadId === undefined && ctx.caller !== undefined) {
			const human = await deps.users.soleHumanForAgent(ctx.db, ctx.actor);
			if (!human) {
				return { ok: false, problems: [{ code: "no_reply_recipient", message: "No thread, no recipients, and no human to reply to." }] };
			}
			const directKey = `${[ctx.actor, human.id].sort().join(":")}:user`;
			const existing = await store.findThread(ctx.db, { directKey });
			if (existing) {
				threadId = existing.id;
			} else {
				creatingThread = { hostKind: "user", hostId: human.id, members: [ctx.actor, human.id] };
			}
		}

		const newThreadId = creatingThread ? randomUUID() : undefined;
		const effectiveThreadId = threadId ?? newThreadId;
		if (effectiveThreadId === undefined) {
			return { ok: false, problems: [{ code: "no_reply_recipient", message: "No thread, no recipients." }] };
		}

		// -- 3. idempotency (create only) ------------------------------------
		if (input.messageId === undefined && input.clientKey !== undefined && threadId !== undefined) {
			const existing = await store.findMessage(ctx.db, { threadId, senderId: ctx.actor, clientKey: input.clientKey });
			if (existing) {
				const candidatePayload = messageBodyOf(input);
				const sameType = existing.type === candidatePayload.type;
				const samePayload = existing.payload === JSON.stringify(candidatePayload.payload);
				if (sameType && samePayload) {
					const threadRow = await store.findThread(ctx.db, { id: threadId });
					if (!threadRow) return { ok: false, problems: [{ code: "not_found", message: "Thread not found" }] };
					const computedTitle = await computeComputedTitle(ctx.db, threadRow, ctx.actor, deps);
					return { ok: true, data: { message: rowToMessage(existing), thread: rowToThread(threadRow, computedTitle) } };
				}
				return { ok: false, problems: [{ code: "idempotency_conflict", message: "clientKey already used with a different payload" }] };
			}
		}

		// -- 4. server invariants ---------------------------------------------
		let threadRow: Awaited<ReturnType<typeof store.findThread>> | undefined;
		let currentMembers: string[] = creatingThread?.members ?? [];
		let existingMessageRow: Awaited<ReturnType<typeof store.findMessage>> | undefined;

		if (threadId !== undefined) {
			threadRow = await store.findThread(ctx.db, { id: threadId });
			if (!threadRow) return { ok: false, problems: [{ code: "not_found", message: `Thread ${threadId} not found` }] };
			if (threadRow.deletedAt !== null) {
				return { ok: false, problems: [{ code: "thread_deleted", message: "This thread was deleted." }] };
			}
			currentMembers = parseParticipants(threadRow.participants);
			if (!canWriteThread(ctx.actor, { hostKind: threadRow.hostKind as HostKind, members: currentMembers })) {
				return { ok: false, problems: [{ code: "not_a_member", message: "You are not a member of this thread." }] };
			}
		}

		if (input.messageId !== undefined) {
			existingMessageRow = await store.findMessage(ctx.db, { id: input.messageId });
			if (!existingMessageRow || existingMessageRow.threadId !== threadId) {
				return { ok: false, problems: [{ code: "not_found", message: `Message ${input.messageId} not found in this thread` }] };
			}
		}

		if (input.review?.producedItemId !== undefined && ctx.caller?.taskId) {
			const parent = await deps.knowledge.findParent(ctx.db, input.review.producedItemId);
			if (!parent || parent.parentKind !== "task" || parent.parentId !== ctx.caller.taskId) {
				return {
					ok: false,
					problems: [{ code: "produced_item_not_owned", message: "The produced item is not parented to this task." }],
				};
			}
		}

		let resolvesMessageRow: Awaited<ReturnType<typeof store.findMessage>> | undefined;
		if (input.verdict !== undefined) {
			resolvesMessageRow = await store.findMessage(ctx.db, { id: input.verdict.resolvesMessageId });
			if (!resolvesMessageRow) {
				return { ok: false, problems: [{ code: "not_found", message: "The message this verdict resolves was not found." }] };
			}
			const sender = await deps.users.getUserById(ctx.db, ctx.actor);
			if (!sender || sender.kind !== "human") {
				return { ok: false, problems: [{ code: "verdict_not_human", message: "Only a human may give a verdict." }] };
			}
			if (resolvesMessageRow.senderId === ctx.actor) {
				return { ok: false, problems: [{ code: "verdict_self", message: "You cannot verdict your own review." }] };
			}
			if (resolvesMessageRow.threadId !== effectiveThreadId) {
				return { ok: false, problems: [{ code: "verdict_foreign_review", message: "That review lives in a different thread." }] };
			}
		}

		// -- 5. inside one transaction -----------------------------------------
		const now = ctx.now;
		const messageId = input.messageId ?? randomUUID();
		const clientKey = input.clientKey ?? randomUUID();
		const body = messageBodyOf(input);
		const mentionedIds: string[] = [];
		let finalMembers = currentMembers;
		let membersChanged = false;
		let resolvedAtBefore: string | null = threadRow?.resolvedAt ?? null;
		let resolvedAtAfter: string | null = resolvedAtBefore;
		let willReopen = false;

		try {
			await ctx.db.transaction(async (tx) => {
				if (creatingThread) {
				const values: NewThread = {
					id: newThreadId as string,
					hostKind: creatingThread.hostKind,
					hostId: creatingThread.hostId,
					initiatorId: ctx.actor,
					participants: JSON.stringify(creatingThread.members),
					pinned: false,
					lastActiveAt: now,
					createdAt: now,
				};
				await store.insertThread(tx as HyperIdleDb, values);
				await deps.changes.appendChange(tx, {
					id: randomUUID(),
					object: "thread",
					objectId: values.id,
					kind: "created",
					actor: ctx.actor,
					before: null,
					after: JSON.stringify({
						id: values.id,
						hostKind: values.hostKind,
						hostId: values.hostId,
						initiatorId: values.initiatorId,
						members: creatingThread.members,
						title: null,
						pinned: false,
						createdAt: now,
					}),
					at: now,
				});
				finalMembers = creatingThread.members;
			}

			// join the sender on a host-scoped thread it is not yet a member of.
			const hostKind = (creatingThread?.hostKind ?? threadRow?.hostKind) as HostKind;
			if (!finalMembers.includes(ctx.actor) && canWriteThread(ctx.actor, { hostKind, members: finalMembers })) {
				finalMembers = [...finalMembers, ctx.actor];
				membersChanged = true;
			}

			if (body.type === "plain") {
				const text = (body.payload as { text: string }).text;
				const { refs, newParticipantIds } = await resolveMentionsForMessage(
					tx as HyperIdleDb,
					text,
					(body.payload as { refs?: never[] }).refs ?? [],
					finalMembers,
					ctx.actor,
					{
						listByIds: (d, ids) => deps.users.listByIds(d, ids),
						listByTeamIds: (d, ids) => deps.users.listByTeamIds(d, ids),
					},
				);
				if (newParticipantIds.length > 0) {
					finalMembers = [...new Set([...finalMembers, ...newParticipantIds])];
					membersChanged = true;
					mentionedIds.push(...newParticipantIds);
				}
				if (refs.length > 0) body.payload = { ...(body.payload as Record<string, unknown>), refs };
			}

			if (membersChanged) {
				await store.updateThread(tx as HyperIdleDb, effectiveThreadId, {
					participants: JSON.stringify(finalMembers),
				});
			}

			let messageBefore: Record<string, unknown> | null = null;
			if (existingMessageRow) {
				messageBefore = {
					messageId: existingMessageRow.id,
					type: existingMessageRow.type,
					payload: JSON.parse(existingMessageRow.payload),
				};
				await store.updateMessage(tx as HyperIdleDb, messageId, {
					type: body.type,
					payload: JSON.stringify(body.payload),
					blockId: body.blockId ?? null,
				});
			} else {
				const values: NewMessage = {
					id: messageId,
					senderId: ctx.actor,
					threadId: effectiveThreadId,
					type: body.type,
					payload: JSON.stringify(body.payload),
					clientKey,
					blockId: body.blockId ?? null,
					createdAt: now,
				};
				await store.insertMessage(tx as HyperIdleDb, values);
			}

			if (input.verdict !== undefined && resolvesMessageRow) {
				const updated = await store.resolveMessageIfUnresolved(tx as HyperIdleDb, resolvesMessageRow.id, now);
				if (updated.length === 0) throw new VerdictRaceConflict();
				resolvedAtAfter = now;
				await store.updateThread(tx as HyperIdleDb, effectiveThreadId, { resolvedAt: now, lastActiveAt: now });
			} else if ((body.type === "review" || body.type === "questionnaire") && threadRow?.resolvedAt !== null && threadRow !== undefined) {
				willReopen = true;
				resolvedAtAfter = null;
				await store.updateThread(tx as HyperIdleDb, effectiveThreadId, { resolvedAt: null, lastActiveAt: now });
			} else {
				await store.updateThread(tx as HyperIdleDb, effectiveThreadId, { lastActiveAt: now });
			}

			const messageAfter: Record<string, unknown> = {
				messageId,
				type: body.type,
				payload: body.payload,
				clientKey,
				blockId: body.blockId ?? null,
				createdAt: now,
			};
			if (membersChanged) messageAfter.members = finalMembers;
			await deps.changes.appendChange(tx, {
				id: randomUUID(),
				object: "thread",
				objectId: effectiveThreadId,
				kind: "message",
				actor: ctx.actor,
				before: messageBefore ? JSON.stringify(messageBefore) : null,
				after: JSON.stringify(messageAfter),
				at: now,
			});

			// A resolve/reopen is the thread's OWN state moving — a `changed`
			// row for it, never naming members (architecture.md §3.5: "adjust_thread
			// remains the ONLY writer of a thread.changed row whose diff names
			// members"). The routine lastActiveAt bump that rides every send is
			// NOT independently reported here — §9's own assertion requires a
			// plain member-adding send to append no `changed` row at all.
			if (resolvedAtAfter !== resolvedAtBefore) {
				const { before, after } = diffFields(effectiveThreadId, { resolvedAt: resolvedAtBefore }, { resolvedAt: resolvedAtAfter });
				await deps.changes.appendChange(tx, {
					id: randomUUID(),
					object: "thread",
					objectId: effectiveThreadId,
					kind: "changed",
					actor: ctx.actor,
					before: JSON.stringify(before),
					after: JSON.stringify({ ...after, lastActiveAt: now }),
					at: now,
				});
			}
			});
		} catch (e) {
			if (e instanceof VerdictRaceConflict) {
				return {
					ok: false,
					problems: [{ code: "verdict_race", message: "This review was already resolved." }],
				};
			}
			throw e;
		}

		// -- 6. after commit -----------------------------------------------------
		ctx.eventBus.emit({
			type: "thread_message_appended",
			streamId: effectiveThreadId,
			threadId: effectiveThreadId,
			messageId,
			messageType: body.type,
			senderId: ctx.actor,
			timestamp: Date.now(),
		} as never);
		if (creatingThread) {
			ctx.eventBus.emit({
				type: "thread_created",
				streamId: effectiveThreadId,
				threadId: effectiveThreadId,
				hostKind: creatingThread.hostKind,
				hostId: creatingThread.hostId,
				initiatorId: ctx.actor,
				timestamp: Date.now(),
			} as never);
		}
		if (resolvedAtAfter !== resolvedAtBefore && input.verdict !== undefined) {
			ctx.eventBus.emit({
				type: "thread_resolved",
				streamId: effectiveThreadId,
				threadId: effectiveThreadId,
				resolvedByMessageId: messageId,
				timestamp: Date.now(),
			} as never);
		}
		if (willReopen) {
			ctx.eventBus.emit({
				type: "thread_reopened",
				streamId: effectiveThreadId,
				threadId: effectiveThreadId,
				reopenedByMessageId: messageId,
				timestamp: Date.now(),
			} as never);
		}

		if (body.type === "review" && ctx.caller?.sessionId) {
			await deps.linkReviewToSession(ctx.caller.sessionId, messageId);
		}

		if (input.verdict !== undefined && resolvesMessageRow) {
			let verdictOutcome: ReviewVerdictOutcome;
			try {
				// The agent that asked is the review's own sender. Its runnable
				// config is core state, so it is baked here and carried across —
				// admission treats a missing bake as a deactivated agent.
				const askingAgent = await deps.users.getUserById(ctx.db, resolvesMessageRow.senderId);
				const persona = askingAgent ? await deps.agents.getAgentIdentity(ctx.db, askingAgent.id) : null;
				verdictOutcome = await deps.reviewVerdictRecorder({
					reviewMessageId: resolvesMessageRow.id,
					decision:
						input.verdict.decision === "approve" || input.verdict.decision === "approve-with-comments"
							? "approve"
							: "decline",
					decidedBy: ctx.actor,
					threadId: effectiveThreadId,
					...(askingAgent ? { agentConfig: bakeAgentRunnableConfig(askingAgent, persona) } : {}),
				});
			} catch (gateErr) {
				verdictOutcome = { status: "not_resumable", reason: gateErr instanceof Error ? gateErr.message : "unknown error" };
			}
			if (verdictOutcome.status === "not_resumable") {
				await sendMessageRun(
					{ actor: ctx.actor, db: ctx.db, eventBus: ctx.eventBus, now: ctx.now },
					{
						threadId: effectiveThreadId,
						text: `This action was approved but could not be carried out: ${verdictOutcome.reason}. The agent has not been told, and the action has not run.`,
					},
				);
			}
		}

		// wake — architecture.md §3.10.
		if (finalMembers.length > 0) {
			const identityRows = await deps.users.listByIds(ctx.db, finalMembers);
			const isAgent = (id: string) => identityRows.some((u) => u.id === id && u.kind === "ai");
			const woken = agentsToWake({ members: finalMembers, senderId: ctx.actor, mentionedIds, isAgent });
			for (const agentId of woken) {
				try {
					const bakedRequest = await resolveThreadTurnRequest(ctx.db, messageId, agentId, {
						requireRunnableAgent: deps.agents.requireRunnableAgent,
						getAgentIdentity: deps.agents.getAgentIdentity,
						readServerConfig: deps.settings.readServerConfig,
					});
					await deps.agentWorkIntentRecorder({
						kind: "thread_turn",
						sourceKind: "thread_message",
						sourceId: `${messageId}:${agentId}`,
						requestedBy: ctx.actor,
						idempotencyKey: `thread-turn:${messageId}:${agentId}`,
						bakedRequest,
					} as AgentWorkIntentRecorderInput);
				} catch {
					// a bake failure (e.g. a deactivated agent) drops that one wake;
					// the message stays committed and the other wakes are unaffected.
				}
			}
		}

		if (deps.wsPush) {
			deps.wsPush(`thread:${effectiveThreadId}`, { kind: "thread.message", objectId: effectiveThreadId });
			deps.wsPush("conversations", { kind: "thread.message", objectId: effectiveThreadId });
		}

		const finalThreadRow = await store.findThread(ctx.db, { id: effectiveThreadId });
		if (!finalThreadRow) return { ok: false, problems: [{ code: "not_found", message: "Thread missing after write" }] };
		const finalMessageRow = await store.findMessage(ctx.db, { id: messageId });
		if (!finalMessageRow) return { ok: false, problems: [{ code: "not_found", message: "Message missing after write" }] };
		const computedTitle = await computeComputedTitle(ctx.db, finalThreadRow, ctx.actor, deps);
		return {
			ok: true,
			data: { message: rowToMessage(finalMessageRow), thread: rowToThread(finalThreadRow, computedTitle) },
		};
	}

	// -----------------------------------------------------------------------
	// adjust_thread
	// -----------------------------------------------------------------------
	async function adjustThreadRun(
		ctx: ActionContext,
		input: AdjustThreadInput,
	): Promise<{ ok: true; data: ThreadView } | { ok: false; problems: readonly Problem[] }> {
		const pureProblems = adjustThreadInvariants(input);
		if (pureProblems.length > 0) return { ok: false, problems: pureProblems };

		const now = ctx.now;
		if (input.id === undefined) {
			const host = input.host ?? { kind: "user" as HostKind, id: ctx.actor };
			const members = [...new Set([ctx.actor, ...(input.members ?? [])])];
			const threadId = randomUUID();
			const values: NewThread = {
				id: threadId,
				hostKind: host.kind,
				hostId: host.id,
				initiatorId: ctx.actor,
				participants: JSON.stringify(members),
				pinned: input.pinned ?? false,
				lastActiveAt: now,
				createdAt: now,
			};
			await ctx.db.transaction(async (tx) => {
				await store.insertThread(tx as HyperIdleDb, values);
				await deps.changes.appendChange(tx, {
					id: randomUUID(),
					object: "thread",
					objectId: threadId,
					kind: "created",
					actor: ctx.actor,
					before: null,
					after: JSON.stringify({
						id: threadId,
						hostKind: host.kind,
						hostId: host.id,
						initiatorId: ctx.actor,
						members,
						title: input.title ?? null,
						pinned: values.pinned,
						createdAt: now,
					}),
					at: now,
				});
				if (input.title !== undefined && input.title !== null) {
					await store.updateThread(tx as HyperIdleDb, threadId, { title: input.title });
				}
			});
			return openThreadRun(ctx, { id: threadId });
		}

		const row = await store.findThread(ctx.db, { id: input.id });
		if (!row) return { ok: false, problems: [{ code: "not_found", message: `Thread ${input.id} not found` }] };
		const members = parseParticipants(row.participants);
		if (!canWriteThread(ctx.actor, { hostKind: row.hostKind as HostKind, members })) {
			return { ok: false, problems: [{ code: "not_a_member", message: "You are not a member of this thread." }] };
		}
		if (row.deletedAt !== null && input.deleted !== false) {
			return { ok: false, problems: [{ code: "thread_deleted", message: "This thread was deleted." }] };
		}

		const before: Record<string, unknown> = {};
		const after: Record<string, unknown> = {};
		const patch: Partial<NewThread> = {};
		if (input.title !== undefined && input.title !== row.title) {
			before.title = row.title;
			after.title = input.title;
			patch.title = input.title;
		}
		if (input.members !== undefined) {
			const newMembers = [...new Set(input.members)];
			const sameSet = newMembers.length === members.length && newMembers.every((m) => members.includes(m));
			if (!sameSet) {
				before.members = members;
				after.members = newMembers;
				patch.participants = JSON.stringify(newMembers);
			}
		}
		if (input.resolved !== undefined) {
			const newResolvedAt = input.resolved ? now : null;
			if (newResolvedAt !== row.resolvedAt) {
				before.resolvedAt = row.resolvedAt;
				after.resolvedAt = newResolvedAt;
				patch.resolvedAt = newResolvedAt;
			}
		}
		if (input.pinned !== undefined && input.pinned !== row.pinned) {
			before.pinned = row.pinned;
			after.pinned = input.pinned;
			patch.pinned = input.pinned;
		}
		if (input.deleted !== undefined) {
			const newDeletedAt = input.deleted ? now : null;
			if (newDeletedAt !== row.deletedAt) {
				before.deletedAt = row.deletedAt;
				after.deletedAt = newDeletedAt;
				patch.deletedAt = newDeletedAt;
			}
		}

		if (Object.keys(after).length > 0) {
			await ctx.db.transaction(async (tx) => {
				await store.updateThread(tx as HyperIdleDb, input.id as string, patch);
				await deps.changes.appendChange(tx, {
					id: randomUUID(),
					object: "thread",
					objectId: input.id as string,
					kind: "changed",
					actor: ctx.actor,
					before: JSON.stringify({ id: input.id, ...before }),
					after: JSON.stringify({ id: input.id, ...after }),
					at: now,
				});
			});
		}

		// Not `openThreadRun` — that guard would refuse a `deleted:true` adjust
		// its own successful result (see `assembleThreadView`'s doc comment).
		// `canWriteThread` above already establishes the actor may see this.
		const finalRow = await store.findThread(ctx.db, { id: input.id as string });
		if (!finalRow) {
			return { ok: false, problems: [{ code: "not_found", message: `Thread ${input.id} not found` }] };
		}
		return { ok: true, data: await assembleThreadView(ctx, finalRow) };
	}

	return [
		{ declaration: searchThreadsDeclaration, run: searchThreadsRun } as Action,
		{ declaration: openThreadDeclaration, run: openThreadRun } as Action,
		{ declaration: sendMessageDeclaration, run: sendMessageRun } as Action,
		{ declaration: adjustThreadDeclaration, run: adjustThreadRun } as Action,
	];
}

/** The one non-null body out of the four `send_message` may carry. */
function messageBodyOf(input: SendMessageInput): {
	type: "plain" | "review" | "questionnaire" | "verdict";
	payload: Record<string, unknown>;
	blockId?: string;
} {
	if (input.text !== undefined) {
		return {
			type: "plain",
			payload: {
				text: input.text,
				...(input.refs !== undefined ? { refs: input.refs } : {}),
				...(input.blockId !== undefined ? { blockId: input.blockId } : {}),
				...(input.spotLabel !== undefined ? { spotLabel: input.spotLabel } : {}),
			},
			...(input.blockId !== undefined ? { blockId: input.blockId } : {}),
		};
	}
	if (input.review !== undefined) return { type: "review", payload: input.review as unknown as Record<string, unknown> };
	if (input.questionnaire !== undefined)
		return { type: "questionnaire", payload: input.questionnaire as unknown as Record<string, unknown> };
	return { type: "verdict", payload: input.verdict as unknown as Record<string, unknown> };
}
