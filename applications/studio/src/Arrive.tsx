import { useState } from "react";

/**
 * ARRIVE — first start, and every morning after.
 * One navigation column, not two: find-or-ask on top, the spines as tabs, the chosen
 * spine's list below. Home is "while you were away". The detail takes the rest.
 */
export const ARRIVE_STEPS = [
	{ id: 0, name: "First start" },
	{ id: 1, name: "First conversation" },
	{ id: 2, name: "Morning: while you were away" },
	{ id: 3, name: "Open one" },
	{ id: 4, name: "Find or ask" },
	{ id: 5, name: "Something new while you focus" },
];

type Tab = "home" | "conversations" | "work" | "knowledge";

interface Item {
	id: string;
	kind: string;
	title: string;
	sub: string;
	age: string;
	needsYou?: boolean;
	unread?: boolean;
}

const needsYou: Item[] = [
	{ id: "r1", kind: "Review", title: "Trial-end explainer", sub: "Builder · final · 2 flags", age: "8h", needsYou: true },
	{ id: "r2", kind: "Review", title: "Comparison table, stacked layout", sub: "Designer · design · 1 flag", age: "5h", needsYou: true },
	{ id: "q1", kind: "Question", title: "What do we call the charge after a trial?", sub: "Builder asks · seen by every trial user", age: "6h", needsYou: true },
];
const inFlight: Item[] = [
	{ id: "f1", kind: "Work", title: "Usage-based tier, metering", sub: "Builder · running 2h", age: "2h" },
	{ id: "f2", kind: "Work", title: "July support themes", sub: "Ops · running 40m", age: "40m" },
];
const finished: Item[] = [
	{ id: "d1", kind: "Work", title: "Proration math covered end to end", sub: "Builder · done 03:40", age: "5h" },
	{ id: "d2", kind: "Doc", title: "Deploy rule, redrafted from Tuesday's retro", sub: "Facilitation · draft", age: "4h" },
	{ id: "d3", kind: "Work", title: "Trial dates normalised to UTC", sub: "Builder · done 05:55", age: "3h" },
	{ id: "d4", kind: "Bet", title: "Trial extension flow — hypothesis held", sub: "Growth · verdict ready", age: "5h" },
];

const lists: Record<Exclude<Tab, "home">, Item[]> = {
	conversations: [
		{ id: "c1", kind: "Thread", title: "Trial-end confusion, three tickets", sub: "Maya: Sent all three, closed the tickets.", age: "13:02", unread: true },
		{ id: "c2", kind: "Thread", title: "Pricing page, Q4 pass", sub: "Growth: two options drafted", age: "yesterday" },
		{ id: "c3", kind: "Thread", title: "Infra wants the rollout rule written down", sub: "Maya: can you own this?", age: "yesterday", unread: true },
		{ id: "c4", kind: "Thread", title: "Onboarding emails", sub: "You: park until October", age: "Mon" },
	],
	work: [
		{ id: "w1", kind: "Bet", title: "Trials that convert without a call", sub: "3 of 7 done · Growth owns", age: "week 2 of 4" },
		{ id: "w2", kind: "Work", title: "Usage-based tier, metering", sub: "Builder · running", age: "2h" },
		{ id: "w3", kind: "Work", title: "Comparison table, stacked layout", sub: "Designer · in review", age: "5h" },
		{ id: "w4", kind: "Work", title: "Explain what happens when a trial ends", sub: "Builder · closed", age: "13:02" },
	],
	knowledge: [
		{ id: "k1", kind: "Doc", title: "How we price", sub: "Published · edited by Growth 2d ago", age: "2d" },
		{ id: "k2", kind: "Doc", title: "Deploy rule", sub: "Draft · Facilitation", age: "4h" },
		{ id: "k3", kind: "Doc", title: "What a clean feature looks like", sub: "Published · you", age: "1w" },
	],
};

const results = [
	{ group: "Conversations", items: ["Trial-end confusion, three tickets", "Pricing page, Q4 pass"] },
	{ group: "Work", items: ["Trials that convert without a call", "Explain what happens when a trial ends"] },
	{ group: "Knowledge", items: ["How we price"] },
];

