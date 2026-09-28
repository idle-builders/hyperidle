import { useState } from "react";

/**
 * ARRIVE — first start, and every morning after.
 * One sidebar: find-or-ask, the three spines stacked, a separator, then the chosen spine's list
 * in priority order — what needs you, what is moving, the rest. Everything is a thread, a task or a
 * document, so the spine says what a row is.
 */
export const ARRIVE_STEPS = [
	{ id: 0, name: "First start" },
	{ id: 1, name: "First conversation" },
	{ id: 2, name: "Conversations, in priority order" },
	{ id: 3, name: "Work, in priority order" },
	{ id: 4, name: "Knowledge, a tree" },
	{ id: 5, name: "Find: results open in place" },
	{ id: 6, name: "Ask: becomes a thread" },
	{ id: 7, name: "Something new while you focus" },
];

type Spine = "conversations" | "work" | "knowledge";

interface Item {
	id: string;
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

const MENTION: Item = { id: "m1", title: "Maya: can you look at the refund wording?", sub: "Mentioned in Trial-end confusion · just now", age: "now", needsYou: true };

function conversations(withMention: boolean): Group[] {
	return [
		{ label: "Needs you", items: [
			...(withMention ? [MENTION] : []),
			{ id: "c-r1", title: "Trial-end explainer", sub: "Review · Builder · final · 2 flags", age: "8h", needsYou: true },
			{ id: "c-r2", title: "Comparison table, stacked layout", sub: "Review · Designer · design · 1 flag", age: "5h", needsYou: true },
			{ id: "c-q", title: "What do we call the charge after a trial?", sub: "Builder asks · seen by every trial user", age: "6h", needsYou: true },
			{ id: "c-infra", title: "Infra wants the rollout rule written down", sub: "Maya: can you own this?", age: "11h", needsYou: true },
		] },
		{ label: "Unread", items: [
			{ id: "c-trial", title: "Trial-end confusion, three tickets", sub: "Maya: Sent all three, closed the tickets.", age: "13:02", unread: true },
		] },
		{ label: "Recent", items: [
			{ id: "c-pricing", title: "Pricing page, Q4 pass", sub: "Growth: two options drafted", age: "yesterday" },
			{ id: "c-onb", title: "Onboarding emails", sub: "You: park until October", age: "Mon" },
		] },
	];
}

/** Work is only tasks. The agent owns them, so nothing here is flagged as yours. */
const WORK: Group[] = [
	{ label: "Running", items: [
		{ id: "w-f1", title: "Trials that convert without a call", sub: "Growth · 3 of 7 subtasks done", age: "week 2" },
		{ id: "w-f2", title: "Usage-based tier, metering", sub: "Builder · running 2h", age: "2h" },
	] },
	{ label: "In review", items: [
		{ id: "w-t1", title: "Explain what happens when a trial ends", sub: "Builder · review open with you", age: "8h" },
		{ id: "w-t2", title: "Comparison table, stacked layout", sub: "Designer · review open with you", age: "5h" },
	] },
	{ label: "Done since you looked", items: [
		{ id: "w-d1", title: "Proration math covered end to end", sub: "Builder · 03:40", age: "5h" },
		{ id: "w-d2", title: "Trial dates normalised to UTC", sub: "Builder · 05:55", age: "3h" },
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
		{ id: "k-deploy", title: "Deploy rule", sub: "Draft · Facilitation · ready to publish", age: "4h", needsYou: true },
	] },
	{ label: "Changed since you looked", items: [
		{ id: "k-price", title: "How we price", sub: "Growth edited · Trials section", age: "2d", unread: true },
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

const RESULTS: { group: string; items: Item[] }[] = [
	{ group: "Conversations", items: [
		{ id: "s-c1", title: "Trial-end confusion, three tickets", sub: "Maya · 3 tickets about the trial ending", age: "13:02" },
		{ id: "s-c2", title: "Pricing page, Q4 pass", sub: "Growth · trial length discussed", age: "yesterday" },
	] },
	{ group: "Work", items: [
		{ id: "s-w1", title: "Trials that convert without a call", sub: "Growth · running", age: "week 2" },
	] },
	{ group: "Knowledge", items: [
		{ id: "s-k1", title: "Trials", sub: "in How we price", age: "2d" },
	] },
];

function Row({ item, current, onPick }: { item: Item; current?: boolean; onPick: () => void }) {
	return (
		<button type="button" className="nrow" aria-current={current} onClick={onPick}>
			<span className="nrow-top">
				{item.unread && <span className="nrow-dot" aria-label="unread" />}
				<span className="nrow-title">{item.title}</span>
				<span className="nrow-age">{item.age}</span>
			</span>
			<span className="nrow-sub">
				{item.needsYou && <span className="chip chip--flag">Needs you</span>}
				<span>{item.sub}</span>
			</span>
		</button>
	);
}

function DocIcon() {
	return (
		<svg className="doc-ic" viewBox="0 0 14 14" aria-hidden="true">
			<path d="M3 1.5h5l3 3v8H3z M8 1.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
		</svg>
	);
}

/** Every node is a document. Guides show what belongs under what; the chevron column never moves. */
function Tree({ docs, open, toggle, picked, onPick }: {
	docs: Doc[]; open: Set<string>; toggle: (id: string) => void; picked: string | null; onPick: (id: string) => void;
}) {
	return (
		<>
			{docs.map((d) => (
				<div key={d.id}>
					<div className="tree-row" aria-current={picked === d.id}>
						{d.children ? (
							<button type="button" className="tree-fold" aria-expanded={open.has(d.id)} aria-label={open.has(d.id) ? "Fold" : "Unfold"} onClick={() => toggle(d.id)}>
								<span className="chev">›</span>
							</button>
						) : <span className="tree-fold" />}
						<button type="button" className="tree-title" onClick={() => onPick(d.id)}>
							<DocIcon />
							<span className="tree-name">{d.title}</span>
						</button>
						{d.note && <span className="tree-note">{d.note}</span>}
						{d.children && !open.has(d.id) && <span className="tree-count">{d.children.length}</span>}
					</div>
					{d.children && open.has(d.id) && (
						<div className="tree-kids">
							<Tree docs={d.children} open={open} toggle={toggle} picked={picked} onPick={onPick} />
						</div>
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
				<span className="chip chip--quiet">Document</span>
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


function AskThread() {
	return (
		<section className="detail">
			<header className="detail-head">
				<span className="chip chip--quiet">Thread</span>
				<h2>What do we know about trials?</h2>
				<span className="meta">started from Find or ask · now in Conversations</span>
			</header>
			<div className="detail-scroll">
				<article className="msg">
					<span className="avatar avatar--human">YO</span>
					<div>
						<div className="msg-who"><span className="msg-name">You</span><span className="meta">now</span></div>
						<div className="msg-body">What do we know about trials?</div>
					</div>
				</article>
				<article className="msg">
					<span className="avatar">BU</span>
					<div>
						<div className="msg-who"><span className="msg-name">Builder</span><span className="meta">now</span></div>
						<div className="msg-body">
							Trials run 14 days with a card up front. Since this week the page and the email both say
							the date and the amount before the first bill. Growth is testing whether trials convert
							without a sales call — 3 of 7 subtasks done.
							<div className="refs">
								<a className="ref" href="#k"><span className="ref-src">Doc</span><span className="ref-title">How we price › Trials</span></a>
								<a className="ref" href="#c"><span className="ref-src">Thread</span><span className="ref-title">Trial-end confusion, three tickets</span></a>
								<a className="ref" href="#w"><span className="ref-src">Task</span><span className="ref-title">Trials that convert without a call</span></a>
							</div>
						</div>
					</div>
				</article>
			</div>
			<div className="composer">
				<input placeholder="Ask a follow-up, or @someone…" aria-label="Reply" />
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
	const initial: Spine = step === 3 ? "work" : step === 4 || step === 7 ? "knowledge" : "conversations";
	const [spine, setSpine] = useState<Spine>(initial);
	const [picked, setPicked] = useState<string | null>(
		step === 1 ? "g" : step === 2 ? "c-r1" : step === 3 ? "w-f1" : step === 4 || step === 7 ? "k-price" : step === 5 ? "s-k1" : null,
	);
	const [open, setOpen] = useState<Set<string>>(new Set(["t-product", "k-price", "t-eng"]));

	if (step === 0) return <FirstStart />;

	const focused = step === 7;
	const conv = conversations(focused);
	const counts: Record<Spine, number> = {
		conversations: conv[0].items.length,
		work: 0,
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

	let detail = <Placeholder kind="Thread" title="Trial-end explainer" meta="Review · Builder · final" note="A review is a thread. It opens here as designed in Judge; the list stays put, so the next one is one click away." />;
	if (step === 1) detail = <FirstConversation />;
	else if (step === 5) detail = <Placeholder kind="Document" title="Trials" meta="in How we price · opened from Find" note="A result opens right here, like picking it from its list. The search stays in the sidebar until you clear it." />;
	else if (step === 6) detail = <AskThread />;
	else if (step === 7) detail = <Focused />;
	else if (spine === "work" && step === 3) {
		detail = <Placeholder kind="Task" title="Trials that convert without a call" meta="Growth owns this · 3 of 7 subtasks done" note="The task opens here with its subtasks. Its thread and any reviews live in Conversations." />;
	} else if (spine === "knowledge" && step === 4) {
		detail = <Placeholder kind="Document" title="How we price" meta="Published · Growth edited the Trials section 2 days ago" note="The document opens here. Its place in the tree stays highlighted on the left." />;
	}

	return (
		<>
			<nav className="nav">
				<div className="nav-top">
					<span className="wordmark">HyperIdle</span>
					<div className="rail-search">
						<input placeholder="Find or ask…" aria-label="Find or ask" defaultValue={step === 5 ? "trial" : step === 6 ? "what do we know about trials?" : ""} />
					</div>
				</div>

				{step === 5 || step === 6 ? (
					<div className="nav-list">
						<button type="button" className="ask" aria-current={step === 6}>
							<span className="ask-h">{step === 6 ? "Asked · answer is on the right" : "Ask instead ↵"}</span>
							<span>{step === 6 ? "What do we know about trials?" : "Starts a thread with Builder. It answers with links."}</span>
						</button>
						{RESULTS.map((g) => (
							<div key={g.group}>
								<p className="nav-group">{g.group}</p>
								{g.items.map((i) => <Row key={i.id} item={i} current={picked === i.id} onPick={() => setPicked(i.id)} />)}
							</div>
						))}
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
									? <Row item={{ id: "g", title: "Getting started", sub: "Builder: What are you working on?", age: "now" }} current onPick={() => undefined} />
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
									<div className="tree"><Tree docs={TREE} open={open} toggle={toggle} picked={picked} onPick={setPicked} /></div>
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
