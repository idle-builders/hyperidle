import { useState } from "react";
import { CHAT_FORMATS, FormatBar } from "./FormatBar";
import { Msg } from "./Msg";
import { type Item, Sidebar, WORK } from "./Sidebar";

/**
 * RUN THE SHIFT — the task screen. Planning happens before, in documents and conversations;
 * checking happens after, in reviews. This screen is the middle: watching the work move through
 * its tree. The tree sits beside the task and stays put while you click through it — names, a
 * state in words, and how many documents and reviews hang on each part. The task beside it says
 * what it is about, carries its owner's summary (a parent's summary is a summary of its parts'
 * summaries), and ranks its conversations and documents so the ones a person takes part in come
 * before what the agents made while working. A small fix has no tree; a recurring task has one
 * part per run.
 */
export const SHIFT_STEPS = [
	{ id: 0, name: "A large task: its tree and summary" },
	{ id: 1, name: "A part that waits on your answer" },
	{ id: 2, name: "A finished part and what it made" },
	{ id: 3, name: "A part where an agent is working" },
	{ id: 4, name: "A small fix: no tree" },
	{ id: 5, name: "A recurring task: one part per run" },
	{ id: 6, name: "Steer it, hold it, stop it" },
];

type Id =
	| "trials" | "understand" | "numbers" | "dropoff" | "build" | "email" | "checkout" | "layout" | "reminder" | "test" | "writeup"
	| "utc"
	| "weekly" | "wnext" | "w41" | "w40" | "w39";

/** A conversation, document or review that hangs on a task. `on` names the part it hangs on, when that is not this one. */
interface Thing {
	kind: "Document" | "Thread" | "Review";
	title: string;
	why: string;
	on?: Id;
	owed?: string;
}
interface Run {
	n: number;
	when: string;
	said: string;
	live?: boolean;
}
interface Line {
	id: string;
	av: string;
	human?: boolean;
	name: string;
	at: string;
	body: React.ReactNode;
}
interface Task {
	title: string;
	owner: string;
	kids?: Id[];
	/** Leaves say their state; a parent without one counts its finished parts. */
	state?: string;
	/** What you owe on it — the only thing that gets the flag colour. */
	owed?: string;
	stand: string;
	action?: string;
	about: string;
	doneWhen?: string[];
	/** Written by the owner when the task finishes or gets stuck, and kept up while it runs. */
	summary?: { when: string; lines: string[] };
	/** Ranked by the owner: what a person takes part in first. */
	things: Thing[];
	/** What the agents made while working — kept, but folded away. */
	more?: { label: string; items: Thing[] };
	runs: Run[];
	earlierRuns?: number;
	thread?: Line[];
	meta: string;
}

const SESSION_STEPS = [
	"read the Trials document for the wording we use",
	"wrote the email text",
	"asked billing for the date and amount of the first bill",
	"started putting both into the email",
];

