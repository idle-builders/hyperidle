import { randomUUID } from "node:crypto";
import type {
	HyperIdleDb,
	NewChange,
	NewMessage,
	NewThread,
	Team,
	User,
	WriteExecutor,
} from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import {
	type ActionResult,
	type AdjustThreadInput,
	type AgentWorkIntentRecorderFn,
	type AgentWorkIntentRecorderInput,
	adjustThread as adjustThreadDeclaration,
	adjustThreadInvariants,
	agentsToWake,
	bakeAgentRunnableConfig,
	canReadThread,
	canWriteThread,
	type DocumentRow,
	type HostKind,
	type Identity,
	IdentitySchema,
	type Message,
	MessageSchema,
	type OpenThreadInput,
	openThread as openThreadDeclaration,
	type Problem,
	type ReviewVerdictOutcome,
	type ReviewVerdictRecorderFn,
	type SearchDocumentsInput,
	type SearchThreadsInput,
	type SendMessageInput,
	type SendMessageOutput,
	searchThreads as searchThreadsDeclaration,
	sendMessage as sendMessageDeclaration,
	sendMessageInvariants,
	type Thread,
	type ThreadListRow,
	type ThreadView,
	threadParticipantsSchema,
} from "@hyperidle/domain-model";
import { type ChangesRow, objectEvent } from "@hyperidle/event-bus";
import type { Action, ActionContext } from "./action-types.js";
import { resolveMentionsForMessage } from "./mention-resolver.js";
import * as store from "./thread-service.js";
import { resolveThreadTurnRequest } from "./thread-turn-resolver.js";
import { resolveThreadTitles } from "./title-ladder.js";

