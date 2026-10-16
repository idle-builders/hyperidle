import { useLayoutEffect, useRef, useState } from "react";
import { CHAT_FORMATS, FormatBar } from "./FormatBar";
import { Msg } from "./Msg";
import { NEED_WORDS, type Need, NeedIcon } from "./NeedIcon";
import { type Item, Sidebar, WORK } from "./Sidebar";

/**
 * RUN THE SHIFT — the task page. Planning happens before, in documents and conversations;
 * checking happens after, in reviews. This page is the middle: watching the work move through
 * its tree. The page itself holds only the title, the details and the conversation. The tree is
 * a section of it, drawn as a graph that follows where you are: it shows the level above the
 * picked part, that part among its siblings, and its subtasks — three levels at most, at any
 * depth. Clicking a part with subtasks shows them; a path line above the graph leads back. Dashed
 * arrows show what waits for what, and a long row of finished parts folds into one chip, so the
 * graph never needs a scroll area. Everything attached sits in one box floating on the right:
 * quick actions, facts, then questions, reviews and documents in sections of their own, then
 * sessions. A small fix has no graph; a recurring task has one part per run.
 */
export const SHIFT_STEPS = [
	{ id: 0, name: "A large task: its parts and summary" },
	{ id: 1, name: "Click a part: its subtasks show" },
	{ id: 2, name: "Go deeper: a part needs input" },
	{ id: 3, name: "Deeper still: the graph moves along" },
	{ id: 4, name: "A small fix: no graph" },
	{ id: 5, name: "A recurring task: twelve runs, folded" },
	{ id: 6, name: "Steer it, hold it, stop it" },
];

type Id =
	| "trials" | "understand" | "numbers" | "dropoff" | "build" | "email" | "checkout" | "page" | "picker" | "payform" | "receipt" | "card" | "wire" | "layout" | "reminder" | "test" | "writeup"
	| "utc"
	| "weekly" | "wnext" | `run${number}`;

