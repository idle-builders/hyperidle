import { useState } from "react";

/**
 * ARRIVE — first start, and every morning after.
 * One sidebar: find-or-ask, the three spines stacked, a separator, then the chosen spine's list.
 * Each list is one priority-ordered run of evenly spaced rows. Status is words on the row saying
 * what is going on; only what is yours gets the flag colour. Find or ask is an overlay.
 */
export const ARRIVE_STEPS = [
	{ id: 0, name: "First start" },
	{ id: 1, name: "First conversation" },
	{ id: 2, name: "Conversations, in priority order" },
	{ id: 3, name: "Work, in priority order" },
	{ id: 4, name: "Knowledge, a tree" },
	{ id: 5, name: "Find (⌘K)" },
	{ id: 6, name: "Ask (Tab to switch)" },
	{ id: 7, name: "Something new while you focus" },
];

type Spine = "conversations" | "work" | "knowledge";

/**
 * `state` is the status in words. `yours` = you owe something (the only use of the flag colour);
 * `fresh` = something new you have not seen. Lists are already in priority order.
 */
interface Item {
	id: string;
	title: string;
	state: string;
	who: string;
	age: string;
	yours?: boolean;
	fresh?: boolean;
}

const MENTION: Item = { id: "m1", title: "Refund wording", state: "Mentioned you", who: "Maya", age: "now", yours: true };

function conversations(withMention: boolean): Item[] {
	return [
		...(withMention ? [MENTION] : []),
		{ id: "c-r1", title: "Trial-end explainer", state: "Your review", who: "Builder · 2 flags", age: "8h", yours: true },
		{ id: "c-r2", title: "Comparison table, stacked layout", state: "Your review", who: "Designer · 1 flag", age: "5h", yours: true },
		{ id: "c-q", title: "Name for the charge after a trial", state: "Your answer", who: "Builder asks", age: "6h", yours: true },
		{ id: "c-infra", title: "Rollout rule, written down", state: "Your answer", who: "Maya asks you to own it", age: "11h", yours: true },
		{ id: "c-trial", title: "Trial-end confusion, three tickets", state: "New reply", who: "Maya", age: "13:02", fresh: true },
		{ id: "c-pricing", title: "Pricing page, Q4 pass", state: "Growth:", who: "two options drafted", age: "yesterday" },
		{ id: "c-onb", title: "Onboarding emails", state: "You:", who: "park until October", age: "Mon" },
		{ id: "c-hiring", title: "Support hire, second round", state: "Maya:", who: "two candidates left", age: "Fri" },
	];
}

/** Work is only tasks. The agent owns them, so nothing here is flagged as yours — the review is in Conversations. */
const WORK: Item[] = [
	{ id: "w-d1", title: "Proration math covered end to end", state: "Done", who: "Builder", age: "03:40", fresh: true },
	{ id: "w-d2", title: "Trial dates normalised to UTC", state: "Done", who: "Builder", age: "05:55", fresh: true },
	{ id: "w-t1", title: "Explain what happens when a trial ends", state: "Waiting on your review", who: "Builder", age: "8h" },
	{ id: "w-t2", title: "Comparison table, stacked layout", state: "Waiting on your review", who: "Designer", age: "5h" },
	{ id: "w-f2", title: "Usage-based tier, metering", state: "Running · 2h", who: "Builder", age: "2h" },
	{ id: "w-f1", title: "Trials that convert without a call", state: "3 of 7 done", who: "Growth", age: "week 2" },
];

const KNOWLEDGE_PRIORITY: Item[] = [
	{ id: "k-deploy", title: "Deploy rule", state: "Publish?", who: "draft by Facilitation", age: "4h", yours: true },
	{ id: "k-price", title: "How we price", state: "Edited by Growth", who: "Trials section", age: "2d", fresh: true },
];

interface Doc {
	id: string;
	title: string;
	icon: string;
	note?: string;
	children?: Doc[];
}

