import { useState } from "react";

/**
 * ARRIVE — first start, and every morning after.
 * One sidebar: find-or-ask, the three spines stacked, a separator, then the chosen spine's list.
 * The list is in priority order with no headings; every row carries its own status icon, and the
 * title is bold only when it wants your attention. Find or ask is an overlay, not a sidebar mode.
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

type Status = "needs" | "unread" | "changed" | "running" | "waiting" | "done" | "read";

const STATUS_LABEL: Record<Status, string> = {
	needs: "Needs you", unread: "Unread", changed: "Changed", running: "Running",
	waiting: "Waiting on a review", done: "Done", read: "Read",
};

interface Item {
	id: string;
	title: string;
	sub: string;
	age: string;
	status: Status;
}

/** Priority blocks. Their order is the list order; they are never labelled on screen. */
type Group = Item[];

const MENTION: Item = { id: "m1", title: "Maya: can you look at the refund wording?", sub: "Mentioned in Trial-end confusion · just now", age: "now", status: "needs" };

function conversations(withMention: boolean): Group[] {
	return [
		[
			...(withMention ? [MENTION] : []),
			{ id: "c-r1", title: "Trial-end explainer", sub: "Review · Builder · 2 flags", age: "8h", status: "needs" },
			{ id: "c-r2", title: "Comparison table, stacked layout", sub: "Review · Designer · 1 flag", age: "5h", status: "needs" },
			{ id: "c-q", title: "What do we call the charge after a trial?", sub: "Builder asks · seen by every trial user", age: "6h", status: "needs" },
			{ id: "c-infra", title: "Infra wants the rollout rule written down", sub: "Maya: can you own this?", age: "11h", status: "needs" },
		],
		[
			{ id: "c-trial", title: "Trial-end confusion, three tickets", sub: "Maya: Sent all three, closed the tickets.", age: "13:02", status: "unread" },
		],
		[
			{ id: "c-pricing", title: "Pricing page, Q4 pass", sub: "", age: "yesterday", status: "read" },
			{ id: "c-onb", title: "Onboarding emails", sub: "", age: "Mon", status: "read" },
			{ id: "c-hiring", title: "Support hire, second round", sub: "", age: "Fri", status: "read" },
		],
	];
}

/** Work is only tasks. The agent owns them, so nothing here is yours to act on. */
const WORK: Group[] = [
	[
		{ id: "w-f1", title: "Trials that convert without a call", sub: "Growth · 3 of 7 subtasks", age: "week 2", status: "running" },
		{ id: "w-f2", title: "Usage-based tier, metering", sub: "Builder · 2h in", age: "2h", status: "running" },
	],
	[
		{ id: "w-t1", title: "Explain what happens when a trial ends", sub: "Builder · waiting on you", age: "8h", status: "waiting" },
		{ id: "w-t2", title: "Comparison table, stacked layout", sub: "Designer · waiting on you", age: "5h", status: "waiting" },
	],
	[
		{ id: "w-d1", title: "Proration math covered end to end", sub: "", age: "03:40", status: "done" },
		{ id: "w-d2", title: "Trial dates normalised to UTC", sub: "", age: "05:55", status: "done" },
	],
];

const KNOWLEDGE_PRIORITY: Group[] = [
	[
		{ id: "k-deploy", title: "Deploy rule", sub: "Draft · Facilitation asks you to publish", age: "4h", status: "needs" },
	],
	[
		{ id: "k-price", title: "How we price", sub: "Growth edited the Trials section", age: "2d", status: "changed" },
	],
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

/** One icon column, always present, so status reads down the list at a glance. */
function StatusIcon({ status }: { status: Status }) {
	const label = STATUS_LABEL[status];
	let body = null;
	if (status === "needs") body = <><circle cx="7" cy="7" r="6" className="si-needs" /><path d="M7 3.8v3.6M7 9.6v.2" className="si-needs-mark" /></>;
	else if (status === "unread" || status === "changed") body = <circle cx="7" cy="7" r="3.5" className="si-dot" />;
	else if (status === "running") body = <><circle cx="7" cy="7" r="5.5" className="si-ring si-ring--live" /><path d="M7 1.5a5.5 5.5 0 0 1 0 11z" className="si-half" /></>;
	else if (status === "waiting") body = <><circle cx="7" cy="7" r="5.5" className="si-ring si-ring--wait" /><circle cx="7" cy="7" r="2" className="si-wait-core" /></>;
	else if (status === "done") body = <><circle cx="7" cy="7" r="6" className="si-done" /><path d="M4.3 7.2l1.8 1.8 3.6-3.8" className="si-done-mark" /></>;
	return (
		<svg className="si" viewBox="0 0 14 14" role="img" aria-label={label}>
			<title>{label}</title>
			{body}
		</svg>
	);
}

function Row({ item, current, onPick }: { item: Item; current?: boolean; onPick: () => void }) {
	const loud = item.status === "needs" || item.status === "unread" || item.status === "changed";
	return (
		<button type="button" className={loud ? "nrow nrow--loud" : "nrow"} aria-current={current} onClick={onPick}>
			<StatusIcon status={item.status} />
			<span className="nrow-main">
				<span className="nrow-top">
					<span className="nrow-title">{item.title}</span>
					<span className="nrow-age">{item.age}</span>
				</span>
				{item.sub && <span className="nrow-sub">{item.sub}</span>}
			</span>
		</button>
	);
}

/** Priority blocks, in order, separated by space rather than headings. */
function Blocks({ groups, picked, onPick }: { groups: Group[]; picked: string | null; onPick: (id: string) => void }) {
	return (
		<>
			{groups.map((g) => (
				<div className="block" key={g[0]?.id ?? "empty"}>
					{g.map((i) => <Row key={i.id} item={i} current={picked === i.id} onPick={() => onPick(i.id)} />)}
				</div>
			))}
		</>
	);
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
		conversations: conv[0].length,
		work: 0,
		knowledge: KNOWLEDGE_PRIORITY[0].length,
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
							? <Row item={{ id: "g", title: "Getting started", sub: "Builder: What are you working on?", age: "now", status: "unread" }} current onPick={() => undefined} />
							: <p className="nav-empty">Nothing here yet.</p>
					) : spine === "conversations" ? (
						<>
							{focused && <p className="nav-new">1 new since you started · it waits here</p>}
							<Blocks groups={conv} picked={picked} onPick={setPicked} />
						</>
					) : spine === "work" ? (
						<Blocks groups={WORK} picked={picked} onPick={setPicked} />
					) : (
						<>
							<Blocks groups={KNOWLEDGE_PRIORITY} picked={picked} onPick={setPicked} />
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
