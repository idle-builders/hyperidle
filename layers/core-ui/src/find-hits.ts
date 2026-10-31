import { isRedactedPayload, type Message, type PlainReadPayload } from "@hyperidle/domain-model";
import { appParam } from "./app-ref";
import { age } from "./sidebar-lists";

/**
 * Find or ask, from what the server says. Find lists the hits of `GET /api/search` in one run —
 * Knowledge, then Apps, then Conversations, then Work — each with where it lives and the text that matched.
 * Ask reads the thread the question was saved as: what was said, whether the agent is still
 * answering, and the sources it named.
 */
interface Hit {
	readonly id: string;
	readonly title: string;
	readonly snippet: string;
	readonly team: string | null;
	readonly at: string;
}

/** An app found; `on` is the conversation or task it opens beside, null for a page of its own. */
interface AppHit extends Hit {
	readonly kind: "document" | "message";
	readonly on: { readonly kind: "thread" | "task"; readonly id: string } | null;
}

export interface Found {
	readonly conversations: readonly Hit[];
	readonly work: readonly Hit[];
	readonly documents: readonly Hit[];
	readonly apps: readonly AppHit[];
}

export type Group = "Knowledge" | "Apps" | "Conversations" | "Work";

export interface FindRow {
	readonly id: string;
	readonly group: Group;
	/** The detail header's word for it. */
	readonly kind: "Document" | "App" | "Thread" | "Task";
	readonly title: string;
	readonly where: string;
	readonly snippet: string;
	/** The address it opens at. */
	readonly to: string;
}

const GROUPS = [
	{ group: "Knowledge", key: "documents", kind: "Document", route: "knowledge" },
	{ group: "Conversations", key: "conversations", kind: "Thread", route: "conversations" },
	{ group: "Work", key: "work", kind: "Task", route: "work" },
] as const;

/** Where an app opens: beside the conversation or task it was made in, else as its own page. */
function appTo(h: AppHit): string {
	if (!h.on) return `/knowledge/${encodeURIComponent(h.id)}`;
	const param =
		h.kind === "message"
			? appParam({ kind: "message", threadId: h.on.id, id: h.id })
			: appParam({ kind: "document", id: h.id });
	const route = h.on.kind === "thread" ? "conversations" : "work";
	return `/${route}/${encodeURIComponent(h.on.id)}?${new URLSearchParams({ app: param })}`;
}

export function findRows(found: Found, now: number = Date.now()): FindRow[] {
	const where = (group: Group, h: Hit) => [group, h.team ?? age(h.at, now)].join(" · ");
	const rows = GROUPS.map(({ group, key, kind, route }) =>
		found[key].map((h) => ({
			id: h.id,
			group,
			kind,
			title: h.title,
			where: where(group, h),
			snippet: h.snippet,
			to: `/${route}/${encodeURIComponent(h.id)}`,
		})),
	);
	const apps = found.apps.map((h) => ({
		id: h.id,
		group: "Apps" as const,
		kind: "App" as const,
		title: h.title,
		where: where("Apps", h),
		snippet: h.snippet,
		to: appTo(h),
	}));
	const [knowledge = [], ...rest] = rows;
	return [...knowledge, ...apps, ...rest.flat()];
}

/** The text cut around the first match of `query`, ignoring case, so the match can be marked. */
export function marked(text: string, query: string): [string, string, string] {
	const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
	if (at < 0) return [text, "", ""];
	return [text.slice(0, at), text.slice(at, at + query.length), text.slice(at + query.length)];
}

export interface Said {
	readonly id: string;
	readonly yours: boolean;
	readonly text: string;
}

export interface Answering {
	readonly said: readonly Said[];
	/** Your question is the newest message: the answer is still to come. */
	readonly waiting: boolean;
	/** What the others named in their answers, first mention first. */
	readonly sources: readonly { readonly kind: "document" | "task"; readonly id: string }[];
}

/** An asked thread, oldest message first. */
export function answering(messages: readonly Message[], you: string): Answering {
	const plain = messages.filter(
		(m) => m.type === "plain" && m.deletedAt === null && !isRedactedPayload(m.payload),
	);
	const said = plain.map((m) => ({
		id: m.id,
		yours: m.senderId === you,
		text: (m.payload as PlainReadPayload).text,
	}));
	const seen = new Set<string>();
	const sources = plain
		.filter((m) => m.senderId !== you)
		.flatMap((m) => (m.payload as PlainReadPayload).refs ?? [])
		.flatMap((r) =>
			(r.kind === "document" || r.kind === "task") && !seen.has(r.id) && seen.add(r.id)
				? [{ kind: r.kind, id: r.id }]
				: [],
		);
	return { said, waiting: said.at(-1)?.yours === true, sources };
}