const TREE: Doc[] = [
	{ id: "t-product", title: "Product", icon: "📦", children: [
		{ id: "k-price", title: "How we price", icon: "💷", children: [
			{ id: "t-trials", title: "Trials", icon: "⏳" },
			{ id: "t-tiers", title: "Tiers and metering", icon: "📊" },
		] },
		{ id: "t-clean", title: "What a clean feature looks like", icon: "✨" },
	] },
	{ id: "t-eng", title: "Engineering", icon: "🛠️", children: [
		{ id: "k-deploy", title: "Deploy rule", icon: "🚀", note: "draft" },
		{ id: "t-trace", title: "Tracing the codebase", icon: "🧭" },
	] },
	{ id: "t-support", title: "Support", icon: "💬", children: [
		{ id: "t-themes", title: "July support themes", icon: "" },
	] },
];

const ICON_CHOICES = ["", "📦", "💷", "⏳", "📊", "✨", "🛠️", "🚀", "🧭", "💬", "📌", "🧪", "📣", "🔒", "🎯", "📚"];

interface Hit {
	id: string;
	spine: "Thread" | "Task" | "Document";
	title: string;
	where: string;
	snippet: [string, string, string];
}

const HITS: Hit[] = [
	{ id: "h1", spine: "Document", title: "Trials", where: "How we price › Trials", snippet: ["Every plan starts with a 14-day ", "trial", ". We ask for a card up front and say, before it ends, exactly when the first bill comes."] },
	{ id: "h2", spine: "Thread", title: "Trial-end confusion, three tickets", where: "Conversations · Maya · 13:02", snippet: ["Three support tickets asking the same thing — people finish the ", "trial", " and cannot tell what they will pay."] },
	{ id: "h3", spine: "Task", title: "Trials that convert without a call", where: "Work · Growth · 3 of 7 subtasks", snippet: ["Can a ", "trial", " convert to paid without a sales call? Testing a self-serve checkout at day 12."] },
	{ id: "h4", spine: "Thread", title: "Pricing page, Q4 pass", where: "Conversations · Growth · yesterday", snippet: ["Two options drafted. Option B shortens the ", "trial", " to 10 days and adds a reminder."] },
];

function Row({ item, current, onPick }: { item: Item; current?: boolean; onPick: () => void }) {
	const tone = item.yours ? " nrow-state--yours" : item.fresh ? " nrow-state--fresh" : "";
	return (
		<button type="button" className="nrow" aria-current={current} onClick={onPick}>
			<span className="nrow-top">
				<span className={item.yours || item.fresh ? "nrow-title nrow-title--strong" : "nrow-title"}>{item.title}</span>
				<span className="nrow-age">{item.age}</span>
			</span>
			<span className="nrow-sub">
				<span className={`nrow-state${tone}`}>{item.state}</span>
				<span className="nrow-who">{item.who}</span>
			</span>
		</button>
	);
}

function List({ items, picked, onPick }: { items: Item[]; picked: string | null; onPick: (id: string) => void }) {
	return <>{items.map((i) => <Row key={i.id} item={i} current={picked === i.id} onPick={() => onPick(i.id)} />)}</>;
}

function DocIcon() {
	return (
		<svg className="doc-ic" viewBox="0 0 14 14" aria-hidden="true">
			<path d="M3 1.5h5l3 3v8H3z M8 1.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
		</svg>
	);
}

/** Every node is a document with its own icon; the page outline is only the default. */
function Tree({ docs, open, toggle, picked, onPick, icons, onIcon, picking, setPicking }: {
	docs: Doc[]; open: Set<string>; toggle: (id: string) => void; picked: string | null; onPick: (id: string) => void;
	icons: Record<string, string>; onIcon: (id: string, icon: string) => void;
	picking: string | null; setPicking: (id: string | null) => void;
}) {
	return (
		<>
			{docs.map((d) => {
				const icon = icons[d.id] ?? d.icon;
				return (
					<div key={d.id}>
						<div className="tree-row" aria-current={picked === d.id}>
							{d.children ? (
								<button type="button" className="tree-fold" aria-expanded={open.has(d.id)} aria-label={open.has(d.id) ? "Fold" : "Unfold"} onClick={() => toggle(d.id)}>
									<span className="chev">›</span>
								</button>
							) : <span className="tree-fold" />}
							<button type="button" className="tree-icon" aria-label="Change icon" onClick={() => setPicking(picking === d.id ? null : d.id)}>
								{icon ? <span className="emoji">{icon}</span> : <DocIcon />}
							</button>
							<button type="button" className="tree-title" onClick={() => onPick(d.id)}>
								<span className="tree-name">{d.title}</span>
							</button>
							{d.note && <span className="tree-note">{d.note}</span>}
							{d.children && !open.has(d.id) && <span className="tree-count">{d.children.length}</span>}
						</div>
						{picking === d.id && (
							<div className="icon-pick" role="dialog" aria-label="Pick an icon">
								{ICON_CHOICES.map((c) => (
									<button key={c || "none"} type="button" aria-pressed={icon === c} onClick={() => { onIcon(d.id, c); setPicking(null); }}>
										{c ? <span className="emoji">{c}</span> : <DocIcon />}
									</button>
								))}
							</div>
						)}
						{d.children && open.has(d.id) && (
							<div className="tree-kids">
								<Tree docs={d.children} open={open} toggle={toggle} picked={picked} onPick={onPick}
									icons={icons} onIcon={onIcon} picking={picking} setPicking={setPicking} />
							</div>
						)}
					</div>
				);
			})}
		</>
	);
}

