import { useState } from "react";

/**
 * ARRIVE — first start, and every morning after.
 * One sidebar: find-or-ask, the three spines stacked, a separator, then the chosen spine's list
 * in priority order — what needs you, what is moving, the rest. No Home: the morning overview is
 * a routine that posts a thread, so it arrives like everything else.
 */
export const ARRIVE_STEPS = [
	{ id: 0, name: "First start" },
	{ id: 1, name: "First conversation" },
	{ id: 2, name: "Morning handover thread" },
	{ id: 3, name: "Work, in priority order" },
	{ id: 4, name: "Knowledge, a tree" },
	{ id: 5, name: "Find or ask" },
	{ id: 6, name: "Something new while you focus" },
];

type Spine = "conversations" | "work" | "knowledge";

interface Item {
	id: string;
	kind: string;
	title: string;
	sub: string;
	age: string;
	needsYou?: boolean;
	unread?: boolean;
}

interface Group {
	label: string;
	items: Item[];
}

const MENTION: Item = { id: "m1", kind: "Mention", title: "Maya: can you look at the refund wording?", sub: "Trial-end confusion · just now", age: "now", needsYou: true };

function conversations(withMention: boolean): Group[] {
	return [
		{ label: "Needs you", items: [
			...(withMention ? [MENTION] : []),
			{ id: "c-q", kind: "Question", title: "What do we call the charge after a trial?", sub: "Builder asks · seen by every trial user", age: "6h", needsYou: true },
			{ id: "c-infra", kind: "Thread", title: "Infra wants the rollout rule written down", sub: "Maya: can you own this?", age: "11h", needsYou: true },
		] },
		{ label: "Unread", items: [
			{ id: "c-morning", kind: "Routine", title: "Morning handover", sub: "7 finished · 3 need you · 2 running", age: "08:00", unread: true },
			{ id: "c-trial", kind: "Thread", title: "Trial-end confusion, three tickets", sub: "Maya: Sent all three, closed the tickets.", age: "13:02", unread: true },
		] },
		{ label: "Recent", items: [
			{ id: "c-pricing", kind: "Thread", title: "Pricing page, Q4 pass", sub: "Growth: two options drafted", age: "yesterday" },
			{ id: "c-onb", kind: "Thread", title: "Onboarding emails", sub: "You: park until October", age: "Mon" },
		] },
	];
}

const WORK: Group[] = [
	{ label: "Needs your review", items: [
		{ id: "w-r1", kind: "Review", title: "Trial-end explainer", sub: "Builder · final · 2 flags", age: "8h", needsYou: true },
		{ id: "w-r2", kind: "Review", title: "Comparison table, stacked layout", sub: "Designer · design · 1 flag", age: "5h", needsYou: true },
	] },
	{ label: "Running", items: [
		{ id: "w-f1", kind: "Task", title: "Trials that convert without a call", sub: "Growth · 3 of 7 subtasks done", age: "week 2" },
		{ id: "w-f2", kind: "Task", title: "Usage-based tier, metering", sub: "Builder · running 2h", age: "2h" },
	] },
	{ label: "Done since you looked", items: [
		{ id: "w-d1", kind: "Task", title: "Proration math covered end to end", sub: "Builder · 03:40", age: "5h" },
		{ id: "w-d2", kind: "Task", title: "Trial dates normalised to UTC", sub: "Builder · 05:55", age: "3h" },
	] },
];

interface Doc {
	id: string;
	title: string;
	note?: string;
	children?: Doc[];
}

const KNOWLEDGE_PRIORITY: Group[] = [
	{ label: "Needs you", items: [
		{ id: "k-deploy", kind: "Draft", title: "Deploy rule", sub: "Facilitation · redrafted from Tuesday's retro · ready to publish", age: "4h", needsYou: true },
	] },
	{ label: "Changed since you looked", items: [
		{ id: "k-price", kind: "Doc", title: "How we price", sub: "Growth edited · Trials section", age: "2d", unread: true },
	] },
];

const TREE: Doc[] = [
	{ id: "t-product", title: "Product", children: [
		{ id: "k-price", title: "How we price", children: [
			{ id: "t-trials", title: "Trials" },
			{ id: "t-tiers", title: "Tiers and metering" },
		] },
		{ id: "t-clean", title: "What a clean feature looks like" },
	] },
	{ id: "t-eng", title: "Engineering", children: [
		{ id: "k-deploy", title: "Deploy rule", note: "draft" },
		{ id: "t-trace", title: "Tracing the codebase" },
	] },
	{ id: "t-support", title: "Support", children: [
		{ id: "t-themes", title: "July support themes" },
	] },
];

