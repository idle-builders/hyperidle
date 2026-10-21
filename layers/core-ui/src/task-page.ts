import type { Task, TaskNode, TaskView } from "@hyperidle/domain-model";
import { NEED_WORDS, PAUSE_WORDS } from "./sidebar-lists";

/**
 * How the task page says where a task and its parts stand, in words, from the tree `open_task`
 * returns. Status is words and marks only: a need is a person's input or review, a pause is the
 * person who paused it, and a parent counts its finished parts.
 */
export interface Tree {
	readonly root: TaskNode;
	readonly byId: ReadonlyMap<string, TaskNode>;
	readonly parentOf: ReadonlyMap<string, string>;
}

/** The root of a task view, as a node of its own tree. */
export function rootNode(view: TaskView): TaskNode {
	return { ...view.task, children: view.children, openBelow: view.openBelow };
}

export function indexTree(root: TaskNode): Tree {
	const byId = new Map<string, TaskNode>();
	const parentOf = new Map<string, string>();
	const walk = (n: TaskNode) => {
		byId.set(n.id, n);
		for (const c of n.children) {
			parentOf.set(c.id, n.id);
			walk(c);
		}
	};
	walk(root);
	return { root, byId, parentOf };
}

export function leaves(n: TaskNode): TaskNode[] {
	return n.children.length === 0 ? [n] : n.children.flatMap(leaves);
}

export const finished = (n: TaskNode): boolean => leaves(n).every((l) => l.state === "done");

/** The parts this one waits for. */
export function waitsFor(t: Task): string[] {
	if (!t.dependencies) return [];
	const ids: unknown = JSON.parse(t.dependencies);
	return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
}

const NUMBER_WORDS = [
	"no",
	"one",
	"two",
	"three",
	"four",
	"five",
	"six",
	"seven",
	"eight",
	"nine",
	"ten",
	"eleven",
	"twelve",
];
const say = (n: number): string => NUMBER_WORDS[n] ?? String(n);
const upper = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "12 min ago", "6h ago", "yesterday", "9 days ago", "2 weeks ago". */
export function ago(iso: string, now: number = Date.now()): string {
	const minutes = Math.max(1, Math.round((now - Date.parse(iso)) / 60_000));
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days === 1) return "yesterday";
	if (days < 14) return `${days} days ago`;
	return `${Math.round(days / 7)} weeks ago`;
}

/** How many parts at the ends of the tree below need a person's input or review; a parent counts them, it does not carry them. */
export function needsBelow(n: TaskNode, need: "input" | "review"): number {
	return n.children.length === 0 ? 0 : leaves(n).filter((l) => l.need === need).length;
}

/** Counts of what is under way below a task, for its tally and stand line. */
function counts(tree: Tree, n: TaskNode, running: ReadonlySet<string>) {
	const all = leaves(n);
	return {
		done: all.filter((l) => l.state === "done").length,
		all: all.length,
		input: needsBelow(n, "input"),
		review: needsBelow(n, "review"),
		running: all.filter((l) => running.has(l.id) && tree.byId.has(l.id)).length,
	};
}

/** "6 of 12 done · 1 needs input · 1 needs review · 1 running"; a stopped task says only that. */
export function tally(tree: Tree, n: TaskNode, running: ReadonlySet<string>): string {
	const c = counts(tree, n, running);
	const head = `${c.done} of ${c.all} done`;
	if (n.paused === "stopped") return `${head} · stopped`;
	return [
		head,
		n.paused === "hold" && "on hold",
		c.input > 0 && `${c.input} needs input`,
		c.review > 0 && `${c.review} needs review`,
		c.running > 0 && `${c.running} running`,
	]
		.filter(Boolean)
		.join(" · ");
}