const TASKS: Record<Id, Task> = {
	trials: {
		title: "Trials that convert without a call",
		owner: "Growth",
		kids: ["understand", "build", "test", "writeup"],
		stand: "Three of eight parts are done. Two wait on you. One is running.",
		about: "Can a trial turn into a paid plan without a sales call? Put a self-serve checkout in front of people on day 12 and compare it with what we do today.",
		doneWhen: [
			"The test ran for two weeks on new signups.",
			"We know how many paid without a call, next to last quarter.",
			"What we learned is written down in How we price.",
		],
		summary: {
			when: "updated 2h ago",
			lines: [
				"Two parts wait on you: an answer on the checkout, and a review of the stacked layout.",
				"Builder is writing the reminder email now.",
				"We know why people leave before paying: most stop at the card form. The plan rests on that.",
				"The two-week test starts by itself when the day-12 path is built.",
			],
		},
		things: [
			{ kind: "Review", title: "Comparison table, stacked layout · Final", why: "Two widths to look at, one spot flagged", on: "layout", owed: "Your review" },
			{ kind: "Thread", title: "Self-serve checkout at day 12", why: "When do we take the card?", on: "checkout", owed: "Your answer" },
			{ kind: "Document", title: "Plan: trials without a call", why: "The plan you wrote with Growth" },
			{ kind: "Thread", title: "Trials that convert without a call", why: "You and Growth · last message 14:32" },
			{ kind: "Document", title: "Where people drop off before paying", why: "What the plan rests on", on: "dropoff" },
		],
		more: {
			label: "made by the agents while working",
			items: [
				{ kind: "Document", title: "Trial-to-paid numbers, last quarter", why: "The table behind the 31%", on: "numbers" },
				{ kind: "Document", title: "Day-12 checkout email", why: "The final email", on: "email" },
				{ kind: "Document", title: "Day-12 email, draft 2", why: "Earlier draft", on: "email" },
				{ kind: "Document", title: "Day-12 email, draft 1", why: "Earlier draft", on: "email" },
				{ kind: "Document", title: "How billing takes cards today", why: "Builder's reading notes", on: "checkout" },
				{ kind: "Document", title: "Reminder email, draft", why: "Being written now", on: "reminder" },
			],
		},
		runs: [{ n: 6, when: "today 14:10", said: "22 min · checked on the parts, wrote the summary" }],
		earlierRuns: 5,
		thread: [
			{ id: "a", av: "GR", name: "Growth", at: "14:32", body: "Two parts need you before the test can start: one answer on the checkout and one review of the layout." },
		],
		meta: "Growth owns this · started 2 weeks ago · 7h in 6 sessions · closes by itself",
	},
	understand: {
		title: "Understand today",
		owner: "Growth",
		kids: ["numbers", "dropoff"],
		stand: "Done 9 days ago. Both parts are finished.",
		about: "Before changing anything, find out how trials turn into paid plans today and where people leave.",
		summary: {
			when: "written when it finished, 9 days ago",
			lines: [
				"31% of trials became paid last quarter, almost all of them after a sales call.",
				"Most people who leave before paying stop at the card form.",
			],
		},
		things: [
			{ kind: "Document", title: "Where people drop off before paying", why: "The finding", on: "dropoff" },
			{ kind: "Document", title: "Trial-to-paid numbers, last quarter", why: "The table behind the 31%", on: "numbers" },
		],
		runs: [{ n: 1, when: "9 days ago", said: "15 min · read both parts, wrote the summary" }],
		meta: "Growth owns this · finished 9 days ago · 15 min in 1 session",
	},
	numbers: {
		title: "Pull last quarter's trial-to-paid numbers",
		owner: "Growth",
		state: "Done",
		stand: "Done 10 days ago. It closed by itself.",
		about: "How many trials started last quarter, how many became paid, and how many of those had a sales call first.",
		summary: { when: "written when it finished, 10 days ago", lines: ["412 trials started. 128 became paid (31%). 119 of those had a sales call first."] },
		things: [{ kind: "Document", title: "Trial-to-paid numbers, last quarter", why: "The table" }],
		runs: [{ n: 1, when: "10 days ago", said: "40 min · finished" }],
		meta: "Growth owns this · finished 10 days ago · 40 min in 1 session",
	},
	dropoff: {
		title: "Find where people drop off before paying",
		owner: "Growth",
		state: "Done",
		stand: "Done 9 days ago. It closed by itself.",
		about: "Of the people who did not pay, where did they stop?",
		summary: {
			when: "written when it finished, 9 days ago",
			lines: ["Of the 284 who did not pay, 171 stopped at the card form.", "Second most common: the trial ended while nobody was looking (62)."],
		},
		things: [{ kind: "Document", title: "Where people drop off before paying", why: "The finding, with the steps people took" }],
		runs: [{ n: 1, when: "9 days ago", said: "1h 20m · finished" }],
		meta: "Growth owns this · finished 9 days ago · 1h 20m in 1 session",
	},
	build: {
		title: "Build the day-12 path",
		owner: "Growth",
		kids: ["email", "checkout", "layout", "reminder"],
		stand: "One of four parts is done. Two wait on you. One is running.",
		about: "Everything a person on day 12 sees: the email, the checkout page, the comparison table and the reminder.",
		summary: {
			when: "updated 2h ago",
			lines: [
				"The checkout page is built but waits on your answer about the card.",
				"The stacked layout waits on your review.",
				"Builder is writing the reminder email. The day-12 email is done.",
			],
		},
		things: [
			{ kind: "Review", title: "Comparison table, stacked layout · Final", why: "Two widths to look at, one spot flagged", on: "layout", owed: "Your review" },
			{ kind: "Thread", title: "Self-serve checkout at day 12", why: "When do we take the card?", on: "checkout", owed: "Your answer" },
			{ kind: "Document", title: "Day-12 checkout email", why: "The final email", on: "email" },
		],
		runs: [{ n: 3, when: "today 14:05", said: "5 min · read the parts, wrote the summary" }],
		earlierRuns: 2,
		meta: "Growth owns this · started 5 days ago · 25 min in 3 sessions",
	},
	email: {
		title: "Draft the day-12 checkout email",
		owner: "Designer",
		state: "Done",
		stand: "Done 3 days ago. It closed by itself.",
		about: "One email on day 12 that says what the plan costs and lets the person pay.",
		summary: {
			when: "written when it finished, 3 days ago",
			lines: [
				"One email, sent on day 12, with the plan, the price and a pay-now button.",
				"Subject line picked from three, by how often last quarter's emails were opened.",
			],
		},
		things: [{ kind: "Document", title: "Day-12 checkout email", why: "The final email" }],
		more: {
			label: "earlier drafts",
			items: [
				{ kind: "Document", title: "Day-12 email, draft 2", why: "Shorter, no price in the subject" },
				{ kind: "Document", title: "Day-12 email, draft 1", why: "First try" },
			],
		},
		runs: [
			{ n: 2, when: "3 days ago", said: "35 min · finished" },
			{ n: 1, when: "4 days ago", said: "50 min · wrote two drafts" },
		],
		meta: "Designer owns this · finished 3 days ago · 1h 25m in 2 sessions",
	},
	checkout: {
		title: "Self-serve checkout at day 12",
		owner: "Builder",
		state: "Your answer",
		owed: "Your answer",
		stand: "Builder stopped and asked you a question 6 hours ago.",
		about: "Let someone on a trial pay by themselves on day 12, without talking to us.",
		doneWhen: ["A person on day 12 can pick a plan and pay on one page.", "People who already pay see nothing new."],
		summary: {
			when: "written when it got stuck, 6h ago",
			lines: [
				"Stuck on one answer from you: when do we take the card?",
				"The checkout page is built and works on a test account.",
				"Once you answer: put it in, then hand the page to Designer for the layout.",
			],
		},
		things: [{ kind: "Thread", title: "Self-serve checkout at day 12", why: "The question for you", owed: "Your answer" }],
		more: { label: "made by Builder while working", items: [{ kind: "Document", title: "How billing takes cards today", why: "Reading notes" }] },
		runs: [
			{ n: 2, when: "today 08:40", said: "1h 05m · built the page, then stopped to ask" },
			{ n: 1, when: "yesterday 21:15", said: "48 min · read how billing takes cards today" },
		],
		thread: [
			{
				id: "a", av: "BU", name: "Builder", at: "09:45",
				body: (
					<>
						The page works. One thing I will not decide on my own.
						<div className="card">
							<div className="card-head">
								<span className="chip chip--flag">Your answer</span>
								<span className="meta">Changes what every new trial user sees</span>
							</div>
							<p className="card-q">When do we take the card?</p>
							<p className="card-why">
								Today we take it when the trial starts. A checkout on day 12 only makes sense if some
								people have not given one yet.
							</p>
							<div className="card-opts">
								<button type="button" className="opt"><b>Keep it up front</b><span>Nothing changes for trials. Day 12 becomes a reminder with a pay-now button.</span></button>
								<button type="button" className="opt"><b>Ask on day 12</b><span>More people start a trial. Some will leave on day 12 instead of paying.</span></button>
								<button type="button" className="opt"><b>Test both</b><span>Half of new signups each way, for two weeks.</span></button>
							</div>
						</div>
					</>
				),
			},
		],
		meta: "Builder owns this · started yesterday 21:15 · 1h 53m in 2 sessions · you review it before it is done",
	},
	layout: {
		title: "Comparison table, stacked layout",
		owner: "Designer",
		state: "Your review",
		owed: "Your review",
		stand: "The work is finished. It closes when you have looked at it.",
		action: "Look at it",
		about: "The table that compares the plans, stacked so it reads on a phone.",
		summary: {
			when: "written when it finished, 5h ago",
			lines: [
				"Finished and waiting on your review.",
				"The table stacks into one column on a narrow screen. Two widths are in the review.",
				"One spot I am not sure about and flagged: the order of the plans on a phone.",
			],
		},
		things: [{ kind: "Review", title: "Comparison table, stacked layout · Final", why: "Two widths to look at, one spot flagged", owed: "Your review" }],
		runs: [{ n: 1, when: "today 09:30", said: "1h 40m · finished, asked for your review" }],
		meta: "Designer owns this · started today 09:30 · 1h 40m in 1 session · you review it before it is done",
	},
	reminder: {
		title: "Reminder email three days before",
		owner: "Builder",
		state: "Running",
		stand: "Builder is working on this. Session 1, 12 minutes in.",
		about: "An email three days before the trial ends that says the date and the amount of the first bill.",
		summary: {
			when: "updated 12 min ago",
			lines: ["The email text is written. I am putting in the date and the amount from billing.", "Next: send it to a test account."],
		},
		things: [{ kind: "Document", title: "Reminder email, draft", why: "Being written now" }],
		runs: [{ n: 1, when: "today 16:05", said: "running · 12 min · 4 steps", live: true }],
		meta: "Builder owns this · started today 16:05 · closes by itself",
	},
	test: {
		title: "Run the test for two weeks",
		owner: "Growth",
		state: "Waits",
		stand: "Waits for “Build the day-12 path”. It starts by itself when that is done.",
		about: "Half of new signups get the day-12 path, half get what we do today. Two weeks.",
		things: [],
		runs: [],
		meta: "Growth owns this · not started",
	},
	writeup: {
		title: "Write up what we learned",
		owner: "Growth",
		state: "Not started",
		stand: "Not started. It comes after the test.",
		about: "What happened, in numbers, and what we change in How we price.",
		things: [],
		runs: [],
		meta: "Growth owns this · not started · you review it before it is done",
	},
	utc: {
		title: "Trial dates normalised to UTC",
		owner: "Builder",
		state: "Done",
		stand: "Done at 05:55. It closed by itself; nobody asked for a review.",
		about: "Trial end dates were stored in local time, so some trials ended a day early or a day late. Store and compare them in UTC.",
		summary: {
			when: "written when it finished, 05:55",
			lines: [
				"Trial end dates are stored and compared in UTC.",
				"41 trials had the wrong end date. I corrected them; nobody was charged early.",
				"Nothing a customer sees changed.",
			],
		},
		things: [{ kind: "Thread", title: "Trial-end confusion, three tickets", why: "Where it came up" }],
		runs: [{ n: 1, when: "today 05:10", said: "45 min · finished" }],
		meta: "Builder owns this · finished today 05:55 · 45 min in 1 session",
	},
	weekly: {
		title: "Support themes, weekly",
		owner: "Growth",
		kids: ["wnext", "w41", "w40", "w39"],
		state: "Every Monday",
		stand: "Runs every Monday at 07:00. Each run is a part of its own.",
		about: "Every Monday, read last week's support tickets and say what people struggled with most.",
		summary: {
			when: "updated Monday 07:20",
			lines: [
				"Trial-end billing was the top theme for the third week running: 5 of 14 tickets.",
				"New this week: two people could not find where to download an invoice.",
				"Tickets are down from 19 to 14 since the pricing page changed.",
			],
		},
		things: [
			{ kind: "Document", title: "Support themes, week of 5 October", why: "The latest run", on: "w41" },
			{ kind: "Thread", title: "Support themes, weekly", why: "You and Maya read these · last message Monday" },
		],
		more: {
			label: "from earlier runs",
			items: [
				{ kind: "Document", title: "Support themes, week of 28 September", why: "19 tickets", on: "w40" },
				{ kind: "Document", title: "Support themes, week of 21 September", why: "17 tickets", on: "w39" },
			],
		},
		runs: [{ n: 12, when: "Monday 07:18", said: "2 min · read the run, wrote the summary" }],
		earlierRuns: 11,
		meta: "Growth owns this · every Monday 07:00 · 12 runs so far",
	},
	wnext: {
		title: "Week of 12 October",
		owner: "Growth",
		state: "Starts Monday 07:00",
		stand: "Not started. It starts by itself on Monday at 07:00.",
		about: "Read the support tickets from the week of 12 October and say what people struggled with most.",
		things: [],
		runs: [],
		meta: "Growth owns this · starts Monday 07:00",
	},
	w41: {
		title: "Week of 5 October",
		owner: "Growth",
		state: "Done",
		stand: "Done Monday 07:18. It closed by itself.",
		about: "Read the support tickets from the week of 5 October and say what people struggled with most.",
		summary: {
			when: "written when it finished, Monday 07:18",
			lines: ["14 tickets. Top theme: trial-end billing (5).", "New: invoice download is hard to find (2).", "Nothing urgent."],
		},
		things: [{ kind: "Document", title: "Support themes, week of 5 October", why: "This run's summary" }],
		runs: [{ n: 1, when: "Monday 07:00", said: "18 min · finished" }],
		meta: "Growth owns this · finished Monday 07:18 · 18 min in 1 session",
	},
	w40: {
		title: "Week of 28 September",
		owner: "Growth",
		state: "Done",
		stand: "Done two Mondays ago. It closed by itself.",
		about: "Read the support tickets from the week of 28 September and say what people struggled with most.",
		summary: { when: "written when it finished", lines: ["19 tickets. Top theme: trial-end billing (8)."] },
		things: [{ kind: "Document", title: "Support themes, week of 28 September", why: "This run's summary" }],
		runs: [{ n: 1, when: "two Mondays ago", said: "21 min · finished" }],
		meta: "Growth owns this · 21 min in 1 session",
	},
	w39: {
		title: "Week of 21 September",
		owner: "Growth",
		state: "Done",
		stand: "Done three Mondays ago. It closed by itself.",
		about: "Read the support tickets from the week of 21 September and say what people struggled with most.",
		summary: { when: "written when it finished", lines: ["17 tickets. Top theme: trial-end billing (6)."] },
		things: [{ kind: "Document", title: "Support themes, week of 21 September", why: "This run's summary" }],
		runs: [{ n: 1, when: "three Mondays ago", said: "19 min · finished" }],
		meta: "Growth owns this · 19 min in 1 session",
	},
};