const RESULTS = [
	{ group: "Conversations", items: ["Trial-end confusion, three tickets", "Pricing page, Q4 pass"] },
	{ group: "Work", items: ["Trials that convert without a call", "Explain what happens when a trial ends"] },
	{ group: "Knowledge", items: ["How we price › Trials"] },
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

function Tree({ docs, depth, open, toggle, picked, onPick }: {
	docs: Doc[]; depth: number; open: Set<string>; toggle: (id: string) => void; picked: string | null; onPick: (id: string) => void;
}) {
	return (
		<>
			{docs.map((d) => (
				<div key={d.id}>
					<div className="tree-row" style={{ paddingLeft: `calc(var(--sp-4) + ${depth} * var(--sp-4))` }} aria-current={picked === d.id}>
						{d.children ? (
							<button type="button" className="tree-fold" aria-expanded={open.has(d.id)} onClick={() => toggle(d.id)}>
								<span className="chev">›</span>
							</button>
						) : <span className="tree-fold" />}
						<button type="button" className="tree-title" onClick={() => onPick(d.id)}>{d.title}</button>
						{d.note && <span className="tree-note">{d.note}</span>}
					</div>
					{d.children && open.has(d.id) && (
						<Tree docs={d.children} depth={depth + 1} open={open} toggle={toggle} picked={picked} onPick={onPick} />
					)}
				</div>
			))}
		</>
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


function MorningThread() {
	return (
		<section className="detail">
			<header className="detail-head">
				<span className="chip chip--quiet">Routine</span>
				<h2>Morning handover</h2>
				<span className="meta">posts every weekday at 08:00 · you can change it</span>
			</header>
			<div className="detail-scroll">
				<article className="msg">
					<span className="avatar">MH</span>
					<div>
						<div className="msg-who"><span className="msg-name">Morning handover</span><span className="meta">08:00</span></div>
						<div className="msg-body">
							Good morning. Overnight: <b>7 finished</b>, <b>3 need you</b>, <b>2 still running</b>.
							<ul className="handover">
								<li>Builder finished the trial-end fix. <a href="#w-r1">Review waiting</a></li>
								<li>Designer stacked the comparison table. <a href="#w-r2">Review waiting</a></li>
								<li>Builder needs a name only you can pick. <a href="#c-q">Question</a></li>
								<li>Growth's trial task is 3 of 7 done and still running.</li>
								<li>Facilitation redrafted the deploy rule from Tuesday's retro. <a href="#k-deploy">Draft to publish</a></li>
							</ul>
						</div>
					</div>
				</article>
			</div>
			<div className="composer">
				<input placeholder="Reply, or @someone…" aria-label="Reply" />
				<button type="button" className="btn btn--accent">Send</button>
			</div>
		</section>
	);
}

function Placeholder({ kind, title, meta, note }: { kind: string; title: string; meta: string; note: string }) {
	return (
		<section className="detail">
			<header className="detail-head">
				<span className="chip chip--quiet">{kind}</span>
				<h2>{title}</h2>
				<span className="meta">{meta}</span>
			</header>
			<div className="detail-scroll">
				<p className="opened-note">{note}</p>
			</div>
		</section>
	);
}

export function Arrive({ step }: { step: number }) {
	const initial: Spine = step === 3 ? "work" : step === 4 || step === 6 ? "knowledge" : "conversations";
	const [spine, setSpine] = useState<Spine>(initial);
	const [picked, setPicked] = useState<string | null>(
		step === 1 ? "g" : step === 2 ? "c-morning" : step === 3 ? "w-r1" : step === 4 || step === 6 ? "k-price" : null,
	);
	const [open, setOpen] = useState<Set<string>>(new Set(["t-product", "k-price", "t-eng"]));

	if (step === 0) return <FirstStart />;

	const focused = step === 6;
	const conv = conversations(focused);
	const counts: Record<Spine, number> = {
		conversations: conv[0].items.length,
		work: WORK[0].items.length,
		knowledge: KNOWLEDGE_PRIORITY[0].items.length,
	};

	const groups = (gs: Group[]) => gs.map((g) => (
		<div key={g.label}>
			<p className="nav-group">{g.label}</p>
			{g.items.map((i) => <Row key={i.id} item={i} current={picked === i.id} onPick={() => setPicked(i.id)} />)}
		</div>
	));

	const toggle = (id: string) => setOpen((prev) => {
		const next = new Set(prev);
		if (next.has(id)) next.delete(id); else next.add(id);
		return next;
	});

	let detail = <MorningThread />;
	if (step === 1) detail = <FirstConversation />;
	else if (step === 6) detail = <Focused />;
	else if (spine === "work" && picked === "w-r1") {
		detail = <Placeholder kind="Review" title="Trial-end explainer" meta="Builder · final" note="The review opens here, as designed in Judge. The list stays put, so the next one is one click away." />;
	} else if (spine === "knowledge" && step === 4) {
		detail = <Placeholder kind="Doc" title="How we price" meta="Published · Growth edited the Trials section 2 days ago" note="The document opens here. Its place in the tree stays highlighted on the left." />;
	}

	return (
		<>
			<nav className="nav">
				<div className="nav-top">
					<span className="wordmark">HyperIdle</span>
					<div className="rail-search">
						<input placeholder="Find or ask…" aria-label="Find or ask" defaultValue={step === 5 ? "trial" : ""} />
					</div>
				</div>

				{step === 5 ? (
					<div className="nav-list">
						{RESULTS.map((g) => (
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
						<div className="spines nav-spines">
							{(["conversations", "work", "knowledge"] as Spine[]).map((t) => (
								<button key={t} type="button" className="spine" aria-current={spine === t} onClick={() => setSpine(t)}>
									<span>{t[0].toUpperCase() + t.slice(1)}</span>
									{step > 1 && counts[t] > 0 && <span className="spine-count spine-count--flag">{counts[t]}</span>}
								</button>
							))}
						</div>
						<hr className="nav-sep" />

						<div className="nav-list">
							{step === 1 ? (
								spine === "conversations"
									? <Row item={{ id: "g", kind: "Thread", title: "Getting started", sub: "Builder: What are you working on?", age: "now" }} current onPick={() => undefined} />
									: <p className="nav-empty">Nothing here yet.</p>
							) : spine === "conversations" ? (
								<>
									{focused && <p className="nav-new">1 new since you started · it waits here</p>}
									{groups(conv)}
								</>
							) : spine === "work" ? (
								groups(WORK)
							) : (
								<>
									{groups(KNOWLEDGE_PRIORITY)}
									<p className="nav-group">All documents</p>
									<Tree docs={TREE} depth={0} open={open} toggle={toggle} picked={picked} onPick={setPicked} />
								</>
							)}
						</div>
					</>
				)}
			</nav>

			{detail}
		</>
	);
}
