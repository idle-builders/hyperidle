import {
	type ActivityEntry,
	isRedactedPayload,
	type Message,
	type PlainReadPayload,
	type QuestionnairePayload,
	type ReviewPayload,
	type SessionRow,
	type Task,
	type VerdictPayload,
} from "@hyperidle/domain-model";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { call, type InputOf } from "./api";
import { Composer } from "./Composer";
import { Failed } from "./Failed";
import { listen } from "./live";
import { Avatar, Event, Msg } from "./Msg";
import { RichText } from "./RichText";
import { initials } from "./sidebar-lists";
import { clock, duration, timeline, titleFrom, workState } from "./thread-timeline";
import { useAction } from "./useAction";

/**
 * HAND OFF — one thread on real data. Its messages come in live; the work item it handed off
 * carries its state in place; while an agent works on it, one line says so and can show its
 * steps, but the session never enters the thread.
 */
interface Person {
	readonly name: string;
	readonly human: boolean;
}
export type People = ReadonlyMap<string, Person>;

const NO_MESSAGES: readonly Message[] = [];

/** Sessions of the tasks shown, asked again when a task says one started or ended. */
function useTaskSessions(taskIds: readonly string[]): readonly SessionRow[] {
	const [rows, setRows] = useState<readonly SessionRow[]>([]);
	const [turn, setTurn] = useState(0);
	const key = taskIds.join(" ");
	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `taskIds`; `turn` asks again
	useEffect(() => {
		let current = true;
		const ids = key ? key.split(" ") : [];
		void Promise.all(ids.map((taskId) => call("search_sessions", { taskId }))).then((all) => {
			if (current) setRows(all.flatMap((r) => (r.ok ? r.data : [])));
		});
		return () => {
			current = false;
		};
	}, [key, turn]);
	useEffect(() => {
		if (!key) return;
		return listen(
			key.split(" ").map((id) => `task:${id}`),
			() => setTurn((t) => t + 1),
		);
	}, [key]);
	return rows;
}

/** Re-render every half minute, so "12m" keeps up. */
export function useNow(): number {
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(timer);
	}, []);
	return now;
}

export function stepWords(entry: ActivityEntry): string | null {
	if (entry.type !== "tool_call") return null;
	const d = entry.data;
	return `${d.verb ?? d.toolName} ${d.target ?? d.argsSummary}`.trim();
}

/** One line while an agent works on the task; its steps show in place only when asked for. */
function SessionLine({ session, agent }: { session: SessionRow; agent: string }) {
	const [peek, setPeek] = useState(false);
	const now = useNow();
	const watch = useAction("watch_session", { id: session.id }, [`session:${session.id}`]);
	const steps = (watch.data?.activity ?? []).flatMap((e) => stepWords(e) ?? []);
	return (
		<div>
			<div className="running">
				<span className="dot dot--live" />
				<span className="running-txt">
					{agent} is working · {duration(now - Date.parse(session.startedAt))} · {steps.length}{" "}
					{steps.length === 1 ? "step" : "steps"}
				</span>
				<button type="button" className="peek" onClick={() => setPeek(!peek)}>
					{peek ? "Hide session" : "Peek at session"}
				</button>
			</div>
			{peek && (
				<ul className="session" aria-label={`${agent}'s steps`}>
					{steps.length === 0 ? (
						<li>· no steps yet</li>
					) : (
						// biome-ignore lint/suspicious/noArrayIndexKey: steps repeat and only ever append
						steps.map((s, i) => <li key={i}>· {s}</li>)
					)}
				</ul>
			)}
		</div>
	);
}

/** The agent's work, as a reference: it carries its state in place and opens the task. */
function WorkItem({
	task,
	owner,
	openReviews,
}: {
	task: Task;
	owner: string;
	openReviews: number;
}) {
	const navigate = useNavigate();
	const state = workState(task, openReviews);
	return (
		<button type="button" className="workitem" onClick={() => navigate(`/work/${task.id}`)}>
			<div>
				<div className="workitem-title">{task.title}</div>
				<div className="workitem-sub">{owner} owns this</div>
			</div>
			<span className="workitem-state">
				<span className={state.dot ? `dot dot--${state.dot}` : "dot"} />
				{state.words}
				<span className="workitem-go">Open ›</span>
			</span>
		</button>
	);
}

