import { type ReactNode, useState } from "react";
import { TEAMS, type TeamName } from "./teams";

/**
 * The one sidebar every journey shares: find-or-ask, the three spines stacked, a separator, then
 * the chosen spine's list — one evenly spaced run in priority order, status in words on each row.
 * There is one organisation, so nothing names it. Work can be narrowed to one team; conversations
 * are across all teams, and in knowledge each team is a space of its own.
 */
export type Spine = "conversations" | "work" | "knowledge";

/**
 * `state` is the status in words. `yours` = you owe something (the only use of the flag colour);
 * `fresh` = something new you have not seen. Lists are already in priority order.
 */
export interface Item {
	id: string;
	title: string;
	state: string;
	who: string;
	age: string;
	yours?: boolean;
	fresh?: boolean;
	/** The team a task belongs to, so Work can be narrowed to one. */
	team?: TeamName;
}

const MENTION: Item = {
	id: "m1",
	title: "Refund wording",
	state: "Mentioned you",
	who: "Maya",
	age: "now",
	yours: true,
};

export function conversations(withMention: boolean): Item[] {
	return [
		...(withMention ? [MENTION] : []),
		{
			id: "c-r1",
			title: "Trial-end explainer",
			state: "Needs review",
			who: "Builder · 2 flags",
			age: "8h",
			yours: true,
		},
		{
			id: "c-r2",
			title: "Comparison table, stacked layout",
			state: "Needs review",
			who: "Designer · 1 flag",
			age: "5h",
			yours: true,
		},
		{
			id: "c-q",
			title: "Name for the charge after a trial",
			state: "Stuck",
			who: "Builder asks",
			age: "6h",
			yours: true,
		},
		{
			id: "c-infra",
			title: "Rollout rule, written down",
			state: "Needs input",
			who: "Maya asks you to own it",
			age: "11h",
			yours: true,
		},
		{
			id: "c-trial",
			title: "Trial-end confusion, three tickets",
			state: "New reply",
			who: "Maya",
			age: "13:02",
			fresh: true,
		},
		{
			id: "c-pricing",
			title: "Pricing page, Q4 pass",
			state: "Growth:",
			who: "two options drafted",
			age: "yesterday",
		},
		{
			id: "c-onb",
			title: "Onboarding emails",
			state: "You:",
			who: "park until October",
			age: "Mon",
		},
		{
			id: "c-hiring",
			title: "Support hire, second round",
			state: "Maya:",
			who: "two candidates left",
			age: "Fri",
		},
	];
}

/** Work is only tasks. The agent owns them, so nothing here is flagged as yours — the review is in Conversations. */
export const WORK: Item[] = [
	{
		id: "w-d1",
		title: "Proration math covered end to end",
		state: "Done",
		who: "Builder",
		age: "03:40",
		fresh: true,
		team: "Product",
	},
	{
		id: "w-d2",
		title: "Trial dates normalised to UTC",
		state: "Done",
		who: "Builder",
		age: "05:55",
		fresh: true,
		team: "Product",
	},
	{
		id: "w-t1",
		title: "Explain what happens when a trial ends",
		state: "Needs review",
		who: "Builder",
		age: "8h",
		team: "Product",
	},
	{
		id: "w-t2",
		title: "Comparison table, stacked layout",
		state: "Needs review",
		who: "Designer",
		age: "5h",
		team: "Support",
	},
	{
		id: "w-r1",
		title: "Refund wording",
		state: "Needs review",
		who: "Designer",
		age: "2h",
		team: "Support",
	},
	{
		id: "w-f2",
		title: "Usage-based tier, metering",
		state: "Running · 2h",
		who: "Builder",
		age: "2h",
		team: "Product",
	},
	{
		id: "w-f1",
		title: "Trials that convert without a call",
		state: "6 of 12 done",
		who: "Growth",
		age: "week 2",
		team: "Product",
	},
];

export const KNOWLEDGE_PRIORITY: Item[] = [
	{
		id: "k-deploy",
		title: "Deploy rule",
		state: "Publish?",
		who: "draft by Facilitation",
		age: "4h",
		yours: true,
	},
	{
		id: "k-price",
		title: "How we price",
		state: "Edited by Growth",
		who: "Trials section",
		age: "2d",
		fresh: true,
	},
];

