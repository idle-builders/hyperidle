import { useState } from "react";
import { drafts, mentionables, sessionSteps, STEPS, tickets } from "./handoff";
import { Judge, JUDGE_STEPS } from "./Judge";
import { needsYou, overnight, type QueueItem } from "./mock";

const SKINS = [
	{ id: "paper", name: "Paper" },
	{ id: "precision", name: "Precision" },
	{ id: "workshop", name: "Workshop" },
];

function Avatar({ who, human }: { who: string; human?: boolean }) {
	return <span className={human ? "avatar avatar--human" : "avatar"}>{who}</span>;
}

function Msg({ who, human, name, at, children }: {
	who: string; human?: boolean; name: string; at: string; children: React.ReactNode;
}) {
	return (
		<article className="msg">
			<Avatar who={who} human={human} />
			<div>
				<div className="msg-who">
					<span className="msg-name">{name}</span>
					<span className="meta">{at}</span>
				</div>
				<div className="msg-body">{children}</div>
			</div>
		</article>
	);
}

function Event({ children }: { children: React.ReactNode }) {
	return (
		<div className="event">
			<span>{children}</span>
			<span className="event-line" />
		</div>
	);
}

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

function Row({ item, current, onPick }: { item: QueueItem; current: boolean; onPick: () => void }) {
	return (
		<button type="button" className="row" aria-current={current} onClick={onPick}>
			<span className="row-top">
				<span className="chip chip--quiet">{item.origin}</span>
				{item.waiting ? <span className="chip chip--flag">Needs you</span> : null}
				<span className="row-age">{item.age}</span>
			</span>
			<span className="row-title">{item.title}</span>
			<span className="row-sub">{item.sub}</span>
		</button>
	);
}

export function App() {
	const [skin, setSkin] = useState("paper");
	const [mode, setMode] = useState("light");
	const [journey, setJourney] = useState("handoff");
	const [step, setStep] = useState(0);
	const [peek, setPeek] = useState(false);
	const steps = journey === "handoff" ? STEPS : JUDGE_STEPS;

	document.documentElement.dataset.skin = skin;
	document.documentElement.dataset.mode = mode;

	// The interruption's own row moves through the queue as the loop turns.
	const live: QueueItem =
		step === 0 ? { id: "x", origin: "TASK", title: "Trial-end confusion, three tickets", sub: "Maya · needs a decision", age: "now", waiting: true }
		: step <= 3 ? { id: "x", origin: "TASK", title: "Trial-end confusion, three tickets", sub: "Builder · running", age: "12m" }
		: step <= 5 ? { id: "x", origin: "TASK", title: "Explain what happens when a trial ends", sub: "Builder · needs your eyes", age: "4h", waiting: true }
		: { id: "x", origin: "TASK", title: "Explain what happens when a trial ends", sub: "Builder · closed by your verdict", age: "4h" };

	return (
		<div className={journey === "judge" ? "frame frame--judge" : "frame"}>
			<nav className="rail">
				<span className="wordmark">HyperIdle</span>

				<div className="rail-search">
					<input placeholder="Find or ask…" aria-label="Find or ask" />
					<button type="button" aria-label="Assistant">✦</button>
				</div>

				<div className="spines">
					<button type="button" className="spine" aria-current="true">
						<span>Conversations</span>
						<span className="spine-count">{step === 0 || step === 4 || step === 5 ? 3 : 2}</span>
					</button>
					<button type="button" className="spine">
						<span>Work</span>
						<span className="spine-count">12</span>
					</button>
					<button type="button" className="spine">
						<span>Knowledge</span>
						<span className="spine-count">2</span>
					</button>
				</div>

				<div className="switcher">
					{[
						{ id: "handoff", name: "Hand off" },
						{ id: "judge", name: "Judge" },
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

			{journey === "judge" ? <Judge key={step} step={step} /> : <>
			<section className="queue">
				<header className="overnight">
					<h1>While you were away</h1>
					<p>Last night's shift, handed over</p>
					<div className="overnight-nums">
						<span className="overnight-num"><b>7</b><span>Finished</span></span>
						<span className="overnight-num overnight-num--flag">
							<b>{step === 0 || step >= 4 ? 3 : 2}</b><span>Need you</span>
						</span>
					</div>
				</header>

				<div className="queue-scroll">
					<p className="queue-group">{step >= 1 && step <= 3 ? "In flight" : "Need you"}</p>
					<Row item={live} current onPick={() => undefined} />
					{needsYou.slice(1).map((i) => (
						<Row key={i.id} item={i} current={false} onPick={() => undefined} />
					))}
					<p className="queue-group">Finished overnight</p>
					{overnight.slice(0, 4).map((i) => (
						<Row key={i.id} item={i} current={false} onPick={() => undefined} />
					))}
				</div>
			</section>

			<section className="thread">
				<header className="thread-head">
					<span className="chip chip--quiet">Task</span>
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
						<>
							<input placeholder="Reply, or @someone…" aria-label="Reply" />
							<button type="button" className="btn btn--accent">Send</button>
						</>
					)}
				</div>
			</section>
			</>}
		</div>
	);
}