/** The few words under a part's name on the graph. */
export function chipWords(
	tree: Tree,
	n: TaskNode,
	running: ReadonlySet<string>,
	owner: (t: Task) => string,
): string {
	if (finished(n)) return "Done";
	if (n.paused) return PAUSE_WORDS[n.paused];
	if (n.children.length > 0) {
		const c = counts(tree, n, running);
		return `${c.done} of ${c.all} done`;
	}
	if (n.need) return NEED_WORDS[n.need];
	if (running.has(n.id)) return `${owner(n)} is on it`;
	return STATE_WORDS[n.state];
}

const STATE_WORDS: Record<Task["state"], string> = {
	proposed: "Not started",
	accepted: "Not started",
	hold: "Waits",
	in_progress: "Under way",
	blocked: "Stuck",
	review: "Needs review",
	done: "Done",
	killed: "Called off",
};

/** The task's state in the bar above the page. */
export function headWords(tree: Tree, n: TaskNode, running: ReadonlySet<string>): string {
	if (n.paused && !finished(n)) return PAUSE_WORDS[n.paused];
	if (n.children.length > 0) {
		const c = counts(tree, n, running);
		return c.done === c.all ? "Done" : `${c.done} of ${c.all} done`;
	}
	return chipWords(tree, n, running, () => "");
}

export function closing(t: Task): string {
	return t.doneWhen.some((l) => l.by === "review")
		? "Was reviewed before it closed"
		: "Closed by itself";
}

/** One sentence or two on where a task stands, under its title. */
export function standLine(
	tree: Tree,
	n: TaskNode,
	running: ReadonlySet<string>,
	owner: (t: Task) => string,
	now: number = Date.now(),
): string {
	const done = finished(n);
	if (n.paused === "stopped" && !done)
		return "Stopped. The agents stopped where they were; nothing they did is undone. Start again, and they pick up from there.";
	if (n.paused === "hold" && !done)
		return "On hold. The agents finish what they are doing, then wait.";
	if (n.state === "killed") return "Called off. It will not run again.";
	const when = ago(n.completedAt ?? n.updatedAt, now);
	if (n.children.length > 0) {
		const c = counts(tree, n, running);
		if (done)
			return `Done ${when}. ${c.all === 2 ? "Both parts are" : `All ${say(c.all)} parts are`} finished.`;
		const rest = [
			c.input > 0 && `${say(c.input)} ${c.input === 1 ? "needs" : "need"} input`,
			c.review > 0 && `${say(c.review)} ${c.review === 1 ? "needs" : "need"} a review`,
			c.running > 0 && `${say(c.running)} ${c.running === 1 ? "is" : "are"} running`,
		].filter((x): x is string => Boolean(x));
		// Past twelve, words read worse than digits; one line never mixes the two.
		const of = c.all > 12 ? `${c.done} of ${c.all}` : `${upper(say(c.done))} of ${say(c.all)}`;
		const parts = `${of} parts are done.`;
		return rest.length > 0 ? `${parts} ${upper(rest.join(", "))}.` : parts;
	}
	if (done)
		return `Done ${when}. It ${closing(n) === "Closed by itself" ? "closed by itself" : "was reviewed before it closed"}.`;
	if (n.need === "stuck") return `${owner(n)} is stuck, and waits for an answer.`;
	if (n.need === "input") return `${owner(n)} stopped to ask a question, and waits for the answer.`;
	if (n.need === "review") return "The work is finished. It closes once it is reviewed.";
	if (running.has(n.id)) return `${owner(n)} is working on this.`;
	const after = waitsFor(n).flatMap((id) => {
		const d = tree.byId.get(id);
		return d && !finished(d) ? [`“${d.title}”`] : [];
	});
	if (n.state === "hold" && after.length > 0)
		return `Waits for ${after.join(" and ")}. It starts by itself when that is done.`;
	if (n.state === "in_progress") return `${owner(n)} is working on this.`;
	return after.length > 0 ? `Not started. It comes after ${after.join(" and ")}.` : "Not started.";
}

/** A task handed off in a conversation that was there before it links back to it. */
export function cameFrom(task: Task, thread: { readonly createdAt: string }): boolean {
	return Date.parse(thread.createdAt) < Date.parse(task.createdAt);
}
