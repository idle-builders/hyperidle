import type {
	DocumentRow,
	Message,
	QuestionnairePayload,
	ReviewPayload,
	SessionRow,
	Task,
	TaskNode,
	TaskView,
} from "@hyperidle/domain-model";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { call, type InputOf } from "./api";
import { Composer } from "./Composer";
import { type Close, Closes, type Reason, Reasons } from "./Loop";
import { Event, Msg } from "./Msg";
import { type Need, NeedIcon } from "./NeedIcon";
import { initials } from "./sidebar-lists";
import { Body, type People, peopleOf, resolvingOf, stepWords, useNow } from "./Thread";
import {
	ago,
	cameFrom,
	chipWords,
	closing,
	finished,
	headWords,
	indexTree,
	needsBelow,
	rootNode,
	standLine,
	type Tree,
	tally,
	waitsFor,
} from "./task-page";
import { clock, duration, timeline } from "./thread-timeline";
import { useAction } from "./useAction";

/**
 * RUN THE SHIFT — the task page. Planning happens before, in documents and conversations;
 * checking happens after, in reviews. This page is the middle: watching the work move through
 * its tree. The page itself holds only the title, the details and the conversation. The tree is
 * a section of it, drawn as a graph that follows where you are. The whole task shows its parts
 * and their subtasks at once; a picked part shows the level above it, the part among its
 * siblings, and its subtasks — three levels at most, at any depth. The picked part is in the
 * address, so back, forward and reload keep it. Dashed arrows show what waits for what, and a
 * long row of finished parts folds into one chip, so the graph never needs a scroll area.
 * Everything attached sits in one box floating on the right: quick actions, facts, then
 * questions, reviews and documents in sections of their own, then sessions. A small task has no
 * graph; a recurring task has one part per run.
 */

/** A question or review still open somewhere in the tree, with the part whose thread holds it. */
interface Ask {
	readonly task: string;
	readonly message: Message;
}

/** A row in the box: a question, review or document. `on` names the part it hangs on, when not this one. */
interface Thing {
	readonly key: string;
	readonly kind: "Question" | "Review" | "Document";
	readonly title: string;
	readonly why: string;
	readonly on?: string;
	readonly needs?: Need;
	readonly open: () => void;
}

const NO_SESSIONS: readonly SessionRow[] = [];

/** A review hangs on the task it names; one that names none hangs on its thread's task. */
function reviewIsFor(m: Message, taskId: string): boolean {
	return m.type === "review" && ((m.payload as ReviewPayload).taskId ?? taskId) === taskId;
}

/** What hangs around the tree: live sessions, documents, open questions and reviews. Asked again whenever the tree changes. */
function useAround(view: TaskView) {
	const [running, setRunning] = useState<ReadonlySet<string>>(new Set());
	const [docs, setDocs] = useState<readonly DocumentRow[]>([]);
	const [asks, setAsks] = useState<readonly Ask[]>([]);
	useEffect(() => {
		let current = true;
		const tree = indexTree(rootNode(view));
		const ids = [...tree.byId.keys()];
		const needy = [...tree.byId.values()].filter((n) => n.need !== null);
		void Promise.all([
			call("search_sessions", { state: "active", limit: 500 }),
			call("search_documents", { parent: { kind: "task", ids }, limit: 500 }),
			Promise.all(
				needy.map(async (n) => {
					const thread = await call("open_thread", { id: n.threadId });
					if (!thread.ok) return [];
					return thread.data.messages
						.filter(
							(m) =>
								m.resolvedAt === null &&
								m.deletedAt === null &&
								(m.type === "questionnaire" || reviewIsFor(m, n.id)),
						)
						.map((message): Ask => ({ task: n.id, message }));
				}),
			),
		]).then(([sessions, found, open]) => {
			if (!current) return;
			setRunning(
				new Set(sessions.ok ? sessions.data.flatMap((s) => (s.taskId ? [s.taskId] : [])) : []),
			);
			setDocs(found.ok ? found.data : []);
			setAsks(open.flat());
		});
		return () => {
			current = false;
		};
	}, [view]);
	return { running, docs, asks };
}

/** The address names the task; a part of it is `?part=`. A part's own address leads to its task. */
export function Shift({ id }: { id: string }) {
	const navigate = useNavigate();
	const [search, setSearch] = useSearchParams();
	const view = useAction("open_task", { id }, [`task:${id}`]);
	const top = view.data?.ancestors[0]?.id;
	useEffect(() => {
		if (top) navigate(`/work/${top}?part=${id}`, { replace: true });
	}, [top, id, navigate]);

	if (view.problems)
		return (
			<section className="detail">
				<header className="detail-head">
					<span className="chip chip--quiet">Task</span>
				</header>
				<div className="detail-scroll">
					<p className="opened-note">{view.problems[0]?.message ?? "This task did not load."}</p>
				</div>
			</section>
		);
	if (!view.data || top) return <section className="detail" />;
	const part = search.get("part");
	return (
		<TaskScreen
			view={view.data}
			reload={view.reload}
			part={part}
			onPick={(pick) => setSearch(pick === id ? {} : { part: pick })}
		/>
	);
}

