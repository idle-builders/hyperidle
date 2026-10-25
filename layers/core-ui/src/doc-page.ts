import {
	type Anchor,
	isRedactedPayload,
	type Message,
	type PlainReadPayload,
	type ProposedChange,
	type Task,
} from "@hyperidle/domain-model";

/**
 * How the document page reads its comments out of the document's thread. A comment is the
 * messages that share one pin on the document's text; the newest message's pin is what it covers
 * now. A pin keeps the characters it covered and their words, so the page finds them again after
 * the text around them changes, and finds the new words once a change to them was applied.
 */
/** What a new document is called until someone names it. */
export const UNTITLED = "Untitled";

export interface Range {
	readonly start: number;
	readonly end: number;
}

export interface DocComment {
	readonly id: string;
	/** Oldest first. */
	readonly messages: readonly Message[];
	readonly first: Message;
	readonly anchor: Anchor;
	readonly resolved: boolean;
}

const payloadOf = (m: Message): PlainReadPayload | null =>
	m.type === "plain" && !isRedactedPayload(m.payload) ? (m.payload as PlainReadPayload) : null;

/** The anchor a message carries when it is a comment on this document's text. */
function pinOn(m: Message, docId: string): Anchor | null {
	const anchor = payloadOf(m)?.anchor;
	return m.deletedAt === null && anchor && !anchor.review && anchor.part === docId ? anchor : null;
}

/** `messages` in any order; comments come in the order they were started. */
export function commentsOf(messages: readonly Message[], docId: string): DocComment[] {
	const byPin = new Map<string, Message[]>();
	const sorted = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	for (const m of sorted) {
		const pin = pinOn(m, docId);
		if (pin) byPin.set(pin.id, [...(byPin.get(pin.id) ?? []), m]);
	}
	return [...byPin].flatMap(([id, list]) => {
		const first = list[0];
		const last = list.at(-1);
		const anchor = last ? pinOn(last, docId) : null;
		return first && anchor
			? [{ id, messages: list, first, anchor, resolved: first.resolvedAt !== null }]
			: [];
	});
}

export const changeOf = (m: Message): ProposedChange | null => payloadOf(m)?.change ?? null;

/** The occurrence of `text` nearest `near`. */
function nearest(body: string, text: string, near: number): number | null {
	let best: number | null = null;
	for (let i = body.indexOf(text); i >= 0; i = body.indexOf(text, i + 1))
		if (best === null || Math.abs(i - near) < Math.abs(best - near)) best = i;
	return best;
}

/** Where a comment's text is in `body` now, or null when it is gone. */
export function locate(body: string, comment: DocComment): Range | null {
	const spot = comment.anchor.spot;
	const was = spot?.kind === "range" ? spot : { start: 0, end: comment.anchor.label.length };
	const length = was.end - was.start;
	const label = comment.anchor.label;
	if (body.slice(was.start, was.end).startsWith(label)) return { start: was.start, end: was.end };
	const found = nearest(body, label, was.start);
	if (found !== null)
		return { start: found, end: Math.min(body.length, found + Math.max(length, label.length)) };
	for (const m of [...comment.messages].reverse()) {
		const change = changeOf(m);
		if (change?.settled?.state !== "applied" || change.to === "") continue;
		const at = nearest(body, change.to, was.start);
		if (at !== null) return { start: at, end: at + change.to.length };
	}
	return null;
}

/** `body` with the change put in at `where`, or null when the text there is no longer `from`. */
export function changeAt(
	body: string,
	where: Range,
	change: { readonly from: string; readonly to: string },
): string | null {
	if (body.slice(where.start, where.end) !== change.from) return null;
	return body.slice(0, where.start) + change.to + body.slice(where.end);
}

/**
 * The editor holds a document's words without their Markdown. A segment is one run of words: its
 * position in the editor and where the same characters are in the stored text.
 */
export interface Segment {
	readonly pos: number;
	readonly md: number;
	readonly length: number;
}

/** `texts` are the editor's runs of text in order; each is found in `md` after the one before. */
export function segmentsOf(
	texts: readonly { readonly pos: number; readonly text: string }[],
	md: string,
): Segment[] {
	const out: Segment[] = [];
	let from = 0;
	for (const { pos, text } of texts) {
		const at = md.indexOf(text, from);
		if (at < 0) continue;
		out.push({ pos, md: at, length: text.length });
		from = at + text.length;
	}
	return out;
}

type Side = "start" | "end";

/** Between the two ways of counting; a place between runs moves into the run on its side. */
function across(
	segs: readonly Segment[],
	at: number,
	side: Side,
	from: "pos" | "md",
): number | null {
	const to = from === "pos" ? "md" : "pos";
	const inside = segs.find((s) => s[from] <= at && at <= s[from] + s.length);
	if (inside) return inside[to] + (at - inside[from]);
	if (side === "start") {
		const next = segs.find((s) => s[from] > at);
		return next ? next[to] : null;
	}
	const before = [...segs].reverse().find((s) => s[from] + s.length < at);
	return before ? before[to] + before.length : null;
}

export const toPm = (segs: readonly Segment[], offset: number, side: Side): number | null =>
	across(segs, offset, side, "md");
export const toMd = (segs: readonly Segment[], pos: number, side: Side): number | null =>
	across(segs, pos, side, "pos");

const mentioned = (m: Message): readonly string[] =>
	(payloadOf(m)?.refs ?? []).flatMap((r) => (r.kind === "mention" ? [r.identityId] : []));

/**
 * The tasks handed off from the document's comments, by comment: a task sits in the comment that
 * last named its owner before it was made, or else in the comment last spoken in before it.
 */
export function tasksIn(
	comments: readonly DocComment[],
	tasks: readonly Task[],
): Map<string, Task[]> {
	const placed = new Map<string, Task[]>();
	const said = comments.flatMap((c) => c.messages.map((m) => ({ c, m })));
	for (const task of tasks) {
		const before = said
			.filter(({ m }) => m.createdAt <= task.createdAt)
			.sort((a, b) => a.m.createdAt.localeCompare(b.m.createdAt));
		const named = before.filter(({ m }) => mentioned(m).includes(task.ownerAgentId ?? ""));
		const home = (named.at(-1) ?? before.at(-1))?.c;
		if (home) placed.set(home.id, [...(placed.get(home.id) ?? []), task]);
	}
	return placed;
}

/** Every discipline someone has or a document is marked for, once each, ignoring case. */
export function disciplinesOf(
	users: readonly { readonly discipline: string | null }[],
	docs: readonly { readonly discipline: string | null }[],
): string[] {
	const byKey = new Map<string, string>();
	for (const { discipline } of [...users, ...docs])
		if (discipline && !byKey.has(discipline.toLowerCase()))
			byKey.set(discipline.toLowerCase(), discipline);
	return [...byKey].sort(([a], [b]) => a.localeCompare(b)).map(([, d]) => d);
}