const leaves = (id: Id): Id[] => TASKS[id].kids?.flatMap(leaves) ?? [id];
const finished = (id: Id): boolean => leaves(id).every((l) => TASKS[l].state === "Done");
/** A leaf says its own state; a parent counts its finished parts unless it says otherwise. */
const stateOf = (id: Id): string => {
	const t = TASKS[id];
	if (t.state) return t.state;
	const all = leaves(id);
	const done = all.filter((l) => TASKS[l].state === "Done").length;
	return done === all.length ? "Done" : `${done} of ${all.length} done`;
};
/** Documents and reviews that hang on this part — and, for a folded parent, on everything inside it. */
const counts = (id: Id, deep: boolean): { docs: number; reviews: number } => {
	const t = TASKS[id];
	const own = [...t.things, ...(t.more?.items ?? [])].filter((x) => !x.on);
	const total = { docs: own.filter((x) => x.kind === "Document").length, reviews: own.filter((x) => x.kind === "Review").length };
	if (deep) {
		for (const k of t.kids ?? []) {
			const c = counts(k, true);
			total.docs += c.docs;
			total.reviews += c.reviews;
		}
	}
	return total;
};
/** How many parts inside wait on you — shown on a folded parent, so folding never hides it. */
const owedIn = (id: Id): number => leaves(id).filter((l) => l !== id && TASKS[l].owed).length;
/** In a parent's summary, parts that need you come first, then what moves, then what is done. */
const rank = (id: Id): number => {
	if (TASKS[id].owed) return 0;
	if (stateOf(id) === "Running") return 1;
	return finished(id) ? 3 : 2;
};
const parentOf = (id: Id): Id | undefined => (Object.keys(TASKS) as Id[]).find((p) => TASKS[p].kids?.includes(id));
const rootOf = (id: Id): Id => {
	const p = parentOf(id);
	return p ? rootOf(p) : id;
};

