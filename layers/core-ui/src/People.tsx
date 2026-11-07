import type {
	DocumentRow,
	PluginListing,
	SubscriptionEventName,
	Task,
	UserRow,
	UserView,
} from "@hyperidle/domain-model";
import { PERSON_REASONS } from "@hyperidle/domain-model";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { call } from "./api";
import { disciplinesOf } from "./doc-page";
import { Failed } from "./Failed";
import { LOOKS, useLooks } from "./looks";
import { Avatar } from "./Msg";
import { NeedIcon } from "./NeedIcon";
import { AddPluginDialog } from "./Plugins";
import {
	agentJobs,
	agentStand,
	countWords,
	crewOf,
	forWords,
	type Job,
	joinWords,
	type Pair,
	personStand,
	pluginName,
	reasonWords,
	runnerButtonState,
	sinceWords,
	startedJobs,
	startRows,
	waitingJobs,
} from "./people-page";
import { pluginLine } from "./plugin-page";
import { StartDialog, UserDialog } from "./Setup";
import { age, initials, teamsOf } from "./sidebar-lists";
import { useNow } from "./Thread";
import { useAction } from "./useAction";

/**
 * PEOPLE — agents and people are the same kind of user, so they share one page. The page is that
 * user's to-do and status list: what is assigned to them and what waits on them. A box floating
 * on the right holds how they are set up — the typical settings sidebar: a link to your
 * conversation with them, what they run on, where they work, what they can reach, when they start
 * working or what they are told about, and what makes them who they are (instructions, skills,
 * memory). There is no separate settings screen: your own page is where your settings live, and it
 * is one click away at the bottom of the sidebar. A team is a group inside the one organisation —
 * a product team, a function, or both; a person can be in several, an agent is in one. A team's
 * page is reached from Work: its people and agents, and in its box its plugins. Changing any of it
 * happens in a small dialog over the page. Anything long is a document: a new agent, or a new
 * reason for it to start, is made in a dialog, and its instructions are then written as a document.
 */

type DialogId = "start" | "edit";
const NO_USERS: readonly UserRow[] = [];
const problemOf = (r: { ok: boolean; problems?: readonly { message: string }[] }): string | null =>
	r.ok ? null : (r.problems?.[0]?.message ?? "That did not work.");
const docHref = (id: string, edit = false) =>
	`/knowledge/${encodeURIComponent(id)}${edit ? "?edit" : ""}`;

/** The same marks as on a task's graph: an icon where a person is needed, initials where an agent is working. */
function Mark({ job }: { job: Job }) {
	if (job.needs) return <NeedIcon kind={job.needs} />;
	if (job.mark === "run") return <span className="avatar nd-av">{job.by}</span>;
	return <>{job.mark === "done" ? "✓" : "○"}</>;
}

function Jobs({ items }: { items: readonly Job[] }) {
	const navigate = useNavigate();
	return (
		<div className="jobs">
			{items.map((w) => (
				<button key={w.id} type="button" className="nd" onClick={() => navigate(w.href)}>
					<span className="nd-mark" aria-hidden="true">
						<Mark job={w} />
					</span>
					<span className="nd-text">
						<span className="nd-name">{w.title}</span>
						<span className="nd-sub">{w.words}</span>
					</span>
				</button>
			))}
		</div>
	);
}