/** A question, review or document that hangs on a task. `on` names the part it hangs on, when that is not this one. */
interface Thing {
	kind: "Question" | "Review" | "Document";
	title: string;
	why: string;
	on?: Id;
	needs?: Need;
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
	/** A person is needed here. It marks the part; it does not make the task theirs. */
	needs?: Need;
	/** Parts that must be done before this one starts. */
	after?: Id[];
	/** Someone asked to look at it before it counts as done. */
	review?: boolean;
	/** Where it came from, when that is a conversation elsewhere. */
	from?: string;
	stand: string;
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

/** A recurring task makes one part per run. Twelve Mondays so far. */
const WEEKS = ["20 July", "27 July", "3 August", "10 August", "17 August", "24 August", "31 August", "7 September", "14 September", "21 September", "28 September", "5 October"];
const TICKETS = [22, 24, 21, 23, 20, 22, 19, 21, 18, 17, 19, 14];
const RUNS: Record<`run${number}`, Task> = Object.fromEntries(
	WEEKS.map((week, i): [string, Task] => [
		`run${i}`,
		{
			title: `Week of ${week}`,
			owner: "Growth",
			state: "Done",
			stand: "Done on its Monday. It closed by itself.",
			about: `Read the support tickets from the week of ${week} and say what people struggled with most.`,
			summary: { when: "written when it finished", lines: [`${TICKETS[i]} tickets. Top theme: trial-end billing.`] },
			things: [{ kind: "Document", title: `Support themes, week of ${week}`, why: "This run's summary" }],
			runs: [{ n: 1, when: "its Monday, 07:00", said: "about 20 min · finished" }],
			meta: "Growth owns this · about 20 min in 1 session",
		},
	]),
);

const TASKS: Record<Id, Task> = {
	trials: {
		title: "Trials that convert without a call",
		owner: "Growth",
		kids: ["understand", "build", "test", "writeup"],
		stand: "Six of twelve parts are done. One needs input, one needs a review, one is running.",
		about: "Can a trial turn into a paid plan without a sales call? Put a self-serve checkout in front of people on day 12 and compare it with what we do today.",
		doneWhen: [
			"The test ran for two weeks on new signups.",
			"We know how many paid without a call, next to last quarter.",
			"What we learned is written down in How we price.",
		],
		summary: {
			when: "updated 2h ago",
			lines: [
				"Two parts need a person: an answer on the checkout, and a review of the stacked layout.",
				"Builder is writing the reminder email now.",
				"We know why people leave before paying: most stop at the card form. The plan rests on that.",
				"The two-week test starts by itself when the day-12 path is built.",
			],
		},
		things: [
			{ kind: "Review", title: "Comparison table, stacked layout · Final", why: "Two widths to look at, one spot flagged", on: "layout", needs: "review" },
			{ kind: "Question", title: "When do we take the card?", why: "Asked by Builder 6h ago", on: "card", needs: "input" },
			{ kind: "Document", title: "Plan: trials without a call", why: "The plan you wrote with Growth" },
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
			{ id: "a", av: "GR", name: "Growth", at: "14:32", body: "Two parts need a person before the test can start: one answer on the checkout and one review of the layout." },
		],
		meta: "Growth owns this · started 2 weeks ago · 7h in 6 sessions",
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
		after: ["understand"],
		title: "Build the day-12 path",
		owner: "Growth",
		kids: ["email", "checkout", "layout", "reminder"],
		stand: "Four of eight parts are done. One needs input, one needs a review, one is running.",
		about: "Everything a person on day 12 sees: the email, the checkout page, the comparison table and the reminder.",
		summary: {
			when: "updated 2h ago",
			lines: [
				"The checkout page is built but needs an answer about the card.",
				"The stacked layout needs a review.",
				"Builder is writing the reminder email. The day-12 email is done.",
			],
		},
		things: [
			{ kind: "Review", title: "Comparison table, stacked layout · Final", why: "Two widths to look at, one spot flagged", on: "layout", needs: "review" },
			{ kind: "Question", title: "When do we take the card?", why: "Asked by Builder 6h ago", on: "card", needs: "input" },
			{ kind: "Document", title: "Day-12 checkout email", why: "The final email", on: "email" },
		],
		runs: [{ n: 3, when: "today 14:05", said: "5 min · read the parts, wrote the summary" }],
		earlierRuns: 2,
		meta: "Growth owns this · started 5 days ago · 25 min in 3 sessions",
	},
	email: {
		after: ["dropoff"],
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
		kids: ["page", "card", "wire"],
		stand: "Three of five parts are done. One needs input.",
		about: "Let someone on a trial pay by themselves on day 12, without talking to us.",
		doneWhen: ["A person on day 12 can pick a plan and pay on one page.", "People who already pay see nothing new."],
		summary: {
			when: "written when it got stuck, 6h ago",
			lines: [
				"Stuck on one question: when do we take the card?",
				"The checkout page is built and works on a test account.",
				"Once that is answered: put it in, then hand the page to Designer for the layout.",
			],
		},
		things: [{ kind: "Question", title: "When do we take the card?", why: "Asked by Builder 6h ago", on: "card", needs: "input" }],
		more: { label: "made by Builder while working", items: [{ kind: "Document", title: "How billing takes cards today", why: "Reading notes" }] },
		runs: [{ n: 1, when: "yesterday 21:15", said: "48 min · read how billing takes cards today, split the work in three" }],
		meta: "Builder owns this · started yesterday 21:15 · 1h 53m in 3 sessions",
		review: true,
	},
	page: {
		title: "Build the checkout page",
		owner: "Builder",
		kids: ["picker", "payform", "receipt"],
		stand: "Done today 09:40. All three parts are finished.",
		about: "One page where a person on a trial picks a plan and pays.",
		summary: { when: "written when it finished, 09:40", lines: ["The checkout page is built and works on a test account.", "Plan picker, payment form and receipt are each a part of their own."] },
		things: [],
		runs: [{ n: 1, when: "today 08:40", said: "10 min · split the page in three" }],
		meta: "Builder owns this · finished today 09:40 · 1h in 4 sessions",
	},
	picker: {
		title: "Plan picker",
		owner: "Builder",
		state: "Done",
		stand: "Done today 09:05. It closed by itself.",
		about: "Show the plans side by side and let the person pick one.",
		summary: { when: "written when it finished, 09:05", lines: ["Three plans side by side, the one from the trial picked to start with."] },
		things: [],
		runs: [{ n: 1, when: "today 08:50", said: "15 min · finished" }],
		meta: "Builder owns this · finished today 09:05 · 15 min in 1 session",
	},
	payform: {
		after: ["picker"],
		title: "Payment form",
		owner: "Builder",
		state: "Done",
		stand: "Done today 09:30. It closed by itself.",
		about: "Take the payment for the picked plan on the same page.",
		summary: { when: "written when it finished, 09:30", lines: ["Card payment works on a test account. It uses the card on file when there is one."] },
		things: [],
		runs: [{ n: 1, when: "today 09:05", said: "25 min · finished" }],
		meta: "Builder owns this · finished today 09:30 · 25 min in 1 session",
	},
	receipt: {
		after: ["payform"],
		title: "Receipt line",
		owner: "Builder",
		state: "Done",
		stand: "Done today 09:40. It closed by itself.",
		about: "After paying, say what was charged and when the next bill comes.",
		summary: { when: "written when it finished, 09:40", lines: ["The page ends with the amount charged and the date of the next bill."] },
		things: [],
		runs: [{ n: 1, when: "today 09:30", said: "10 min · finished" }],
		meta: "Builder owns this · finished today 09:40 · 10 min in 1 session",
	},
	card: {
		after: ["page"],
		title: "Decide when the card is taken",
		owner: "Builder",
		state: "Needs input",
		needs: "input",
		stand: "Builder stopped and asked a question 6 hours ago.",
		about: "Taking the card on day 12 instead of at the start changes what every new trial user sees.",
		summary: {
			when: "written when it got stuck, 6h ago",
			lines: ["Stuck on one question: when do we take the card?", "Today we take it when the trial starts."],
		},
		things: [{ kind: "Question", title: "When do we take the card?", why: "Asked by Builder 6h ago", needs: "input" }],
		runs: [{ n: 1, when: "today 09:40", said: "5 min · stopped to ask" }],
		thread: [
			{
				id: "a", av: "BU", name: "Builder", at: "09:45",
				body: (
					<>
						The page works. One thing I will not decide on my own.
						<div className="card">
							<div className="card-head">
								<span className="chip chip--flag">Needs input</span>
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
		meta: "Builder owns this · waiting since today 09:45 · 5 min in 1 session",
	},
	wire: {
		after: ["card"],
		title: "Put the answer into the checkout",
		owner: "Builder",
		state: "Waits",
		stand: "Waits for the answer about the card.",
		about: "Take the card when the answer says, then hand the page to Designer for the layout.",
		things: [],
		runs: [],
		meta: "Builder owns this · not started",
	},
	layout: {
		title: "Comparison table, stacked layout",
		owner: "Designer",
		state: "Needs review",
		needs: "review",
		stand: "The work is finished. It closes once it is reviewed.",
		about: "The table that compares the plans, stacked so it reads on a phone.",
		summary: {
			when: "written when it finished, 5h ago",
			lines: [
				"Finished and waiting for a review.",
				"The table stacks into one column on a narrow screen. Two widths are in the review.",
				"One spot I am not sure about and flagged: the order of the plans on a phone.",
			],
		},
		things: [{ kind: "Review", title: "Comparison table, stacked layout · Final", why: "Two widths to look at, one spot flagged", needs: "review" }],
		runs: [{ n: 1, when: "today 09:30", said: "1h 40m · finished, asked for a review" }],
		meta: "Designer owns this · started today 09:30 · 1h 40m in 1 session",
		review: true,
	},
	reminder: {
		after: ["email"],
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
		meta: "Builder owns this · started today 16:05",
	},
	test: {
		after: ["build"],
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
		after: ["test"],
		title: "Write up what we learned",
		owner: "Growth",
		state: "Not started",
		stand: "Not started. It comes after the test.",
		about: "What happened, in numbers, and what we change in How we price.",
		things: [],
		runs: [],
		meta: "Growth owns this · not started",
		review: true,
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
		things: [],
		from: "Thread · Trial-end confusion, three tickets",
		runs: [{ n: 1, when: "today 05:10", said: "45 min · finished" }],
		meta: "Builder owns this · finished today 05:55 · 45 min in 1 session",
	},
	weekly: {
		title: "Support themes, weekly",
		owner: "Growth",
		kids: [...WEEKS.map((_, i): Id => `run${i}`), "wnext"],
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
			{ kind: "Document", title: "Support themes, week of 5 October", why: "The latest run", on: "run11" },
		],
		more: {
			label: "from earlier runs",
			items: [
				{ kind: "Document", title: "Support themes, week of 28 September", why: "19 tickets", on: "run10" },
				{ kind: "Document", title: "Support themes, week of 21 September", why: "17 tickets", on: "run9" },
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
	...RUNS,
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
/** Documents and reviews that hang on this very part. */
const counts = (id: Id): { docs: number; reviews: number } => {
	const t = TASKS[id];
	const own = [...t.things, ...(t.more?.items ?? [])].filter((x) => !x.on);
	return { docs: own.filter((x) => x.kind === "Document").length, reviews: own.filter((x) => x.kind === "Review").length };
};
/** How many parts inside need a person, by kind — shown on their parent. */
const needsIn = (id: Id, kind: Need): number => leaves(id).filter((l) => l !== id && TASKS[l].needs === kind).length;
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

const START: Id[] = ["trials", "build", "card", "page", "utc", "weekly", "trials"];
const INITIALS: Record<string, string> = { Builder: "BU", Growth: "GR", Designer: "DS" };

function KindIcon({ kind }: { kind: Thing["kind"] }) {
	return (
		<svg className="att-ic" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			{kind === "Document" && <path d="M4 1.75h5.5l2.5 2.5v10H4zM9.5 1.75v2.5H12" />}
			{kind === "Question" && (
				<>
					<path d="M6 6.2a2 2 0 1 1 2.9 1.8c-.6.3-.9.7-.9 1.4" />
					<circle cx="8" cy="12" r="0.6" fill="currentColor" />
				</>
			)}
			{kind === "Review" && (
				<>
					<path d="M1.5 8s2.4-4.3 6.5-4.3S14.5 8 14.5 8s-2.4 4.3-6.5 4.3S1.5 8 1.5 8z" />
					<circle cx="8" cy="8" r="1.8" />
				</>
			)}
		</svg>
	);
}

/** What the graph needs to know to draw itself. */
interface View {
	/** The picked part. Its subtasks show to its right. */
	sel: Id;
	/** The parts that lead to it, from the task down. Each shows its subtasks too. */
	path: Set<Id>;
	/** Parents whose long row of finished parts has been opened up. */
	unfolded: Set<Id>;
	onPick: (id: Id) => void;
	onUnfold: (id: Id) => void;
	/** The parts drawn right now, once the graph has measured them. */
	seen?: Set<Id>;
}

/** A dashed arrow in small, the same mark the graph draws between two parts. */
function Wait() {
	return (
		<svg className="nd-wait" viewBox="0 0 18 8" aria-hidden="true">
			<path d="M1 4h12" strokeDasharray="2 3" />
			<path d="M12 1l4 3-4 3" />
		</svg>
	);
}

/** One part on the graph: a mark for how it stands, its name, a few words. Clicking a part shows its subtasks. */
const ALL = (): Id[] => Object.keys(TASKS) as Id[];

function Node({ id, view }: { id: Id; view: View }) {
	const t = TASKS[id];
	const state = stateOf(id);
	const done = finished(id);
	const running = state === "Running";
	const c = counts(id);
	const shown = view.sel === id || view.path.has(id);
	const inside: Need[] = t.kids ? (["input", "review"] as const).filter((k) => needsIn(id, k) > 0) : [];
	let words = state;
	if (t.needs) words = NEED_WORDS[t.needs];
	else if (running) words = `${t.owner} is on it`;
	const extra = [c.docs > 0 && `${c.docs} ${c.docs === 1 ? "doc" : "docs"}`, c.reviews > 0 && `${c.reviews} ${c.reviews === 1 ? "review" : "reviews"}`].filter(Boolean).join(" · ");
	// A wait whose other end is out of view still shows, so the graph never hides that there is more.
	const away = (x: Id) => Boolean(view.seen && !view.seen.has(x));
	const waitsFor = (t.after ?? []).filter(away);
	const waitedOn = ALL().filter((o) => TASKS[o].after?.includes(id) && away(o));
	return (
		<button
			type="button" data-id={id} aria-pressed={view.sel === id} onClick={() => view.onPick(id)}
			className={["nd", t.kids && "nd--head", done && "nd--done", view.path.has(id) && "nd--path"].filter(Boolean).join(" ")}
		>
			<span className="nd-mark" aria-hidden="true">
				{t.needs && <NeedIcon kind={t.needs} />}
				{!t.needs && running && <span className="avatar nd-av">{INITIALS[t.owner]}</span>}
				{!(t.needs || running) && done && "✓"}
				{!(t.needs || running || done) && (t.kids ? "◐" : "○")}
			</span>
			<span className="nd-text">
				<span className="nd-name">{t.title}</span>
				<span className="nd-sub">
					{words}{extra && ` · ${extra}`}
					{inside.map((k) => <span key={k} className="nd-in"><NeedIcon kind={k} />{needsIn(id, k)}</span>)}
				</span>
				{waitsFor.map((d) => <span key={d} className="nd-away"><Wait />after {TASKS[d].title}</span>)}
				{waitedOn.map((o) => <span key={o} className="nd-away"><Wait />{TASKS[o].title} comes after</span>)}
			</span>
			{t.kids && !shown && <span className="nd-kids" title={`${t.kids.length} subtasks`}>{t.kids.length} ›</span>}
		</button>
	);
}

/**
 * The parts under one parent. A long row of finished parts folds into one chip, keeping the
 * latest in sight; opening it grows the page, so the graph never needs a scroll area of its own.
 */
function Parts({ parent, view }: { parent: Id; view: View }) {
	const kids = TASKS[parent].kids ?? [];
	const done = kids.filter((k) => finished(k) && k !== view.sel && !view.path.has(k));
	const folded = done.length > 3 && !view.unfolded.has(parent) ? done.slice(0, -1) : [];
	return (
		<>
			{kids.map((k) => {
				if (!folded.includes(k)) return <div key={k} className="st-kid"><Branch id={k} view={view} /></div>;
				if (k !== folded[0]) return null;
				return (
					<div key={k} className="st-kid">
						<button type="button" className="nd nd--more" onClick={() => view.onUnfold(parent)}>
							<span className="nd-mark" aria-hidden="true">✓</span>
							<span className="nd-text">
								<span className="nd-name">{folded.length} earlier, done</span>
								<span className="nd-sub">Show them</span>
							</span>
						</button>
					</div>
				);
			})}
		</>
	);
}

/** Branches run left to right, each parent level with its first part. */
function Branch({ id, view }: { id: Id; view: View }) {
	return (
		<div className="st">
			<Node id={id} view={view} />
			{TASKS[id].kids && (view.sel === id || view.path.has(id)) && <div className="st-kids"><Parts parent={id} view={view} /></div>}
		</div>
	);
}

interface Arrow {
	key: string;
	d: string;
	open: boolean;
}

/**
 * The graph: up to three levels of the tree around the picked part, plus a dashed arrow from
 * each part to the part that waits for it. `from` is the part whose subtasks fill the first
 * column; the task itself is never drawn — it is the page. Arrows are measured from where the
 * chips really sit: straight down when nothing is in the way, a curve out to the right when
 * something is.
 */
function Graph({ from, columns, view }: { from: Id; columns: number; view: View }) {
	const box = useRef<HTMLDivElement>(null);
	const [arrows, setArrows] = useState<Arrow[]>([]);
	const [seen, setSeen] = useState("");
	const shape = `${from}|${view.sel}|${[...view.unfolded].join()}`;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `shape` stands for what the graph shows; the arrows must be measured again whenever it changes
	useLayoutEffect(() => {
		const el = box.current;
		if (!el) return;
		const draw = () => {
			const host = el.getBoundingClientRect();
			const chips = [...el.querySelectorAll<HTMLElement>("[data-id]")].map((c) => {
				const r = c.getBoundingClientRect();
				return { id: c.dataset.id as Id, l: r.left - host.left, t: r.top - host.top, r: r.right - host.left, b: r.bottom - host.top };
			});
			const next: Arrow[] = [];
			for (const to of chips) {
				for (const dep of TASKS[to.id].after ?? []) {
					const from = chips.find((c) => c.id === dep);
					if (!from) continue;
					const sameColumn = Math.abs(from.l - to.l) < 4;
					const inTheWay = chips.some((o) => o !== from && o !== to && Math.abs(o.l - from.l) < 4 && o.t > from.t && o.t < to.t);
					let d = `M${from.r + 3} ${from.t + 20}C${from.r + 40} ${from.t + 20} ${to.l - 40} ${to.t + 20} ${to.l - 7} ${to.t + 20}`;
					if (sameColumn && !inTheWay) d = `M${from.l + 23} ${from.b + 2}V${to.t - 4}`;
					else if (from.l > to.r) d = `M${from.l - 3} ${from.t + 20}C${from.l - 40} ${from.t + 20} ${to.r + 40} ${to.t + 20} ${to.r + 7} ${to.t + 20}`;
					else if (sameColumn) {
						const out = Math.max(from.r, to.r) + 22;
						d = `M${from.r + 3} ${from.t + 20}C${out} ${from.t + 20} ${out} ${to.t + 20} ${to.r + 7} ${to.t + 20}`;
					}
					next.push({ key: `${dep}>${to.id}`, d, open: !finished(dep) });
				}
			}
			setArrows(next);
			setSeen(chips.map((c) => c.id).sort().join(","));
		};
		draw();
		const watch = new ResizeObserver(draw);
		watch.observe(el);
		return () => watch.disconnect();
	}, [shape]);
	return (
		<div className={columns > 2 ? "mp mp--deep" : "mp"} ref={box}>
			<svg className="waits" aria-hidden="true">
				<defs>
					<marker id="wait-end" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
						<path d="M1 1l5 3-5 3" fill="none" stroke="context-stroke" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
					</marker>
				</defs>
				{arrows.map((a) => <path key={a.key} d={a.d} className={a.open ? "wait wait--open" : "wait"} markerEnd="url(#wait-end)" />)}
			</svg>
			<div className="st-kids st-kids--first"><Parts parent={from} view={seen ? { ...view, seen: new Set(seen.split(",") as Id[]) } : view} /></div>
		</div>
	);
}

const SECTIONS: { kind: Thing["kind"]; title: string }[] = [
	{ kind: "Question", title: "Questions" },
	{ kind: "Review", title: "Reviews" },
	{ kind: "Document", title: "Documents" },
];

/**
 * The floating box: quick actions, the facts, then what is attached — questions, reviews and
 * documents each in a section of their own, ranked so what a person takes part in comes first.
 */
function TaskBox({ id, held, onHold, onPick }: { id: Id; held: boolean; onHold: () => void; onPick: (id: Id) => void }) {
	const t = TASKS[id];
	const [more, setMore] = useState(false);
	const [peek, setPeek] = useState(false);
	const [review, setReview] = useState(Boolean(t.review));
	// You follow what you started; following is how its news reaches you.
	const [following, setFollowing] = useState(true);
	const done = finished(id);
	let state = stateOf(id);
	if (t.needs) state = NEED_WORDS[t.needs];
	if (held) state = "On hold";
	let closing = review ? "Was reviewed before it closed" : "Closed without a review";
	if (!done) closing = "";
	const row = (x: Thing, quiet?: boolean) => {
		const on = x.on;
		return (
			<div key={x.kind + x.title} className={quiet ? "att att--quiet" : "att"}>
				{x.needs ? <NeedIcon kind={x.needs} /> : <KindIcon kind={x.kind} />}
				<span className="att-body">
					<button type="button" className="att-title">{x.title}</button>
					<span className="att-why">{x.why}{on && <> · on <button type="button" onClick={() => onPick(on)}>{TASKS[on].title}</button></>}</span>
				</span>
			</div>
		);
	};
	return (
		<aside className="tbox" aria-label="About this task">
			<div className="tbox-head">
				<span className="tbox-name">{t.title}</span>
				<span className="tbox-state">{state}</span>
			</div>

			<div className="tbox-acts">
				<button type="button" className="btn" aria-pressed={following} onClick={() => setFollowing(!following)}>{following ? "Following" : "Follow"}</button>
				{!done && <button type="button" className="btn" onClick={onHold}>{held ? "Take off hold" : "Put on hold"}</button>}
				{!done && <button type="button" className="btn">Stop</button>}
			</div>

			<ul className="tbox-facts">
				{t.meta.split(" · ").map((f) => <li key={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</li>)}
				{t.from && <li>Came from <button type="button" className="tbox-link">{t.from}</button></li>}
				<li>
					{closing}
					{!done && (
						<button type="button" className="fact-switch" role="switch" aria-checked={review} onClick={() => setReview(!review)}>
							<span className="fact-knob" />
							Review before it is done
						</button>
					)}
				</li>
			</ul>

			{SECTIONS.map(({ kind, title }) => {
				const items = t.things.filter((x) => x.kind === kind);
				const rest = t.more?.items.filter((x) => x.kind === kind) ?? [];
				if (items.length + rest.length === 0) return null;
				const waiting = items.filter((x) => x.needs).length;
				return (
					<section key={kind} className="tbox-sec">
						<h4>{title} {waiting > 0 && <span>{waiting} open</span>}{kind === "Document" && <span>ranked by {t.owner}</span>}</h4>
						{items.map((x) => row(x))}
						{rest.length > 0 && (
							<>
								<button type="button" className="tbox-more" aria-expanded={more} onClick={() => setMore(!more)}>
									{more ? "Hide" : "Show"} {rest.length} more, {t.more?.label}
								</button>
								{more && rest.map((x) => row(x, true))}
							</>
						)}
					</section>
				);
			})}

			{t.runs.length > 0 && (
				<section className="tbox-sec">
					<h4>Sessions</h4>
					{t.runs.map((x) => (
						<div key={x.n} className="ses">
							<span className="ses-t">Session {x.n} · {x.when}</span>
							<span className="ses-s">
								{x.said}
								{x.live && !held && <> · <button type="button" className="peek" onClick={() => setPeek(!peek)}>{peek ? "Hide" : "Peek"}</button></>}
							</span>
						</div>
					))}
					{peek && <ul className="session">{SESSION_STEPS.map((l) => <li key={l}>· {l}</li>)}</ul>}
					{t.earlierRuns && <button type="button" className="tbox-more">{t.earlierRuns} earlier sessions</button>}
				</section>
			)}
		</aside>
	);
}

const depthOf = (id: Id): number => {
	const p = parentOf(id);
	return p ? depthOf(p) + 1 : 0;
};
/** The parts that lead from the task down to this one, nearest last. Neither end is included. */
const pathTo = (id: Id): Id[] => {
	const p = parentOf(id);
	return p && parentOf(p) ? [...pathTo(p), p] : [];
};

export function Shift({ step }: { step: number }) {
	const [sel, setSel] = useState<Id>(START[step] ?? "trials");
	const [held, setHeld] = useState(step === 6);
	const [unfolded, setUnfolded] = useState<Set<Id>>(new Set());
	const root = rootOf(sel);
	const r = TASKS[root];
	const t = TASKS[sel];
	const all = leaves(root);
	const path = pathTo(sel);
	// Three levels at most: the level above the picked part, its own, and its subtasks.
	const deepest = depthOf(sel) + (t.kids ? 1 : 0);
	const first = Math.max(1, deepest - 2);
	const from = [root, ...path, sel].find((id) => depthOf(id) === first - 1) ?? root;
	const view: View = {
		sel, path: new Set(path), unfolded, onPick: setSel,
		onUnfold: (id) => setUnfolded((u) => {
			const next = new Set(u);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		}),
	};
	const tally = [
		`${all.filter((l) => TASKS[l].state === "Done").length} of ${all.length} done`,
		needsIn(root, "input") > 0 && `${needsIn(root, "input")} needs input`,
		needsIn(root, "review") > 0 && `${needsIn(root, "review")} needs review`,
		all.some((l) => TASKS[l].state === "Running") && `${all.filter((l) => TASKS[l].state === "Running").length} running`,
	].filter(Boolean).join(" · ");
	const lines = step === 6 && sel === "trials" ? [...(t.thread ?? []), ...STEERED] : t.thread ?? [];

	return (
		<>
			<Sidebar key={root} initialSpine="work" initialPicked={ROWS[root] ?? null} lists={{ work: LIST }} />
			<section className="detail">
				<header className="detail-head">
					<span className="chip chip--quiet">Task</span>
					<span className="doc-state">{held ? "On hold" : stateOf(root)}</span>
				</header>

				<div className="detail-scroll">
					<article className="tk-page">
						<div className="tk-main">
							<h1 className="page-title">{r.title}</h1>
							<p className="stand">
								{r.needs && !held && <NeedIcon kind={r.needs} />}
								<span>{held ? "On hold. The agents finish what they are doing, then wait." : r.stand}</span>
							</p>
							<p>{r.about}</p>

							{r.kids && (
								<section className="tk-map" aria-label="Parts of this task">
									<h3>Parts <span>{r.state ? `${all.length - 1} runs so far, the next one last` : tally}</span></h3>
									{sel !== root && (
										<nav className="crumbs" aria-label="Where you are in this task">
											<button type="button" onClick={() => setSel(root)}>The whole task</button>
											{path.map((id) => <button key={id} type="button" onClick={() => setSel(id)}>{TASKS[id].title}</button>)}
											<span aria-current="true">{t.title}</span>
										</nav>
									)}
									<Graph from={from} columns={deepest - first + 1} view={view} />
								</section>
							)}

							<div className={sel === root ? "tk-part" : "tk-part tk-part--sub"} key={sel}>
								{sel !== root && (
									<>
										<h2 className="tk-part-title">{t.title}</h2>
										<p className="stand">
											{t.needs && <NeedIcon kind={t.needs} />}
											<span>{t.stand}</span>
										</p>
										<p>{t.about}</p>
									</>
								)}
								{t.doneWhen && (
									<>
										<h3>Done when</h3>
										<ul className="task-list">{t.doneWhen.map((l) => <li key={l}>{l}</li>)}</ul>
									</>
								)}

								<h3>Summary {t.summary && <span>by {t.owner} · {t.summary.when}</span>}</h3>
								{t.summary ? <ul className="task-list">{t.summary.lines.map((l) => <li key={l}>{l}</li>)}</ul> : <p className="tk-none">No summary yet. It has not started.</p>}

								<h3>Conversation <span>also in Conversations</span></h3>
								{lines.length === 0 && <p className="tk-none">Nothing said here yet.</p>}
								{lines.map((l) => <Msg key={l.id} who={l.av} human={l.human} name={l.name} at={l.at}>{l.body}</Msg>)}
								<div className="composer-box task-reply">
									<input placeholder={`Tell ${t.owner} something, or @someone…`} aria-label="Reply" />
									<div className="composer-row">
										<FormatBar kinds={CHAT_FORMATS} />
										<button type="button" className="btn btn--accent">Send</button>
									</div>
								</div>
							</div>
						</div>

						<TaskBox key={sel} id={sel} held={held} onHold={() => setHeld(!held)} onPick={setSel} />
					</article>
				</div>
			</section>
		</>
	);
}
