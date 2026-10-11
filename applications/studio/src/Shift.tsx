import { useState } from "react";
import { CHAT_FORMATS, FormatBar } from "./FormatBar";
import { tickets } from "./handoff";
import { Avatar, Msg } from "./Msg";
import { Sidebar } from "./Sidebar";

/**
 * RUN THE SHIFT — the task page. A task is the agent's; to a person it is something to look at
 * and steer, never something on their plate. Top to bottom the page answers: where does it
 * stand, what is it for, what are its parts, what has the agent written down, what ran, and what
 * was said. Facts sit in the margin. State is always words.
 */
export const SHIFT_STEPS = [
	{ id: 0, name: "A running task" },
	{ id: 1, name: "A task with subtasks" },
	{ id: 2, name: "A subtask waiting on your answer" },
	{ id: 3, name: "Waiting on your review" },
	{ id: 4, name: "Done, no review asked" },
	{ id: 5, name: "Steer it, hold it, stop it" },
];

type TaskId = "metering" | "trials" | "checkout" | "explainer" | "proration";

interface Sub {
	title: string;
	state: string;
	who: string;
	done?: boolean;
	opens?: TaskId;
}
interface Run {
	n: number;
	when: string;
	said: string;
	live?: boolean;
}
interface Rev {
	what: string;
	whose: string;
	state: string;
	yours?: boolean;
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
	/** The row in the Work list that stays picked while this task is open. */
	row: string;
	parent?: TaskId;
	state: string;
	/** What you owe on it, if anything — the only thing that gets the flag colour. */
	owed?: string;
	stand: string;
	action?: string;
	brief: string;
	doneWhen: string[];
	subs?: Sub[];
	notes: { by: string; when: string; lines: string[] };
	runs: Run[];
	earlierRuns?: number;
	reviews?: Rev[];
	thread: { title: string; earlier: number; lines: Line[] };
	owner: { name: string; av: string };
	review: boolean;
	facts: { k: string; v: React.ReactNode }[];
}

const link = (text: string) => <button type="button" className="fact-link">{text}</button>;

const SESSION_STEPS = [
	"read the Tiers and metering document",
	"added a table of events, one row per event id",
	"counted each id once, retries included",
	"wrote 3 cases for events sent twice",
	"started the running total on the billing page",
];

