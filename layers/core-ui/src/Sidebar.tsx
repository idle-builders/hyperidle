import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { call } from "./api";
import { UNTITLED } from "./doc-page";
import { FindOrAsk } from "./Find";
import { useFocus } from "./focus";
import { listen } from "./live";
import {
	conversationItems,
	countTasks,
	type Doc,
	firstDoc,
	type Inbox,
	type Item,
	initials,
	knowledgeItems,
	knowledgeTree,
	namesOf,
	newSince,
	noteWhat,
	age as relative,
	teamsOf,
	workItems,
} from "./sidebar-lists";
import { useAction } from "./useAction";

/**
 * The one sidebar on every screen: find-or-ask, the three spines stacked, a separator, then the
 * chosen spine's list — one evenly spaced run in priority order, status in words on each row.
 * There is one organisation, so nothing names it. Work can be narrowed to one team; conversations
 * are across all teams, and in knowledge each team is a space of its own. Clicking a row goes to
 * its address, so back, forward and reload keep the place.
 */
type Spine = "conversations" | "work" | "knowledge";
const SPINES: readonly Spine[] = ["conversations", "work", "knowledge"];
const isSpine = (s: string | undefined): s is Spine => SPINES.includes(s as Spine);

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

function Row({ item, current, onPick }: { item: Item; current?: boolean; onPick: () => void }) {
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

interface TreeProps {
	docs: Doc[];
	open: Set<string>;
	toggle: (id: string) => void;
	picked: string | null;
	onPick: (id: string) => void;
	onIcon: (id: string, icon: string) => void;
	/** A new untitled draft inside this row: under a document, or at the top of a space. */
	onAdd: (d: Doc) => void;
	picking: string | null;
	setPicking: (id: string | null) => void;
}

/** Every node is a document with its own icon; the page outline is only the default. */
function Tree(props: TreeProps) {
	const { docs, open, toggle, picked, onPick, picking, setPicking, onIcon, onAdd } = props;
	return (
		<>
			{docs.map((d) => {
				const icon = d.icon ?? "";
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
							<button
								type="button"
								className="tree-title"
								onClick={() => (d.space ? toggle(d.id) : onPick(d.id))}
							>
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
								onClick={() => onAdd(d)}
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
								<Tree {...props} docs={d.children} />
							</div>
						)}
					</div>
				);
			})}
		</>
	);
}

/** Where a notification's row leads: the thread, task, document or person it is about. */
const ROUTE_OF = { thread: "conversations", task: "work", document: "knowledge", user: "people" };

