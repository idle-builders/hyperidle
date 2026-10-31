import type {
	ConnectionView,
	FolderView,
	HarnessDescriptor,
	SessionRow,
	SubscriptionEventName,
	SubscriptionView,
	Task,
	ThreadListRow,
	UserRow,
} from "@hyperidle/domain-model";
import { NEED_WORDS, PAUSE_WORDS } from "./sidebar-lists";

/**
 * The people pages, worked out from what the server says: who is in a team, what waits on someone,
 * what they are doing now, and the words for how they are set up.
 */

/** A line in a box: what it is, and a few words about it. */
export interface Pair {
	what: string;
	why: string;
	/** Built in: it cannot be switched off. */
	fixed?: boolean;
}

/** A row in someone's list: a task, a review or a question, opening its page. */
export interface Job {
	id: string;
	title: string;
	words: string;
	mark: "run" | "open" | "done";
	needs?: "input" | "review";
	/** Whose initials mark a running row. */
	by?: string;
	href: string;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const live = (u: UserRow): boolean => u.status !== "retired";
const inTeam = (u: UserRow, teamId: string): boolean => u.teams.some((t) => t.id === teamId);

/** "A", "A and B", "A, B and C". */
export function joinWords(words: readonly string[]): string {
	return words.length > 1
		? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`
		: (words[0] ?? "");
}

/** "3 July". */
export function sinceWords(iso: string): string {
	return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

/** "6h", "12 min", "2 days" — how long something has been as it is. */
export function forWords(iso: string, now: number): string {
	const ms = Math.max(0, now - Date.parse(iso));
	if (ms < 60 * MINUTE) return `${Math.max(1, Math.round(ms / MINUTE))} min`;
	if (ms < DAY) return `${Math.round(ms / (60 * MINUTE))}h`;
	const days = Math.round(ms / DAY);
	return days === 1 ? "1 day" : `${days} days`;
}

/** The people in a team, each with the agents that work for them in it; then the agents that work for every team. */
export function crewOf(
	users: readonly UserRow[],
	teamId: string,
	you: string,
): { crews: { person: UserRow; agents: UserRow[] }[]; wholeTeam: UserRow[]; everyTeam: UserRow[] } {
	const here = users.filter(live);
	const people = here
		.filter((u) => u.kind === "human" && inTeam(u, teamId))
		.sort((a, b) => Number(a.id === you) - Number(b.id === you) || a.name.localeCompare(b.name));
	const agents = here.filter((u) => u.kind === "ai" && inTeam(u, teamId));
	return {
		crews: people.map((person) => ({
			person,
			agents: agents.filter((a) => a.ownerUserId === person.id),
		})),
		wholeTeam: agents.filter((a) => a.ownerUserId === null),
		everyTeam: here.filter((u) => u.kind === "ai" && u.teams.length === 0 && u.role !== "system"),
	};
}

/** "1 person and 2 agents". */
export function countWords(people: number, agents: number): string {
	return `${people} ${people === 1 ? "person" : "people"} and ${agents} ${agents === 1 ? "agent" : "agents"}`;
}

const pad = (n: string): string => n.padStart(2, "0");

/** A schedule in words: "Every Monday at 07:00", "Every day at 08:00", "Every month on the 1st at 08:00". */
export function cronWords(schedule: string): string {
	const [minute, hour, dayOfMonth, month, dayOfWeek] = schedule.trim().split(/\s+/);
	const simple = (s: string | undefined) => s !== undefined && /^\d+$/.test(s);
	if (!(simple(minute) && simple(hour)) || month !== "*") return schedule;
	const at = `${pad(hour ?? "")}:${pad(minute ?? "")}`;
	if (dayOfMonth === "*" && dayOfWeek === "*") return `Every day at ${at}`;
	if (dayOfMonth === "*" && simple(dayOfWeek))
		return `Every ${DAYS[Number(dayOfWeek) % 7]} at ${at}`;
	if (simple(dayOfMonth) && dayOfWeek === "*") return `Every month on day ${dayOfMonth} at ${at}`;
	return schedule;
}

export type Often = "day" | "week" | "month";

/** What the "At a time" row in the reasons dialog says, as a schedule. The month form starts on its 1st. */
export function cronOf(often: Often, day: string, time: string): string {
	const [h = "8", m = "0"] = time.split(":");
	const at = `${Number(m)} ${Number(h)}`;
	if (often === "day") return `${at} * * *`;
	if (often === "month") return `${at} 1 * *`;
	return `${at} * * ${Math.max(0, DAYS.indexOf(day))}`;
}

/** What a subscription is about, in the words a person uses. */
export const EVENT_WORDS: Record<SubscriptionEventName, string> = {
	"task.created": "A task is created",
	"task.changed": "A task changes",
	"thread.created": "A thread starts",
	"thread.message": "A thread gets a message",
	"thread.changed": "A thread changes",
	"document.created": "A document is created",
	"document.changed": "A document changes",
	"user.created": "Someone joins the team",
	"user.changed": "Someone's set-up changes",
	"review.raised_for_me": "A review is raised for me",
	"mention.of_me": "Someone mentions me",
	"started.done_or_stuck": "A task I started is done or stuck",
	"followed.changed": "Something I follow changes",
};

/** The things that can happen, as the reasons dialog offers them: what, then each way it can happen. */
export const EVENT_CHOICES: readonly {
	about: string;
	does: readonly { words: string; event: SubscriptionEventName }[];
}[] = [
	{
		about: "A task",
		does: [
			{ words: "is created", event: "task.created" },
			{ words: "changes", event: "task.changed" },
		],
	},
	{
		about: "A thread",
		does: [
			{ words: "starts", event: "thread.created" },
			{ words: "gets a message", event: "thread.message" },
		],
	},
	{
		about: "A document",
		does: [
			{ words: "is created", event: "document.created" },
			{ words: "changes", event: "document.changed" },
		],
	},
	{ about: "Someone", does: [{ words: "joins the team", event: "user.created" }] },
];

/** When a subscription fires, in words. */
export function reasonWords(sub: Pick<SubscriptionView, "event" | "schedule">): string {
	if (sub.schedule) return cronWords(sub.schedule);
	return sub.event ? EVENT_WORDS[sub.event] : "";
}

/** The reasons an agent starts working: the two it always has, then its own, each with what it does. */
export function startRows(
	name: string,
	subs: readonly SubscriptionView[],
	titles: ReadonlyMap<string, string>,
): (Pair & { id?: string; paused?: boolean; documentId?: string | null })[] {
	return [
		{ what: `Someone mentions @${name}`, why: "it joins that thread", fixed: true },
		{ what: "A task is handed to it", why: "it starts when a session is free", fixed: true },
		...subs
			.filter((s) => s.objectId === null)
			.map((s) => {
				const title = s.documentId ? titles.get(s.documentId) : undefined;
				return {
					id: s.id,
					what: reasonWords(s),
					why: title ? `it starts a run of ${title}` : "it starts with no document to read",
					paused: s.paused,
					documentId: s.documentId,
				};
			}),
	];
}

/** How a task reads in someone's list: running, waiting on a person, paused, or how far it is. */
function taskWords(t: Task, running: SessionRow | undefined, now: number): string {
	if (running) return `Running · ${forWords(running.startedAt, now)}`;
	if (t.paused) return PAUSE_WORDS[t.paused];
	if (t.need) return `${NEED_WORDS[t.need]} · ${forWords(t.updatedAt, now)}`;
	if (t.state === "proposed" || t.state === "accepted" || t.state === "hold") return "Waits";
	if (t.state === "in_progress") return "Under way";
	return t.state === "done" ? "Done" : "Stopped";
}

const needOf = (t: Task): "input" | "review" | undefined =>
	t.need === "review" ? "review" : t.need ? "input" : undefined;

/** Where a task opens: its root's page, with the part picked. */
export function taskHref(t: Task, byId: ReadonlyMap<string, Task>): string {
	let root = t;
	for (let up = byId.get(root.parentTaskId ?? ""); up; up = byId.get(up.parentTaskId ?? ""))
		root = up;
	return root.id === t.id ? `/work/${t.id}` : `/work/${root.id}?part=${encodeURIComponent(t.id)}`;
}

const open = (t: Task): boolean => t.state !== "done" && t.state !== "killed";
const isToday = (iso: string | null, now: number): boolean =>
	iso !== null && new Date(iso).toDateString() === new Date(now).toDateString();

/** An agent's own tasks not finished, the running ones first; and how many it finished today. */
export function agentJobs(
	tasks: readonly Task[],
	agentId: string,
	sessions: readonly SessionRow[],
	initialsOf: string,
	now: number,
): { on: Job[]; doneToday: number } {
	const byId = new Map(tasks.map((t) => [t.id, t]));
	const mine = tasks.filter((t) => t.ownerAgentId === agentId);
	// A parent is only a list of its parts here; the parts are the work.
	const parents = new Set(mine.map((t) => t.parentTaskId));
	const running = new Map(
		sessions.filter((s) => s.agentId === agentId && s.endedAt === null).map((s) => [s.taskId, s]),
	);
	const on = mine
		.filter((t) => open(t) && !(parents.has(t.id) && !running.has(t.id)))
		.map((t): Job & { rank: number } => {
			const run = running.get(t.id);
			const needs = needOf(t);
			return {
				id: t.id,
				title: t.title,
				words: taskWords(t, run, now),
				mark: run ? "run" : "open",
				...(needs && !run ? { needs } : {}),
				href: taskHref(t, byId),
				by: initialsOf,
				rank: run ? 0 : needs ? 1 : 2,
			};
		})
		.sort((a, b) => a.rank - b.rank)
		.map(({ rank: _, ...job }) => job);
	return {
		on,
		doneToday: mine.filter((t) => t.state === "done" && isToday(t.completedAt, now)).length,
	};
}

/** What waits on someone: the conversations with a question or a review for them. */
export function waitingJobs(threads: readonly ThreadListRow[], now: number): Job[] {
	return threads
		.filter((t) => t.need !== null)
		.map((t) => ({
			id: t.id,
			title: t.computedTitle,
			words: `${t.need === "review" ? "Review" : t.need === "stuck" ? "Question · an agent waits" : "Question"} · ${forWords(t.lastActiveAt, now)}`,
			mark: "open" as const,
			needs: t.need === "review" ? ("review" as const) : ("input" as const),
			href: `/conversations/${t.id}`,
		}));
}

/** The tasks someone started and that are not finished, with whose they are and how each stands. */
export function startedJobs(
	tasks: readonly Task[],
	personId: string,
	firstNames: ReadonlyMap<string, string>,
	initialsOf: (id: string) => string,
	sessions: readonly SessionRow[],
	now: number,
	/** Conversations they started: a task an agent made there is what they asked for. */
	askedIn: ReadonlySet<string> = new Set(),
): Job[] {
	const byId = new Map(tasks.map((t) => [t.id, t]));
	const theirs = (t: Task | undefined) =>
		t !== undefined && (t.startedBy === personId || askedIn.has(t.threadId));
	const kids = new Map<string, Task[]>();
	for (const t of tasks)
		if (t.parentTaskId) kids.set(t.parentTaskId, [...(kids.get(t.parentTaskId) ?? []), t]);
	const leaves = (t: Task): Task[] => {
		const under = kids.get(t.id) ?? [];
		return under.length === 0 ? [t] : under.flatMap(leaves);
	};
	return tasks
		.filter((t) => theirs(t) && open(t) && !theirs(byId.get(t.parentTaskId ?? "")))
		.map((t) => {
			const run = sessions.find((s) => s.taskId === t.id && s.endedAt === null);
			const parts = kids.has(t.id) ? leaves(t) : [];
			const done = parts.filter((p) => p.state === "done").length;
			const needs = needOf(t);
			const how =
				parts.length > 0 && !t.need && !t.paused
					? `${done} of ${parts.length} done`
					: taskWords(t, run, now).toLowerCase();
			const owner = firstNames.get(t.ownerAgentId ?? "") ?? "Nobody";
			return {
				id: t.id,
				title: t.title,
				words: `${owner} · ${how}`,
				mark: run ? ("run" as const) : ("open" as const),
				...(needs && !run ? { needs } : {}),
				by: initialsOf(t.ownerAgentId ?? ""),
				href: taskHref(t, byId),
			};
		});
}

/** What an agent is doing now, in one line. */
export function agentStand(input: {
	paused: boolean;
	unwritten: boolean;
	running: readonly { title: string; startedAt: string }[];
	asking: number;
	/** Its next scheduled run: what it does, and when, in words. */
	nextRun: { title: string; when: string } | null;
	now: number;
}): string {
	if (input.paused) return "Paused. It takes no new work until you let it.";
	if (input.unwritten) return "New. It has no instructions yet.";
	const [first, ...more] = input.running;
	if (first)
		return `Working on “${first.title}”, ${forWords(first.startedAt, input.now)} in${more.length > 0 ? `, and ${more.length} more` : ""}.`;
	const next = input.nextRun
		? ` Its next run is “${input.nextRun.title}”, ${input.nextRun.when.charAt(0).toLowerCase()}${input.nextRun.when.slice(1)}.`
		: "";
	if (input.asking > 0)
		return `Idle. It waits for ${input.asking === 1 ? "an answer" : `${input.asking} answers`}.${next}`;
	return `Idle.${next}`;
}

/** What waits on a person, in one line. */
export function personStand(waiting: readonly Job[], you: boolean): string {
	const reviews = waiting.filter((j) => j.needs === "review").length;
	const questions = waiting.length - reviews;
	const parts = [
		reviews > 0 ? `${reviews === 1 ? "One review" : `${reviews} reviews`}` : null,
		questions > 0 ? `${questions === 1 ? "one question" : `${questions} questions`}` : null,
	].filter((p) => p !== null);
	if (parts.length === 0) return you ? "Nothing waits for you." : "Nothing waits for them.";
	const what = joinWords(parts);
	const wait = waiting.length === 1 ? "waits" : "wait";
	return `${what.charAt(0).toUpperCase()}${what.slice(1)} ${wait} for ${you ? "you" : "them"}.`;
}

/** What an agent program on this computer says about itself. */
export function programWords(h: HarnessDescriptor): string {
	if (h.discovery.disabled) return "switched off";
	switch (h.discovery.state) {
		case "ready":
			return "signed in";
		case "unauthenticated":
			return "installed, not signed in";
		case "installed":
			return "installed";
		case "missing":
			return "not installed";
		default:
			return h.discovery.reason ?? "not available";
	}
}

/** A folder's path, whether it is a repository or a folder of documents. */
export function folderPath(f: FolderView): string {
	return f.resourceRef.kind === "code" ? f.resourceRef.repo : f.resourceRef.folder;
}

/** What went wrong the last time an agent opened a folder, or null when nothing did. */
export function folderTrouble(f: FolderView): string | null {
	if (f.state !== "needs_attention") return null;
	return f.connectionId === null
		? "Not found on this computer"
		: "Cannot be reached with its service";
}

/** What may be done in a folder. */
export function folderMay(f: FolderView): string {
	return f.writeback === "none" ? "only reads" : "reads and changes";
}

/** How a service is reached: a key, a server, or signed in on this computer. */
export function serviceHow(c: ConnectionView): string {
	if (c.authSource === "inherited") return "Signed in on this computer";
	if (c.authSource === "token") return "A key, kept encrypted";
	return `Through its MCP server, ${c.via}`;
}

/** "Builder and Growth", or "nobody yet". */
export function givenTo(names: readonly string[]): string {
	return names.length === 0 ? "nobody yet" : joinWords(names);
}

/** A plugin's name as a person reads it: "team-habits" is "Team habits". */
export function pluginName(name: string): string {
	const words = name.replace(/[-_]+/g, " ").trim();
	return words.charAt(0).toUpperCase() + words.slice(1);
}