function Section({
	title,
	sub,
	items,
	none,
	add,
	onAdd,
	first,
}: {
	title: string;
	sub?: string;
	items: readonly (Pair & { href?: string })[];
	none?: string;
	add?: string;
	onAdd?: () => void;
	/** Show only this many until asked for the rest. */
	first?: number;
}) {
	const navigate = useNavigate();
	const [all, setAll] = useState(false);
	const shown = first !== undefined && !all ? items.slice(0, first) : items;
	return (
		<section className="tbox-sec">
			<h4>
				{title} {sub && <span>{sub}</span>}
			</h4>
			{items.length === 0 && none && <p className="tbox-none">{none}</p>}
			{shown.map((x) =>
				x.href ? (
					<button
						key={x.what + x.why}
						type="button"
						className="pair pair--go"
						onClick={() => navigate(x.href ?? "")}
					>
						<span className="pair-what">{x.what}</span>
						{x.why && <span className="pair-why">{x.why}</span>}
					</button>
				) : (
					<div key={x.what + x.why} className="pair">
						<span className="pair-what">{x.what}</span>
						{x.why && <span className="pair-why">{x.why}</span>}
					</div>
				),
			)}
			{shown.length < items.length && (
				<button type="button" className="tbox-more" onClick={() => setAll(true)}>
					Show all {items.length}
				</button>
			)}
			{add && (
				<button type="button" className="tbox-more" onClick={onAdd}>
					{add}
				</button>
			)}
		</section>
	);
}

/* ---------- a team's page ---------- */

/** One row on the team page: who, what they do, and what they are doing right now. */
function Row({ u, stand }: { u: UserRow; stand: string }) {
	const navigate = useNavigate();
	return (
		<button type="button" className="who" onClick={() => navigate(`/people/${u.id}`)}>
			<Avatar who={initials(u.name)} human={u.kind === "human"} />
			<span className="who-text">
				<span className="who-name">{u.name}</span>
				<span className="who-what">{u.what}</span>
			</span>
			<span className="who-now">{stand}</span>
		</button>
	);
}

/** A person's row says what waits for them, which only they and the threads know. */
function PersonRow({ u, you }: { u: UserRow; you: string }) {
	const now = useNow();
	const threads = useAction("search_threads", { member: u.id }, ["conversations"]);
	return <Row u={u} stand={personStand(waitingJobs(threads.data ?? [], now), u.id === you)} />;
}

const NO_TASKS: readonly Task[] = [];
function useTasks(): readonly Task[] {
	return useAction("search_tasks", {}, ["tasks"]).data ?? NO_TASKS;
}

const forTeam = (p: PluginListing, teamId: string): boolean =>
	p.state === "available" || p.scope.kind === "factory" || p.scope.teamId === teamId;

