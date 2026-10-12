import { useState } from "react";
import { drafts, mentionables, sessionSteps, STEPS, tickets } from "./handoff";
import { Arrive, ARRIVE_STEPS } from "./Arrive";
import { CHAT_FORMATS, FormatBar } from "./FormatBar";
import { Avatar, Event, Msg } from "./Msg";
import { Judge, JUDGE_STEPS } from "./Judge";
import { People, PEOPLE_STEPS, PLUGIN_STEPS } from "./People";
import { Shift, SHIFT_STEPS } from "./Shift";
import { Think, THINK_STEPS } from "./Think";
import { conversations, type Item, Sidebar } from "./Sidebar";

const SKINS = [
	{ id: "paper", name: "Paper" },
	{ id: "precision", name: "Precision" },
	{ id: "workshop", name: "Workshop" },
];

/** The work item mints itself and then carries state, so the thread never fills with status. */
function WorkItem({ step }: { step: number }) {
	const state =
		step <= 2 ? { dot: "", txt: "Queued" }
		: step === 3 ? { dot: " dot--live", txt: "Running" }
		: step === 4 ? { dot: " dot--wait", txt: "Needs you" }
		: step === 5 ? { dot: " dot--wait", txt: "2 reviews · 1 yours" }
		: { dot: " dot--done", txt: "Done" };
	return (
		<button type="button" className="workitem">
			<div>
				<div className="workitem-title">Explain what happens when a trial ends</div>
				<div className="workitem-sub">Builder owns this · minted from this thread · 3 references</div>
			</div>
			<span className="workitem-state">
				<span className={`dot${state.dot}`} />
				{state.txt}
				<span className="workitem-go">Open ›</span>
			</span>
		</button>
	);
}