function Row({ item, current, onPick }: { item: Item; current?: boolean; onPick: () => void }) {
	return (
		<button type="button" className="nrow" aria-current={current} onClick={onPick}>
			<span className="nrow-top">
				<span className="nrow-kind">{item.kind}</span>
				{item.needsYou && <span className="chip chip--flag">Needs you</span>}
				{item.unread && <span className="nrow-dot" aria-label="unread" />}
				<span className="nrow-age">{item.age}</span>
			</span>
			<span className="nrow-title">{item.title}</span>
			<span className="nrow-sub">{item.sub}</span>
		</button>
	);
}

function FirstStart() {
	return (
		<div className="first">
			<div className="first-card">
				<h1>HyperIdle</h1>
				<p className="first-lead">Agents already on this computer can start right away.</p>
				<div className="found">
					<span className="found-h">Found on this computer</span>
					<div className="found-row"><span className="found-ok">✓</span><b>Claude Code</b><span>signed in · 6 connectors</span></div>
					<div className="found-row"><span className="found-ok">✓</span><b>Codex</b><span>signed in</span></div>
					<div className="found-row found-row--off"><span>–</span><b>Cursor</b><span>not installed</span></div>
				</div>
				<p className="first-note">
					We made a team for you. Folders, GitHub and teammates can come later, when you need them.
				</p>
				<button type="button" className="btn btn--accent first-go">Start talking</button>
			</div>
		</div>
	);
}

function FirstConversation() {
	return (
		<section className="detail">
			<header className="detail-head">
				<span className="chip chip--quiet">Thread</span>
				<h2>Getting started</h2>
			</header>
			<div className="detail-scroll">
				<article className="msg">
					<span className="avatar">BU</span>
					<div>
						<div className="msg-who"><span className="msg-name">Builder</span><span className="meta">now</span></div>
						<div className="msg-body">
							Hi. I run on your Claude Code, so I can already read and change files on this computer.
							What are you working on?
						</div>
					</div>
				</article>
				<div className="hint">
					<span>Point me at your code and I can do more</span>
					<span className="hint-acts">
						<button type="button" className="btn">Connect a folder</button>
						<button type="button" className="btn">Connect GitHub</button>
						<button type="button" className="hint-skip">Not now</button>
					</span>
				</div>
			</div>
			<div className="composer">
				<input placeholder="Say what you are working on, or @someone…" aria-label="Message" />
				<button type="button" className="btn btn--accent">Send</button>
			</div>
		</section>
	);
}

function Morning() {
	return (
		<section className="detail">
			<div className="detail-scroll detail-scroll--brief">
				<div className="brief">
					<span className="brief-when">Tuesday · 08:02</span>
					<h1>While you were away</h1>
					<div className="brief-nums">
						<span><b>7</b>finished</span>
						<span className="brief-nums-flag"><b>3</b>need you</span>
						<span><b>2</b>still running</span>
					</div>
					<p className="brief-lead">
						The night went well. The trial-end fix is ready for your review, and Growth's trial
						extension bet held — 27% more trials converted. One question is waiting on a name only
						you can pick.
					</p>
					<div className="brief-by">
						<span className="brief-by-h">By agent</span>
						<div className="brief-agent"><span className="avatar">BU</span><b>Builder</b><span>3 done · 1 review · 1 question</span></div>
						<div className="brief-agent"><span className="avatar">DS</span><b>Designer</b><span>1 done · 1 review</span></div>
						<div className="brief-agent"><span className="avatar">GR</span><b>Growth</b><span>1 bet verdict · 1 running</span></div>
						<div className="brief-agent"><span className="avatar">OP</span><b>Ops</b><span>1 running</span></div>
					</div>
					<p className="brief-foot">Start with what needs you on the left. Everything else can wait.</p>
				</div>
			</div>
		</section>
	);
}