export function TeamScreen({ name }: { name: string }): React.ReactElement {
	const navigate = useNavigate();
	const now = useNow();
	const me = useAction("open_user", {});
	const users = useAction("search_users", {}, ["users"]);
	const plugins = useAction("search_plugins", {});
	const tasks = useTasks();
	const [adding, setAdding] = useState(false);
	const [addingPlugin, setAddingPlugin] = useState(false);
	const location = useLocation();
	const removed = (location.state as { removed?: { id: string; name: string } } | null)?.removed;

	const you = me.data?.user?.id ?? "";
	const everyone = users.data ?? NO_USERS;
	const team = teamsOf([...everyone]).find((t) => t.name === name);
	if (users.problems || (users.data && !team))
		return (
			<section className="detail">
				<header className="detail-head">
					<span className="chip chip--quiet">Team</span>
				</header>
				<div className="detail-scroll">
					<Failed
						what="This team"
						why={users.problems?.[0]?.message ?? `There is no team called ${name}.`}
						onRetry={users.reload}
					/>
				</div>
			</section>
		);
	const { crews, wholeTeam, everyTeam } = crewOf(everyone, team?.id ?? "", you);
	const agents = crews.flatMap((c) => c.agents).length + wholeTeam.length;
	const stand = (u: UserRow) =>
		agentStand({
			paused: u.status === "inactive",
			unwritten: false,
			running: [],
			asking: tasks.filter(
				(t) => t.ownerAgentId === u.id && (t.need === "input" || t.need === "stuck"),
			).length,
			nextRun: null,
			now,
		});
	const shown = (plugins.data ?? []).filter((p) => forTeam(p, team?.id ?? ""));
	const yours = me.data?.user?.teams.some((t) => t.id === team?.id) ?? false;

	return (
		<section className="detail">
			<header className="detail-head">
				<span className="chip chip--quiet">Team</span>
				<span className="doc-state">Its people and agents</span>
			</header>
			<div className="detail-scroll">
				<article className="tk-page">
					<div className="tk-main">
						<h1 className="page-title">{name}</h1>
						<p className="stand">
							<span>{countWords(crews.length, agents)}.</span>
						</p>
						<p>
							A team can be a product team, a function such as sales, or a group across functions.
							Its conversations and knowledge are open to everyone; its work is what Work shows when
							you pick it.
						</p>

						{crews.map(({ person, agents: theirs }) => (
							<section
								key={person.id}
								className="crew"
								aria-label={`${person.id === you ? "You" : person.name} and their agents`}
							>
								<PersonRow u={person} you={you} />
								{theirs.length > 0 && (
									<div className="crew-agents">
										{theirs.map((a) => (
											<Row key={a.id} u={a} stand={stand(a)} />
										))}
									</div>
								)}
							</section>
						))}
						{wholeTeam.length > 0 && (
							<section className="crew-team" aria-label="Works for the whole team">
								<h3>
									Also here <span>works for the whole team</span>
								</h3>
								<div className="crew-agents">
									{wholeTeam.map((a) => (
										<Row key={a.id} u={a} stand={stand(a)} />
									))}
								</div>
							</section>
						)}
						{everyTeam.length > 0 && (
							<section className="crew-team" aria-label="Works for every team">
								<h3>
									Also here <span>works for every team</span>
								</h3>
								<div className="crew-agents">
									{everyTeam.map((a) => (
										<Row key={a.id} u={a} stand={stand(a)} />
									))}
								</div>
							</section>
						)}

						<div className="crew-add">
							<button type="button" className="btn" onClick={() => setAdding(true)}>
								Add someone to {name}
							</button>
						</div>
					</div>

					<aside className="tbox" aria-label={`How ${name} is set up`}>
						<div className="tbox-head">
							<span className="tbox-name">{name}</span>
							<span className="tbox-state">Team</span>
						</div>
						<ul className="tbox-facts">
							<li>{countWords(crews.length, agents)}</li>
						</ul>
						<section className="tbox-sec">
							<h4>
								Plugins <span>ready-made agents and skills</span>
							</h4>
							{removed && (
								<p className="cm-receipt">
									{removed.name} is removed.{" "}
									<button
										type="button"
										onClick={async () => {
											await call("edit_plugin", { id: removed.id, state: "enabled" });
											navigate(".", { replace: true, state: null });
											plugins.reload();
											users.reload();
										}}
									>
										Undo
									</button>
								</p>
							)}
							{shown.length === 0 && <p className="tbox-none">No plugin yet.</p>}
							{shown.map((p) => (
								<button
									key={p.id}
									type="button"
									className="pair pair--go"
									onClick={() =>
										navigate(
											`/plugins/${encodeURIComponent(p.id)}?team=${encodeURIComponent(name)}`,
										)
									}
								>
									<span className="pair-what">{pluginName(p.name)}</span>
									<span className="pair-why">{pluginLine(p)}</span>
								</button>
							))}
							<button type="button" className="tbox-more" onClick={() => setAddingPlugin(true)}>
								Add a plugin
							</button>
						</section>
					</aside>
				</article>
				{adding && (
					<AddSomeone
						team={name}
						you={you}
						yours={yours}
						users={everyone}
						onClose={() => setAdding(false)}
					/>
				)}
				{addingPlugin && (
					<AddPluginDialog
						teams={teamsOf([...everyone])}
						team={name}
						onClose={() => setAddingPlugin(false)}
						onAdded={(id, forTeam) =>
							navigate(`/plugins/${encodeURIComponent(id)}?team=${encodeURIComponent(forTeam)}`)
						}
					/>
				)}
			</div>
		</section>
	);
}

