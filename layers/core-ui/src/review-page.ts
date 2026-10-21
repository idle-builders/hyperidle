import {
	type Anchor,
	isRedactedPayload,
	type Message,
	type Pin,
	type PlainReadPayload,
	type ReviewPayload,
} from "@hyperidle/domain-model";

/**
 * How a review reads out of its thread. A retry is a new review that names the one it follows,
 * so the rounds are a chain back to the first. Each pin on a round is its own little thread: the
 * agent's flags, lettered on from the rounds before, and people's comments, numbered in the
 * order they were made. A comment is open until someone other than its asker replies; a flag
 * until someone replies to it, or the review is approved.
 */
export interface Round {
	readonly message: Message;
	readonly review: ReviewPayload;
}

export interface PinThread {
	readonly key: string;
	readonly mark: string;
	readonly flag: boolean;
	readonly pin: Pin;
	readonly asker: string;
	/** The flag's words, or the comment that opened the pin. */
	readonly says: string;
	readonly replies: readonly Message[];
	readonly state: "open" | "answered" | "settled";
}

const live = (m: Message): boolean => m.deletedAt === null && !isRedactedPayload(m.payload);

function roundOf(m: Message | undefined): Round | undefined {
	return m?.type === "review" && live(m)
		? { message: m, review: m.payload as ReviewPayload }
		: undefined;
}

/** The rounds up to `reviewId`, first first. */
export function roundsOf(reviewId: string, messages: readonly Message[]): Round[] {
	const byId = new Map(messages.map((m) => [m.id, m]));
	const chain: Round[] = [];
	let at = roundOf(byId.get(reviewId));
	while (at && !chain.some((r) => r.message.id === at?.message.id)) {
		chain.unshift(at);
		const previous = at.review.previousReviewId;
		at = previous ? roundOf(byId.get(previous)) : undefined;
	}
	return chain;
}

/** The round that retries this one, if there is one yet. */
export function nextRoundOf(reviewId: string, messages: readonly Message[]): Message | undefined {
	return messages.find(
		(m) => roundOf(m) && (m.payload as ReviewPayload).previousReviewId === reviewId,
	);
}

/** "A" … "Z", then "AA", "AB" … */
function letter(i: number): string {
	return i < 26 ? String.fromCharCode(65 + i) : letter(Math.floor(i / 26) - 1) + letter(i % 26);
}

/** The comments on `review`, oldest first. */
function commentsOn(
	reviewId: string,
	messages: readonly Message[],
): (Message & { anchor: Anchor })[] {
	return messages.flatMap((m) => {
		if (m.type !== "plain" || !live(m)) return [];
		const anchor = (m.payload as PlainReadPayload).anchor;
		return anchor?.review === reviewId ? [{ ...m, anchor }] : [];
	});
}

export function pinsOf(
	round: Round,
	messages: readonly Message[],
	lettersBefore: number,
	approved: boolean,
): PinThread[] {
	const comments = commentsOn(round.message.id, messages);
	const flags = round.review.flags ?? [];
	const flagIds = new Set(flags.map((f) => f.id));
	const text = (m: Message) => (m.payload as PlainReadPayload).text;

	const opened: string[] = [];
	for (const c of comments)
		if (!(flagIds.has(c.anchor.id) || opened.includes(c.anchor.id))) opened.push(c.anchor.id);
	const mine = opened.flatMap((key, i): PinThread[] => {
		const [first, ...replies] = comments.filter((c) => c.anchor.id === key);
		if (!first) return [];
		const { review: _, ...pin } = first.anchor;
		return [
			{
				key,
				mark: String(i + 1),
				flag: false,
				pin,
				asker: first.senderId,
				says: text(first),
				replies,
				state: replies.some((r) => r.senderId !== first.senderId) ? "answered" : "open",
			},
		];
	});
	const theirs = flags.map((f, i): PinThread => {
		const { says, ...pin } = f;
		const replies = comments.filter((c) => c.anchor.id === f.id);
		return {
			key: f.id,
			mark: letter(lettersBefore + i),
			flag: true,
			pin,
			asker: round.message.senderId,
			says,
			replies,
			state: replies.length > 0 || approved ? "settled" : "open",
		};
	});
	return [...mine, ...theirs];
}