function TaskScreen({
	view,
	reload,
	part,
	onPick,
}: {
	view: TaskView;
	reload: () => void;
	part: string | null;
	onPick: (id: string) => void;
}) {
	const tree = indexTree(rootNode(view));
	const root = tree.root;
	const sel = (part && tree.byId.get(part)) || root;
	const around = useAround(view);
	const users = useAction("search_users", {});
	const me = useAction("open_user", {});
	const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set());
	const [focus, setFocus] = useState<string | null>(null);
	const [problem, setProblem] = useState<string | null>(null);

	const people = peopleOf(users.data ?? []);
	const you = me.data?.user?.id ?? "";
	const owner = (t: Task) =>
		t.ownerAgentId ? (people.get(t.ownerAgentId)?.name.split(" ")[0] ?? "") : "Nobody";
	const pick = (id: string) => {
		setFocus(null);
		onPick(id);
	};

	const path = pathTo(tree, sel.id);
	// Three levels at most: the level above the picked part, its own, and its subtasks.
	const open = new Set(
		sel === root ? root.children.filter((k) => k.children.length > 0).map((k) => k.id) : [],
	);
	const deepest =
		depthOf(tree, sel.id) + (sel.children.length > 0 ? 1 : 0) + (open.size > 0 ? 1 : 0);
	const first = Math.max(1, deepest - 2);
	const from = [root.id, ...path, sel.id].find((id) => depthOf(tree, id) === first - 1) ?? root.id;
	const graph: View = {
		tree,
		sel: sel.id,
		path: new Set(path),
		open,
		unfolded,
		running: around.running,
		owner,
		docs: around.docs,
		asks: around.asks,
		onPick: pick,
		onUnfold: (id) =>
			setUnfolded((u) => {
				const next = new Set(u);
				if (next.has(id)) next.delete(id);
				else next.add(id);
				return next;
			}),
	};

	const edit = async (input: Omit<InputOf<"edit_task">, "id">) => {
		const done = await call("edit_task", { id: sel.id, ...input });
		setProblem(done.ok ? null : (done.problems[0]?.message ?? "That did not work."));
		reload();
	};
	const following = me.data?.subscriptions.find(
		(s) => s.objectId === sel.id && s.event === "task.changed",
	);
	const follow = async () => {
		const done = await call("edit_user", {
			id: you,
			subscriptions: following
				? { remove: [following.id] }
				: { add: [{ event: "task.changed", objectId: sel.id }] },
		});
		setProblem(done.ok ? null : (done.problems[0]?.message ?? "That did not work."));
		me.reload();
	};

	return (
		<section className="detail">
			<header className="detail-head">
				<span className="chip chip--quiet">Task</span>
				<span className="doc-state">{headWords(tree, root, around.running)}</span>
			</header>

			<div className="detail-scroll">
				<article className="tk-page">
					<div className="tk-main">
						<h1 className="page-title">{root.title}</h1>
						<Stand tree={tree} n={root} running={around.running} owner={owner} />
						{root.description && <p>{root.description}</p>}

						{root.children.length > 0 && (
							<section className="tk-map" aria-label="Parts of this task">
								<h3>
									Parts <span>{tally(tree, root, around.running)}</span>
								</h3>
								{sel !== root && (
									<nav className="crumbs" aria-label="Where you are in this task">
										<button type="button" onClick={() => pick(root.id)}>
											The whole task
										</button>
										{path.map((id) => (
											<button key={id} type="button" onClick={() => pick(id)}>
												{tree.byId.get(id)?.title}
											</button>
										))}
										<span aria-current="true">{sel.title}</span>
									</nav>
								)}
								<Graph from={from} columns={deepest - first + 1} view={graph} />
							</section>
						)}

						<div className={sel === root ? "tk-part" : "tk-part tk-part--sub"} key={sel.id}>
							{sel !== root && (
								<>
									<h2 className="tk-part-title">{sel.title}</h2>
									<Stand tree={tree} n={sel} running={around.running} owner={owner} />
									{sel.description && <p>{sel.description}</p>}
								</>
							)}
							{sel.reasons.length > 0 && <Reasons items={sel.reasons.map(toReason)} />}
							{sel.doneWhen.length > 0 && <Closes items={sel.doneWhen.map(toClose)} />}
							<Summary n={sel} owner={owner(sel)} />
							<Conversation task={sel} owner={owner(sel)} you={you} people={people} focus={focus} />
						</div>
					</div>

					<TaskBox
						key={sel.id}
						tree={tree}
						n={sel}
						running={around.running}
						owner={owner}
						people={people}
						you={you}
						asks={around.asks}
						docs={around.docs}
						following={me.data ? Boolean(following) : null}
						problem={problem}
						onFollow={() => void follow()}
						onEdit={(input) => void edit(input)}
						onPick={pick}
						onAsk={(task, message) => {
							onPick(task);
							setFocus(message);
						}}
					/>
				</article>
			</div>
		</section>
	);
}