/** What happened in things you follow. Each opens the thread, task or document it is about. */
function Notifications({
	you,
	inbox,
	names,
	onClose,
	onChanged,
}: {
	you: string;
	inbox: Inbox;
	names: ReadonlyMap<string, string>;
	onClose: () => void;
	onChanged: () => void;
}) {
	const navigate = useNavigate();
	const [titles, setTitles] = useState<ReadonlyMap<string, string>>(new Map());
	const about = (object: string): string[] => [
		...new Set(inbox.filter((r) => r.change.object === object).map((r) => r.change.objectId)),
	];
	// Compared by value, so a re-render with the same rows does not ask again.
	const wanted = JSON.stringify([about("task"), about("document"), about("thread")]);
	useEffect(() => {
		const [tasks, docs, threads] = JSON.parse(wanted) as [string[], string[], string[]];
		void Promise.all([
			tasks.length ? call("search_tasks", { ids: tasks }) : null,
			docs.length ? call("search_documents", { ids: docs }) : null,
			threads.length ? call("search_threads", { ids: threads }) : null,
		]).then(([t, d, th]) => {
			const pairs: [string, string][] = [
				...(t?.ok ? t.data.map((x): [string, string] => [x.id, x.title]) : []),
				...(d?.ok ? d.data.map((x): [string, string] => [x.id, x.title]) : []),
				...(th?.ok ? th.data.map((x): [string, string] => [x.id, x.computedTitle]) : []),
			];
			setTitles(new Map(pairs));
		});
	}, [wanted]);

	const unread = inbox.filter((r) => r.readAt === null).map((r) => r.change.id);
	const markRead = async (ids: string[]) => {
		if (ids.length > 0) await call("edit_user", { id: you, inbox: { read: ids } });
		onChanged();
	};

	return (
		<div className="notes" role="dialog" aria-label="Notifications">
			<header className="notes-h">
				<span>Notifications</span>
				<button type="button" className="notes-act" onClick={() => void markRead(unread)}>
					Mark all read
				</button>
				<button type="button" className="notes-x" aria-label="Close" onClick={onClose}>
					✕
				</button>
			</header>
			{inbox.length === 0 && (
				<p className="nav-empty">Nothing yet. What happens in what you follow shows up here.</p>
			)}
			{inbox.map(({ change, readAt }) => (
				<button
					key={change.id}
					type="button"
					className="note"
					onClick={() => {
						void markRead(readAt === null ? [change.id] : []);
						onClose();
						navigate(`/${ROUTE_OF[change.object]}/${change.objectId}`);
					}}
				>
					<span className="nrow-top">
						<span className={readAt === null ? "nrow-title nrow-title--strong" : "nrow-title"}>
							{titles.get(change.objectId) ?? names.get(change.objectId) ?? ""}
						</span>
						<span className="nrow-age">{relative(change.at)}</span>
					</span>
					<span className={readAt === null ? "note-what note-what--new" : "note-what"}>
						{noteWhat(change, names)}
					</span>
				</button>
			))}
			<footer className="notes-f">
				<span>You get these for what you follow.</span>
				<button
					type="button"
					className="notes-act"
					onClick={() => {
						onClose();
						navigate("/people/me?open=start");
					}}
				>
					Change what you are told about
				</button>
			</footer>
		</div>
	);
}

/** What an empty list says, so it never reads as broken. */
const EMPTY: Record<Spine, string> = {
	conversations: "No conversations yet. Start one, or @mention someone anywhere.",
	work: "No tasks here yet. Hand something to an agent in a conversation and it shows up here.",
	knowledge: "No documents yet.",
};

const NO_INBOX: Inbox = [];

