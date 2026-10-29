import type {
	DocumentRow,
	PluginListing,
	SessionRow,
	SubscriptionEventName,
	Task,
	ThreadListRow,
	UserRow,
	UserView,
} from "@hyperidle/domain-model";
import { PERSON_REASONS } from "@hyperidle/domain-model";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { call, type InputOf } from "./api";
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
	folderMay,
	folderPath,
	folderTrouble,
	forWords,
	givenTo,
	type Job,
	joinWords,
	type Pair,
	personStand,
	pluginName,
	programWords,
	reasonWords,
	serviceHow,
	sinceWords,
	startedJobs,
	startRows,
	waitingJobs,
} from "./people-page";
import { pluginLine } from "./plugin-page";
import { ReachDialog, type ReachRow, StartDialog, UserDialog } from "./Setup";
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

type DialogId = "folder" | "service" | "start" | "edit";
const NO_USERS: readonly UserRow[] = [];
const NO_SESSIONS: readonly SessionRow[] = [];
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

/** Running sessions, for every stand on the page. */
function useRunning(): readonly SessionRow[] {
	return (
		useAction("search_sessions", { state: "active", limit: 500 }, ["tasks"]).data ?? NO_SESSIONS
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

/** What a running session works on: its task, else the conversation that started it. */
function workingOn(
	s: SessionRow,
	tasks: ReadonlyMap<string, string>,
	threads: ReadonlyMap<string, string>,
): string {
	return tasks.get(s.taskId ?? "") ?? threads.get(s.threadId ?? "") ?? "a conversation";
}

const NO_THREADS: readonly ThreadListRow[] = [];
/** Every conversation's title by id, to name what a running session answers. */
function useThreadTitles(): ReadonlyMap<string, string> {
	const threads = useAction("search_threads", {}, ["conversations"]).data ?? NO_THREADS;
	return new Map(threads.map((t) => [t.id, t.computedTitle]));
}

function agentRowStand(
	u: UserRow,
	tasks: readonly Task[],
	running: readonly SessionRow[],
	threadTitles: ReadonlyMap<string, string>,
	now: number,
): string {
	const titles = new Map(tasks.map((t) => [t.id, t.title]));
	return agentStand({
		paused: u.status === "inactive",
		unwritten: false,
		running: running
			.filter((s) => s.agentId === u.id && s.endedAt === null)
			.map((s) => ({
				title: workingOn(s, titles, threadTitles),
				startedAt: s.startedAt,
			})),
		asking: tasks.filter(
			(t) => t.ownerAgentId === u.id && (t.need === "input" || t.need === "stuck"),
		).length,
		nextRun: null,
		now,
	});
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
	const running = useRunning();
	const threadTitles = useThreadTitles();
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
	const stand = (u: UserRow) => agentRowStand(u, tasks, running, threadTitles, now);
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
						programs={me.data?.runsOn ?? []}
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
	programs,
	onClose,
}: {
	team: string;
	you: string;
	/** You are in this team, so an agent of yours can join it. */
	yours: boolean;
	users: readonly UserRow[];
	programs: UserView["runsOn"];
	onClose: () => void;
}) {
	const navigate = useNavigate();
	const docs = useAction("search_documents", { inTree: true });
	return (
		<UserDialog
			programs={programs}
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
					...(v.harness
						? {
								runConfig: {
									harnessType: v.harness as NonNullable<
										InputOf<"edit_user">["runConfig"]
									>["harnessType"],
									...(v.model ? { modelId: v.model } : {}),
								},
							}
						: {}),
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

/** The open_user of each of these users, kept fresh with the people list. */
function useViews(ids: readonly string[]): ReadonlyMap<string, UserView> {
	const [views, setViews] = useState<ReadonlyMap<string, UserView>>(new Map());
	const key = ids.join(" ");
	const users = useAction("search_users", {}, ["users"]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `ids`; a new people list asks again
	useEffect(() => {
		let current = true;
		const list = key ? key.split(" ") : [];
		void Promise.all(list.map((id) => call("open_user", { id }))).then((all) => {
			if (!current) return;
			setViews(new Map(all.flatMap((r, i) => (r.ok ? [[list[i] ?? "", r.data] as const] : []))));
		});
		return () => {
			current = false;
		};
	}, [key, users.data]);
	return views;
}

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
	const running = useRunning();
	const threads = useAction("search_threads", { member: u.id }, ["conversations"]);
	const myThreads = useAction("search_threads", {}, ["conversations"]);
	const plugins = useAction("search_plugins", {});
	const ownDocs = useAction("search_documents", { scopeKind: "user" }, ["documents"]);
	const promptIds = view.subscriptions.flatMap((s) => (s.documentId ? [s.documentId] : []));
	const fileIds = [...view.documentIds.map((d) => d.id), ...promptIds];
	const files = useAction("search_documents", { ids: fileIds }, ["documents"]);
	const tree = useAction("search_documents", { inTree: true });
	const myAgents = users.filter(
		(a) => a.kind === "ai" && a.ownerUserId === you && a.status !== "retired",
	);
	const agentViews = useViews(isMe ? myAgents.map((a) => a.id) : []);
	const [dialog, setDialog] = useState<DialogId | null>(null);
	// A dialog asked for from elsewhere: the bell's "Change what you are told about" (start), and
	// the first conversation's "Connect a folder" and "Connect GitHub".
	const asked = search.get("open");
	const askedFor =
		isMe && (asked === "start" || asked === "folder" || asked === "service") ? asked : null;
	useEffect(() => {
		if (askedFor) setDialog(askedFor);
	}, [askedFor]);
	const [showDone, setShowDone] = useState(false);
	const [looked, setLooked] = useState<string | null>(null);
	const [problem, setProblem] = useState<string | null>(null);
	const [looks, setLooks] = useLooks();

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
	const mineRunning = running.filter((s) => s.agentId === u.id);
	const jobs = agentJobs(tasks, u.id, running, initials(u.name), now);
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
		running,
		now,
		new Set((myThreads.data ?? []).filter((t) => t.initiatorId === u.id).map((t) => t.id)),
	);
	const titlesOfTasks = new Map(tasks.map((t) => [t.id, t.title]));
	const next = view.subscriptions
		.filter((s) => s.nextRunAt && !s.paused)
		.sort((a, b) => (a.nextRunAt ?? "").localeCompare(b.nextRunAt ?? ""))[0];
	const stand = agent
		? agentStand({
				paused,
				unwritten,
				running: mineRunning.map((s) => ({
					title: workingOn(
						s,
						titlesOfTasks,
						new Map((myThreads.data ?? []).map((t) => [t.id, t.computedTitle])),
					),
					startedAt: s.startedAt,
				})),
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
	const program = view.runsOn.find((h) => h.type === view.runConfig?.harnessType);
	const model = program?.models.find((m) => m.id === view.runConfig?.modelId);
	const sessions = view.runConfig?.maxConcurrentSessions ?? 1;
	const runsOn: Pair[] = agent
		? [
				program
					? { what: program.name, why: `on this computer · ${programWords(program)}` }
					: { what: "No agent program set", why: "pick one in Edit" },
				{ what: "Model", why: model?.label ?? view.runConfig?.modelId ?? "the default" },
				{ what: `${sessions} ${sessions === 1 ? "session" : "sessions"} at a time`, why: "" },
			]
		: [];
	const folderGivenTo = (folderId: string) =>
		givenTo(
			myAgents
				.filter((a) => agentViews.get(a.id)?.folders.some((f) => f.id === folderId))
				.map((a) => a.name),
		);
	const worksIn: Pair[] = view.folders.map((f) => ({
		what: folderPath(f),
		why: [folderTrouble(f), isMe ? `given to ${folderGivenTo(f.id)}` : folderMay(f)]
			.filter(Boolean)
			.join(" · "),
	}));
	const held = view.connections?.connections ?? [];
	const inherited = view.connections?.inherited ?? [];
	const servicesGivenTo = (keptFrom: readonly string[]) =>
		givenTo(myAgents.filter((a) => !keptFrom.includes(a.id)).map((a) => a.name));
	const reach: Pair[] = [
		...held
			.filter((c) => !(agent && c.withheldFrom.includes(u.id)))
			.map((c) => ({
				what: c.service,
				why: isMe
					? `${serviceHow(c)} · given to ${servicesGivenTo(c.withheldFrom)}`
					: serviceHow(c),
			})),
		...inherited.map((c) => ({ what: c.service, why: serviceHow(c) })),
	];
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
	const agentTeam = home?.name;
	const folderRows: ReachRow[] = (
		agent ? me.folders.filter((f) => u.teams.some((t) => t.id === f.teamId)) : view.folders
	).map((f) => ({
		id: f.id,
		name: folderPath(f),
		how: `${f.kind === "code" ? "A git repository" : "A folder"} · ${folderMay(f)}`,
		given: view.folders.some((g) => g.id === f.id),
		givenTo: folderGivenTo(f.id),
	}));
	const serviceRows: ReachRow[] = [
		...held.map((c) => ({
			id: c.id,
			name: c.service,
			how: serviceHow(c),
			given: !c.withheldFrom.includes(u.id),
			givenTo: servicesGivenTo(c.withheldFrom),
		})),
		...inherited.map((c) => ({
			id: c.id,
			name: c.service,
			how: serviceHow(c),
			given: true,
			givenTo: "every agent",
			locked: true,
		})),
	];
	const ticked = (ticks: Map<string, boolean>, on: boolean) =>
		[...ticks].filter(([, given]) => given === on).map(([x]) => x);

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
								{agent
									? paused
										? "Paused"
										: mineRunning.length > 0
											? "Working"
											: "Idle"
									: isMe
										? "You"
										: "Person"}
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
							</div>
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

						{agent && <Section title="Runs on" items={runsOn} />}
						<Section
							title="Works in"
							items={worksIn}
							none={
								agent
									? "No folder. It works inside HyperIdle and with what it can reach."
									: "No folder yet."
							}
							add={mine && (isMe || agentTeam) ? "Add a folder" : undefined}
							onAdd={() => setDialog("folder")}
						/>
						{view.connections && (
							<Section
								title="Can reach"
								items={reach}
								first={5}
								none="No service yet."
								add={mine ? "Connect a service" : undefined}
								onAdd={() => setDialog("service")}
							/>
						)}
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
								<h4>
									Agent programs <span>on this computer</span>
								</h4>
								{view.runsOn.length === 0 && <p className="tbox-none">None found.</p>}
								{view.runsOn.map((h) => (
									<div
										key={h.type}
										className={h.discovery.state === "ready" ? "pair" : "pair pair--off"}
									>
										<span className="pair-what">{h.name}</span>
										<span className="pair-why">
											{programWords(h)}
											{h.discovery.version ? ` · ${h.discovery.version}` : ""}
											{agentsOn(h.type, myAgents, agentViews)}
										</span>
									</div>
								))}
								<p className="pair-why">
									Each one signs in on its own. Install or sign in to one, then look again.
								</p>
								<button
									type="button"
									className="tbox-more"
									onClick={() => {
										setLooked("Looking…");
										const before = view.runsOn.filter((h) => h.discovery.state === "ready").length;
										void call("edit_user", { id: you, redetectHarnesses: true }).then((r) => {
											const found = r.ok
												? r.data.runsOn.filter((h) => h.discovery.state === "ready").length
												: before;
											setLooked(
												found > before
													? `Looked just now · ${found - before} more signed in`
													: "Looked just now · nothing new",
											);
											reload();
										});
									}}
								>
									{looked ?? "Look again"}
								</button>
							</section>
						)}
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

			{dialog === "folder" && (
				<ReachDialog
					who={subject}
					kind="folder"
					rows={folderRows}
					yourAgents={myAgents}
					teams={me.user?.teams.map((t) => t.name) ?? []}
					onClose={close}
					onSave={async (save) => {
						if (agent && save.ticks.size > 0) {
							const r = await call("edit_user", {
								id: u.id,
								folders: { give: ticked(save.ticks, true), take: ticked(save.ticks, false) },
							});
							if (!r.ok) return after(r);
						}
						if (save.added?.kind === "folder") {
							const before = new Set(me.folders.map((f) => f.id));
							const r = await call("edit_user", {
								id: you,
								folders: {
									add: [
										{
											team: agent ? agentTeam : save.added.team,
											kind: "code",
											resourceRef: { kind: "code", repo: save.added.where, branch: "main" },
											writeback: save.added.readOnly ? "none" : "git",
										},
									],
								},
							});
							if (!r.ok) return after(r);
							const made = r.data.folders.find((f) => !before.has(f.id));
							for (const agentId of save.keepFrom)
								if (made) await call("edit_user", { id: agentId, folders: { take: [made.id] } });
						}
						reload();
						close();
						return null;
					}}
				/>
			)}
			{dialog === "service" && (
				<ReachDialog
					who={subject}
					kind="service"
					rows={serviceRows}
					yourAgents={myAgents}
					teams={[]}
					onClose={close}
					onSave={async (save) => {
						if (agent && save.ticks.size > 0) {
							const r = await call("edit_user", {
								id: u.id,
								connections: { give: ticked(save.ticks, true), take: ticked(save.ticks, false) },
							});
							if (!r.ok) return after(r);
						}
						if (save.added?.kind === "service") {
							const before = new Set((me.connections?.connections ?? []).map((c) => c.id));
							const r = await call("edit_user", {
								id: you,
								connections: {
									add: [
										save.added.key
											? { service: save.added.name, authSource: "token", token: save.added.key }
											: {
													...(save.added.name ? { service: save.added.name } : {}),
													authSource: "mcp",
													serverUrl: save.added.address ?? "",
												},
									],
								},
							});
							if (!r.ok) return after(r);
							const made = r.data.connections?.connections.find((c) => !before.has(c.id));
							for (const agentId of save.keepFrom)
								if (made)
									await call("edit_user", { id: agentId, connections: { take: [made.id] } });
						}
						reload();
						close();
						return null;
					}}
				/>
			)}
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
						harness: view.runConfig?.harnessType ?? null,
						model: view.runConfig?.modelId ?? null,
						sessions,
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
					programs={view.runsOn}
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
							...(agent
								? {
										runConfig: {
											...(v.harness
												? {
														harnessType: v.harness as NonNullable<
															InputOf<"edit_user">["runConfig"]
														>["harnessType"],
													}
												: {}),
											...(v.model ? { modelId: v.model } : {}),
											maxConcurrentSessions: v.sessions,
										},
									}
								: {}),
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

/** Which of your agents run on a program, as the end of its line. */
function agentsOn(
	type: string,
	agents: readonly UserRow[],
	views: ReadonlyMap<string, UserView>,
): string {
	const on = agents
		.filter((a) => views.get(a.id)?.runConfig?.harnessType === type)
		.map((a) => a.name);
	return on.length > 0 ? ` · ${joinWords(on)} ${on.length === 1 ? "runs" : "run"} on it` : "";
}