/** An ask with real options. Picking one answers it; then the card shows the choice in place. */
function Question({
	message,
	answer,
	askerIsAgent,
	yours,
	answeredBy,
	onPick,
}: {
	message: Message;
	answer: string | null;
	askerIsAgent: boolean;
	yours: boolean;
	answeredBy: string;
	onPick: (option: string) => void;
}) {
	const q = message.payload as QuestionnairePayload;
	const open = message.resolvedAt === null;
	const waiting = askerIsAgent ? "Stuck" : "Needs input";
	return (
		<div className="card">
			<div className="card-head">
				<span className={open && !yours ? "chip chip--flag" : "chip chip--quiet"}>
					{open ? waiting : "Answered"}
				</span>
			</div>
			<p className="card-q">{q.title}</p>
			{q.question && (
				<div className="card-why">
					<RichText text={q.question} />
				</div>
			)}
			{q.options.length > 0 && (
				<div className="card-opts">
					{q.options.map((option) => (
						<button
							key={option}
							type="button"
							className="opt"
							aria-pressed={answer === option}
							disabled={!open || yours}
							onClick={() => onPick(option)}
						>
							<b>{option}</b>
							{answer === option && <span>chosen by {answeredBy}</span>}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

/** A review: yours is raised with its action; someone else's shows in full with none. */
function Review({
	message,
	verdict,
	you,
	people,
	threadId,
}: {
	message: Message;
	verdict: VerdictPayload | null;
	you: string;
	people: People;
	threadId: string;
}) {
	const navigate = useNavigate();
	const r = message.payload as ReviewPayload;
	const open = message.resolvedAt === null;
	const reviewer = r.reviewer ? people.get(r.reviewer) : undefined;
	const yours = open && message.senderId !== you && (!r.reviewer || r.reviewer === you);
	const look = () => navigate(`/conversations/${threadId}?review=${message.id}`);
	return (
		<div className={yours ? "review" : "review review--theirs"}>
			<div className="review-head">
				<span className="chip chip--quiet">Review</span>
				<span className="review-what">{r.title}</span>
				<span className="review-owner">
					{!open ? (
						<span className="chip chip--quiet">
							{verdict?.decision === "reject" ? "Rejected" : "Approved"}
						</span>
					) : yours ? (
						<span className="chip chip--flag">Needs review</span>
					) : reviewer ? (
						<>
							<Avatar who={initials(reviewer.name)} human={reviewer.human} />
							{reviewer.name} · told {clock(message.createdAt)}
						</>
					) : (
						<span className="chip chip--quiet">Needs review</span>
					)}
				</span>
			</div>
			{r.reasoning.length > 0 && (
				<div className="review-body">
					<ul className="result-list">
						{r.reasoning.map((line) => (
							<li key={line}>{line}</li>
						))}
					</ul>
				</div>
			)}
			<div className="review-foot">
				{yours ? (
					<button type="button" className="btn btn--accent" onClick={look}>
						Look at it
					</button>
				) : open ? (
					<span className="review-note">
						{reviewer ? `Needs review by ${reviewer.name.split(" ")[0]}` : "Needs review"}
					</span>
				) : (
					<>
						<button type="button" className="btn" onClick={look}>
							Look at it
						</button>
						{verdict?.note && <span className="review-note">{verdict.note}</span>}
					</>
				)}
			</div>
		</div>
	);
}

/** One message's body inside its sender's block. */
export function Body({
	message,
	threadId,
	you,
	people,
	resolving,
	onAnswer,
}: {
	message: Message;
	threadId: string;
	you: string;
	people: People;
	resolving: ReadonlyMap<string, Message>;
	onAnswer: (question: Message, option: string) => void;
}) {
	if (message.redactedAt || isRedactedPayload(message.payload))
		return <p className="msg-para msg-gone">This message was removed.</p>;
	const by = resolving.get(message.id);
	if (message.type === "questionnaire") {
		const answer = by?.type === "answer" ? (by.payload as { option?: string }).option : undefined;
		return (
			<Question
				message={message}
				answer={answer ?? null}
				askerIsAgent={!people.get(message.senderId)?.human}
				yours={message.senderId === you}
				answeredBy={by ? (by.senderId === you ? "you" : (people.get(by.senderId)?.name ?? "")) : ""}
				onPick={(option) => onAnswer(message, option)}
			/>
		);
	}
	if (message.type === "review")
		return (
			<div className="reviews">
				<Review
					message={message}
					verdict={by?.type === "verdict" ? (by.payload as VerdictPayload) : null}
					you={you}
					people={people}
					threadId={threadId}
				/>
			</div>
		);
	const p = message.payload as PlainReadPayload;
	const mentions = (p.refs ?? []).flatMap((r) => (r.kind === "mention" ? [r.sourceText] : []));
	return <RichText text={p.text} mentions={mentions} />;
}

/** Each answered question or decided review, by the message that answered or decided it. */
export function resolvingOf(messages: readonly Message[]): ReadonlyMap<string, Message> {
	return new Map(
		messages.flatMap((m): [string, Message][] =>
			(m.type === "answer" || m.type === "verdict") && !isRedactedPayload(m.payload)
				? [[(m.payload as { resolvesMessageId: string }).resolvesMessageId, m]]
				: [],
		),
	);
}

/** Everyone who can be in a thread, by id. */
export function peopleOf(
	users: readonly { readonly id: string; readonly name: string; readonly kind: string }[],
): People {
	return new Map(users.map((u) => [u.id, { name: u.name, human: u.kind === "human" }]));
}

export function ThreadPage({ id }: { id: string }) {
	const me = useAction("open_user", {});
	const users = useAction("search_users", {});
	const view = useAction("open_thread", { id }, [`thread:${id}`]);
	const inThread = useAction("search_tasks", { threadId: id }, ["tasks"]);
	const tasks = (inThread.data ?? []).filter(
		(t, _, all) => !all.some((p) => p.id === t.parentTaskId),
	);
	const taskTopics = tasks.map((t) => `task:${t.id}`).join(" ");
	const reloadTasks = inThread.reload;
	useEffect(
		() => (taskTopics ? listen(taskTopics.split(" "), reloadTasks) : undefined),
		[taskTopics, reloadTasks],
	);
	const sessions = useTaskSessions(tasks.map((t) => t.id));
	// Parts share their task's conversation; an agent working on one is working here too.
	const parts = (inThread.data ?? []).filter((t) => !tasks.includes(t));
	const partSessions = useTaskSessions(parts.map((t) => t.id));
	// An agent answering a message here, rather than working on one of the thread's tasks.
	const active = useAction("search_sessions", { state: "active" }, [`thread:${id}`]);
	const answering = (active.data ?? []).filter((s) => s.threadId === id && s.taskId === null);
	const [problem, setProblem] = useState<string | null>(null);
	const scroll = useRef<HTMLDivElement>(null);
	// The first conversation after first start offers what an agent can use next.
	const [search, setSearch] = useSearchParams();
	const navigate = useNavigate();
	const first = search.has("first");

	const you = me.data?.user?.id ?? "";
	const people = peopleOf(users.data ?? []);
	const firstName = (uid: string) =>
		uid === you ? "You" : (people.get(uid)?.name.split(" ")[0] ?? "Someone");
	const agent = view.data?.members.find((m) => m.isAgent);
	const messages = [...(view.data?.messages ?? NO_MESSAGES)]
		.filter((m) => m.deletedAt === null)
		.reverse();
	const resolving = resolvingOf(messages);
	const entries = timeline(messages, tasks, sessions, firstName);
	const running = [
		...[...sessions, ...partSessions].filter((s) => s.endedAt === null && s.state === "active"),
		...answering,
	];

	// A thread opens at its newest message, and follows new ones in.
	const filled = entries.length + people.size + running.length;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `filled` changes whenever more of the thread arrives
	useLayoutEffect(() => {
		const el = scroll.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [filled]);

	const send = async (body: InputOf<"send_message">): Promise<boolean> => {
		const sent = await call("send_message", body);
		setProblem(sent.ok ? null : (sent.problems[0]?.message ?? "It did not send."));
		if (sent.ok) view.reload();
		return sent.ok;
	};

	if (view.problems)
		return (
			<section className="thread">
				<header className="thread-head">
					<span className="chip chip--quiet">Thread</span>
				</header>
				<div className="thread-scroll">
					<Failed what="This thread" why={view.problems[0]?.message} onRetry={view.reload} />
				</div>
			</section>
		);

	// The offer sits under the first agent's hello, however much is said after it.
	const helloKey = entries.find((e) => e.kind === "said" && e.senderId === agent?.id)?.key;
	const hint = first && agent && (
		<div className="hint">
			<span>Point {agent.name} at your code, and it can do more</span>
			<span className="hint-acts">
				<button type="button" className="btn" onClick={() => navigate("/people/me?open=folder")}>
					Connect a folder
				</button>
				<button type="button" className="btn" onClick={() => navigate("/people/me?open=service")}>
					Connect GitHub
				</button>
				<button
					type="button"
					className="hint-skip"
					onClick={() => setSearch({}, { replace: true })}
				>
					Not now
				</button>
			</span>
		</div>
	);
	return (
		<section className="thread">
			<header className="thread-head">
				<span className="chip chip--quiet">Thread</span>
				<h2 title={view.data?.thread.computedTitle}>{view.data?.thread.computedTitle ?? ""}</h2>
			</header>

			<div className="thread-scroll" ref={scroll} role="log" aria-label="Messages">
				{entries.map((e) => {
					if (e.kind === "event") return <Event key={e.key}>{e.text}</Event>;
					if (e.kind === "task")
						return (
							<WorkItem
								key={e.key}
								task={e.task}
								owner={firstName(e.task.ownerAgentId ?? "")}
								openReviews={
									messages.filter(
										(m) =>
											m.type === "review" &&
											m.resolvedAt === null &&
											(m.payload as ReviewPayload).taskId === e.task.id,
									).length
								}
							/>
						);
					const sender = people.get(e.senderId);
					const spot = (e.messages[0]?.payload as PlainReadPayload | undefined)?.anchor?.label;
					const msg = (
						<Msg
							key={e.key}
							who={initials(sender?.name ?? "")}
							human={sender?.human}
							name={e.senderId === you ? "You" : (sender?.name ?? "")}
							at={spot ? `${clock(e.at)} · on ${spot}` : clock(e.at)}
						>
							{e.messages.map((m) => (
								<Body
									key={m.id}
									message={m}
									threadId={id}
									you={you}
									people={people}
									resolving={resolving}
									onAnswer={(question, option) =>
										void send({
											threadId: id,
											answer: { resolvesMessageId: question.id, option },
										})
									}
								/>
							))}
						</Msg>
					);
					return e.key === helloKey && hint ? (
						<Fragment key={e.key}>
							{msg}
							{hint}
						</Fragment>
					) : (
						msg
					);
				})}
				{running.map((s) => (
					<SessionLine key={s.id} session={s} agent={firstName(s.agentId)} />
				))}
			</div>

			{problem && <p className="composer-problem">{problem}</p>}
			<Composer
				label="Reply"
				placeholder="Reply, or @someone…"
				pickerHead="Hand to"
				pickerKeys={["hand off", "keep it"]}
				onSend={(text) => send({ threadId: id, text })}
			/>
		</section>
	);
}

/** A conversation you start yourself: empty until you say what it is about and who is in it. */
export function NewConversation() {
	const navigate = useNavigate();
	const [problem, setProblem] = useState<string | null>(null);
	return (
		<section className="thread">
			<header className="thread-head">
				<span className="chip chip--quiet">Thread</span>
				<h2>New conversation</h2>
				<span className="meta">not sent yet</span>
			</header>
			<div className="thread-scroll">
				<p className="opened-note">
					Say what it is about and @mention who should be in it, people and agents alike. Its first
					line becomes its title; you can change it later.
				</p>
			</div>
			{problem && <p className="composer-problem">{problem}</p>}
			<Composer
				label="Message"
				startPicking
				pickerHead="Bring in"
				pickerKeys={["bring in", "close"]}
				onSend={async (text, mentioned) => {
					if (mentioned.length === 0) {
						setProblem("@mention who should be in it.");
						return false;
					}
					const title = titleFrom(
						text,
						mentioned.map((m) => m.name),
					);
					const made = await call("adjust_thread", { title, members: mentioned.map((m) => m.id) });
					if (!made.ok) {
						setProblem(made.problems[0]?.message ?? "It did not start.");
						return false;
					}
					const threadId = made.data.thread.id;
					const sent = await call("send_message", { threadId, text });
					if (!sent.ok) {
						await call("adjust_thread", { id: threadId, deleted: true });
						setProblem(sent.problems[0]?.message ?? "It did not send.");
						return false;
					}
					navigate(`/conversations/${threadId}`, { replace: true });
					return true;
				}}
			/>
		</section>
	);
}