interface Doc {
	id: string;
	title: string;
	icon: string;
	note?: string;
	children?: Doc[];
	/** A team's space: the top of the tree has one per team. */
	space?: boolean;
}

const TREE: Doc[] = [
	{
		id: "s-product",
		title: "Product",
		icon: "",
		space: true,
		children: [
			{
				id: "k-price",
				title: "How we price",
				icon: "💷",
				children: [
					{ id: "t-trials", title: "Trials", icon: "⏳" },
					{ id: "t-tiers", title: "Tiers and metering", icon: "📊" },
					{ id: "t-10days", title: "Should trials be 10 days?", icon: "🤔", note: "draft" },
				],
			},
			{ id: "t-clean", title: "What a clean feature looks like", icon: "✨" },
			{
				id: "t-eng",
				title: "Engineering",
				icon: "🛠️",
				children: [
					{ id: "k-deploy", title: "Deploy rule", icon: "🚀", note: "draft" },
					{ id: "t-trace", title: "Tracing the codebase", icon: "🧭" },
				],
			},
		],
	},
	{
		id: "s-support",
		title: "Support",
		icon: "",
		space: true,
		children: [
			{ id: "t-themes", title: "July support themes", icon: "💬" },
			{ id: "t-refunds", title: "Refund wording", icon: "", note: "draft" },
		],
	},
];

/** A team's mark in the tree: two heads, where a document has its page. */
function TeamIcon() {
	return (
		<svg className="doc-ic" viewBox="0 0 14 14" aria-hidden="true">
			<path
				d="M5 6.2a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM1.5 12c0-2 1.6-3.5 3.5-3.5S8.5 10 8.5 12M9.6 6.4a1.7 1.7 0 1 0 0-3.4M10.4 8.6c1.3.3 2.1 1.6 2.1 3.4"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.1"
				strokeLinecap="round"
			/>
		</svg>
	);
}

const ICON_CHOICES = [
	"",
	"📦",
	"💷",
	"⏳",
	"📊",
	"✨",
	"🛠️",
	"🚀",
	"🧭",
	"💬",
	"📌",
	"🧪",
	"📣",
	"🔒",
	"🎯",
	"📚",
];

export function Row({
	item,
	current,
	onPick,
}: {
	item: Item;
	current?: boolean;
	onPick: () => void;
}) {
	const tone = item.yours ? " nrow-state--yours" : item.fresh ? " nrow-state--fresh" : "";
	return (
		<button type="button" className="nrow" aria-current={current} onClick={onPick}>
			<span className="nrow-top">
				<span className={item.yours || item.fresh ? "nrow-title nrow-title--strong" : "nrow-title"}>
					{item.title}
				</span>
				<span className="nrow-age">{item.age}</span>
			</span>
			<span className="nrow-sub">
				<span className={`nrow-state${tone}`}>{item.state}</span>
				<span className="nrow-who">{item.who}</span>
			</span>
		</button>
	);
}

function List({
	items,
	picked,
	onPick,
}: {
	items: Item[];
	picked: string | null;
	onPick: (id: string) => void;
}) {
	return (
		<>
			{items.map((i) => (
				<Row key={i.id} item={i} current={picked === i.id} onPick={() => onPick(i.id)} />
			))}
		</>
	);
}