function Stand({
	tree,
	n,
	running,
	owner,
}: {
	tree: Tree;
	n: TaskNode;
	running: ReadonlySet<string>;
	owner: (t: Task) => string;
}) {
	const need = n.paused || finished(n) || n.children.length > 0 ? undefined : iconOf(n.need);
	return (
		<p className="stand">
			{need && <NeedIcon kind={need} />}
			<span>{standLine(tree, n, running, owner)}</span>
		</p>
	);
}

/** Stuck waits on an answer too, so it shares the question mark. */
function iconOf(need: TaskNode["need"]): Need | undefined {
	if (need === "review") return "review";
	return need ? "input" : undefined;
}

function toReason(r: Task["reasons"][number]): Reason {
	if (r.kind === "decision")
		return {
			kind: "Decision",
			what: r.what,
			state: r.state === "waiting" ? "open" : "made",
			why: r.why ?? "",
			waits: r.state === "waiting",
		};
	return { kind: "Assumption", what: r.what, state: r.state, why: r.why ?? "" };
}

function toClose(l: Task["doneWhen"][number]): Close {
	return { what: l.what, by: l.by, state: l.state, how: l.how ?? "" };
}

/** Written by the owner: the outcome once it is done, its notes while it runs or waits. */
function Summary({ n, owner }: { n: Task; owner: string }) {
	const text = n.state === "done" ? n.outcomeSummary : n.notes;
	const lines = (text ?? "").split("\n").filter((l) => l.trim() !== "");
	const when =
		n.state === "done"
			? `written when it finished, ${ago(n.completedAt ?? n.updatedAt)}`
			: `updated ${ago(n.updatedAt)}`;
	const started = !["proposed", "accepted", "hold"].includes(n.state);
	return (
		<>
			<h3>
				Summary{" "}
				{lines.length > 0 && (
					<span>
						by {owner} · {when}
					</span>
				)}
			</h3>
			{lines.length > 0 ? (
				<ul className="task-list">
					{lines.map((l) => (
						<li key={l}>{l}</li>
					))}
				</ul>
			) : (
				<p className="tk-none">
					{started ? "No summary yet." : "No summary yet. It has not started."}
				</p>
			)}
		</>
	);
}

/** The part's own conversation: steering is a message here, and its questions are answered in place. */
function Conversation({
	task,
	owner,
	you,
	people,
	focus,
}: {
	task: Task;
	owner: string;
	you: string;
	people: People;
	focus: string | null;
}) {
	const navigate = useNavigate();
	const thread = useAction("open_thread", { id: task.threadId }, [`thread:${task.threadId}`]);
	const [problem, setProblem] = useState<string | null>(null);
	const messages = [...(thread.data?.messages ?? [])].filter((m) => m.deletedAt === null).reverse();
	const resolving = resolvingOf(messages);
	const first = (uid: string) =>
		uid === you ? "You" : (people.get(uid)?.name.split(" ")[0] ?? "Someone");
	const entries = timeline(messages, [], [], first);

	useLayoutEffect(() => {
		if (focus && messages.length > 0)
			document.getElementById(`m-${focus}`)?.scrollIntoView({ block: "center" });
	}, [focus, messages.length]);

	const send = async (body: InputOf<"send_message">): Promise<boolean> => {
		const sent = await call("send_message", body);
		setProblem(sent.ok ? null : (sent.problems[0]?.message ?? "It did not send."));
		if (sent.ok) thread.reload();
		return sent.ok;
	};

	return (
		<>
			<h3>
				Conversation{" "}
				<span>
					<button
						type="button"
						className="tbox-link"
						onClick={() => navigate(`/conversations/${task.threadId}`)}
					>
						also in Conversations
					</button>
				</span>
			</h3>
			{thread.data && entries.length === 0 && <p className="tk-none">Nothing said here yet.</p>}
			{entries.map((e) => {
				if (e.kind === "event") return <Event key={e.key}>{e.text}</Event>;
				if (e.kind !== "said") return null;
				const sender = people.get(e.senderId);
				return (
					<Msg
						key={e.key}
						who={initials(sender?.name ?? "")}
						human={sender?.human}
						name={e.senderId === you ? "You" : (sender?.name ?? "")}
						at={clock(e.at)}
					>
						{e.messages.map((m) => (
							<div key={m.id} id={`m-${m.id}`}>
								<Body
									message={m}
									threadId={task.threadId}
									you={you}
									people={people}
									resolving={resolving}
									onAnswer={(question, option) =>
										void send({
											threadId: task.threadId,
											answer: { resolvesMessageId: question.id, option },
										})
									}
								/>
							</div>
						))}
					</Msg>
				);
			})}
			{problem && <p className="composer-problem">{problem}</p>}
			<div className="task-reply">
				<Composer
					label="Reply"
					placeholder={`Tell ${owner} something, or @someone…`}
					pickerHead="Hand to"
					pickerKeys={["hand off", "keep it"]}
					onSend={(text) => send({ threadId: task.threadId, text })}
				/>
			</div>
		</>
	);
}

