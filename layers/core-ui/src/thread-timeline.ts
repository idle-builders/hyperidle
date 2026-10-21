import {
	type AnswerPayload,
	isRedactedPayload,
	type Message,
	type ReviewPayload,
	type SessionRow,
	type Task,
	type VerdictPayload,
} from "@hyperidle/domain-model";
import { NEED_WORDS, STATE_WORDS } from "./sidebar-lists";

/**
 * A thread read top to bottom. Messages from one sender close together read as one block; a
 * verdict or an answer is a small event, since the card it resolves shows the result in place;
 * the work item the thread handed off sits where it was minted; a finished stretch of agent work
 * is one event.
 */
export type Entry =
	| {
			readonly kind: "said";
			readonly key: string;
			readonly senderId: string;
			readonly at: string;
			readonly messages: readonly Message[];
	  }
	| { readonly kind: "event"; readonly key: string; readonly text: string }
	| { readonly kind: "task"; readonly key: string; readonly task: Task };

/** One sender's messages this close together share one name and time. */
const RUN_MS = 5 * 60_000;
const MINUTE = 60_000;

/** "12m", "1h", "4h 20m". */
export function duration(ms: number): string {
	const minutes = Math.max(1, Math.round(ms / MINUTE));
	if (minutes < 60) return `${minutes}m`;
	const rest = minutes % 60;
	return rest === 0 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 60)}h ${rest}m`;
}

type Stamp =
	| { at: string; rank: 0; message: Message }
	| { at: string; rank: 1; task: Task }
	| { at: string; rank: 2; worked: number };

/**
 * `messages` oldest first. `who(id)` names a sender the way an event says it ("You", "Maya").
 */
export function timeline(
	messages: readonly Message[],
	tasks: readonly Task[],
	sessions: readonly SessionRow[],
	who: (id: string) => string,
): Entry[] {
	const reviewTitle = new Map(
		messages
			.filter((m) => m.type === "review" && !isRedactedPayload(m.payload))
			.map((m) => [m.id, (m.payload as ReviewPayload).title]),
	);
	const stamps: Stamp[] = [
		...messages.map((message): Stamp => ({ at: message.createdAt, rank: 0, message })),
		...tasks.map((task): Stamp => ({ at: task.createdAt, rank: 1, task })),
		...sessions.flatMap((s): Stamp[] =>
			s.endedAt
				? [{ at: s.endedAt, rank: 2, worked: Date.parse(s.endedAt) - Date.parse(s.startedAt) }]
				: [],
		),
	].sort((a, b) => a.at.localeCompare(b.at) || a.rank - b.rank);

	const out: Entry[] = [];
	/** The stretch of finished sessions not yet written out. */
	const worked: { ms: number; n: number; key: string }[] = [];
	const flushWorked = () => {
		const w = worked.pop();
		if (!w) return;
		const n = w.n === 1 ? "1 session" : `${w.n} sessions`;
		out.push({ kind: "event", key: w.key, text: `Worked ${duration(w.ms)} · ${n}` });
	};
	for (const s of stamps) {
		if (s.rank === 2) {
			const w = worked[0];
			if (w) worked[0] = { ...w, ms: w.ms + s.worked, n: w.n + 1 };
			else worked.push({ ms: s.worked, n: 1, key: `worked-${s.at}` });
			continue;
		}
		flushWorked();
		if (s.rank === 1) {
			out.push({ kind: "task", key: `task-${s.task.id}`, task: s.task });
			continue;
		}
		const m = s.message;
		if ((m.type === "verdict" || m.type === "answer") && !isRedactedPayload(m.payload)) {
			out.push({ kind: "event", key: m.id, text: resolvedWords(m, who, reviewTitle) });
			continue;
		}
		const last = out.at(-1);
		const lastAt = last?.kind === "said" ? last.messages.at(-1)?.createdAt : undefined;
		if (
			last?.kind === "said" &&
			last.senderId === m.senderId &&
			lastAt !== undefined &&
			Date.parse(m.createdAt) - Date.parse(lastAt) <= RUN_MS
		) {
			out[out.length - 1] = { ...last, messages: [...last.messages, m] };
		} else
			out.push({ kind: "said", key: m.id, senderId: m.senderId, at: m.createdAt, messages: [m] });
	}
	flushWorked();
	return out;
}

function resolvedWords(
	m: Message,
	who: (id: string) => string,
	reviewTitle: ReadonlyMap<string, string>,
): string {
	const by = who(m.senderId);
	if (m.type === "answer") {
		const a = m.payload as AnswerPayload;
		return a.option !== undefined
			? `${by} went with ${a.option}`
			: `${by} answered: ${a.text ?? ""}`;
	}
	const v = m.payload as VerdictPayload;
	const title = reviewTitle.get(v.resolvesMessageId) ?? "the review";
	return v.decision === "approve" ? `${by} approved ${title}` : `${by} rejected ${title}`;
}

/** The work item's state in words, and the dot beside it. */
export function workState(
	task: Task,
	openReviews: number,
): { readonly words: string; readonly dot: "" | "live" | "wait" | "done" } {
	if (task.need === "review" && openReviews > 0)
		return {
			words: `${NEED_WORDS.review} · ${openReviews} ${openReviews === 1 ? "review" : "reviews"}`,
			dot: "wait",
		};
	if (task.need) return { words: NEED_WORDS[task.need], dot: "wait" };
	const dot = task.state === "in_progress" ? "live" : task.state === "done" ? "done" : "";
	return { words: STATE_WORDS[task.state], dot };
}

/** A message's time: just the clock today, the day before it otherwise. */
export function clock(iso: string, now: number = Date.now()): string {
	const at = new Date(iso);
	const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
	const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const days = Math.round((day(new Date(now)) - day(at)) / 86_400_000);
	if (days === 0) return time;
	if (days === 1) return `yesterday ${time}`;
	if (days < 7) return `${at.toLocaleDateString("en-GB", { weekday: "short" })} ${time}`;
	return `${at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${time}`;
}

/** A new conversation is named by its first line, without the @mentions that only bring people in. */
export function titleFrom(text: string, names: readonly string[]): string {
	let line = text.split("\n")[0] ?? "";
	for (const name of names) line = line.split(`@${name}`).join("");
	const title = line.replace(/\s+/g, " ").trim().slice(0, 512);
	return title || `With ${names.join(", ")}`;
}