function Opened() {
	return (
		<section className="detail">
			<header className="detail-head">
				<span className="chip chip--quiet">Review</span>
				<h2>Trial-end explainer</h2>
				<span className="meta">Builder · final · raised 8h ago in "Trial-end confusion, three tickets"</span>
			</header>
			<div className="detail-scroll">
				<p className="opened-note">The review opens here, as designed in Judge. The list on the left stays put, so the next one is one click away.</p>
			</div>
		</section>
	);
}

function Focused() {
	return (
		<section className="detail">
			<header className="detail-head">
				<span className="chip chip--quiet">Doc</span>
				<h2>How we price</h2>
				<span className="meta">You are editing</span>
			</header>
			<div className="detail-scroll">
				<div className="doc">
					<h3>Trials</h3>
					<p>Every plan starts with a 14-day trial. We ask for a card up front and say, before the trial ends, exactly when the first bill comes and how much it is.</p>
					<p>We do not extend trials by hand. If someone needs more time, …<span className="caret" /></p>
				</div>
			</div>
		</section>
	);
}

export function Arrive({ step }: { step: number }) {
	const [tab, setTab] = useState<Tab>(step === 1 ? "conversations" : "home");
	const [picked, setPicked] = useState<string | null>(step === 3 ? "r1" : step === 5 ? "k1" : null);

	if (step === 0) return <FirstStart />;

	const isNew = step === 5;
	const homeNeeds = isNew
		? [{ id: "m1", kind: "Mention", title: "Maya: can you look at the refund wording?", sub: "in Trial-end confusion · just now", age: "now", needsYou: true }, ...needsYou]
		: needsYou;
	const counts = { home: homeNeeds.length, conversations: 2, work: 2, knowledge: 1 };

	const list = (items: Item[]) => items.map((i) => (
		<Row key={i.id} item={i} current={picked === i.id} onPick={() => setPicked(i.id)} />
	));

	return (
		<>
			<nav className="nav">
				<div className="nav-top">
					<span className="wordmark">HyperIdle</span>
					<div className="rail-search">
						<input placeholder="Find or ask…" aria-label="Find or ask" defaultValue={step === 4 ? "trial" : ""} />
					</div>
				</div>

				{step === 4 ? (
					<div className="nav-list">
						{results.map((g) => (
							<div key={g.group}>
								<p className="nav-group">{g.group}</p>
								{g.items.map((t) => (
									<button key={t} type="button" className="nrow"><span className="nrow-title">{t}</span></button>
								))}
							</div>
						))}
						<button type="button" className="ask">
							<span className="ask-h">Ask Builder</span>
							<span>"trial" — what do we know about trials?</span>
						</button>
					</div>
				) : (
					<>
						<div className="tabs" role="tablist">
							{(step === 1 ? (["conversations", "work", "knowledge"] as Tab[]) : (["home", "conversations", "work", "knowledge"] as Tab[])).map((t) => (
								<button key={t} type="button" role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
									{t === "home" ? "Home" : t[0].toUpperCase() + t.slice(1)}
									{step > 1 && counts[t] > 0 && (
										<span className={t === "home" ? "tab-n tab-n--flag" : "tab-n"}>{counts[t]}</span>
									)}
								</button>
							))}
						</div>

						<div className="nav-list">
							{step === 1 ? (
								<Row item={{ id: "g", kind: "Thread", title: "Getting started", sub: "Builder: What are you working on?", age: "now" }} current onPick={() => undefined} />
							) : tab === "home" ? (
								<>
									{isNew && <p className="nav-new">1 new since you started · it waits here</p>}
									<p className="nav-group">Needs you</p>
									{list(homeNeeds)}
									<p className="nav-group">Still running</p>
									{list(inFlight)}
									<p className="nav-group">Finished overnight</p>
									{list(finished)}
								</>
							) : (
								list(lists[tab])
							)}
						</div>
					</>
				)}
			</nav>

			{step === 1 ? <FirstConversation />
				: step === 3 ? <Opened />
				: step === 5 ? <Focused />
				: <Morning />}
		</>
	);
}