function KindIcon({ kind }: { kind: Thing["kind"] }) {
	return (
		<svg
			className="att-ic"
			width="14"
			height="14"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.3"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{kind === "Document" && <path d="M4 1.75h5.5l2.5 2.5v10H4zM9.5 1.75v2.5H12" />}
			{kind === "Question" && (
				<>
					<path d="M6 6.2a2 2 0 1 1 2.9 1.8c-.6.3-.9.7-.9 1.4" />
					<circle cx="8" cy="12" r="0.6" fill="currentColor" />
				</>
			)}
			{kind === "Review" && (
				<>
					<path d="M1.5 8s2.4-4.3 6.5-4.3S14.5 8 14.5 8s-2.4 4.3-6.5 4.3S1.5 8 1.5 8z" />
					<circle cx="8" cy="8" r="1.8" />
				</>
			)}
		</svg>
	);
}

/** What the graph needs to know to draw itself. */
interface View {
	readonly tree: Tree;
	/** The picked part. Its subtasks show to its right. */
	readonly sel: string;
	/** The parts that lead to it, from the task down. Each shows its subtasks too. */
	readonly path: ReadonlySet<string>;
	/** Parts whose subtasks show without being picked: the task's own parts, while the whole task is shown. */
	readonly open: ReadonlySet<string>;
	/** Parents whose long row of finished parts has been opened up. */
	readonly unfolded: ReadonlySet<string>;
	/** Parts an agent is working on right now. */
	readonly running: ReadonlySet<string>;
	readonly owner: (t: Task) => string;
	readonly docs: readonly DocumentRow[];
	readonly asks: readonly Ask[];
	readonly onPick: (id: string) => void;
	readonly onUnfold: (id: string) => void;
	/** The parts drawn right now, once the graph has measured them. */
	readonly seen?: ReadonlySet<string>;
}