/** The Work list shows root tasks only. */
const ROWS: Partial<Record<Id, string>> = { trials: "w-f1", utc: "w-d2", weekly: "w-wk" };
const LIST: Item[] = [
	...WORK.map((i) => (i.id === "w-f1" ? { ...i, state: stateOf("trials") } : i)),
	{ id: "w-wk", title: "Support themes, weekly", state: "Every Monday", who: "Growth", age: "Mon 07:00" },
];

const STEERED: Line[] = [
	{ id: "s1", av: "FO", human: true, name: "You", at: "16:17", body: <><strong>@Growth</strong> leave the annual plan out of the test for now.</> },
	{ id: "s2", av: "GR", name: "Growth", at: "16:17", body: "Noted. The test covers monthly plans only. I told Builder and put it in the summary." },
];

const START: Id[] = ["trials", "checkout", "email", "reminder", "utc", "weekly", "trials"];

function Tree({ id, depth, sel, open, onPick, onFold }: {
	id: Id; depth: number; sel: Id; open: Set<Id>; onPick: (id: Id) => void; onFold: (id: Id) => void;
}) {
	const t = TASKS[id];
	const folded = Boolean(t.kids) && !open.has(id);
	const c = counts(id, folded);
	return (
		<>
			<div className={["tk-row", depth === 0 && "tk-row--root", finished(id) && "tk-row--done"].filter(Boolean).join(" ")} aria-current={sel === id}>
				{t.kids ? (
					<button type="button" className="tree-fold" aria-expanded={!folded} aria-label={folded ? "Unfold" : "Fold"} onClick={() => onFold(id)}>
						<span className="chev">›</span>
					</button>
				) : <span className="tree-fold" />}
				<button type="button" className="tk-pick" onClick={() => onPick(id)}>
					<span className="tk-name">{t.title}</span>
					<span className="tk-line">
						<span className={t.owed ? "nrow-state nrow-state--yours" : "nrow-state"}>{stateOf(id)}</span>
						{folded && owedIn(id) > 0 && <span className="nrow-state nrow-state--yours">{owedIn(id)} for you</span>}
						<span>{t.owner}</span>
						{(c.docs > 0 || c.reviews > 0) && (
							<span className="tk-counts">
								{c.docs > 0 && <span>{c.docs} {c.docs === 1 ? "doc" : "docs"}</span>}
								{c.reviews > 0 && <span>{c.reviews} {c.reviews === 1 ? "review" : "reviews"}</span>}
							</span>
						)}
					</span>
				</button>
			</div>
			{t.kids && !folded && (
				<div className="tree-kids">
					{t.kids.map((k) => <Tree key={k} id={k} depth={depth + 1} sel={sel} open={open} onPick={onPick} onFold={onFold} />)}
				</div>
			)}
		</>
	);
}