/** Adding an agent: made in a dialog, then its page, where its instructions are written next. */
function AddSomeone({
	team,
	you,
	yours,
	users,
	onClose,
}: {
	team: string;
	you: string;
	/** You are in this team, so an agent of yours can join it. */
	yours: boolean;
	users: readonly UserRow[];
	onClose: () => void;
}) {
	const navigate = useNavigate();
	const docs = useAction("search_documents", { inTree: true });
	return (
		<UserDialog
			disciplines={disciplinesOf(users, docs.data ?? [])}
			owners={yours ? ["You", team] : [team]}
			onClose={onClose}
			onSave={async (v) => {
				const made = await call("edit_user", {
					kind: "ai",
					name: v.name,
					what: v.what || null,
					...(v.discipline ? { discipline: v.discipline } : {}),
					teams: [team],
					...(v.worksFor === "You" ? { ownerUserId: you } : {}),
					identity: "",
				});
				if (!made.ok) return problemOf(made);
				navigate(`/people/${made.data.user?.id ?? ""}`);
				return null;
			}}
		/>
	);
}

/* ---------- a user's page ---------- */

export function UserScreen({ id }: { id: string }): React.ReactElement {
	const me = useAction("open_user", {});
	const you = me.data?.user?.id ?? "";
	const self = id === "me" || id === you;
	const view = useAction(
		"open_user",
		self ? {} : { id },
		you ? ["users", `user:${you}`] : ["users"],
	);
	if (view.problems && !view.data)
		return (
			<section className="detail">
				<header className="detail-head">
					<span className="chip chip--quiet">Person</span>
				</header>
				<div className="detail-scroll">
					<Failed what="This page" why={view.problems[0]?.message} onRetry={view.reload} />
				</div>
			</section>
		);
	if (!(view.data?.user && me.data?.user)) return <section className="detail" />;
	return (
		<UserPage
			key={view.data.user.id}
			view={view.data}
			me={me.data}
			reload={() => {
				view.reload();
				me.reload();
			}}
		/>
	);
}