/** A dashed arrow in small, the same mark the graph draws between two parts. */
function Wait() {
	return (
		<svg className="nd-wait" viewBox="0 0 18 8" aria-hidden="true">
			<path d="M1 4h12" strokeDasharray="2 3" />
			<path d="M12 1l4 3-4 3" />
		</svg>
	);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One part on the graph: a mark for how it stands, its name, a few words. */
function Node({ n, view }: { n: TaskNode; view: View }) {
	const done = finished(n);
	const stopped = n.paused === "stopped" && !done;
	const running = view.running.has(n.id) && !n.paused && !done;
	const head = n.children.length > 0;
	const need = n.paused || done || head ? undefined : iconOf(n.need);
	const docs = view.docs.filter((d) => d.parentId === n.id).length;
	const reviews = view.asks.filter((a) => a.task === n.id && a.message.type === "review").length;
	const shown = view.sel === n.id || view.path.has(n.id) || view.open.has(n.id);
	const inside: Need[] =
		head && !n.paused ? (["input", "review"] as const).filter((k) => needsBelow(n, k) > 0) : [];
	const extra = [
		docs > 0 && plural(docs, "doc", "docs"),
		reviews > 0 && plural(reviews, "review", "reviews"),
	]
		.filter(Boolean)
		.join(" · ");
	// A wait whose other end is out of view still shows, so the graph never hides that there is more.
	const away = (x: string) => Boolean(view.seen && !view.seen.has(x));
	const after = waitsFor(n).filter(away);
	const before = [...view.tree.byId.values()].filter(
		(o) => waitsFor(o).includes(n.id) && away(o.id),
	);
	return (
		<button
			type="button"
			data-id={n.id}
			aria-pressed={view.sel === n.id}
			onClick={() => view.onPick(n.id)}
			className={["nd", head && "nd--head", done && "nd--done", view.path.has(n.id) && "nd--path"]
				.filter(Boolean)
				.join(" ")}
		>
			<span className="nd-mark" aria-hidden="true">
				{need && <NeedIcon kind={need} />}
				{!need && running && <span className="avatar nd-av">{initials(view.owner(n))}</span>}
				{!(need || running) && done && "✓"}
				{stopped && "■"}
				{!(need || running || done || stopped) && (head || n.state === "in_progress" ? "◐" : "○")}
			</span>
			<span className="nd-text">
				<span className="nd-name">{n.title}</span>
				<span className="nd-sub">
					{chipWords(view.tree, n, view.running, view.owner)}
					{extra && ` · ${extra}`}
					{inside.map((k) => (
						<span key={k} className="nd-in">
							<NeedIcon kind={k} />
							{needsBelow(n, k)}
						</span>
					))}
				</span>
				{after.map((d) => (
					<span key={d} className="nd-away">
						<Wait />
						after {view.tree.byId.get(d)?.title}
					</span>
				))}
				{before.map((o) => (
					<span key={o.id} className="nd-away">
						<Wait />
						{o.title} comes after
					</span>
				))}
			</span>
			{head && !shown && (
				<span className="nd-kids" title={`${n.children.length} subtasks`}>
					{n.children.length} ›
				</span>
			)}
		</button>
	);
}

/**
 * The parts under one parent. A long row of finished parts folds into one chip, keeping the
 * latest in sight; opening it grows the page, so the graph never needs a scroll area of its own.
 */
function Parts({ parent, view }: { parent: string; view: View }) {
	const kids = view.tree.byId.get(parent)?.children ?? [];
	const done = kids.filter((k) => finished(k) && k.id !== view.sel && !view.path.has(k.id));
	const folded =
		done.length > 3 && !view.unfolded.has(parent) ? done.slice(0, -1).map((k) => k.id) : [];
	return (
		<>
			{kids.map((k) => {
				if (!folded.includes(k.id))
					return (
						<div key={k.id} className="st-kid">
							<Branch n={k} view={view} />
						</div>
					);
				if (k.id !== folded[0]) return null;
				return (
					<div key={k.id} className="st-kid">
						<button type="button" className="nd nd--more" onClick={() => view.onUnfold(parent)}>
							<span className="nd-mark" aria-hidden="true">
								✓
							</span>
							<span className="nd-text">
								<span className="nd-name">{folded.length} earlier, done</span>
								<span className="nd-sub">Show them</span>
							</span>
						</button>
					</div>
				);
			})}
		</>
	);
}

/** Branches run left to right, each parent level with its first part. */
function Branch({ n, view }: { n: TaskNode; view: View }) {
	const shown = view.sel === n.id || view.path.has(n.id) || view.open.has(n.id);
	return (
		<div className="st">
			<Node n={n} view={view} />
			{n.children.length > 0 && shown && (
				<div className="st-kids">
					<Parts parent={n.id} view={view} />
				</div>
			)}
		</div>
	);
}

interface Arrow {
	readonly key: string;
	readonly d: string;
	readonly open: boolean;
}

/**
 * The graph: up to three levels of the tree around the picked part, plus a dashed arrow from
 * each part to the part that waits for it. `from` is the part whose subtasks fill the first
 * column; the task itself is never drawn — it is the page. Arrows are measured from where the
 * chips really sit: straight down when nothing is in the way, a curve out to the right when
 * something is.
 */
function Graph({ from, columns, view }: { from: string; columns: number; view: View }) {
	const box = useRef<HTMLDivElement>(null);
	const [arrows, setArrows] = useState<Arrow[]>([]);
	const [seen, setSeen] = useState("");
	const { tree } = view;
	// The arrows are measured against the tree as it is when the shape changes.
	const current = useRef(tree);
	current.current = tree;
	const shape = `${from}|${view.sel}|${[...view.unfolded].join()}|${[...tree.byId.values()]
		.map((n) => `${n.id}:${n.state}:${n.dependencies ?? ""}`)
		.join()}`;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `shape` stands for what the graph shows; the arrows must be measured again whenever it changes
	useLayoutEffect(() => {
		const el = box.current;
		if (!el) return;
		const draw = () => {
			const tree = current.current;
			const host = el.getBoundingClientRect();
			const chips = [...el.querySelectorAll<HTMLElement>("[data-id]")].map((c) => {
				const r = c.getBoundingClientRect();
				return {
					id: c.dataset.id ?? "",
					l: r.left - host.left,
					t: r.top - host.top,
					r: r.right - host.left,
					b: r.bottom - host.top,
				};
			});
			const next: Arrow[] = [];
			for (const to of chips) {
				const node = tree.byId.get(to.id);
				for (const dep of node ? waitsFor(node) : []) {
					const from = chips.find((c) => c.id === dep);
					const depNode = tree.byId.get(dep);
					if (!(from && depNode)) continue;
					const sameColumn = Math.abs(from.l - to.l) < 4;
					const inTheWay = chips.some(
						(o) =>
							o !== from && o !== to && Math.abs(o.l - from.l) < 4 && o.t > from.t && o.t < to.t,
					);
					let d = `M${from.r + 3} ${from.t + 20}C${from.r + 40} ${from.t + 20} ${to.l - 40} ${to.t + 20} ${to.l - 7} ${to.t + 20}`;
					if (sameColumn && !inTheWay) d = `M${from.l + 23} ${from.b + 2}V${to.t - 4}`;
					else if (from.l > to.r)
						d = `M${from.l - 3} ${from.t + 20}C${from.l - 40} ${from.t + 20} ${to.r + 40} ${to.t + 20} ${to.r + 7} ${to.t + 20}`;
					else if (sameColumn) {
						const out = Math.max(from.r, to.r) + 22;
						d = `M${from.r + 3} ${from.t + 20}C${out} ${from.t + 20} ${out} ${to.t + 20} ${to.r + 7} ${to.t + 20}`;
					}
					next.push({ key: `${dep}>${to.id}`, d, open: !finished(depNode) });
				}
			}
			setArrows(next);
			setSeen(
				chips
					.map((c) => c.id)
					.sort()
					.join(","),
			);
		};
		draw();
		const watch = new ResizeObserver(draw);
		watch.observe(el);
		return () => watch.disconnect();
	}, [shape]);
	return (
		<div className={columns > 2 ? "mp mp--deep" : "mp"} ref={box}>
			<svg className="waits" aria-hidden="true">
				<defs>
					<marker
						id="wait-end"
						viewBox="0 0 8 8"
						refX="6"
						refY="4"
						markerWidth="7"
						markerHeight="7"
						orient="auto-start-reverse"
					>
						<path
							d="M1 1l5 3-5 3"
							fill="none"
							stroke="context-stroke"
							strokeWidth="1.4"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</marker>
				</defs>
				{arrows.map((a) => (
					<path
						key={a.key}
						d={a.d}
						className={a.open ? "wait wait--open" : "wait"}
						markerEnd="url(#wait-end)"
					/>
				))}
			</svg>
			<div className="st-kids st-kids--first">
				<Parts parent={from} view={seen ? { ...view, seen: new Set(seen.split(",")) } : view} />
			</div>
		</div>
	);
}

const SECTIONS: { kind: Thing["kind"]; title: string }[] = [
	{ kind: "Question", title: "Questions" },
	{ kind: "Review", title: "Reviews" },
	{ kind: "Document", title: "Documents" },
];

/** Every part from this one down. */
function subtree(n: TaskNode): TaskNode[] {
	return [n, ...n.children.flatMap(subtree)];
}

/**
 * The floating box: quick actions, the facts, then what is attached — questions, reviews and
 * documents each in a section of their own, what a person takes part in first — then sessions.
 */
function TaskBox({
	tree,
	n,
	running,
	owner,
	people,
	you,
	asks,
	docs,
	following,
	problem,
	onFollow,
	onEdit,
	onPick,
	onAsk,
}: {
	tree: Tree;
	n: TaskNode;
	running: ReadonlySet<string>;
	owner: (t: Task) => string;
	people: People;
	you: string;
	asks: readonly Ask[];
	docs: readonly DocumentRow[];
	/** Null until it is known whether you follow it. */
	following: boolean | null;
	problem: string | null;
	onFollow: () => void;
	onEdit: (input: Omit<InputOf<"edit_task">, "id">) => void;
	onPick: (id: string) => void;
	onAsk: (task: string, message: string) => void;
}) {
	const navigate = useNavigate();
	const [more, setMore] = useState(false);
	const sessions = useAction("search_sessions", { taskId: n.id }, [`task:${n.id}`]);
	const thread = useAction("open_thread", { id: n.threadId }, [`thread:${n.threadId}`]);
	const done = finished(n);
	const stopped = n.paused === "stopped";
	const held = n.paused === "hold";
	const reviewed = n.doneWhen.some((l) => l.by === "review");
	const below = new Set(subtree(n).map((x) => x.id));
	const name = (uid: string) => people.get(uid)?.name.split(" ")[0] ?? "Someone";
	const titleOf = (id: string) => tree.byId.get(id)?.title ?? "";

	const things: Thing[] = [
		...asks
			.filter((a) => below.has(a.task))
			.map((a): Thing => {
				const on = a.task === n.id ? {} : { on: a.task };
				if (a.message.type === "questionnaire")
					return {
						key: a.message.id,
						kind: "Question",
						title: (a.message.payload as QuestionnairePayload).title,
						why: `Asked by ${name(a.message.senderId)} ${ago(a.message.createdAt)}`,
						needs: "input",
						open: () => onAsk(a.task, a.message.id),
						...on,
					};
				return {
					key: a.message.id,
					kind: "Review",
					title: (a.message.payload as ReviewPayload).title,
					why: `Raised by ${name(a.message.senderId)} ${ago(a.message.createdAt)}`,
					needs: "review",
					open: () => navigate(`/conversations/${a.message.threadId}?review=${a.message.id}`),
					...on,
				};
			}),
	];
	const asDoc = (d: DocumentRow): Thing => ({
		key: d.id,
		kind: "Document",
		title: d.title,
		why: `${d.status === "proposed" ? "Draft by" : "By"} ${name(d.updatedBy)} · ${ago(d.updatedAt)}`,
		open: () => navigate(`/knowledge/${d.id}`),
		...(d.parentId && d.parentId !== n.id ? { on: d.parentId } : {}),
	});
	const newest = (a: DocumentRow, b: DocumentRow) => b.updatedAt.localeCompare(a.updatedAt);
	const ownDocs = docs
		.filter((d) => d.parentId === n.id)
		.sort(newest)
		.map(asDoc);
	const madeBelow = docs
		.filter((d) => d.parentId !== n.id && below.has(d.parentId ?? ""))
		.sort(newest)
		.map(asDoc);

	const all = [...(sessions.data ?? NO_SESSIONS)].sort((a, b) =>
		a.startedAt.localeCompare(b.startedAt),
	);
	const worked = all.reduce(
		(ms, s) => ms + (Date.parse(s.endedAt ?? new Date().toISOString()) - Date.parse(s.startedAt)),
		0,
	);
	const facts = [
		`${owner(n)} owns this`,
		done
			? `Finished ${ago(n.completedAt ?? n.updatedAt)}`
			: all.length > 0 || n.state === "in_progress"
				? `Started ${ago(n.createdAt)}`
				: "Not started",
		all.length > 0 && `${duration(worked)} in ${plural(all.length, "session", "sessions")}`,
	].filter((f): f is string => Boolean(f));
	const came = thread.data && cameFrom(n, thread.data.thread) ? thread.data.thread : null;

	const row = (x: Thing, quiet?: boolean) => {
		const on = x.on;
		return (
			<div key={x.key} className={quiet ? "att att--quiet" : "att"}>
				{x.needs ? <NeedIcon kind={x.needs} /> : <KindIcon kind={x.kind} />}
				<span className="att-body">
					<button type="button" className="att-title" onClick={x.open}>
						{x.title}
					</button>
					<span className="att-why">
						{x.why}
						{on && (
							<>
								{" "}
								· on{" "}
								<button type="button" onClick={() => onPick(on)}>
									{titleOf(on)}
								</button>
							</>
						)}
					</span>
				</span>
			</div>
		);
	};

	return (
		<aside className="tbox" aria-label="About this task">
			<div className="tbox-head">
				<span className="tbox-name">{n.title}</span>
				<span className="tbox-state">{headWords(tree, n, running)}</span>
			</div>

			<div className="tbox-acts">
				{following !== null && (
					<button type="button" className="btn" aria-pressed={following} onClick={onFollow}>
						{following ? "Following" : "Follow"}
					</button>
				)}
				{!done && stopped && (
					<button
						type="button"
						className="btn btn--accent"
						onClick={() => onEdit({ paused: null })}
					>
						Start again
					</button>
				)}
				{!(done || stopped) && (
					<button
						type="button"
						className="btn"
						onClick={() => onEdit({ paused: held ? null : "hold" })}
					>
						{held ? "Take off hold" : "Put on hold"}
					</button>
				)}
				{!(done || stopped) && (
					<button type="button" className="btn" onClick={() => onEdit({ paused: "stopped" })}>
						Stop
					</button>
				)}
				{!(done || reviewed || stopped) && (
					<button
						type="button"
						className="btn"
						onClick={() =>
							onEdit({
								doneWhen: [
									...n.doneWhen,
									{
										id: crypto.randomUUID(),
										what: "A person looked at it before it counts as done.",
										by: "review",
										state: "open",
										how: `${name(you)} asked for this review`,
									},
								],
							})
						}
					>
						Ask for a review
					</button>
				)}
			</div>
			{problem && <p className="tbox-none">{problem}</p>}

			<ul className="tbox-facts">
				{facts.map((f) => (
					<li key={f}>{f}</li>
				))}
				{came && (
					<li>
						Came from{" "}
						<button
							type="button"
							className="tbox-link"
							onClick={() => navigate(`/conversations/${came.id}`)}
						>
							Thread · {came.computedTitle}
						</button>
					</li>
				)}
				{done && <li>{closing(n)}</li>}
			</ul>

			{SECTIONS.map(({ kind, title }) => {
				const items = kind === "Document" ? ownDocs : things.filter((x) => x.kind === kind);
				const rest = kind === "Document" ? madeBelow : [];
				if (items.length + rest.length === 0) return null;
				const waiting = items.filter((x) => x.needs).length;
				return (
					<section key={kind} className="tbox-sec">
						<h4>
							{title} {waiting > 0 && <span>{waiting} open</span>}
						</h4>
						{items.map((x) => row(x))}
						{rest.length > 0 && (
							<>
								<button
									type="button"
									className="tbox-more"
									aria-expanded={more}
									onClick={() => setMore(!more)}
								>
									{more ? "Hide" : "Show"} {rest.length} more, made while working on its parts
								</button>
								{more && rest.map((x) => row(x, true))}
							</>
						)}
					</section>
				);
			})}

			{all.length > 0 && <Sessions sessions={all} quiet={Boolean(n.paused)} />}
		</aside>
	);
}

/** The newest session; the earlier ones open in place. A live one can be peeked at. */
function Sessions({ sessions, quiet }: { sessions: readonly SessionRow[]; quiet: boolean }) {
	const [earlier, setEarlier] = useState(false);
	const now = useNow();
	const numbered = sessions.map((s, i) => ({ s, n: i + 1 })).reverse();
	const shown = earlier ? numbered : numbered.slice(0, 1);
	return (
		<section className="tbox-sec">
			<h4>Sessions</h4>
			{shown.map(({ s, n }) => (
				<SessionRowLine key={s.id} session={s} n={n} now={now} quiet={quiet} />
			))}
			{numbered.length > 1 && (
				<button
					type="button"
					className="tbox-more"
					aria-expanded={earlier}
					onClick={() => setEarlier(!earlier)}
				>
					{earlier
						? "Hide earlier sessions"
						: `${plural(numbered.length - 1, "earlier session", "earlier sessions")}`}
				</button>
			)}
		</section>
	);
}

function SessionRowLine({
	session,
	n,
	now,
	quiet,
}: {
	session: SessionRow;
	n: number;
	now: number;
	quiet: boolean;
}) {
	const [peek, setPeek] = useState(false);
	const live = session.endedAt === null && session.state === "active";
	const when = clock(session.startedAt, now);
	const said = live
		? `running · ${duration(now - Date.parse(session.startedAt))}`
		: [
				duration(Date.parse(session.endedAt ?? session.startedAt) - Date.parse(session.startedAt)),
				session.state === "stopped" ? "stopped" : session.notes,
			]
				.filter(Boolean)
				.join(" · ");
	return (
		<>
			<div className="ses">
				<span className="ses-t">
					Session {n} · {/^\d/.test(when) ? `today ${when}` : when}
				</span>
				<span className="ses-s">
					{said}
					{live && !quiet && (
						<>
							{" "}
							·{" "}
							<button type="button" className="peek" onClick={() => setPeek(!peek)}>
								{peek ? "Hide" : "Peek"}
							</button>
						</>
					)}
				</span>
			</div>
			{peek && live && <Steps id={session.id} />}
		</>
	);
}

function Steps({ id }: { id: string }) {
	const watch = useAction("watch_session", { id }, [`session:${id}`]);
	const steps = (watch.data?.activity ?? []).flatMap((e) => stepWords(e) ?? []);
	return (
		<ul className="session" aria-label="Steps so far">
			{steps.length === 0 ? (
				<li>· no steps yet</li>
			) : (
				// biome-ignore lint/suspicious/noArrayIndexKey: steps repeat and only ever append
				steps.map((s, i) => <li key={i}>· {s}</li>)
			)}
		</ul>
	);
}

function depthOf(tree: Tree, id: string): number {
	const p = tree.parentOf.get(id);
	return p ? depthOf(tree, p) + 1 : 0;
}

/** The parts that lead from the task down to this one, nearest last. Neither end is included. */
function pathTo(tree: Tree, id: string): string[] {
	const p = tree.parentOf.get(id);
	return p && tree.parentOf.get(p) ? [...pathTo(tree, p), p] : [];
}