export function App() {
	const [skin, setSkin] = useState("paper");
	const [mode, setMode] = useState("light");
	const [journey, setJourney] = useState("handoff");
	const [step, setStep] = useState(0);
	const [peek, setPeek] = useState(false);
	const steps = journey === "handoff" ? STEPS : journey === "judge" ? JUDGE_STEPS : journey === "think" ? THINK_STEPS : journey === "shift" ? SHIFT_STEPS : journey === "people" ? PEOPLE_STEPS : journey === "plugins" ? PLUGIN_STEPS : ARRIVE_STEPS;
	const arrive = journey === "arrive";

	document.documentElement.dataset.skin = skin;
	document.documentElement.dataset.mode = mode;

	// The interruption's own thread moves through the list as the loop turns.
	const live: Item =
		step === 0 ? { id: "x", title: "Trial-end confusion, three tickets", state: "Your answer", who: "Maya asks", age: "now", yours: true }
		: step <= 2 ? { id: "x", title: "Trial-end confusion, three tickets", state: "Handed to Builder", who: "you", age: "now" }
		: step === 3 ? { id: "x", title: "Trial-end confusion, three tickets", state: "Builder working · 12m", who: "5 steps", age: "12m" }
		: step === 4 ? { id: "x", title: "Trial-end confusion, three tickets", state: "Your answer", who: "Builder asks", age: "4h", yours: true }
		: step === 5 ? { id: "x", title: "Trial-end confusion, three tickets", state: "Your review", who: "Builder · 1 of 2 reviews", age: "4h", yours: true }
		: { id: "x", title: "Trial-end confusion, three tickets", state: "Maya:", who: "Sent all three, closed the tickets.", age: "13:02", fresh: true };
	const others = conversations(false).filter((i) => i.id !== "c-trial" && i.id !== "c-r1" && i.id !== "c-q");
	const handoffList = [live, ...others].sort((a, b) => Number(Boolean(b.yours)) - Number(Boolean(a.yours)) || Number(Boolean(b.fresh)) - Number(Boolean(a.fresh)));

	return (
		<div className={arrive && step === 0 ? "frame frame--first" : "frame"}>
			<nav className="rail rail--studio">
				<span className="studio-h">Studio controls</span>

				<div className="switcher">
					{[
						{ id: "handoff", name: "Hand off" },
						{ id: "judge", name: "Judge" },
						{ id: "arrive", name: "Arrive" },
						{ id: "think", name: "Think" },
						{ id: "shift", name: "Run the shift" },
						{ id: "people", name: "People" },
						{ id: "plugins", name: "Plugins" },
					].map((j) => (
						<button key={j.id} type="button" aria-pressed={journey === j.id}
							onClick={() => { setJourney(j.id); setStep(0); setPeek(false); }}>
							{j.name}
						</button>
					))}
				</div>

				<div className="steps">
					<span className="steps-head">Walkthrough</span>
					{steps.map((s) => (
						<button key={s.id} type="button" className="step" aria-current={step === s.id}
							onClick={() => { setStep(s.id); setPeek(false); }}>
							<span className="step-n">{s.id + 1}</span>
							<span>{s.name}</span>
						</button>
					))}
				</div>

				<div className="rail-foot">
					<div className="switcher">
						{SKINS.map((s) => (
							<button key={s.id} type="button" aria-pressed={skin === s.id} onClick={() => setSkin(s.id)}>
								{s.name}
							</button>
						))}
					</div>
					<div className="switcher">
						{["light", "dark"].map((m) => (
							<button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
								{m === "light" ? "Light" : "Dark"}
							</button>
						))}
					</div>
				</div>
			</nav>

			{journey === "judge" ? <><Sidebar key={`j${step}`} initialPicked="c-r1" /><Judge key={step} step={step} /></> : arrive ? <Arrive key={step} step={step} /> : journey === "think" ? <Think key={step} step={step} /> : journey === "shift" ? <Shift key={step} step={step} /> : journey === "people" ? <People key={step} view={PEOPLE_STEPS[step].view} /> : journey === "plugins" ? <People key={`p${step}`} view={PLUGIN_STEPS[step].view} /> : <>
			<Sidebar key={`h${step}`} initialPicked="x" lists={{ conversations: handoffList }} />

			<section className="thread">
				<header className="thread-head">
					<span className="chip chip--quiet">Thread</span>
					<h2>Trial-end confusion, three tickets</h2>
				</header>

				<div className="thread-scroll">
					<Msg who="MC" human name="Maya Chen" at="08:12">
						Three support tickets this week asking the same thing — people finish the trial and
						cannot tell what they will actually pay.
						<div className="refs">
							{tickets.map((t) => (
								<a key={t.id} className="ref" href="#ref">
									<span className="ref-src">{t.src}</span>
									<span className="ref-id">{t.id}</span>
									<span className="ref-title">{t.title}</span>
									<span className="ref-out">↗</span>
								</a>
							))}
						</div>
					</Msg>

					{step >= 2 && (
						<>
							<Msg who="FO" human name="You" at="08:13">
								<strong>@Builder</strong> can you take a look at this and propose a fix
							</Msg>
							<Event>Builder joined</Event>
							<Msg who="BU" name="Builder" at="08:13">
								Yes — taking it. I will come back here when I have something to look at.
							</Msg>
							<WorkItem step={step} />
						</>
					)}

					{step === 3 && (
						<div className="running">
							<span className="dot dot--live" />
							<span className="running-txt">Builder is working · 12m · 5 steps</span>
							<button type="button" className="peek" onClick={() => setPeek(!peek)}>
								{peek ? "Hide session" : "Peek at session"}
							</button>
						</div>
					)}
					{step === 3 && peek && (
						<ul className="session">
							{sessionSteps.map((l) => <li key={l}>· {l}</li>)}
						</ul>
					)}

					{step >= 4 && <Event>Worked 4h 20m · 1 session</Event>}

					{step === 4 && (
						<Msg who="BU" name="Builder" at="12:31">
							Fix is written and the maths is covered. One thing I will not name on my own,
							because it goes in front of every trial user.
							<div className="card">
								<div className="card-head">
									<span className="chip chip--flag">Needs you</span>
									<span className="meta">Seen by every trial user</span>
								</div>
								<p className="card-q">What do we call the charge after a trial ends?</p>
								<p className="card-why">
									Internally it is <code>trial_conversion</code>. That name is mine to pick.
									This one is on the pricing page and in the receipt, so it is yours.
								</p>
								<div className="card-opts">
									<button type="button" className="opt">
										<b>Your first bill</b><span>Plainest. Says exactly when money moves.</span>
									</button>
									<button type="button" className="opt">
										<b>Plan starts</b><span>Frames it as beginning, not charging.</span>
									</button>
									<button type="button" className="opt">
										<b>Trial ends</b><span>Matches the email we already send.</span>
									</button>
								</div>
							</div>
						</Msg>
					)}

					{step >= 5 && (
						<Msg who="BU" name="Builder" at="12:48">
							Went with <strong>Your first bill</strong>. Fix is in and the page says it in three
							places. I raised two reviews — the change is yours, the replies are Maya's.
							<div className="reviews">
								<div className="review">
									<div className="review-head">
										<span className="chip chip--quiet">Review</span>
										<span className="review-what">Trial-end explainer</span>
										<span className="review-owner">
											<span className="chip chip--flag">Needs you</span>
										</span>
									</div>
									<div className="review-body">
										<ul className="result-list">
											<li>Proration bug on mid-cycle upgrade — fixed, 3 cases cover it</li>
											<li>Pricing page and receipt now name the first bill and its date</li>
											<li>Support macro updated to match</li>
										</ul>
										<div className="result-preview">
											<b>Your first bill: 2 September</b>
											<p>£24/month for the Team plan. We will email you three days before.</p>
										</div>
									</div>
									<div className="review-foot">
										<button type="button" className="btn btn--accent">Look at it</button>
										<span className="review-note">The change that ships</span>
									</div>
								</div>

								<div className="review review--theirs">
									<div className="review-head">
										<span className="chip chip--quiet">Review</span>
										<span className="review-what">Three replies to customers</span>
										<span className="review-owner">
											<Avatar who="MC" human />
											Maya Chen · told 12:48
										</span>
									</div>
									<div className="review-body">
										{drafts.map((d) => (
											<div className="draft" key={d.ref}>
												<span className="ref-id">{d.ref}</span>
												<span>
													<span className="draft-to">to {d.to}</span>
													<span className="draft-body">{d.body}</span>
												</span>
											</div>
										))}
										<div className="handoff-note">
											<span>
												These go to customers, so I am not sending them — and they are not
												yours to approve either.
											</span>
										</div>
									</div>
									<div className="review-foot">
										<span className="chip chip--quiet">Not sent</span>
										<span className="review-note">Waiting on Maya, not on you</span>
									</div>
								</div>
							</div>
						</Msg>
					)}

					{step === 6 && (
						<>
							<Event>You approved the change · Maya sent the replies · work item closed</Event>
							<Msg who="MC" human name="Maya Chen" at="13:02">
								Sent all three, barely touched them. Closed the tickets. Thanks.
								<div className="refs">
									{tickets.map((t) => (
										<a key={t.id} className="ref" href="#ref">
											<span className="ref-src">{t.src}</span>
											<span className="ref-id">{t.id}</span>
											<span className="ref-title">closed</span>
											<span className="ref-out">↗</span>
										</a>
									))}
								</div>
							</Msg>
						</>
					)}
				</div>

				<div className="composer">
					{step === 1 ? (
						<div style={{ flex: 1 }}>
							<div className="picker">
								<div className="picker-head">
									<span>Hand to</span>
									<span>agents and people, same list</span>
								</div>
								{mentionables.map((m, i) => (
									<button key={m.id} type="button" className="picker-row" aria-selected={i === 0}>
										<Avatar who={m.initials} human={m.id === "maya"} />
										<span>
											<span className="picker-name">{m.name}</span>
											<span className="picker-what">{m.what}</span>
										</span>
										<span className="picker-load">{m.load}</span>
									</button>
								))}
								<div className="picker-foot">
									<span><kbd>↑↓</kbd> choose</span>
									<span><kbd>↵</kbd> hand off</span>
									<span><kbd>esc</kbd> keep it</span>
								</div>
							</div>
							<div style={{ display: "flex", gap: "var(--sp-3)" }}>
								<input className="composer-input" defaultValue="@bu" aria-label="Reply"
									style={{ flex: 1, minHeight: 36, padding: "0 var(--sp-4)", border: "var(--line-w) solid var(--accent)", borderRadius: "var(--r-sm)", background: "var(--surface)" }} />
								<button type="button" className="btn btn--accent">Send</button>
							</div>
						</div>
					) : (
						<div className="composer-box">
							<input placeholder="Reply, or @someone…" aria-label="Reply" />
							<div className="composer-row">
								<FormatBar kinds={CHAT_FORMATS} />
								<button type="button" className="btn btn--accent">Send</button>
							</div>
						</div>
					)}
				</div>
			</section>
			</>}
		</div>
	);
}