/** One input, two intents. Tab flips between them and keeps what you typed. */
function Palette({ initialMode }: { initialMode: "find" | "ask" }) {
	const [mode, setMode] = useState(initialMode);
	const [sel, setSel] = useState("h1");
	const hit = HITS.find((h) => h.id === sel) ?? HITS[0];
	const query = mode === "find" ? "trial" : "what do we know about trials?";

	return (
		<div className="pal-back">
			<div className="pal" role="dialog" aria-label="Find or ask">
				<div className="pal-top">
					<div className="pal-mode" role="radiogroup" aria-label="Mode">
						<button type="button" role="radio" aria-checked={mode === "find"} onClick={() => setMode("find")}>Find</button>
						<button type="button" role="radio" aria-checked={mode === "ask"} onClick={() => setMode("ask")}>Ask</button>
					</div>
					<input className="pal-in" defaultValue={query} key={mode} aria-label={mode === "find" ? "Find" : "Ask"}
						placeholder={mode === "find" ? "Find threads, tasks, documents…" : "Ask anything — an agent answers with sources"} />
					<kbd className="pal-kbd">esc</kbd>
				</div>

				{mode === "find" ? (
					<div className="pal-body">
						<div className="pal-list">
							<button type="button" className="pal-askrow" onClick={() => setMode("ask")}>
								<span className="pal-askrow-ic">↳</span>
								<span>Ask Builder about “trial”</span>
								<kbd>Tab</kbd>
							</button>
							{(["Document", "Thread", "Task"] as const).map((sp) => {
								const hits = HITS.filter((h) => h.spine === sp);
								if (hits.length === 0) return null;
								return (
									<div key={sp}>
										<p className="pal-group">{sp === "Document" ? "Knowledge" : sp === "Thread" ? "Conversations" : "Work"}</p>
										{hits.map((h) => (
											<button key={h.id} type="button" className="pal-hit" aria-selected={sel === h.id}
												onMouseEnter={() => setSel(h.id)} onClick={() => setSel(h.id)}>
												<span className="pal-hit-t">{h.title}</span>
												<span className="pal-hit-w">{h.where}</span>
											</button>
										))}
									</div>
								);
							})}
						</div>
						<div className="pal-prev">
							<span className="pal-prev-sp">{hit.spine}</span>
							<h3>{hit.title}</h3>
							<span className="pal-prev-w">{hit.where}</span>
							<p className="pal-prev-s">…{hit.snippet[0]}<mark>{hit.snippet[1]}</mark>{hit.snippet[2]}</p>
							<span className="pal-prev-go">↵ open here · ⌘↵ open beside</span>
						</div>
					</div>
				) : (
					<div className="pal-ask">
						<div className="pal-who">
							<span className="avatar">BU</span>
							<span><b>Builder</b> is answering · searched 3 threads, 2 tasks, 4 documents</span>
						</div>
						<p className="pal-ans">
							Trials run <b>14 days</b> with a card up front. Since this week the pricing page and the
							three-day email both say the date and the amount before the first bill. Growth is testing
							whether trials convert without a sales call — 3 of 7 subtasks done. Option B in the Q4
							pricing thread would shorten trials to 10 days; nobody has decided that yet.
						</p>
						<div className="pal-src">
							<span className="pal-src-h">Sources</span>
							{HITS.map((h) => (
								<button key={h.id} type="button" className="pal-src-row">
									<span className="pal-src-sp">{h.spine}</span>
									<span>{h.title}</span>
								</button>
							))}
						</div>
					</div>
				)}

				<footer className="pal-foot">
					{mode === "find" ? (
						<>
							<span><kbd>↑↓</kbd> move</span>
							<span><kbd>↵</kbd> open</span>
							<span><kbd>Tab</kbd> ask instead</span>
						</>
					) : (
						<>
							<span className="pal-saved">Saved as a thread in Conversations</span>
							<span><kbd>↵</kbd> follow up</span>
							<span><kbd>⌘↵</kbd> open thread</span>
							<span><kbd>Tab</kbd> back to find</span>
						</>
					)}
				</footer>
			</div>
		</div>
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
		step === 1 ? "g" : step === 2 ? "c-r1" : step === 3 ? "w-f1" : step === 4 || step === 7 ? "k-price" : null,
	);
	const [open, setOpen] = useState<Set<string>>(new Set(["t-product", "k-price", "t-eng"]));
	const [icons, setIcons] = useState<Record<string, string>>({});
	const [picking, setPicking] = useState<string | null>(null);

	if (step === 0) return <FirstStart />;

	const focused = step === 7;
	const conv = conversations(focused);
	const needs: Record<Spine, number> = {
		conversations: conv.filter((i) => i.yours).length,
		work: 0,
		knowledge: KNOWLEDGE_PRIORITY.filter((i) => i.yours).length,
	};

	const toggle = (id: string) => setOpen((prev) => {
		const next = new Set(prev);
		if (next.has(id)) next.delete(id); else next.add(id);
		return next;
	});

	let detail = <Placeholder kind="Thread" title="Trial-end explainer" meta="Review · Builder · final" note="A review is a thread. It opens here as designed in Judge; the list stays put, so the next one is one click away." />;
	if (step === 1) detail = <FirstConversation />;
	else if (step === 3) detail = <Placeholder kind="Task" title="Trials that convert without a call" meta="Growth owns this · 3 of 7 subtasks done" note="The task opens here with its subtasks. Its thread and any reviews live in Conversations." />;
	else if (step === 4) detail = <Placeholder kind="Document" title="How we price" meta="Published · Growth edited the Trials section 2 days ago" note="The document opens here. Click any icon in the tree to change it." />;
	else if (step === 7) detail = <Focused />;

	return (
		<>
			<nav className="nav">
				<div className="nav-top">
					<span className="wordmark">HyperIdle</span>
					<button type="button" className="find-btn">
						<span>Find or ask…</span>
						<kbd>⌘K</kbd>
					</button>
				</div>

				<div className="spines nav-spines">
					{(["conversations", "work", "knowledge"] as Spine[]).map((t) => (
						<button key={t} type="button" className="spine" aria-current={spine === t} onClick={() => setSpine(t)}>
							<span>{t[0].toUpperCase() + t.slice(1)}</span>
							{step > 1 && needs[t] > 0 && <span className="spine-count spine-count--flag">{needs[t]}</span>}
						</button>
					))}
				</div>
				<hr className="nav-sep" />

				<div className="nav-list">
					{step === 1 ? (
						spine === "conversations"
							? <Row item={{ id: "g", title: "Getting started", state: "New", who: "Builder", age: "now", fresh: true }} current onPick={() => undefined} />
							: <p className="nav-empty">Nothing here yet.</p>
					) : spine === "conversations" ? (
						<>
							{focused && <p className="nav-new">1 new since you started · it waits here</p>}
							<List items={conv} picked={picked} onPick={setPicked} />
						</>
					) : spine === "work" ? (
						<List items={WORK} picked={picked} onPick={setPicked} />
					) : (
						<>
							<List items={KNOWLEDGE_PRIORITY} picked={picked} onPick={setPicked} />
							<section className="tree-wrap" aria-label="All documents">
								<div className="tree">
									<Tree docs={TREE} open={open} toggle={toggle} picked={picked} onPick={setPicked}
										icons={icons} onIcon={(id, ic) => setIcons((p) => ({ ...p, [id]: ic }))}
										picking={picking} setPicking={setPicking} />
								</div>
							</section>
						</>
					)}
				</div>
			</nav>

			{detail}
			{(step === 5 || step === 6) && <Palette initialMode={step === 5 ? "find" : "ask"} />}
		</>
	);
}