function UserPage({ view, me, reload }: { view: UserView; me: UserView; reload: () => void }) {
	const navigate = useNavigate();
	const now = useNow();
	const [search, setSearch] = useSearchParams();
	const u = view.user as UserRow;
	const you = me.user?.id ?? "";
	const isMe = u.id === you;
	const agent = u.kind === "ai";
	const mine = isMe || (agent && (u.ownerUserId === you || u.ownerUserId === null));
	const paused = u.status === "inactive";

	const users = useAction("search_users", {}, ["users"]).data ?? NO_USERS;
	const tasks = useTasks();
	const threads = useAction("search_threads", { member: u.id }, ["conversations"]);
	const myThreads = useAction("search_threads", {}, ["conversations"]);
	const plugins = useAction("search_plugins", {});
	const ownDocs = useAction("search_documents", { scopeKind: "user" }, ["documents"]);
	const promptIds = view.subscriptions.flatMap((s) => (s.documentId ? [s.documentId] : []));
	const fileIds = [...view.documentIds.map((d) => d.id), ...promptIds];
	const files = useAction("search_documents", { ids: fileIds }, ["documents"]);
	const tree = useAction("search_documents", { inTree: true });
	const [dialog, setDialog] = useState<DialogId | null>(null);
	// A dialog asked for from elsewhere: the bell's "Change what you are told about" (start).
	const asked = search.get("open");
	const askedFor: DialogId | null = asked === "start" && isMe ? "start" : null;
	useEffect(() => {
		if (askedFor) setDialog(askedFor);
	}, [askedFor]);
	const [showDone, setShowDone] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	const [looks, setLooks] = useLooks();

	// Desktop only: query whether the local runner holds this agent.
	const hasRunner = window.__HYPERIDLE__?.runner !== undefined;
	const [runnerState, setRunnerState] = useState<{ held: boolean; movedAway: boolean } | null>(
		null,
	);
	useEffect(() => {
		if (!(hasRunner && agent)) return;
		void window.__HYPERIDLE__?.runner?.state(u.id).then((s) => setRunnerState(s));
	}, [hasRunner, agent, u.id]);
	const runnerBtn =
		mine && agent && hasRunner && runnerState !== null
			? runnerButtonState({
					hasRunner: true,
					held: runnerState.held,
					movedAway: runnerState.movedAway,
				})
			: null;

	const byId = new Map(users.map((x) => [x.id, x]));
	const firstNames = new Map(users.map((x) => [x.id, x.name.split(" ")[0] ?? x.name]));
	const nameOf = (uid: string) => (uid === you ? "you" : (byId.get(uid)?.name ?? "someone"));
	const docById = new Map<string, DocumentRow>((files.data ?? []).map((d) => [d.id, d]));
	const titles = new Map((files.data ?? []).map((d) => [d.id, d.title]));
	const file = view.documentIds.find((d) => d.slot === "agent_file");
	const fileDoc = file ? docById.get(file.id) : undefined;
	const unwritten = agent && files.data !== null && !fileDoc?.body.trim();
	const owner = u.ownerUserId ? byId.get(u.ownerUserId) : undefined;
	const home = u.teams[0] ?? null;
	const close = () => {
		setDialog(null);
		if (search.has("open")) setSearch({}, { replace: true });
	};
	const after = (result: { ok: boolean; problems?: readonly { message: string }[] }) => {
		reload();
		return problemOf(result);
	};

	// What the page lists.
	const jobs = agentJobs(tasks, u.id, initials(u.name), now);
	const done = tasks.filter(
		(t) =>
			t.ownerAgentId === u.id &&
			t.state === "done" &&
			t.completedAt !== null &&
			new Date(t.completedAt).toDateString() === new Date(now).toDateString(),
	);
	const waiting = waitingJobs(threads.data ?? [], now);
	const started = startedJobs(
		tasks,
		u.id,
		firstNames,
		(x) => initials(byId.get(x)?.name ?? ""),
		now,
		new Set((myThreads.data ?? []).filter((t) => t.initiatorId === u.id).map((t) => t.id)),
	);
	const next = view.subscriptions
		.filter((s) => s.nextRunAt && !s.paused)
		.sort((a, b) => (a.nextRunAt ?? "").localeCompare(b.nextRunAt ?? ""))[0];
	const stand = agent
		? agentStand({
				paused,
				unwritten,
				running: [],
				asking: tasks.filter(
					(t) => t.ownerAgentId === u.id && (t.need === "input" || t.need === "stuck"),
				).length,
				nextRun:
					next?.nextRunAt && next.documentId
						? { title: titles.get(next.documentId) ?? "", when: reasonWords(next) }
						: null,
				now,
			})
		: personStand(waiting, isMe);

	// The conversation between you and them: one you are both in, and nobody else.
	const direct = (myThreads.data ?? []).find(
		(t) =>
			(t.hostKind === "user" || t.hostKind === "agent") &&
			t.members.length === 2 &&
			t.members.includes(you) &&
			t.members.includes(u.id),
	);
	const talk = async () => {
		if (direct) return navigate(`/conversations/${direct.id}`);
		const made = await call("adjust_thread", { members: [you, u.id] });
		if (!made.ok) return setProblem(problemOf(made));
		navigate(`/conversations/${made.data.thread.id}`);
	};
	const pause = async () =>
		setProblem(
			await after(await call("edit_user", { id: u.id, status: paused ? "active" : "inactive" })),
		);
	const openFile = async () => {
		if (file) return navigate(docHref(file.id, !fileDoc?.body.trim()));
		const made = await call("edit_user", { id: u.id, identity: "" });
		const madeFile = made.ok
			? made.data.documentIds.find((d) => d.slot === "agent_file")
			: undefined;
		if (!madeFile) return setProblem(problemOf(made) ?? "Its document was not made.");
		navigate(docHref(madeFile.id, true));
	};

	// Facts.
	const plugin = (plugins.data ?? []).find(
		(p) =>
			p.state !== "available" &&
			p.contributions.some((c) => c.kind === "agent" && c.entityId === u.id),
	);
	const facts = [
		agent
			? `Agent · works for ${owner ? nameOf(owner.id) : home ? `the ${home.name} team` : "everyone in the organisation"}`
			: isMe
				? "Person · you"
				: "Person",
		agent
			? home
				? `Team ${home.name}`
				: "In every team"
			: u.teams.length > 0
				? `${u.teams.length === 1 ? "Team" : "Teams"} ${joinWords(u.teams.map((t) => t.name))}`
				: "In no team yet",
		`Here since ${sinceWords(u.createdAt)}`,
	];

	// The box's lists.
	const reasons = startRows(u.name, view.subscriptions, titles);
	const told = view.subscriptions.filter((s) => s.objectId === null && s.event !== null);
	const toldRows = [...told].sort(
		(a, b) =>
			Number(!(PERSON_REASONS as readonly string[]).includes(a.event ?? "")) -
				Number(!(PERSON_REASONS as readonly string[]).includes(b.event ?? "")) ||
			reasonWords(a).localeCompare(reasonWords(b)),
	);
	const follows = view.subscriptions.filter((s) => s.objectId !== null);
	const followWords = joinWords(
		(
			[
				["document", "document"],
				["task", "task"],
				["thread", "conversation"],
			] as const
		)
			.map(
				([kind, word]) =>
					[follows.filter((s) => s.event?.startsWith(`${kind}.`)).length, word] as const,
			)
			.filter(([n]) => n > 0)
			.map(([n, word]) => `${n} ${word}${n === 1 ? "" : "s"}`),
	);
	const skills = (ownDocs.data ?? []).filter((d) => d.scopeId === u.id && d.slot === "skill");
	const memory = (ownDocs.data ?? []).filter(
		(d) => d.scopeId === u.id && d.slot === "ordinary" && d.parentKind === null,
	);
	const editedWords = (d: DocumentRow | undefined) =>
		d
			? `${nameOf(d.updatedBy) === "you" ? "you" : nameOf(d.updatedBy)} edited it ${age(d.updatedAt, now) === "now" ? "just now" : forWords(d.updatedAt, now)} ago`
			: "";
	const selfRows: (Pair & { href?: string })[] = agent
		? [
				{
					what: "Instructions",
					why: unwritten
						? "Not written yet"
						: `Who ${u.name} is and how it works · ${editedWords(fileDoc)}`,
					...(file ? { href: docHref(file.id, unwritten) } : {}),
				},
				...skills.map((d) => ({ what: `Skill · ${d.title}`, why: "", href: docHref(d.id) })),
				...(memory.length > 0
					? [
							{
								what: `Memory · ${memory.length} ${memory.length === 1 ? "note" : "notes"}`,
								why: `Only ${owner ? `${nameOf(owner.id)} and ${u.name}` : `${u.name} and the people it works for`} can read these`,
							},
						]
					: []),
			]
		: fileDoc
			? [
					{
						what: isMe ? "About you" : `About ${u.name.split(" ")[0]}`,
						why: `What agents should know when they work with ${isMe ? "you" : "them"}`,
						href: docHref(fileDoc.id),
					},
				]
			: [];
	const app = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)
		? { what: "Lives on this computer", why: "only the people on it see this work" }
		: {
				what: "Lives on a shared server",
				why: `${window.location.host} · everyone sees the same work`,
			};

	const subject = { name: u.name, agent, me: isMe };

	return (
		<section className="detail">
			<header className="detail-head">
				<span className="chip chip--quiet">{agent ? "Agent" : "Person"}</span>
				<span className="doc-state">{u.what}</span>
			</header>
			<div className="detail-scroll">
				<article className="tk-page">
					<div className="tk-main">
						<nav className="crumbs" aria-label="Where you are">
							{home && (
								<button
									type="button"
									onClick={() => navigate(`/teams/${encodeURIComponent(home.name)}`)}
								>
									{home.name}
								</button>
							)}
							{owner && (
								<button type="button" onClick={() => navigate(`/people/${owner.id}`)}>
									{owner.id === you ? "You" : owner.name}
								</button>
							)}
							<span aria-current="true">{isMe ? "You" : u.name}</span>
						</nav>
						<h1 className="page-title who-title">
							<Avatar who={initials(u.name)} human={!agent} />
							{u.name}
						</h1>
						<p className="stand">
							<span>{stand}</span>
						</p>
						{unwritten && mine && (
							<div className="hint">
								<span>
									{u.name} has no instructions yet. They are a document: who it is and how it should
									work.
								</span>
								<span className="hint-acts">
									<button type="button" className="btn btn--accent" onClick={() => void openFile()}>
										Write its instructions
									</button>
								</span>
							</div>
						)}

						{agent ? (
							<>
								<h3>
									On now <span>{jobs.on.length}</span>
								</h3>
								{jobs.on.length === 0 && (
									<p className="tbox-none">
										Nothing yet. Hand it a task, or mention @{u.name} in a thread.
									</p>
								)}
								<Jobs items={jobs.on} />
								{jobs.doneToday > 0 && (
									<button
										type="button"
										className="tbox-more"
										onClick={() => setShowDone(!showDone)}
									>
										{jobs.doneToday} more, done today
									</button>
								)}
								{showDone && (
									<Jobs
										items={done.map((t) => ({
											id: t.id,
											title: t.title,
											words: `Done · ${forWords(t.completedAt ?? t.updatedAt, now)} ago`,
											mark: "done",
											href: `/work/${t.id}`,
										}))}
									/>
								)}
							</>
						) : (
							<>
								<h3>
									{isMe ? "Waiting for you" : `Waiting for ${u.name.split(" ")[0]}`}{" "}
									<span>{waiting.length}</span>
								</h3>
								{waiting.length === 0 && <p className="tbox-none">Nothing waits here.</p>}
								<Jobs items={waiting} />
								<h3>
									{isMe ? "Started by you" : `Started by ${u.name.split(" ")[0]}`}{" "}
									<span>{started.length}</span>
								</h3>
								{started.length === 0 && (
									<p className="tbox-none">
										Nothing under way that {isMe ? "you" : "they"} started.
									</p>
								)}
								<Jobs items={started} />
							</>
						)}
					</div>

					<aside className="tbox" aria-label={`How ${u.name} is set up`}>
						<div className="tbox-head">
							<span className="tbox-name">{u.name}</span>
							<span className="tbox-state">
								{agent ? (paused ? "Paused" : "Idle") : isMe ? "You" : "Person"}
							</span>
						</div>
						{(mine || !isMe) && (
							<div className="tbox-acts">
								{!isMe && (
									<button type="button" className="btn btn--accent" onClick={() => void talk()}>
										Open conversation
									</button>
								)}
								{mine && (
									<button type="button" className="btn" onClick={() => setDialog("edit")}>
										Edit
									</button>
								)}
								{mine && agent && (
									<button type="button" className="btn" onClick={() => void pause()}>
										{paused ? "Let it work" : "Pause"}
									</button>
								)}
								{runnerBtn === "move-here" && (
									<button
										type="button"
										className="btn"
										onClick={() => {
											void window.__HYPERIDLE__?.runner?.moveHere(u.id).then(() => {
												void window.__HYPERIDLE__?.runner
													?.state(u.id)
													.then((s) => setRunnerState(s));
											});
										}}
									>
										Move here
									</button>
								)}
							</div>
						)}
						{runnerBtn === "moved-away" && (
							<p className="tbox-none">{u.name} now lives on another computer.</p>
						)}
						{problem && <p className="composer-problem">{problem}</p>}
						<ul className="tbox-facts">
							{facts.map((f) => (
								<li key={f}>{f}</li>
							))}
							{u.discipline && (
								<li>
									Discipline {u.discipline}
									{agent && ` · gets the documents marked ${u.discipline}`}
								</li>
							)}
							{plugin && (
								<li>
									<button
										type="button"
										className="tbox-link"
										onClick={() =>
											navigate(
												`/plugins/${encodeURIComponent(plugin.id)}${home ? `?team=${encodeURIComponent(home.name)}` : ""}`,
											)
										}
									>
										Came with the plugin {pluginName(plugin.name)}
									</button>
								</li>
							)}
							{direct && <li>You last talked {age(direct.lastActiveAt, now)}</li>}
						</ul>

						{agent && (
							<Section
								title="Starts working when"
								items={reasons.filter((r) => !r.paused)}
								none="Only when someone hands it a task or names it in a thread."
								add={mine ? "Add a time or an event" : undefined}
								onAdd={() => setDialog("start")}
							/>
						)}
						{isMe && (
							<section className="tbox-sec">
								<h4>
									Notifications <span>tell me when</span>
								</h4>
								{toldRows.map((s) => (
									<button
										key={s.id}
										type="button"
										className="fact-switch"
										role="switch"
										aria-checked={!s.paused}
										onClick={() =>
											void call("edit_user", {
												id: you,
												subscriptions: { change: [{ id: s.id, paused: !s.paused }] },
											}).then(after)
										}
									>
										<span className="fact-knob" />
										{reasonWords(s)}
									</button>
								))}
								<button type="button" className="tbox-more" onClick={() => setDialog("start")}>
									Change what you are told about
								</button>
								<p className="pair-why">
									{followWords ? `You follow ${followWords}. ` : ""}You follow a task or a document
									from its own page.
								</p>
							</section>
						)}
						<Section
							title={agent ? "Instructions, skills and memory" : "About"}
							items={selfRows}
							none={isMe ? undefined : "Nothing written yet."}
							add={
								!agent && isMe && !fileDoc ? "Write what agents should know about you" : undefined
							}
							onAdd={() => void openFile()}
						/>
						{isMe && <Section title="This app" items={[app]} />}
						{isMe && (
							<section className="tbox-sec">
								<h4>Looks</h4>
								<div className="chips">
									{LOOKS.map((l) => (
										<button
											key={l}
											type="button"
											aria-pressed={looks === l}
											onClick={() => setLooks(l)}
										>
											{l}
										</button>
									))}
								</div>
							</section>
						)}
					</aside>
				</article>
			</div>

			{dialog === "start" && (
				<StartDialog
					who={subject}
					rows={
						agent
							? reasons
							: toldRows.map((s) => ({ id: s.id, what: reasonWords(s), why: "", paused: s.paused }))
					}
					onClose={close}
					onSave={async (save) => {
						const before = new Set(view.subscriptions.map((s) => s.id));
						const add = [
							...save.times.map((schedule) => ({ schedule, prompt: "", title: save.name })),
							...save.events.map((event: SubscriptionEventName) =>
								agent ? { event, prompt: "", title: save.name } : { event },
							),
						];
						const change = [...save.paused].map(([sid, p]) => ({ id: sid, paused: p }));
						const r = await call("edit_user", { id: u.id, subscriptions: { add, change } });
						if (!r.ok) return after(r);
						reload();
						close();
						const made = r.data.subscriptions.find((s) => !before.has(s.id) && s.documentId);
						if (agent && made?.documentId) navigate(docHref(made.documentId, true));
						return null;
					}}
				/>
			)}
			{dialog === "edit" && (
				<UserDialog
					user={{
						name: u.name,
						agent,
						me: isMe,
						what: u.what ?? "",
						discipline: u.discipline ?? "",
						worksFor: owner
							? owner.id === you
								? "You"
								: owner.name
							: home
								? `The ${home.name} team`
								: "Every team",
						file: fileDoc
							? {
									title: fileDoc.title,
									edited: `${editedWords(fileDoc).replace(/^./, (c) => c.toUpperCase())}.`,
								}
							: null,
					}}
					disciplines={disciplinesOf(users, tree.data ?? [])}
					owners={[]}
					onClose={close}
					onFile={() => void openFile()}
					onSave={async (v) => {
						const r = await call("edit_user", {
							id: u.id,
							...(v.name !== u.name ? { name: v.name } : {}),
							what: v.what || null,
							discipline: v.discipline || null,
						});
						if (!r.ok) return after(r);
						reload();
						close();
						return null;
					}}
				/>
			)}
		</section>
	);
}