/**
 * The thread module's outward-facing deps — every one a sibling Service, the
 * seam, or the websocket hub.
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
		 * @lore The team-scoped read `resolveMentionsForMessage` needs — AE5's
		 * "mention any agent in the team, not only who is in the thread" rule.
		 * A nested Service may not import `@hyperidle/user` directly.
		 */
		listByTeamIds(exec: WriteExecutor, teamIds: readonly string[]): Promise<readonly User[]>;
		/**
		 * @lore Agents owned by a user (`users.ownerUserId`) —
		 * `resolveMentionsForMessage` needs it so a human's own agent stays
		 * addressable by @mention even with no team of its own.
		 */
		listOwnedBy(exec: WriteExecutor, ownerId: string): Promise<readonly User[]>;
	};
	/**
	 * The ONE door onto `document` (architecture.md §6.7, §8.3) — thread never
	 * imports `@hyperidle/document`, never opens a document (a read here must
	 * never count as one), and never calls this inside its own open
	 * transaction (a runner call inside `ctx.db.transaction` hangs PGlite).
	 * Every read below — the title ladder's batched host title, the
	 * single-thread `hostTitle`, the produced-item parent check — goes
	 * through it.
	 */
	readonly searchDocuments: (
		ctx: ActionContext,
		input: SearchDocumentsInput,
	) => Promise<ActionResult<DocumentRow[]>>;
	readonly org: { getTeam(exec: WriteExecutor, q: { id: string }): Promise<Team | undefined> };
	readonly agents: {
		requireRunnableAgent(db: HyperIdleDb, agentId: string): Promise<User>;
		/** Via `searchDocuments` now — needs the full ctx, not just `db` (§8.3). */
		getAgentIdentity(ctx: ActionContext, agentId: string): Promise<string | null>;
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

function rowToThread(
	row: {
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
	},
	computedTitle: string,
): Thread {
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

/**
 * The ladder's batched title lookup, bound to ONE `search_documents({ids})`
 * call however many document-hosted rows are in play (architecture.md §8.3)
 * — never a per-id loop. A missing/invisible document simply has no entry in
 * the returned map, and the ladder's own fallback ("Deleted document") takes
 * over.
 */
function documentTitleLookup(
	ctx: ActionContext,
	deps: ThreadActionsDeps,
): (db: HyperIdleDb, ids: readonly string[]) => Promise<ReadonlyMap<string, string>> {
	return async (_db, ids) => {
		if (ids.length === 0) return new Map();
		const result = await deps.searchDocuments(ctx, { ids: [...ids] });
		return result.ok ? new Map(result.data.map((doc) => [doc.id, doc.title])) : new Map();
	};
}

async function computeComputedTitle(
	ctx: ActionContext,
	row: Parameters<typeof rowToThread>[0],
	deps: ThreadActionsDeps,
): Promise<string> {
	const titles = await resolveThreadTitles(ctx.db, [row as never], ctx.actor, {
		listUserNames: async (d, ids) => {
			const rows = await deps.users.listByIds(d, ids);
			return new Map(rows.map((r) => [r.id, { name: r.name, ownerUserId: r.ownerUserId }]));
		},
		getDocumentTitles: documentTitleLookup(ctx, deps),
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

/**
 * A `changes` row `send_message`/`adjust_thread` wrote inside its own
 * transaction, captured for the post-commit push. `kind` here is the DB
 * vocabulary (`changes_kind_ck`); the wire `kind` is derived from it, never
 * the other way around.
 */
interface PushableChange {
	readonly id: string;
	readonly objectId: string;
	readonly kind: "created" | "changed" | "message";
	readonly actor: string;
	readonly before: Record<string, unknown> | null;
	readonly after: Record<string, unknown>;
	readonly at: string;
}

function wireKindFor(
	kind: PushableChange["kind"],
): "thread.created" | "thread.changed" | "thread.message" {
	return `thread.${kind}` as "thread.created" | "thread.changed" | "thread.message";
}

/**
 * `conversations` is a global topic any authenticated identity may subscribe
 * to — the message body may never ride it. Strip the payload, keep the
 * thread id, message id, sender and members. Applied
 * to BOTH `after` and (when present) `before` — an overwrite's `before`
 * carries the old payload just as `after` carries the new one, and it must
 * never ride this topic either.
 */
function redactMessageSideForConversations(
	side: Record<string, unknown>,
	threadId: string,
	senderId: string,
): Record<string, unknown> {
	const out: Record<string, unknown> = { threadId, messageId: side.messageId, senderId };
	if ("members" in side) out.members = side.members;
	return out;
}

/**
 * Post-commit push, once per `changes` row, on both `thread:<threadId>` and
 * `conversations` — the unchanged envelope `{type, topic, kind, data}`.
 * A no-op when `deps.wsPush` is absent (tests that don't need WS pushes,
 * per `app.ts`'s `WsPushTarget` doc comment).
 */
function pushChanges(deps: ThreadActionsDeps, rows: readonly PushableChange[]): void {
	if (!deps.wsPush) return;
	for (const row of rows) {
		const kind = wireKindFor(row.kind);
		const threadTopic = `thread:${row.objectId}`;
		deps.wsPush(threadTopic, {
			type: "update",
			topic: threadTopic,
			kind,
			data: {
				id: row.id,
				object: "thread",
				objectId: row.objectId,
				kind,
				actor: row.actor,
				before: row.before,
				after: row.after,
				at: row.at,
			},
		});
		const conversationsAfter =
			kind === "thread.message"
				? redactMessageSideForConversations(row.after, row.objectId, row.actor)
				: row.after;
		const conversationsBefore =
			kind === "thread.message" && row.before !== null
				? redactMessageSideForConversations(row.before, row.objectId, row.actor)
				: row.before;
		deps.wsPush("conversations", {
			type: "update",
			topic: "conversations",
			kind,
			data: {
				id: row.id,
				object: "thread",
				objectId: row.objectId,
				kind,
				actor: row.actor,
				before: conversationsBefore,
				after: conversationsAfter,
				at: row.at,
			},
		});
	}
}

/**
 * Post-commit, once per `changes` row this call appended — the SAME rows
 * `pushChanges` pushes over the socket — the idiom
 * thread and document use for the socket. `objectEvent` wants the raw
 * `changes`-row shape (JSON text); re-encoding `PushableChange`'s already
 * decoded `before`/`after` here keeps one canonical builder shared by every
 * module instead of a second one over decoded values.
 */
function emitObjectEvents(
	eventBus: ActionContext["eventBus"],
	rows: readonly PushableChange[],
	woke: readonly string[] = [],
): void {
	for (const row of rows) {
		const changesRow: ChangesRow = {
			id: row.id,
			object: "thread",
			objectId: row.objectId,
			kind: row.kind,
			actor: row.actor,
			before: row.before === null ? null : JSON.stringify(row.before),
			after: JSON.stringify(row.after),
			at: row.at,
		};
		eventBus.emit(objectEvent(changesRow, { woke }));
	}
}

const logger = createLogger({ pkg: "thread.thread-actions" });

class VerdictRaceConflict extends Error {}

export function createThreadActions(deps: ThreadActionsDeps): readonly Action[] {
	/**
	 * @lore Assembles the `ThreadView` for an already-loaded, already-
	 * permission-checked row — no `not_found`/`canReadThread` guard here.
	 * `openThreadRun` applies that guard itself, before calling this;
	 * `adjustThreadRun`'s with-id branch calls this directly on the row IT
	 * just wrote, because `adjustThreadRun({id, deleted:true})` must still
	 * return the ThreadView it just produced — routing that through
	 * `openThreadRun`'s own guard would make a successful delete answer its
	 * own caller with `not_found`. `open_thread.run(ctx,{id})` is bounded to
	 * the READ door; it is not a hook adjust can call to refuse its own
	 * write's result.
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
		if (row.hostKind === "document") {
			const hostResult = await deps.searchDocuments(ctx, { ids: [row.hostId] });
			hostTitle = hostResult.ok ? (hostResult.data[0]?.title ?? null) : null;
		}

		const computedTitle = await computeComputedTitle(ctx, row, deps);

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
		if (
			!row ||
			row.deletedAt !== null ||
			!canReadThread(ctx.actor, { hostKind: row.hostKind as HostKind, members })
		) {
			return {
				ok: false,
				problems: [{ code: "not_found", message: `Thread ${input.id} not found` }],
			};
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
			rows =
				input.ids.length > 0
					? await store.listThreads(ctx.db, { ids: input.ids, includeDeleted: false })
					: [];
		} else if (input.host !== undefined) {
			rows = await store.listThreads(ctx.db, {
				host: input.host,
				order: "lastActive",
				includeDeleted: false,
			});
		} else if (input.text !== undefined) {
			const participantProbe = `%${JSON.stringify(ctx.actor).replace(/[\\%_]/g, "\\$&")}%`;
			const messagePattern = `%${input.text.replace(/[\\%_]/g, "\\$&")}%`;
			const byMessage = await store.searchConversations(
				ctx.db,
				participantProbe,
				messagePattern,
				input.limit ?? 50,
			);
			const byTitle = await store.searchThreadsByTitle(
				ctx.db,
				`%${input.text}%`,
				input.limit ?? 50,
			);
			const ids = [...new Set([...byMessage.map((r) => r.id), ...byTitle.map((r) => r.id)])];
			rows = ids.length > 0 ? await store.listThreads(ctx.db, { ids, includeDeleted: false }) : [];
		} else if (input.mine !== false) {
			// `mine` defaults to the sentence's own promise — "no parameter lists
			// the ones you are in" — so an empty `{}` input (mine `undefined`)
			// takes this branch exactly like `{mine:true}`; only an explicit
			// `mine:false` with no other filter falls through to `[]` below.
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
			canReadThread(ctx.actor, {
				hostKind: r.hostKind as HostKind,
				members: parseParticipants(r.participants),
			}),
		);
		if (readable.length === 0) return { ok: true, data: [] };

		const threadIds = readable.map((r) => r.id);
		const unresolvedMsgs = await store.listMessages(ctx.db, {
			threadIds,
			types: ["review", "questionnaire"],
			unresolved: true,
		});
		const unresolvedThreadIds = new Set(unresolvedMsgs.map((m) => m.threadId));

		const lastMessageRows = await store.listLastMessagePerThread(ctx.db, threadIds);
		const lastMessageById = new Map(lastMessageRows.map((m) => [m.threadId, m]));

		const titles = await resolveThreadTitles(ctx.db, readable, ctx.actor, {
			listUserNames: async (d, ids) => {
				const users2 = await deps.users.listByIds(d, ids);
				return new Map(users2.map((u) => [u.id, { name: u.name, ownerUserId: u.ownerUserId }]));
			},
			getDocumentTitles: documentTitleLookup(ctx, deps),
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
			return {
				...thread,
				hasUnresolvedReview: unresolvedThreadIds.has(row.id),
				lastMessagePreview: preview,
			};
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
		// @lore `hasCallingThread` here means "a session is calling" (any
		// fallback MIGHT exist), not literally `caller.threadId != null` — an
		// agent with a caller but no calling thread must still reach the
		// server-side sole-human fallback, not be pre-empted here.
		const pureProblems = sendMessageInvariants(input, {
			hasCallingThread: ctx.caller !== undefined,
		});
		if (pureProblems.length > 0) return { ok: false, problems: pureProblems };

		// -- 2. resolve the thread -------------------------------------------
		let threadId: string | undefined = input.threadId;
		let creatingThread:
			| { hostKind: HostKind; hostId: string; members: string[]; directKey?: string }
			| undefined;

		if (threadId === undefined && input.recipients !== undefined) {
			if (input.recipients.length === 1) {
				const recipientId = input.recipients[0] as string;
				const recipient = await deps.users.getUserById(ctx.db, recipientId);
				if (!recipient) {
					return {
						ok: false,
						problems: [
							{
								code: "recipient_not_found",
								message: `User ${recipientId} not found`,
								path: "recipients",
							},
						],
					};
				}
				// Review-fix (BUG): the direct thread's host must not depend on who
				// spoke first. When exactly one party is AI, that agent hosts the
				// thread — whether it is `ctx.actor` (a welcome message, or any
				// agent-initiated send) or `recipientId` (a human's first send) —
				// because the assistant overlay always finds its thread as
				// `search_threads({host:{kind:"agent", id: myAgentId}})`. Human↔human
				// and agent↔agent keep the old recipient-decides shape: there is no
				// "the" agent to prefer when both or neither party is one.
				const actorUser = await deps.users.getUserById(ctx.db, ctx.actor);
				const actorIsAgent = actorUser?.kind === "ai";
				const recipientIsAgent = recipient.kind === "ai";
				let directHostKind: HostKind;
				let directHostId: string;
				if (actorIsAgent && !recipientIsAgent) {
					directHostKind = "agent";
					directHostId = ctx.actor;
				} else if (recipientIsAgent && !actorIsAgent) {
					directHostKind = "agent";
					directHostId = recipientId;
				} else {
					directHostKind = recipientIsAgent ? "agent" : "user";
					directHostId = recipientId;
				}
				const directKey = `${[ctx.actor, recipientId].sort().join(":")}:${directHostKind}`;
				const existing = await store.findThread(ctx.db, { directKey });
				if (existing) {
					threadId = existing.id;
				} else {
					creatingThread = {
						hostKind: directHostKind,
						hostId: directHostId,
						members: [ctx.actor, recipientId],
						directKey,
					};
				}
			} else {
				for (const recipientId of input.recipients) {
					const recipient = await deps.users.getUserById(ctx.db, recipientId);
					if (!recipient) {
						return {
							ok: false,
							problems: [
								{
									code: "recipient_not_found",
									message: `User ${recipientId} not found`,
									path: "recipients",
								},
							],
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
				return {
					ok: false,
					problems: [
						{
							code: "no_reply_recipient",
							message: "No thread, no recipients, and no human to reply to.",
						},
					],
				};
			}
			// Review-fix (BUG): this fallback only runs when a session is calling
			// (`ctx.caller !== undefined`), so `ctx.actor` is always the agent and
			// `human` is never one — the host is the agent, matching the
			// single-recipient rule above. It was hardcoded "user"/`human.id`,
			// which both mis-hosted the thread AND produced a different directKey
			// than the single-recipient path for the same pair, so a human's first
			// reply to the same agent created a SECOND thread instead of finding
			// this one.
			const directKey = `${[ctx.actor, human.id].sort().join(":")}:agent`;
			const existing = await store.findThread(ctx.db, { directKey });
			if (existing) {
				threadId = existing.id;
			} else {
				creatingThread = {
					hostKind: "agent",
					hostId: ctx.actor,
					members: [ctx.actor, human.id],
					directKey,
				};
			}
		}

		if (threadId === undefined && creatingThread === undefined) {
			return {
				ok: false,
				problems: [{ code: "no_reply_recipient", message: "No thread, no recipients." }],
			};
		}

		const now = ctx.now;
		const messageId = input.messageId ?? randomUUID();
		const clientKey = input.clientKey ?? randomUUID();
		const body = messageBodyOf(input);
		// The review's task is stamped by the server from the calling session,
		// never accepted from the caller's input — the input schema already
		// omits `taskId` from `review`.
		if (body.type === "review" && ctx.caller?.taskId) {
			body.payload = { ...body.payload, taskId: ctx.caller.taskId };
		}

		let threadRow: Awaited<ReturnType<typeof store.findThread>> | undefined;
		let currentMembers: string[] = creatingThread?.members ?? [];
		let existingMessageRow: Awaited<ReturnType<typeof store.findMessage>> | undefined;
		let resolvesMessageRow: Awaited<ReturnType<typeof store.findMessage>> | undefined;
		let mentionedIds: string[] = [];
		let finalMembers: string[] = [];
		let membersChanged = false;
		let resolvedAtBefore: string | null = null;
		let resolvedAtAfter: string | null = null;
		const pushRows: PushableChange[] = [];

		// Recomputed once: `creatingThread` is either a group-thread create
		// (no `directKey`, no dedup) or a direct-thread create, whose `INSERT
		// … ON CONFLICT DO NOTHING` inside step 5's transaction may find the
		// pair already has one and switch `effectiveThreadId` to the winner's
		// id — see step 5.
		const newThreadId = creatingThread ? randomUUID() : undefined;
		const resolvedThreadId = threadId ?? newThreadId;
		if (resolvedThreadId === undefined) {
			return {
				ok: false,
				problems: [{ code: "no_reply_recipient", message: "No thread, no recipients." }],
			};
		}
		let effectiveThreadId = resolvedThreadId;

		// -- 3. idempotency (create only) ------------------------------------
		if (input.messageId === undefined && input.clientKey !== undefined && threadId !== undefined) {
			const existing = await store.findMessage(ctx.db, {
				threadId,
				senderId: ctx.actor,
				clientKey: input.clientKey,
			});
			if (existing) {
				const candidatePayload = messageBodyOf(input);
				// The stored payload for a `review` carries the server-stamped
				// `taskId` — the candidate must be stamped
				// the same way before comparing, or a retry from a session (same
				// review, same clientKey) mismatches its own prior write and
				// answers `idempotency_conflict` instead of the original.
				if (candidatePayload.type === "review" && ctx.caller?.taskId) {
					candidatePayload.payload = {
						...candidatePayload.payload,
						taskId: ctx.caller.taskId,
					};
				}
				const sameType = existing.type === candidatePayload.type;
				const samePayload = existing.payload === JSON.stringify(candidatePayload.payload);
				if (sameType && samePayload) {
					const idempotentThreadRow = await store.findThread(ctx.db, { id: threadId });
					if (!idempotentThreadRow)
						return { ok: false, problems: [{ code: "not_found", message: "Thread not found" }] };
					const computedTitle = await computeComputedTitle(ctx, idempotentThreadRow, deps);
					return {
						ok: true,
						data: {
							message: rowToMessage(existing),
							thread: rowToThread(idempotentThreadRow, computedTitle),
						},
					};
				}
				return {
					ok: false,
					problems: [
						{
							code: "idempotency_conflict",
							message: "clientKey already used with a different payload",
						},
					],
				};
			}
		}

		// -- 4. server invariants ---------------------------------------------
		if (threadId !== undefined) {
			threadRow = await store.findThread(ctx.db, { id: threadId });
			if (!threadRow)
				return {
					ok: false,
					problems: [{ code: "not_found", message: `Thread ${threadId} not found` }],
				};
			if (threadRow.deletedAt !== null) {
				return {
					ok: false,
					problems: [{ code: "thread_deleted", message: "This thread was deleted." }],
				};
			}
			currentMembers = parseParticipants(threadRow.participants);
			if (
				!canWriteThread(ctx.actor, {
					hostKind: threadRow.hostKind as HostKind,
					members: currentMembers,
				})
			) {
				return {
					ok: false,
					problems: [{ code: "not_a_member", message: "You are not a member of this thread." }],
				};
			}
		}

		if (input.messageId !== undefined) {
			existingMessageRow = await store.findMessage(ctx.db, { id: input.messageId });
			if (!existingMessageRow || existingMessageRow.threadId !== threadId) {
				return {
					ok: false,
					problems: [
						{ code: "not_found", message: `Message ${input.messageId} not found in this thread` },
					],
				};
			}
		}

		if (input.review?.producedItemId !== undefined && ctx.caller?.taskId) {
			const producedResult = await deps.searchDocuments(ctx, {
				ids: [input.review.producedItemId],
			});
			const produced = producedResult.ok ? producedResult.data[0] : undefined;
			if (produced?.parentKind !== "task" || produced.parentId !== ctx.caller.taskId) {
				return {
					ok: false,
					problems: [
						{
							code: "produced_item_not_owned",
							message: "The produced item is not parented to this task.",
						},
					],
				};
			}
		}

		if (input.verdict !== undefined) {
			resolvesMessageRow = await store.findMessage(ctx.db, {
				id: input.verdict.resolvesMessageId,
			});
			if (!resolvesMessageRow) {
				return {
					ok: false,
					problems: [
						{ code: "not_found", message: "The message this verdict resolves was not found." },
					],
				};
			}
			const sender = await deps.users.getUserById(ctx.db, ctx.actor);
			if (sender?.kind !== "human") {
				return {
					ok: false,
					problems: [{ code: "verdict_not_human", message: "Only a human may give a verdict." }],
				};
			}
			if (resolvesMessageRow.senderId === ctx.actor) {
				return {
					ok: false,
					problems: [{ code: "verdict_self", message: "You cannot verdict your own review." }],
				};
			}
			if (resolvesMessageRow.threadId !== effectiveThreadId) {
				return {
					ok: false,
					problems: [
						{
							code: "verdict_foreign_review",
							message: "That review lives in a different thread.",
						},
					],
				};
			}
		}

		// -- 5. inside one transaction -----------------------------------------
		mentionedIds = [];
		finalMembers = currentMembers;
		resolvedAtBefore = threadRow?.resolvedAt ?? null;
		resolvedAtAfter = resolvedAtBefore;

		try {
			await ctx.db.transaction(async (tx) => {
				if (creatingThread) {
					const values: NewThread = {
						id: newThreadId as string,
						hostKind: creatingThread.hostKind,
						hostId: creatingThread.hostId,
						initiatorId: ctx.actor,
						participants: JSON.stringify(creatingThread.members),
						// @lore A two-party create carries the SAME directKey the lookup
						// above computed; the >1-recipient group-thread path leaves
						// this undefined (never deduped).
						directKey: creatingThread.directKey,
						pinned: false,
						lastActiveAt: now,
						createdAt: now,
					};
					// @lore A direct create is `INSERT … ON CONFLICT (direct_key) DO
					// NOTHING RETURNING *`. Under READ COMMITTED, if another
					// transaction is concurrently inserting the same `directKey`,
					// this statement waits for it to finish before deciding there's
					// a conflict, so by the time it returns no row the winner's row
					// is already committed and visible to the locked re-read below.
					// One transaction, no retry. A group-thread create (no
					// `directKey`) is never deduped, so it always "creates".
					const created =
						values.directKey !== undefined
							? (await store.insertDirectThread(
									tx as HyperIdleDb,
									values as NewThread & { directKey: string },
								)) !== undefined
							: await store.insertThread(tx as HyperIdleDb, values).then(() => true);

					if (created) {
						const createdChangeId = randomUUID();
						const createdAfter = {
							id: values.id,
							hostKind: values.hostKind,
							hostId: values.hostId,
							initiatorId: values.initiatorId,
							members: creatingThread.members,
							title: null,
							pinned: false,
							createdAt: now,
						};
						await deps.changes.appendChange(tx, {
							id: createdChangeId,
							object: "thread",
							objectId: values.id,
							kind: "created",
							actor: ctx.actor,
							before: null,
							after: JSON.stringify(createdAfter),
							at: now,
						});
						pushRows.push({
							id: createdChangeId,
							objectId: values.id,
							kind: "created",
							actor: ctx.actor,
							before: null,
							after: createdAfter,
							at: now,
						});
						finalMembers = creatingThread.members;
					} else {
						// Someone else won the pair — join the send into their
						// thread instead, same as any other existing-thread send.
						const winnerRow = await store.findThreadForUpdate(tx as HyperIdleDb, {
							directKey: creatingThread.directKey as string,
						});
						if (winnerRow) {
							effectiveThreadId = winnerRow.id;
							finalMembers = parseParticipants(winnerRow.participants);
						} else {
							finalMembers = creatingThread.members;
						}
						creatingThread = undefined;
					}
				} else if (threadRow) {
					// @lore Join-on-post race: re-read + lock the thread row inside
					// the transaction, immediately before computing membership,
					// instead of trusting `currentMembers`'s pre-transaction
					// snapshot. Two different non-members posting into the same
					// shared thread at once must not both compute "add myself" from
					// that same stale snapshot and overwrite each other's join —
					// the lock serialises the second transaction behind the first's
					// commit, so it sees the already-joined list.
					const lockedRow = await store.findThreadForUpdate(tx as HyperIdleDb, {
						id: effectiveThreadId,
					});
					if (lockedRow) finalMembers = parseParticipants(lockedRow.participants);
				}

				// join the sender on a host-scoped thread it is not yet a member of.
				const hostKind = (creatingThread?.hostKind ?? threadRow?.hostKind) as HostKind;
				const hostId = (creatingThread?.hostId ?? threadRow?.hostId) as string;
				if (
					!finalMembers.includes(ctx.actor) &&
					canWriteThread(ctx.actor, { hostKind, members: finalMembers })
				) {
					finalMembers = [...finalMembers, ctx.actor];
					membersChanged = true;
				}

				if (body.type === "plain") {
					const text = (body.payload as { text: string }).text;
					const {
						refs,
						newParticipantIds,
						mentionedIds: resolvedMentionedIds,
					} = await resolveMentionsForMessage(
						tx as HyperIdleDb,
						text,
						(body.payload as { refs?: never[] }).refs ?? [],
						finalMembers,
						ctx.actor,
						hostKind === "team" ? hostId : null,
						{
							listByIds: (d, ids) => deps.users.listByIds(d, ids),
							listByTeamIds: (d, ids) => deps.users.listByTeamIds(d, ids),
							listOwnedBy: (d, ownerId) => deps.users.listOwnedBy(d, ownerId),
						},
					);
					// @lore Wake reads every resolved mention (including an agent
					// already a member) — membership only grows for the NEW ones.
					mentionedIds.push(...resolvedMentionedIds);
					if (newParticipantIds.length > 0) {
						finalMembers = [...new Set([...finalMembers, ...newParticipantIds])];
						membersChanged = true;
					}
					if (refs.length > 0)
						body.payload = { ...(body.payload as Record<string, unknown>), refs };
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
					const updated = await store.resolveMessageIfUnresolved(
						tx as HyperIdleDb,
						resolvesMessageRow.id,
						now,
					);
					if (updated.length === 0) throw new VerdictRaceConflict();
					resolvedAtAfter = now;
					await store.updateThread(tx as HyperIdleDb, effectiveThreadId, {
						resolvedAt: now,
						lastActiveAt: now,
					});
				} else if (
					(body.type === "review" || body.type === "questionnaire") &&
					threadRow?.resolvedAt !== null &&
					threadRow !== undefined
				) {
					resolvedAtAfter = null;
					await store.updateThread(tx as HyperIdleDb, effectiveThreadId, {
						resolvedAt: null,
						lastActiveAt: now,
					});
				} else {
					await store.updateThread(tx as HyperIdleDb, effectiveThreadId, { lastActiveAt: now });
				}

				// An overwrite's `after.clientKey` is the message's OWN stored key
				// (`updateMessage` never touches that column) — never a fresh one
				// minted just to fill this field.
				const messageAfter: Record<string, unknown> = {
					messageId,
					type: body.type,
					payload: body.payload,
					clientKey: existingMessageRow?.clientKey ?? clientKey,
					blockId: body.blockId ?? null,
					createdAt: now,
				};
				if (membersChanged) messageAfter.members = finalMembers;
				const messageChangeId = randomUUID();
				await deps.changes.appendChange(tx, {
					id: messageChangeId,
					object: "thread",
					objectId: effectiveThreadId,
					kind: "message",
					actor: ctx.actor,
					before: messageBefore ? JSON.stringify(messageBefore) : null,
					after: JSON.stringify(messageAfter),
					at: now,
				});
				pushRows.push({
					id: messageChangeId,
					objectId: effectiveThreadId,
					kind: "message",
					actor: ctx.actor,
					before: messageBefore,
					after: messageAfter,
					at: now,
				});

				// @lore A resolve/reopen is the thread's OWN state moving — a
				// `changed` row for it, never naming members: `adjust_thread`
				// remains the ONLY writer of a `thread.changed` row whose diff
				// names members. The routine `lastActiveAt` bump that rides every
				// send is NOT independently reported here — a plain member-adding
				// send appends no `changed` row at all.
				if (resolvedAtAfter !== resolvedAtBefore) {
					const { before, after } = diffFields(
						effectiveThreadId,
						{ resolvedAt: resolvedAtBefore },
						{ resolvedAt: resolvedAtAfter },
					);
					const resolveAfter = { ...after, lastActiveAt: now };
					const resolveChangeId = randomUUID();
					await deps.changes.appendChange(tx, {
						id: resolveChangeId,
						object: "thread",
						objectId: effectiveThreadId,
						kind: "changed",
						actor: ctx.actor,
						before: JSON.stringify(before),
						after: JSON.stringify(resolveAfter),
						at: now,
					});
					pushRows.push({
						id: resolveChangeId,
						objectId: effectiveThreadId,
						kind: "changed",
						actor: ctx.actor,
						before,
						after: resolveAfter,
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
		// The agents this send itself starts work for: the thread turns below,
		// and on a verdict the review's sender, whom the verdict brings back.
		// Resolved before the events go out so every event names them.
		let woken: readonly string[] = [];
		if (finalMembers.length > 0) {
			const identityRows = await deps.users.listByIds(ctx.db, finalMembers);
			const isAgent = (id: string) => identityRows.some((u) => u.id === id && u.kind === "ai");
			woken = agentsToWake({
				members: finalMembers,
				senderId: ctx.actor,
				mentionedIds,
				isAgent,
			});
		}
		const woke =
			input.verdict !== undefined && resolvesMessageRow
				? [...new Set([...woken, resolvesMessageRow.senderId])]
				: woken;

		// Every row this call appended is one object event
		// (decision 5) — `pushRows` already carries them all: the message,
		// the create (if any) and the resolve/reopen (if any).
		emitObjectEvents(ctx.eventBus, pushRows, woke);

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
				const persona = askingAgent
					? await deps.agents.getAgentIdentity(ctx, askingAgent.id)
					: null;
				verdictOutcome = await deps.reviewVerdictRecorder({
					reviewMessageId: resolvesMessageRow.id,
					decision:
						input.verdict.decision === "approve" ||
						input.verdict.decision === "approve-with-comments"
							? "approve"
							: "decline",
					decidedBy: ctx.actor,
					threadId: effectiveThreadId,
					...(askingAgent ? { agentConfig: bakeAgentRunnableConfig(askingAgent, persona) } : {}),
				});
			} catch (gateErr) {
				verdictOutcome = {
					status: "not_resumable",
					reason: gateErr instanceof Error ? gateErr.message : "unknown error",
				};
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

		// wake
		for (const agentId of woken) {
			try {
				const bakedRequest = await resolveThreadTurnRequest(ctx.db, messageId, agentId, {
					requireRunnableAgent: deps.agents.requireRunnableAgent,
					// `resolveThreadTurnRequest`'s own dep shape only threads `db`,
					// not the full ctx `getAgentIdentity` now needs (§8.3) — close
					// over `ctx` here rather than widen that module's interface.
					getAgentIdentity: (_db, id) => deps.agents.getAgentIdentity(ctx, id),
				});
				await deps.agentWorkIntentRecorder({
					kind: "thread_turn",
					sourceKind: "thread_message",
					sourceId: `${messageId}:${agentId}`,
					requestedBy: ctx.actor,
					idempotencyKey: `thread-turn:${messageId}:${agentId}`,
					bakedRequest,
				} as AgentWorkIntentRecorderInput);
			} catch (error) {
				// a bake failure (e.g. a deactivated agent) drops that one wake —
				// the message stays committed and the other wakes are unaffected —
				// but the drop must be LOGGED, never silent.
				logger.error("thread turn wake failed", {
					messageId,
					agentId,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		pushChanges(deps, pushRows);

		const finalThreadRow = await store.findThread(ctx.db, { id: effectiveThreadId });
		if (!finalThreadRow)
			return {
				ok: false,
				problems: [{ code: "not_found", message: "Thread missing after write" }],
			};
		const finalMessageRow = await store.findMessage(ctx.db, { id: messageId });
		if (!finalMessageRow)
			return {
				ok: false,
				problems: [{ code: "not_found", message: "Message missing after write" }],
			};
		const computedTitle = await computeComputedTitle(ctx, finalThreadRow, deps);
		return {
			ok: true,
			data: {
				message: rowToMessage(finalMessageRow),
				thread: rowToThread(finalThreadRow, computedTitle),
			},
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
			const createdChangeId = randomUUID();
			const createdAfter = {
				id: threadId,
				hostKind: host.kind,
				hostId: host.id,
				initiatorId: ctx.actor,
				members,
				title: input.title ?? null,
				pinned: values.pinned,
				createdAt: now,
			};
			await ctx.db.transaction(async (tx) => {
				await store.insertThread(tx as HyperIdleDb, values);
				await deps.changes.appendChange(tx, {
					id: createdChangeId,
					object: "thread",
					objectId: threadId,
					kind: "created",
					actor: ctx.actor,
					before: null,
					after: JSON.stringify(createdAfter),
					at: now,
				});
				if (input.title !== undefined && input.title !== null) {
					await store.updateThread(tx as HyperIdleDb, threadId, { title: input.title });
				}
			});
			const createdRow: PushableChange = {
				id: createdChangeId,
				objectId: threadId,
				kind: "created",
				actor: ctx.actor,
				before: null,
				after: createdAfter,
				at: now,
			};
			pushChanges(deps, [createdRow]);
			emitObjectEvents(ctx.eventBus, [createdRow]);
			return openThreadRun(ctx, { id: threadId });
		}

		const row = await store.findThread(ctx.db, { id: input.id });
		if (!row)
			return {
				ok: false,
				problems: [{ code: "not_found", message: `Thread ${input.id} not found` }],
			};
		const members = parseParticipants(row.participants);
		if (!canWriteThread(ctx.actor, { hostKind: row.hostKind as HostKind, members })) {
			return {
				ok: false,
				problems: [{ code: "not_a_member", message: "You are not a member of this thread." }],
			};
		}
		if (row.deletedAt !== null && input.deleted !== false) {
			return {
				ok: false,
				problems: [{ code: "thread_deleted", message: "This thread was deleted." }],
			};
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
			const sameSet =
				newMembers.length === members.length && newMembers.every((m) => members.includes(m));
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
			const changeId = randomUUID();
			const changeBefore = { id: input.id, ...before };
			const changeAfter = { id: input.id, ...after };
			await ctx.db.transaction(async (tx) => {
				await store.updateThread(tx as HyperIdleDb, input.id as string, patch);
				await deps.changes.appendChange(tx, {
					id: changeId,
					object: "thread",
					objectId: input.id as string,
					kind: "changed",
					actor: ctx.actor,
					before: JSON.stringify(changeBefore),
					after: JSON.stringify(changeAfter),
					at: now,
				});
			});
			const changedRow: PushableChange = {
				id: changeId,
				objectId: input.id as string,
				kind: "changed",
				actor: ctx.actor,
				before: changeBefore,
				after: changeAfter,
				at: now,
			};
			pushChanges(deps, [changedRow]);
			emitObjectEvents(ctx.eventBus, [changedRow]);
		}

		// Not `openThreadRun` — that guard would refuse a `deleted:true` adjust
		// its own successful result (see `assembleThreadView`'s doc comment).
		// `canWriteThread` above already establishes the actor may see this.
		const finalRow = await store.findThread(ctx.db, { id: input.id as string });
		if (!finalRow) {
			return {
				ok: false,
				problems: [{ code: "not_found", message: `Thread ${input.id} not found` }],
			};
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
	if (input.review !== undefined)
		return { type: "review", payload: input.review as unknown as Record<string, unknown> };
	if (input.questionnaire !== undefined)
		return {
			type: "questionnaire",
			payload: input.questionnaire as unknown as Record<string, unknown>,
		};
	return { type: "verdict", payload: input.verdict as unknown as Record<string, unknown> };
}
