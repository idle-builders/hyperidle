import type {
	ChangeRow,
	DocumentRow,
	Task,
	ThreadListRow,
	UserRow,
	UserView,
} from "@hyperidle/domain-model";

/**
 * The sidebar's lists, built from what the server says. Each list is in priority order: what you
 * owe first, then what is new to you, then the rest. "New to you" is an unread notification about
 * the thing.
 */

/**
 * `state` is the status in words. `yours` = you owe something (the only use of the flag colour);
 * `fresh` = something new you have not seen.
 */
export interface Item {
	id: string;
	title: string;
	state: string;
	who: string;
	age: string;
	yours?: boolean;
	fresh?: boolean;
	/** The team a task belongs to, so Work can be narrowed to one. */
	team?: string;
}

/** A node of the knowledge tree; a team's space sits at the top of it. */
export interface Doc {
	id: string;
	title: string;
	note?: string;
	children?: Doc[];
	space?: boolean;
}

export interface Team {
	id: string;
	name: string;
}

export type Inbox = NonNullable<UserView["inbox"]>;
type Names = ReadonlyMap<string, string>;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** How long ago, the way a list row says it: now, 12m, 8h, yesterday, Mon, 3 Sep. */
export function age(iso: string, now: number = Date.now()): string {
	const at = new Date(iso);
	const ms = now - at.getTime();
	if (ms < MINUTE) return "now";
	if (ms < 60 * MINUTE) return `${Math.floor(ms / MINUTE)}m`;
	if (ms < DAY) return `${Math.floor(ms / (60 * MINUTE))}h`;
	if (ms < 2 * DAY) return "yesterday";
	if (ms < 7 * DAY) return at.toLocaleDateString("en-GB", { weekday: "short" });
	return at.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function initials(name: string): string {
	return name
		.split(/\s+/)
		.map((w) => w[0] ?? "")
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

/** A list row names people by their first name, as people do. */
export function namesOf(users: readonly UserRow[]): Map<string, string> {
	return new Map(users.map((u) => [u.id, u.name.split(" ")[0] ?? u.name]));
}

/** Every team anyone is in, by name — there is one organisation and nothing names it. */
export function teamsOf(users: readonly UserRow[]): Team[] {
	const byId = new Map(users.flatMap((u) => u.teams).map((t) => [t.id, t]));
	return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Unread notifications, by the id of what they are about. */
function unreadAbout(inbox: Inbox, object: ChangeRow["object"]): Map<string, ChangeRow> {
	return new Map(
		inbox
			.filter((r) => r.readAt === null && r.change.object === object)
			.map((r) => [r.change.objectId, r.change]),
	);
}

/** Priority order, stable within a rank. */
function ranked(items: Item[], rank: (i: Item) => number): Item[] {
	return items
		.map((i, n) => ({ i, n }))
		.sort((a, b) => rank(a.i) - rank(b.i) || a.n - b.n)
		.map((x) => x.i);
}

const NEED_WORDS = { stuck: "Stuck", input: "Needs input", review: "Needs review" } as const;

export function conversationItems(
	threads: readonly ThreadListRow[],
	you: string,
	names: Names,
	inbox: Inbox,
): Item[] {
	const unread = unreadAbout(inbox, "thread");
	const items = threads.map((t): Item => {
		const base = { id: t.id, title: t.computedTitle, age: age(t.lastActiveAt) };
		const last = t.lastSenderId === you ? "You" : (names.get(t.lastSenderId ?? "") ?? "");
		if (t.mentionsYou) return { ...base, state: "Mentioned you", who: last, yours: true };
		if (t.need === "review") return { ...base, state: NEED_WORDS.review, who: last, yours: true };
		if (t.need) return { ...base, state: NEED_WORDS[t.need], who: `${last} asks`, yours: true };
		const reply = unread.get(t.id);
		if (reply)
			return { ...base, state: "New reply", who: names.get(reply.actor) ?? "", fresh: true };
		return { ...base, state: last ? `${last}:` : "", who: t.lastMessagePreview ?? "" };
	});
	return ranked(items, (i) => (i.yours ? 0 : i.fresh ? 1 : 2));
}

const STATE_WORDS: Record<Task["state"], string> = {
	proposed: "Queued",
	accepted: "Queued",
	in_progress: "Running",
	blocked: "Stuck",
	review: "Needs review",
	hold: "On hold",
	done: "Done",
	killed: "Stopped",
};

/** Root tasks only: the agent owns them, so nothing here is yours — the review is in Conversations. */
export function workItems(tasks: readonly Task[], names: Names, inbox: Inbox): Item[] {
	const kids = new Map<string, Task[]>();
	for (const t of tasks)
		if (t.parentTaskId) kids.set(t.parentTaskId, [...(kids.get(t.parentTaskId) ?? []), t]);
	const leaves = (t: Task): Task[] => {
		const under = kids.get(t.id) ?? [];
		return under.length === 0 ? [t] : under.flatMap(leaves);
	};
	const unread = unreadAbout(inbox, "task");
	const items = tasks
		.filter((t) => t.parentTaskId === null && t.state !== "killed")
		.map((t): Item => {
			const parts = kids.has(t.id) ? leaves(t) : [];
			const done = parts.filter((p) => p.state === "done").length;
			const state = t.need
				? NEED_WORDS[t.need]
				: parts.length > 0 && t.state !== "done"
					? `${done} of ${parts.length} done`
					: STATE_WORDS[t.state];
			return {
				id: t.id,
				title: t.title,
				state,
				who: names.get(t.ownerAgentId ?? "") ?? "",
				age: age(t.updatedAt),
				fresh: unread.has(t.id),
				team: t.teamId,
			};
		});
	const needs: ReadonlySet<string> = new Set(Object.values(NEED_WORDS));
	return ranked(items, (i) => (i.fresh ? 0 : needs.has(i.state) ? 1 : i.state === "Done" ? 3 : 2));
}

/** Drafts someone else wrote wait for you to publish them; then what changed since you looked. */
export function knowledgeItems(
	docs: readonly DocumentRow[],
	you: string,
	names: Names,
	teams: readonly Team[],
	inbox: Inbox,
): Item[] {
	const drafts = docs
		.filter((d) => d.status === "proposed" && d.updatedBy !== you)
		.map(
			(d): Item => ({
				id: d.id,
				title: d.title,
				state: "Publish?",
				who: `draft by ${names.get(d.updatedBy) ?? "someone"}`,
				age: age(d.updatedAt),
				yours: true,
			}),
		);
	const byId = new Map(docs.map((d) => [d.id, d]));
	const edited = [...unreadAbout(inbox, "document").values()].flatMap((c): Item[] => {
		const d = byId.get(c.objectId);
		if (!d || drafts.some((x) => x.id === d.id)) return [];
		const space = teams.find((t) => t.id === d.scopeId)?.name ?? "";
		const who = names.get(c.actor) ?? "someone";
		return [
			{
				id: d.id,
				title: d.title,
				state: `Edited by ${who}`,
				who: space,
				age: age(c.at),
				fresh: true,
			},
		];
	});
	return [...drafts, ...edited];
}

/** One space per team at the top, then each team's documents as they nest. */
export function knowledgeTree(docs: readonly DocumentRow[], teams: readonly Team[]): Doc[] {
	const sorted = [...docs].sort(
		(a, b) => a.position - b.position || a.title.localeCompare(b.title),
	);
	const under = (parent: (d: DocumentRow) => boolean): Doc[] =>
		sorted.filter(parent).map((d) => {
			const children = under((c) => c.parentKind === "document" && c.parentId === d.id);
			return {
				id: d.id,
				title: d.title,
				...(d.status === "proposed" ? { note: "draft" } : {}),
				...(children.length > 0 ? { children } : {}),
			};
		});
	return teams.map((t) => ({
		id: t.id,
		title: t.name,
		space: true,
		children: under((d) => d.scopeId === t.id && d.parentKind === null),
	}));
}

/** What a notification says happened, in words. */
export function noteWhat(change: ChangeRow, names: Names): string {
	const who = names.get(change.actor) ?? "Someone";
	const after = change.after;
	if (change.object === "task" && after.state === "done") return `Task done · ${who}`;
	if (change.object === "task" && after.state === "blocked") return `${who} is stuck`;
	if (change.object === "document" && after.status === "active") return `Published · ${who}`;
	if (change.object === "document" && change.kind === "changed") return `Edited by ${who}`;
	if (change.object === "thread" && after.type === "review") return `${who} raised a review`;
	if (change.object === "thread" && after.type === "questionnaire") return `${who} asks`;
	if (change.kind === "message") return `New reply · ${who}`;
	if (change.kind === "created") return `New ${change.object} · ${who}`;
	return `${who} changed it`;
}