const TASKS: Record<TaskId, Task> = {
	metering: {
		title: "Usage-based tier, metering",
		row: "w-f2",
		state: "Running · 2h",
		stand: "Builder is working on this. Session 2, 12 minutes in.",
		brief: "Bill the Scale plan by events used instead of by seat. Count events per account, show the running total on the billing page, and charge the total at month end.",
		doneWhen: [
			"An event is counted once, even when it is sent twice.",
			"The billing page shows this month's count and what it costs so far.",
			"The month-end invoice uses the counted total.",
		],
		notes: {
			by: "Builder", when: "updated 12 min ago",
			lines: [
				"Counting works. Each event is counted once by its id, retries included. Three cases cover it.",
				"Next: the running total on the billing page.",
				"Careful: invoices for seat-based plans must not change. I am leaving them alone and checking that last.",
			],
		},
		runs: [
			{ n: 2, when: "today 16:05", said: "running · 12 min · 5 steps", live: true },
			{ n: 1, when: "yesterday 18:02", said: "1h 48m · stopped when its memory was full, left notes" },
		],
		thread: {
			title: "Pricing page, Q4 pass", earlier: 6,
			lines: [
				{ id: "a", av: "FO", human: true, name: "You", at: "yesterday 18:02", body: <><strong>@Builder</strong> start on usage-based billing for the Scale plan. The brief is on the task.</> },
				{ id: "b", av: "BU", name: "Builder", at: "yesterday 18:02", body: "Taking it. I will come back here when there is something to look at." },
			],
		},
		owner: { name: "Builder", av: "BU" },
		review: true,
		facts: [
			{ k: "Made from", v: link("Thread · Pricing page, Q4 pass") },
			{ k: "Follows", v: link("Document · Tiers and metering") },
			{ k: "Started", v: "Yesterday 18:02" },
			{ k: "Worked", v: "2h in 2 sessions" },
		],
	},
	trials: {
		title: "Trials that convert without a call",
		row: "w-f1",
		state: "3 of 7 done",
		stand: "Growth is running this. Two parts are waiting on you; the test starts when both land.",
		brief: "Can a trial turn into a paid plan without a sales call? Put a self-serve checkout in front of people on day 12 and compare it with what we do today.",
		doneWhen: [
			"The test ran for two weeks on new signups.",
			"We know how many paid without a call, next to last quarter.",
			"What we learned is written down in How we price.",
		],
		subs: [
			{ title: "Pull last quarter's trial-to-paid numbers", state: "Done", who: "Growth", done: true },
			{ title: "Find where people drop off before paying", state: "Done", who: "Growth", done: true },
			{ title: "Draft the day-12 checkout email", state: "Done", who: "Designer", done: true },
			{ title: "Self-serve checkout at day 12", state: "Waiting on your answer", who: "Builder", opens: "checkout" },
			{ title: "Comparison table, stacked layout", state: "Waiting on your review", who: "Designer" },
			{ title: "Run the test for two weeks", state: "Waits for the two above", who: "Growth" },
			{ title: "Write up what we learned", state: "Not started", who: "Growth" },
		],
		notes: {
			by: "Growth", when: "updated 2h ago",
			lines: [
				"Three of seven parts are done: the numbers, the drop-off points and the day-12 email.",
				"The checkout is waiting on one answer from you. The stacked layout is waiting on your review.",
				"The two-week test cannot start until both land.",
			],
		},
		runs: [{ n: 6, when: "today 14:10", said: "22 min · checked on the parts, updated the notes" }],
		earlierRuns: 5,
		thread: {
			title: "Trials that convert without a call", earlier: 9,
			lines: [
				{ id: "a", av: "GR", name: "Growth", at: "14:32", body: "Two parts need you before the test can start: one answer on the checkout and one review of the layout. Both are in Conversations." },
			],
		},
		owner: { name: "Growth", av: "GR" },
		review: false,
		facts: [
			{ k: "Follows", v: link("Document · Trials") },
			{ k: "Started", v: "2 weeks ago" },
			{ k: "Worked", v: "7h in 6 sessions" },
		],
	},
	checkout: {
		title: "Self-serve checkout at day 12",
		row: "w-f1",
		parent: "trials",
		state: "Waiting on your answer",
		owed: "Your answer",
		stand: "Builder stopped and asked you a question 6 hours ago.",
		brief: "Let someone on a trial pay by themselves on day 12, without talking to us.",
		doneWhen: ["A person on day 12 can pick a plan and pay on one page.", "People who already pay see nothing new."],
		notes: {
			by: "Builder", when: "updated 6h ago",
			lines: [
				"The checkout page is built and works on a test account.",
				"I stopped before changing when we take the card. That changes what every new trial user sees, so it is your call.",
				"Next, once you answer: put the answer in, then hand the page to Designer for the layout.",
			],
		},
		runs: [
			{ n: 2, when: "today 08:40", said: "1h 05m · built the page, then stopped to ask" },
			{ n: 1, when: "yesterday 21:15", said: "48 min · read how billing takes cards today" },
		],
		thread: {
			title: "Self-serve checkout at day 12", earlier: 2,
			lines: [
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
									Today we take it when the trial starts. A checkout on day 12 only makes sense if
									some people have not given one yet.
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
		},
		owner: { name: "Builder", av: "BU" },
		review: true,
		facts: [
			{ k: "Waiting since", v: "Today 09:45" },
			{ k: "Started", v: "Yesterday 21:15" },
			{ k: "Worked", v: "1h 53m in 2 sessions" },
		],
	},
	explainer: {
		title: "Explain what happens when a trial ends",
		row: "w-t1",
		state: "Waiting on your review",
		owed: "Your review",
		stand: "The work is finished. It closes when you have looked at it.",
		action: "Look at it",
		brief: "People finish a trial and cannot tell what they will pay. Find out why and fix it.",
		doneWhen: [
			"The pricing page and the receipt say the date and the amount of the first bill.",
			"The three people who wrote in have an answer.",
		],
		notes: {
			by: "Builder", when: "updated 8h ago",
			lines: [
				"Found a bug: upgrading in the middle of a month charged the wrong part of the month. Fixed, three cases cover it.",
				"The pricing page, the receipt and the support reply now all say “Your first bill”, with its date.",
				"I drafted the three replies to customers. Those are Maya's to send, not mine.",
			],
		},
		runs: [{ n: 1, when: "yesterday 08:13", said: "4h 20m · asked you one question on the way" }],
		reviews: [
			{ what: "Trial-end explainer · Final", whose: "Yours", state: "open for 8h", yours: true },
			{ what: "Three replies to customers", whose: "Maya Chen", state: "sent 13:02" },
		],
		thread: {
			title: "Trial-end confusion, three tickets", earlier: 5,
			lines: [
				{ id: "a", av: "BU", name: "Builder", at: "12:48", body: <>Went with <strong>Your first bill</strong>. The fix is in and the page says it in three places. I raised two reviews: the change is yours, the replies are Maya's.</> },
				{ id: "b", av: "MC", human: true, name: "Maya Chen", at: "13:02", body: "Sent all three, barely touched them. Closed the tickets. Thanks." },
			],
		},
		owner: { name: "Builder", av: "BU" },
		review: true,
		facts: [
			{ k: "Made from", v: link("Thread · Trial-end confusion, three tickets") },
			{
				k: "References",
				v: (
					<span className="fact-refs">
						{tickets.map((t) => (
							<a key={t.id} className="ref" href="#ref"><span className="ref-src">{t.src}</span><span className="ref-id">{t.id}</span><span className="ref-out">↗</span></a>
						))}
					</span>
				),
			},
			{ k: "Started", v: "Yesterday 08:13" },
			{ k: "Worked", v: "4h 20m in 1 session" },
		],
	},
	proration: {
		title: "Proration math covered end to end",
		row: "w-d1",
		state: "Done · 03:40",
		stand: "Done at 03:40. It closed by itself; nobody asked for a review.",
		brief: "After the trial-end fix: make sure an upgrade in the middle of a month charges the right amount on every day of the month, so the bug cannot come back.",
		doneWhen: [
			"An upgrade on any day charges only the days left in the month.",
			"Cases cover the first day, the last day and February in a leap year.",
		],
		notes: {
			by: "Builder", when: "written 03:40",
			lines: [
				"Done. An upgrade now charges only the days left in the month.",
				"Nine cases cover it, including the first day, the last day and February in a leap year.",
				"Nothing else changed. Invoices already sent are untouched.",
			],
		},
		runs: [{ n: 1, when: "today 02:30", said: "1h 10m · finished" }],
		thread: {
			title: "Proration math covered end to end", earlier: 0,
			lines: [
				{ id: "a", av: "BU", name: "Builder", at: "03:40", body: "Done. Nine cases cover the maths. I did not ask for a review because nothing a customer sees changed." },
			],
		},
		owner: { name: "Builder", av: "BU" },
		review: false,
		facts: [
			{ k: "Made from", v: link("Task · Explain what happens when a trial ends") },
			{ k: "Finished", v: "Today 03:40" },
			{ k: "Worked", v: "1h 10m in 1 session" },
		],
	},
};

const STEERED: Line[] = [
	{ id: "s1", av: "FO", human: true, name: "You", at: "16:17", body: <><strong>@Builder</strong> leave the annual plan out of this for now.</> },
	{ id: "s2", av: "BU", name: "Builder", at: "16:17", body: "Noted. I will finish monthly first and leave annual untouched. It is in my notes." },
];

const START: TaskId[] = ["metering", "trials", "checkout", "explainer", "proration", "metering"];

export function Shift({ step }: { step: number }) {
	const [open, setOpen] = useState<TaskId>(START[step] ?? "metering");
	const [peek, setPeek] = useState(false);
	const [menu, setMenu] = useState(step === 5);
	const [held, setHeld] = useState(false);
	const [asked, setAsked] = useState<Partial<Record<TaskId, boolean>>>({});
	const t = TASKS[open];
	const parent = t.parent;
	const review = asked[open] ?? t.review;
	const lines = step === 5 && open === "metering" ? [...t.thread.lines, ...STEERED] : t.thread.lines;
	const done = t.subs?.filter((s) => s.done).length ?? 0;
	const closed = t.state.startsWith("Done");

	return (
		<>
			<Sidebar key={t.row} initialSpine="work" initialPicked={t.row} />
			<section className="detail">
				<header className="detail-head">
					<span className="chip chip--quiet">Task</span>
					<h2>{t.title}</h2>
					<span className="doc-state">{held ? "On hold" : t.state}</span>
					{!closed && (
						<span className="doc-act">
							<button type="button" className="tool" aria-expanded={menu} aria-label="More" onClick={() => setMenu(!menu)}>⋯</button>
							{menu && (
								<div className="menu" role="menu">
									<button type="button" role="menuitem" onClick={() => { setHeld(!held); setMenu(false); }}>
										<b>{held ? "Take off hold" : "Put on hold"}</b>
										<span>{held ? `${t.owner.name} picks it up again.` : `${t.owner.name} finishes what it is doing, then waits for you.`}</span>
									</button>
									<button type="button" role="menuitem" onClick={() => setMenu(false)}>
										<b>Stop this task</b>
										<span>
											Ends it{t.subs ? ` and its ${t.subs.length - done} open parts` : ""}, and stops the running session. What was done so far stays.
										</span>
									</button>
								</div>
							)}
						</span>
					)}
				</header>

				<div className="detail-scroll">
					<article className="task">
						<div className="task-main">
							{parent && (
								<button type="button" className="task-up" onClick={() => setOpen(parent)}>‹ Part of {TASKS[parent].title}</button>
							)}
							<h1 className="page-title">{t.title}</h1>
							<p className="stand">
								{t.owed && !held && <span className="chip chip--flag">{t.owed}</span>}
								<span>{held ? `On hold. ${t.owner.name} waits until you take it off hold.` : t.stand}</span>
								{t.action && <button type="button" className="btn btn--accent">{t.action}</button>}
							</p>

							<p>{t.brief}</p>
							<h3>Done when</h3>
							<ul className="task-list">{t.doneWhen.map((l) => <li key={l}>{l}</li>)}</ul>

							{t.subs && (
								<>
									<h3>Subtasks <span>{done} of {t.subs.length} done</span></h3>
									<div>
										{t.subs.map((s) => {
											const row = (
												<>
													<span className="trow-t">{s.title}</span>
													<span className="trow-s">{s.state} · {s.who}{s.opens ? " ›" : ""}</span>
												</>
											);
											const opens = s.opens;
											return opens ? (
												<button key={s.title} type="button" className="trow" onClick={() => setOpen(opens)}>{row}</button>
											) : (
												<div key={s.title} className={s.done ? "trow trow--done" : "trow"}>{row}</div>
											);
										})}
									</div>
								</>
							)}

							<h3>Notes <span>kept by {t.notes.by} · {t.notes.when}</span></h3>
							<ul className="task-list">{t.notes.lines.map((l) => <li key={l}>{l}</li>)}</ul>

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
								{peek && open === "metering" && <ul className="session">{SESSION_STEPS.map((l) => <li key={l}>· {l}</li>)}</ul>}
								{t.earlierRuns && <button type="button" className="task-more">{t.earlierRuns} earlier sessions</button>}
							</div>

							{t.reviews && (
								<>
									<h3>Reviews</h3>
									<div>
										{t.reviews.map((r) => (
											<div key={r.what} className="trow">
												<span className="trow-t">{r.what}</span>
												<span className="trow-s">
													{r.whose} · {r.state}
													{r.yours && <button type="button" className="peek">Look at it</button>}
												</span>
											</div>
										))}
									</div>
								</>
							)}

							<h3>Thread <span>{t.thread.title} · also in Conversations</span></h3>
							{t.thread.earlier > 0 && <button type="button" className="task-more">{t.thread.earlier} earlier messages</button>}
							{lines.map((l) => <Msg key={l.id} who={l.av} human={l.human} name={l.name} at={l.at}>{l.body}</Msg>)}
							<div className="composer-box task-reply">
								<input placeholder={`Say something to ${t.owner.name}, or @someone…`} aria-label="Reply" />
								<div className="composer-row">
									<FormatBar kinds={CHAT_FORMATS} />
									<button type="button" className="btn btn--accent">Send</button>
								</div>
							</div>
						</div>

						<dl className="facts">
							<div>
								<dt>Owner</dt>
								<dd><Avatar who={t.owner.av} />{t.owner.name}</dd>
							</div>
							{parent && (
								<div>
									<dt>Part of</dt>
									<dd><button type="button" className="fact-link" onClick={() => setOpen(parent)}>{TASKS[parent].title}</button></dd>
								</div>
							)}
							<div>
								<dt>Review before it is done</dt>
								<dd>
									{closed && (review ? "Yes" : "Not asked")}
									{!closed && (
										<button type="button" className="fact-switch" role="switch" aria-checked={review} onClick={() => setAsked((a) => ({ ...a, [open]: !review }))}>
											<span className="fact-knob" />
											{review ? "Yes — yours" : "No, it closes by itself"}
										</button>
									)}
								</dd>
							</div>
							{t.facts.map((f) => (
								<div key={f.k}>
									<dt>{f.k}</dt>
									<dd>{f.v}</dd>
								</div>
							))}
						</dl>
					</article>
				</div>
			</section>
		</>
	);
}