export function Sidebar() {
	const navigate = useNavigate();
	const { pathname, search } = useLocation();
	const [, section = "", rawId = ""] = pathname.split("/");
	const here = decodeURIComponent(rawId);
	const routeSpine: Spine | null = isSpine(section) ? section : section === "teams" ? "work" : null;

	const me = useAction("open_user", {});
	const you = me.data?.user?.id ?? "";
	const users = useAction("search_users", {});
	const threads = useAction("search_threads", {}, ["conversations"]);
	const tasks = useAction("search_tasks", {}, ["tasks"]);
	const docs = useAction(
		"search_documents",
		{ inTree: true, scopeKind: "team", slot: "ordinary" },
		["documents"],
	);
	useEffect(() => (you ? listen([`user:${you}`], me.reload) : undefined), [you, me.reload]);

	const [notesOpen, setNotesOpen] = useState(false);
	const [finding, setFinding] = useState(false);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setFinding(true);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
	const [spine, setSpine] = useState<Spine>(routeSpine ?? "conversations");
	const [teamId, setTeamId] = useState<string | null>(null);
	const [menu, setMenu] = useState(false);
	const [open, setOpen] = useState<Set<string>>(new Set());
	const [picking, setPicking] = useState<string | null>(null);

	const names = namesOf(users.data ?? []);
	const teams = teamsOf(users.data ?? []);
	const inbox: Inbox = me.data?.inbox ?? NO_INBOX;
	const newestFirst = [...inbox].sort((a, b) => b.change.at.localeCompare(a.change.at));

	// The address decides the spine shown, and a team's page picks that team in Work.
	useEffect(() => {
		if (routeSpine) setSpine(routeSpine);
	}, [routeSpine]);
	const teamHere = section === "teams" ? teams.find((t) => t.name === here) : undefined;
	const teamHereId = teamHere?.id;
	useEffect(() => {
		if (teamHereId) setTeamId(teamHereId);
	}, [teamHereId]);
	// Every team's space starts unfolded, and so does the way down to the open document.
	const docRows = docs.data;
	useEffect(() => {
		if (!docRows) return;
		const parents = new Map(
			docRows.map((d) => [d.id, d.parentKind === "document" ? d.parentId : null]),
		);
		const path: string[] = [];
		for (let p = parents.get(here) ?? null; p; p = parents.get(p) ?? null) path.push(p);
		const spaces = docRows.map((d) => d.scopeId ?? "");
		setOpen((prev) => new Set([...prev, ...spaces, ...path]));
	}, [docRows, here]);

	const lists: Record<Spine, Item[] | null> = {
		conversations: threads.data && conversationItems(threads.data, you, names, inbox),
		work: tasks.data && workItems(tasks.data, names, inbox),
		knowledge: docs.data && knowledgeItems(docs.data, you, names, teams, inbox),
	};
	// While you write in a document, the conversation list holds still; what is new waits.
	const { editing } = useFocus();
	const [held, setHeld] = useState<{ items: Item[]; at: ReadonlyMap<string, string> } | null>(null);
	const conversations = lists.conversations;
	const threadRows = threads.data;
	useEffect(() => {
		if (!editing) setHeld(null);
		else if (conversations && threadRows)
			setHeld(
				(h) =>
					h ?? {
						items: conversations,
						at: new Map(threadRows.map((t) => [t.id, t.lastActiveAt])),
					},
			);
	}, [editing, conversations, threadRows]);
	const waitingNew = held && threadRows ? newSince(held.at, threadRows) : 0;
	const needs = (t: Spine) => (t === "work" ? 0 : (lists[t] ?? []).filter((i) => i.yours).length);
	// The same count your page lists: questions and reviews waiting on you.
	const waiting = (threads.data ?? []).filter((t) => t.need !== null).length;
	const unread = inbox.filter((r) => r.readAt === null).length;
	const all = spine === "conversations" && held ? held.items : lists[spine];
	const items = all && spine === "work" && teamId ? all.filter((i) => i.team === teamId) : all;
	const team = teams.find((t) => t.id === teamId) ?? null;
	const picked = section === spine ? here : null;

	// Each spine reopens the page you last had there; until then, the first row it lists. While you
	// edit a document, a spine only shows its list, so the document stays open.
	const last = useRef<Partial<Record<Spine, string>>>({});
	useEffect(() => {
		if (routeSpine && rawId) last.current[routeSpine] = pathname + search;
	}, [routeSpine, rawId, pathname, search]);
	const homeOf = (t: Spine): string | undefined => {
		const remembered = last.current[t];
		if (remembered) return remembered;
		const rows = t === "work" && teamId ? lists.work?.filter((i) => i.team === teamId) : lists[t];
		const first =
			rows?.[0]?.id ??
			(t === "knowledge" && docs.data ? firstDoc(knowledgeTree(docs.data, teams)) : undefined);
		return first && `/${t}/${encodeURIComponent(first)}`;
	};
	const openSpine = (t: Spine) => {
		setSpine(t);
		const home = homeOf(t);
		if (home && !editing && home !== pathname + search) navigate(home);
	};
	// The bare address the app starts on opens the first conversation too.
	const startAt = section === "conversations" && !rawId ? homeOf("conversations") : undefined;
	useEffect(() => {
		if (startAt) navigate(startAt, { replace: true });
	}, [startAt, navigate]);

	const toggle = (id: string) =>
		setOpen((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	return (
		<nav className="nav nav--rel" aria-label="Sidebar">
			<div className="nav-top">
				<div className="nav-find">
					<button type="button" className="find-btn" onClick={() => setFinding(true)}>
						<span>Find or ask…</span>
						<kbd>⌘K</kbd>
					</button>
					<button
						type="button"
						className="bell"
						aria-label={`Notifications, ${unread} new`}
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
						{unread > 0 && <span className="bell-n">{unread}</span>}
					</button>
				</div>
			</div>

			<div className="spines nav-spines">
				{SPINES.map((t) => (
					<button
						key={t}
						type="button"
						className="spine"
						aria-current={spine === t}
						onClick={() => openSpine(t)}
					>
						<span>{t[0].toUpperCase() + t.slice(1)}</span>
						{needs(t) > 0 && <span className="spine-count spine-count--flag">{needs(t)}</span>}
					</button>
				))}
			</div>
			<hr className="nav-sep" />

			{finding && <FindOrAsk onClose={() => setFinding(false)} />}
			{notesOpen && (
				<Notifications
					you={you}
					inbox={newestFirst}
					names={names}
					onClose={() => setNotesOpen(false)}
					onChanged={me.reload}
				/>
			)}
			<div className="nav-list">
				{spine === "conversations" && (
					<button
						type="button"
						className="nav-add"
						aria-current={section === "conversations" && here === "new"}
						onClick={() => navigate("/conversations/new")}
					>
						<span aria-hidden="true">+</span>New conversation
					</button>
				)}
				{spine === "work" && (
					<div className="team-pick">
						<button
							type="button"
							className="team-btn"
							aria-expanded={menu}
							onClick={() => setMenu(!menu)}
						>
							{team?.name ?? "All teams"}
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
								aria-current={section === "teams" && here === team.name}
								onClick={() => navigate(`/teams/${encodeURIComponent(team.name)}`)}
							>
								The team ›
							</button>
						)}
						{menu && (
							<div className="team-menu" role="menu" aria-label="Work of one team">
								{[null, ...teams].map((t) => (
									<button
										key={t?.id ?? "all"}
										type="button"
										role="menuitem"
										className="team-row"
										aria-current={teamId === (t?.id ?? null)}
										onClick={() => {
											setTeamId(t?.id ?? null);
											setMenu(false);
										}}
									>
										<span className="team-mark" aria-hidden="true">
											{teamId === (t?.id ?? null) && "✓"}
										</span>
										<span className="team-name">{t?.name ?? "All teams"}</span>
										<span className="team-n">
											{countTasks((all ?? []).filter((i) => t === null || i.team === t.id).length)}
										</span>
									</button>
								))}
							</div>
						)}
					</div>
				)}
				{spine === "conversations" && waitingNew > 0 && (
					<p className="nav-new">{waitingNew} new since you started · it waits here</p>
				)}
				{items?.map((i) => (
					<Row
						key={i.id}
						item={i}
						current={picked === i.id}
						onPick={() => navigate(`/${spine}/${encodeURIComponent(i.id)}`)}
					/>
				))}
				{items?.length === 0 && spine !== "knowledge" && (
					<p className="nav-empty">{EMPTY[spine]}</p>
				)}
				{spine === "knowledge" && docs.data && (
					<section className="tree-wrap" aria-label="All documents">
						<div className="tree">
							{docs.data.length === 0 ? (
								<p className="nav-empty">{EMPTY.knowledge}</p>
							) : (
								<Tree
									docs={knowledgeTree(docs.data, teams)}
									open={open}
									toggle={toggle}
									picked={picked}
									onPick={(id) => navigate(`/knowledge/${encodeURIComponent(id)}`)}
									onIcon={(id, icon) =>
										void call("edit_document", { id, icon: icon || null }).then(docs.reload)
									}
									onAdd={(d) =>
										void call("edit_document", {
											title: UNTITLED,
											body: "",
											scopeKind: "team",
											scopeId: d.team,
											...(d.space ? {} : { parent: { kind: "document", id: d.id } }),
										}).then((made) => {
											if (!made.ok) return;
											setOpen((prev) => new Set([...prev, d.id]));
											docs.reload();
											navigate(`/knowledge/${encodeURIComponent(made.data.document.id)}`);
										})
									}
									picking={picking}
									setPicking={setPicking}
								/>
							)}
						</div>
					</section>
				)}
			</div>
			<button
				type="button"
				className="nav-you"
				aria-current={section === "people" && here === "me"}
				title="Your page: what waits for you, and your settings"
				onClick={() => navigate("/people/me")}
			>
				<span className="avatar avatar--human">{initials(me.data?.user?.name ?? "")}</span>
				<span className="nav-you-name">You</span>
				<span className="nav-you-sub">{waiting} waiting for you</span>
			</button>
		</nav>
	);
}