function Things({ items, quiet, onPick }: { items: Thing[]; quiet?: boolean; onPick: (id: Id) => void }) {
	return (
		<div className={quiet ? "things things--quiet" : "things"}>
			{items.map((x) => {
				const on = x.on;
				return (
					<div key={x.kind + x.title} className="thing">
						<span className="thing-kind">{x.kind}</span>
						<span className="thing-body">
							<button type="button" className="thing-title">{x.title}</button>
							<span className="thing-why">
								{x.owed && <span className="nrow-state nrow-state--yours">{x.owed}</span>}
								<span>{x.why}</span>
								{on && <span>· on <button type="button" className="thing-on" onClick={() => onPick(on)}>{TASKS[on].title}</button></span>}
							</span>
						</span>
					</div>
				);
			})}
		</div>
	);
}

export function Shift({ step }: { step: number }) {
	const [sel, setSel] = useState<Id>(START[step] ?? "trials");
	const [open, setOpen] = useState<Set<Id>>(new Set<Id>(["trials", "build", "weekly"]));
	const [peek, setPeek] = useState(false);
	const [more, setMore] = useState(false);
	const [menu, setMenu] = useState(step === 6);
	const [held, setHeld] = useState(false);
	const root = rootOf(sel);
	const t = TASKS[sel];
	const single = !TASKS[root].kids;
	const lines = step === 6 && sel === "trials" ? [...(t.thread ?? []), ...STEERED] : t.thread ?? [];
	const parts = [...(t.kids ?? [])].sort((a, b) => rank(a) - rank(b));
	const pick = (id: Id) => { setSel(id); setPeek(false); setMore(false); };
	const fold = (id: Id) =>
		setOpen((o) => {
			const n = new Set(o);
			if (n.has(id)) n.delete(id);
			else n.add(id);
			return n;
		});

	return (
		<>
			<Sidebar key={root} initialSpine="work" initialPicked={ROWS[root] ?? null} lists={{ work: LIST }} />
			<section className="detail">
				<header className="detail-head">
					<span className="chip chip--quiet">Task</span>
					<h2>{TASKS[root].title}</h2>
					<span className="doc-state">{held ? "On hold" : stateOf(root)}</span>
					{!finished(root) && (
						<span className="doc-act">
							<button type="button" className="tool" aria-expanded={menu} aria-label="More" onClick={() => setMenu(!menu)}>⋯</button>
							{menu && (
								<div className="menu" role="menu">
									<button type="button" role="menuitem" onClick={() => { setHeld(!held); setMenu(false); }}>
										<b>{held ? "Take off hold" : "Put on hold"}</b>
										<span>{held ? "The agents pick it up again." : "The agents finish what they are doing, then wait for you."}</span>
									</button>
									<button type="button" role="menuitem" onClick={() => setMenu(false)}>
										<b>Stop this task</b>
										<span>Ends it and every part that is not done, and stops the running sessions. What was done so far stays.</span>
									</button>
								</div>
							)}
						</span>
					)}
				</header>

				<div className={single ? "tk tk--single" : "tk"}>
					{!single && (
						<nav className="tk-tree" aria-label="Parts of this task">
							<Tree id={root} depth={0} sel={sel} open={open} onPick={pick} onFold={fold} />
						</nav>
					)}

					<article className="tk-page" key={sel}>
						<h1 className="page-title">{t.title}</h1>
						<p className="stand">
							{t.owed && !held && <span className="chip chip--flag">{t.owed}</span>}
							<span>{held ? "On hold. The agents wait until you take it off hold." : t.stand}</span>
							{t.action && <button type="button" className="btn btn--accent">{t.action}</button>}
						</p>
						<p className="tk-meta">{t.meta}</p>

						<p>{t.about}</p>
						{t.doneWhen && (
							<>
								<h3>Done when</h3>
								<ul className="task-list">{t.doneWhen.map((l) => <li key={l}>{l}</li>)}</ul>
							</>
						)}

						<h3>Summary {t.summary && <span>by {t.owner} · {t.summary.when}</span>}</h3>
						{t.summary ? <ul className="task-list">{t.summary.lines.map((l) => <li key={l}>{l}</li>)}</ul> : <p className="tk-none">No summary yet. It has not started.</p>}
						{parts.length > 0 && (
							<div className="parts">
								<span className="parts-h">From its parts</span>
								{parts.map((k) => (
									<button key={k} type="button" className="part" onClick={() => pick(k)}>
										<span className="part-top">
											<span className="part-t">{TASKS[k].title}</span>
											<span className={TASKS[k].owed ? "nrow-state nrow-state--yours" : "part-s"}>{stateOf(k)}</span>
										</span>
										<span className="part-sum">{TASKS[k].summary?.lines[0] ?? TASKS[k].stand}</span>
									</button>
								))}
							</div>
						)}

						<h3>Conversations and documents <span>ranked by {t.owner}</span></h3>
						{t.things.length > 0 ? <Things items={t.things} onPick={pick} /> : <p className="tk-none">Nothing here yet.</p>}
						{t.more && (
							<>
								<button type="button" className="task-more" aria-expanded={more} onClick={() => setMore(!more)}>
									{more ? "Hide" : "Show"} {t.more.items.length} more, {t.more.label}
								</button>
								{more && <Things items={t.more.items} quiet onPick={pick} />}
							</>
						)}

						{t.runs.length > 0 && (
							<>
								<h3>Sessions</h3>
								<div>
									{t.runs.map((r) => (
										<div key={r.n} className="trow">
											<span className="trow-t">Session {r.n} · {r.when}</span>
											<span className="trow-s">
												{r.said}
												{r.live && !held && <button type="button" className="peek" onClick={() => setPeek(!peek)}>{peek ? "Hide" : "Peek"}</button>}
											</span>
										</div>
									))}
									{peek && <ul className="session">{SESSION_STEPS.map((l) => <li key={l}>· {l}</li>)}</ul>}
									{t.earlierRuns && <button type="button" className="task-more">{t.earlierRuns} earlier sessions</button>}
								</div>
							</>
						)}

						{!finished(sel) && (
							<>
								<h3>Say something <span>goes into this task's thread</span></h3>
								{lines.map((l) => <Msg key={l.id} who={l.av} human={l.human} name={l.name} at={l.at}>{l.body}</Msg>)}
								<div className="composer-box task-reply">
									<input placeholder={`Tell ${t.owner} something, or @someone…`} aria-label="Reply" />
									<div className="composer-row">
										<FormatBar kinds={CHAT_FORMATS} />
										<button type="button" className="btn btn--accent">Send</button>
									</div>
								</div>
							</>
						)}
					</article>
				</div>
			</section>
		</>
	);
}
