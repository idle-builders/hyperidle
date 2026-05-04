/**
 * Shared decoder for `GET /api/threads/:id` responses.
 *
 * @lore L15: extracted from `WorkTeamTaskThread` + `ConversationsReview`
 * (previously copy/pasted). Both pages call the same endpoint and need the
 * same shape, so the decoder lives in one place. Add new fields by extending
 * `decodeThread` — do not paper over missing fields with defaults.
 */
import {
	HOST_KINDS,
	type HostKind,
	MESSAGE_TYPES,
	type Message,
	type MessageType,
	type Thread,
} from "@hyperidle/shared";

export interface ThreadDetail {
	thread: Thread;
	messages: ReadonlyArray<Message>;
	headMessageId: string | null;
	identities: Record<string, { name: string; role?: string }>;
}

export class ThreadDetailDecodeError extends Error {
	constructor(reason: string) {
		super(`thread detail decode: ${reason}`);
		this.name = "ThreadDetailDecodeError";
	}
}

export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHostKind(value: unknown): value is HostKind {
	return typeof value === "string" && (HOST_KINDS as ReadonlyArray<string>).includes(value);
}

function decodeThread(value: unknown): Thread {
	if (!isObject(value)) {
		throw new ThreadDetailDecodeError("missing thread");
	}
	const {
		id,
		hostKind,
		hostId,
		initiatorId,
		participants,
		pinned,
		resolvedAt,
		lastActiveAt,
		createdAt,
	} = value;
	if (typeof id !== "string") throw new ThreadDetailDecodeError("thread.id");
	if (!isHostKind(hostKind)) throw new ThreadDetailDecodeError("thread.hostKind");
	if (typeof hostId !== "string") throw new ThreadDetailDecodeError("thread.hostId");
	if (typeof initiatorId !== "string") throw new ThreadDetailDecodeError("thread.initiatorId");
	if (!(Array.isArray(participants) && participants.every((p) => typeof p === "string"))) {
		throw new ThreadDetailDecodeError("thread.participants");
	}
	if (typeof pinned !== "boolean") throw new ThreadDetailDecodeError("thread.pinned");
	if (resolvedAt !== null && typeof resolvedAt !== "string") {
		throw new ThreadDetailDecodeError("thread.resolvedAt");
	}
	if (typeof lastActiveAt !== "string") throw new ThreadDetailDecodeError("thread.lastActiveAt");
	if (typeof createdAt !== "string") throw new ThreadDetailDecodeError("thread.createdAt");
	return {
		id,
		hostKind,
		hostId,
		initiatorId,
		participants,
		pinned,
		resolvedAt,
		lastActiveAt,
		createdAt,
	};
}

function isMessageType(value: unknown): value is MessageType {
	return typeof value === "string" && (MESSAGE_TYPES as ReadonlyArray<string>).includes(value);
}

/**
 * @lore L15 review (apply E / Security MUST-2): the previous implementation
 * trusted `value.messages as ReadonlyArray<Message>` and let downstream
 * narrowing in ThreadShell handle per-payload type checks. A malformed row
 * with an unrecognised `type` (or a missing payload object) would crash
 * inside the renderer rather than failing loudly here. We now mirror the
 * server `messageRowSchema` discriminated union shape — type discriminator
 * + the BaseMessage required fields + a payload object.
 */
function decodeMessage(value: unknown, index: number): Message {
	if (!isObject(value)) {
		throw new ThreadDetailDecodeError(`messages[${index}] is not an object`);
	}
	const {
		id,
		threadId,
		senderId,
		clientKey,
		deletedAt,
		redactedAt,
		resolvedAt,
		createdAt,
		type,
		payload,
	} = value;
	// Required wire fields that the renderer reads.
	if (typeof id !== "string") throw new ThreadDetailDecodeError(`messages[${index}].id`);
	if (typeof threadId !== "string")
		throw new ThreadDetailDecodeError(`messages[${index}].threadId`);
	if (typeof senderId !== "string")
		throw new ThreadDetailDecodeError(`messages[${index}].senderId`);
	if (typeof createdAt !== "string")
		throw new ThreadDetailDecodeError(`messages[${index}].createdAt`);
	if (!isMessageType(type)) throw new ThreadDetailDecodeError(`messages[${index}].type`);
	if (!isObject(payload)) throw new ThreadDetailDecodeError(`messages[${index}].payload`);
	// Optional (server-emitted) tombstone fields — accept null/undefined or
	// string. Renderer only reads `resolvedAt` for `cardSubject`; the others
	// are tracked in the type for future fanout.
	if (clientKey !== undefined && typeof clientKey !== "string") {
		throw new ThreadDetailDecodeError(`messages[${index}].clientKey`);
	}
	if (deletedAt !== undefined && deletedAt !== null && typeof deletedAt !== "string") {
		throw new ThreadDetailDecodeError(`messages[${index}].deletedAt`);
	}
	if (redactedAt !== undefined && redactedAt !== null && typeof redactedAt !== "string") {
		throw new ThreadDetailDecodeError(`messages[${index}].redactedAt`);
	}
	if (resolvedAt !== undefined && resolvedAt !== null && typeof resolvedAt !== "string") {
		throw new ThreadDetailDecodeError(`messages[${index}].resolvedAt`);
	}
	// The cast is safe because we have validated the discriminator + base fields.
	return {
		id,
		threadId,
		senderId,
		clientKey: typeof clientKey === "string" ? clientKey : "",
		deletedAt: typeof deletedAt === "string" ? deletedAt : null,
		redactedAt: typeof redactedAt === "string" ? redactedAt : null,
		resolvedAt: typeof resolvedAt === "string" ? resolvedAt : null,
		createdAt,
		type,
		payload,
	} as Message;
}

export function decodeThreadDetail(value: unknown): ThreadDetail {
	if (!isObject(value)) {
		throw new ThreadDetailDecodeError("response is not an object");
	}
	const thread = decodeThread(value.thread);
	if (!Array.isArray(value.messages)) {
		throw new ThreadDetailDecodeError("missing messages array");
	}
	const headMessageId = value.headMessageId;
	if (typeof headMessageId !== "string" && headMessageId !== null) {
		throw new ThreadDetailDecodeError("invalid headMessageId");
	}
	const identitiesRaw = isObject(value.identities) ? value.identities : {};
	const identities: Record<string, { name: string; role?: string }> = {};
	for (const [k, v] of Object.entries(identitiesRaw)) {
		if (!isObject(v) || typeof v.name !== "string") continue;
		identities[k] = {
			name: v.name,
			...(typeof v.role === "string" ? { role: v.role } : {}),
		};
	}
	const messages: Message[] = value.messages.map((m, i) => decodeMessage(m, i));
	return {
		thread,
		messages,
		headMessageId,
		identities,
	};
}