function DocIcon() {
	return (
		<svg className="doc-ic" viewBox="0 0 14 14" aria-hidden="true">
			<path
				d="M3 1.5h5l3 3v8H3z M8 1.5v3h3"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.1"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** Every node is a document with its own icon; the page outline is only the default. */
function Tree({
	docs,
	open,
	toggle,
	picked,
	onPick,
	icons,
	onIcon,
	picking,
	setPicking,
	onAdd,
}: {
	docs: Doc[];
	open: Set<string>;
	toggle: (id: string) => void;
	picked: string | null;
	onPick: (id: string) => void;
	icons: Record<string, string>;
	onIcon: (id: string, icon: string) => void;
	picking: string | null;
	setPicking: (id: string | null) => void;
	/** A new document inside this one, or at the top of this space. */
	onAdd: (parent: string) => void;
}) {
	return (
		<>
			{docs.map((d) => {
				const icon = icons[d.id] ?? d.icon;
				return (
					<div key={d.id}>
						<div
							className={d.space ? "tree-row tree-row--space" : "tree-row"}
							aria-current={picked === d.id}
						>
							{d.children ? (
								<button
									type="button"
									className="tree-fold"
									aria-expanded={open.has(d.id)}
									aria-label={open.has(d.id) ? "Fold" : "Unfold"}
									onClick={() => toggle(d.id)}
								>
									<span className="chev">›</span>
								</button>
							) : (
								<span className="tree-fold" />
							)}
							{d.space ? (
								<span className="tree-icon">
									<TeamIcon />
								</span>
							) : (
								<button
									type="button"
									className="tree-icon"
									aria-label="Change icon"
									onClick={() => setPicking(picking === d.id ? null : d.id)}
								>
									{icon ? <span className="emoji">{icon}</span> : <DocIcon />}
								</button>
							)}
							<button type="button" className="tree-title" onClick={() => onPick(d.id)}>
								<span className="tree-name">{d.title}</span>
							</button>
							{d.note && <span className="tree-note">{d.note}</span>}
							{d.space && <span className="tree-note">space</span>}
							{d.children && !open.has(d.id) && (
								<span className="tree-count">{d.children.length}</span>
							)}
							<button
								type="button"
								className="tree-add"
								aria-label={`New document in ${d.title}`}
								title={`New document in ${d.title}`}
								onClick={() => onAdd(d.id)}
							>
								+
							</button>
						</div>
						{picking === d.id && (
							<div className="icon-pick" role="dialog" aria-label="Pick an icon">
								{ICON_CHOICES.map((c) => (
									<button
										key={c || "none"}
										type="button"
										aria-pressed={icon === c}
										onClick={() => {
											onIcon(d.id, c);
											setPicking(null);
										}}
									>
										{c ? <span className="emoji">{c}</span> : <DocIcon />}
									</button>
								))}
							</div>
						)}
						{d.children && open.has(d.id) && (
							<div className="tree-kids">
								<Tree
									docs={d.children}
									open={open}
									toggle={toggle}
									picked={picked}
									onPick={onPick}
									icons={icons}
									onIcon={onIcon}
									picking={picking}
									setPicking={setPicking}
									onAdd={onAdd}
								/>
							</div>
						)}
					</div>
				);
			})}
		</>
	);
}

/** What happened in things you follow. Each opens the thread, task or document it is about. */
interface Note {
	id: string;
	title: string;
	what: string;
	age: string;
	unread?: boolean;
}

const NOTES: Note[] = [
	{
		id: "n1",
		title: "Usage-based tier, metering",
		what: "Builder is stuck · needs a decision on rounding",
		age: "20m",
		unread: true,
	},
	{
		id: "n2",
		title: "Proration math covered end to end",
		what: "Task done · Builder",
		age: "5h",
		unread: true,
	},
	{
		id: "n3",
		title: "How we price",
		what: "Growth edited the Trials section · you follow this",
		age: "2d",
		unread: true,
	},
	{ id: "n4", title: "July support themes", what: "Published · Ops", age: "3d" },
	{
		id: "n5",
		title: "Comparison table, stacked layout",
		what: "Designer raised a review",
		age: "5h",
	},
];

function Notifications({ onClose }: { onClose: () => void }) {
	return (
		<div className="notes" role="dialog" aria-label="Notifications">
			<header className="notes-h">
				<span>Notifications</span>
				<button type="button" className="notes-act">
					Mark all read
				</button>
				<button type="button" className="notes-x" aria-label="Close" onClick={onClose}>
					✕
				</button>
			</header>
			{NOTES.map((n) => (
				<button key={n.id} type="button" className="note">
					<span className="nrow-top">
						<span className={n.unread ? "nrow-title nrow-title--strong" : "nrow-title"}>
							{n.title}
						</span>
						<span className="nrow-age">{n.age}</span>
					</span>
					<span className={n.unread ? "note-what note-what--new" : "note-what"}>{n.what}</span>
				</button>
			))}
			<footer className="notes-f">
				<span>You get these for what you follow.</span>
				<button type="button" className="notes-act">
					Change what you are told about
				</button>
			</footer>
		</div>
	);
}

interface SidebarProps {
	initialSpine?: Spine;
	initialPicked?: string | null;
	/** A list per spine; `null` shows the honest empty state. Defaults to the populated world. */
	lists?: Partial<Record<Spine, Item[] | null>>;
	showCounts?: boolean;
	/** Shown above the Conversations list, e.g. a quiet "1 new since you started". */
	conversationsNote?: ReactNode;
	notificationsOpen?: boolean;
	/** Documents published during the walkthrough; the tree stops calling them drafts. */
	published?: string[];
	/** Your own page is showing. */
	youOpen?: boolean;
	/** Work narrowed to one team; none is all teams. */
	initialTeam?: TeamName | null;
	/** The list of teams to jump between is open. */
	teamMenuOpen?: boolean;
	/** That team's page is showing. */
	teamOpen?: TeamName | null;
	onTeam?: (team: TeamName) => void;
	/** A new document was just made inside this one; it is picked, untitled and a draft. */
	newDocIn?: string | null;
	/** A new conversation was just started; it sits at the top, picked. */
	newConversation?: boolean;
	/** The detail pane follows what you start here. */
	onNewDoc?: (parent: string) => void;
	onNewConversation?: () => void;
}

const UNTITLED: Doc = { id: "k-new", title: "Untitled", icon: "", note: "draft" };
const STARTED: Item = {
	id: "c-new",
	title: "New conversation",
	state: "Not sent yet",
	who: "you",
	age: "now",
};

/** The tree with an untitled draft placed inside `parent`. */
const withNew = (docs: Doc[], parent: string): Doc[] =>
	docs.map((d) =>
		d.id === parent
			? { ...d, children: [UNTITLED, ...(d.children ?? [])] }
			: { ...d, children: d.children && withNew(d.children, parent) },
	);

/** What an empty list says, so it never reads as broken. */
const EMPTY: Record<Spine, string> = {
	conversations: "No conversations yet. Start one, or @mention someone anywhere.",
	work: "No tasks here yet. Hand something to an agent in a conversation and it shows up here.",
	knowledge: "No documents yet.",
};

const withoutDraft = (docs: Doc[], ids: string[]): Doc[] =>
	docs.map((d) => ({
		...d,
		note: ids.includes(d.id) ? undefined : d.note,
		children: d.children && withoutDraft(d.children, ids),
	}));

export function Sidebar({
	initialSpine = "conversations",
	initialPicked = null,
	lists = {},
	showCounts = true,
	conversationsNote,
	notificationsOpen = false,
	published = [],
	youOpen = false,
	initialTeam = null,
	teamMenuOpen = false,
	teamOpen = null,
	onTeam,
	newDocIn = null,
	newConversation = false,
	onNewDoc,
	onNewConversation,
}: SidebarProps) {
	const [notesOpen, setNotesOpen] = useState(notificationsOpen);
	const [spine, setSpine] = useState<Spine>(initialSpine);
	const [picked, setPicked] = useState<string | null>(initialPicked);
	const [open, setOpen] = useState<Set<string>>(new Set(["s-product", "k-price", "s-support"]));
	const [team, setTeam] = useState<TeamName | null>(initialTeam);
	const [menu, setMenu] = useState(teamMenuOpen);
	const [icons, setIcons] = useState<Record<string, string>>({});
	const [picking, setPicking] = useState<string | null>(null);
	const [docIn, setDocIn] = useState(newDocIn);
	const [started, setStarted] = useState(newConversation);
	const addDoc = (parent: string) => {
		setDocIn(parent);
		setOpen((prev) => new Set([...prev, parent]));
		setPicked(UNTITLED.id);
		onNewDoc?.(parent);
	};
	const startConversation = () => {
		setStarted(true);
		setPicked(STARTED.id);
		onNewConversation?.();
	};

	const resolved: Record<Spine, Item[] | null> = {
		conversations: lists.conversations === undefined ? conversations(false) : lists.conversations,
		work: lists.work === undefined ? WORK : lists.work,
		knowledge: lists.knowledge === undefined ? KNOWLEDGE_PRIORITY : lists.knowledge,
	};
	const needs = (t: Spine) =>
		t === "work" ? 0 : (resolved[t] ?? []).filter((i) => i.yours).length;

	const toggle = (id: string) =>
		setOpen((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	if (started) resolved.conversations = [STARTED, ...(resolved.conversations ?? [])];
	const all = resolved[spine];
	const items = all && spine === "work" && team ? all.filter((i) => i.team === team) : all;
	const tree = docIn ? withNew(TREE, docIn) : TREE;

	return (
		<nav className="nav nav--rel">
			<div className="nav-top">
				<div className="nav-find">
					<button type="button" className="find-btn">
						<span>Find or ask…</span>
						<kbd>⌘K</kbd>
					</button>
					{showCounts && (
						<button
							type="button"
							className="bell"
							aria-label="Notifications, 3 new"
							aria-expanded={notesOpen}
							onClick={() => setNotesOpen(!notesOpen)}
						>
							<svg viewBox="0 0 16 16" aria-hidden="true">
								<path
									d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3zM6.5 14h3"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.3"
									strokeLinejoin="round"
									strokeLinecap="round"
								/>
							</svg>
							<span className="bell-n">3</span>
						</button>
					)}
				</div>
			</div>

			<div className="spines nav-spines">
				{(["conversations", "work", "knowledge"] as Spine[]).map((t) => (
					<button
						key={t}
						type="button"
						className="spine"
						aria-current={spine === t}
						onClick={() => setSpine(t)}
					>
						<span>{t[0].toUpperCase() + t.slice(1)}</span>
						{showCounts && needs(t) > 0 && (
							<span className="spine-count spine-count--flag">{needs(t)}</span>
						)}
					</button>
				))}
			</div>
			<hr className="nav-sep" />

			{notesOpen && <Notifications onClose={() => setNotesOpen(false)} />}
			<div className="nav-list">
				{spine === "conversations" && (
					<button type="button" className="nav-add" onClick={startConversation}>
						<span aria-hidden="true">+</span>New conversation
					</button>
				)}
				{items === null ? (
					<p className="nav-empty">{EMPTY[spine]}</p>
				) : (
					<>
						{spine === "conversations" && conversationsNote}
						{spine === "work" && (
							<div className="team-pick">
								<button
									type="button"
									className="team-btn"
									aria-expanded={menu}
									onClick={() => setMenu(!menu)}
								>
									{team ?? "All teams"}
									<svg viewBox="0 0 12 12" aria-hidden="true">
										<path
											d="M3 4.5l3 3 3-3"
											fill="none"
											stroke="currentColor"
											strokeWidth="1.4"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
								</button>
								{team && (
									<button
										type="button"
										className="team-link"
										aria-current={teamOpen === team}
										onClick={() => onTeam?.(team)}
									>
										The team ›
									</button>
								)}
								{menu && (
									<div className="team-menu" role="menu" aria-label="Work of one team">
										{[null, ...TEAMS.map((t) => t.name)].map((t) => (
											<button
												key={t ?? "all"}
												type="button"
												role="menuitem"
												className="team-row"
												aria-current={team === t}
												onClick={() => {
													setTeam(t);
													setMenu(false);
												}}
											>
												<span className="team-mark" aria-hidden="true">
													{team === t && "✓"}
												</span>
												<span className="team-name">{t ?? "All teams"}</span>
												<span className="team-n">
													{(all ?? []).filter((i) => t === null || i.team === t).length} tasks
												</span>
											</button>
										))}
									</div>
								)}
							</div>
						)}
						<List items={items} picked={picked} onPick={setPicked} />
						{items.length === 0 && spine !== "knowledge" && (
							<p className="nav-empty">{EMPTY[spine]}</p>
						)}
						{spine === "knowledge" && (
							<section className="tree-wrap" aria-label="All documents">
								<div className="tree">
									<Tree
										docs={published.length ? withoutDraft(tree, published) : tree}
										open={open}
										toggle={toggle}
										picked={picked}
										onPick={setPicked}
										icons={icons}
										onIcon={(id, ic) => setIcons((p) => ({ ...p, [id]: ic }))}
										picking={picking}
										setPicking={setPicking}
										onAdd={addDoc}
									/>
								</div>
							</section>
						)}
					</>
				)}
			</div>
			{showCounts && (
				<button
					type="button"
					className="nav-you"
					aria-current={youOpen}
					title="Your page: what waits for you, and your settings"
				>
					<span className="avatar avatar--human">FO</span>
					<span className="nav-you-name">You</span>
					<span className="nav-you-sub">4 waiting for you</span>
				</button>
			)}
		</nav>
	);
}
