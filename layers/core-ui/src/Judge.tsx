import type { Message, PlainReadPayload, Task, VerdictPayload } from "@hyperidle/domain-model";
import { useState } from "react";
import { useNavigate } from "react-router";
import { call, type InputOf } from "./api";
import { Composer } from "./Composer";
import { Failed } from "./Failed";
import { Closes, Reasons, toClose, toReason } from "./Loop";
import { DEVICES, PartBody, type Point, partTitle } from "./ReviewPart";
import { nextRoundOf, type PinThread, pinsOf, type Round, roundsOf } from "./review-page";
import { peopleOf, resolvingOf } from "./Thread";
import { useAction } from "./useAction";

/**
 * JUDGE — you are checking, not reading. Dozens of these a day.
 * The parts get the width of the page (more space is one click away), pins mark the spots,
 * and every pin has a row in a list so you never hunt for a comment again. Above the work, the
 * loop: what already checked itself, and the decisions and assumptions it rests on. A retry is
 * a new round; the round before is one link away, its open questions left there.
 */
const NO_MESSAGES: readonly Message[] = [];

/** The first sentence of a reason, for the link back to its round. */
const firstSentence = (s: string): string => {
	const m = /^.+?[.!?](?=\s|$)/.exec(s);
	return m && m[0].length < s.length ? `${m[0].slice(0, -1)}…` : s;
};

const flagsBefore = (rounds: readonly Round[], i: number): number =>
	rounds.slice(0, i).reduce((n, r) => n + (r.review.flags?.length ?? 0), 0);

export function Judge({ threadId, reviewId }: { threadId: string; reviewId: string }) {
	const navigate = useNavigate();
	const me = useAction("open_user", {});
	const users = useAction("search_users", {});
	const view = useAction("open_thread", { id: threadId }, [`thread:${threadId}`]);
	const messages = [...(view.data?.messages ?? NO_MESSAGES)]
		.filter((m) => m.deletedAt === null)
		.reverse();
	const rounds = roundsOf(reviewId, messages);
	const round = rounds.at(-1);
	const taskId = round?.review.taskId;
	const tasks = useAction(
		"search_tasks",
		taskId ? { ids: [taskId] } : { threadId },
		taskId ? [`task:${taskId}`] : ["tasks"],
	);
	const task: Task | undefined = (tasks.data ?? []).find(
		(t, _, all) => !all.some((p) => p.id === t.parentTaskId),
	);

	const [openPin, setOpenPin] = useState<string | null>(null);
	const [draft, setDraft] = useState<(Point & { part: string }) | null>(null);
	const [wide, setWide] = useState<string | null>(null);
	const [device, setDevice] = useState<string>("desktop");
	const [rejecting, setRejecting] = useState(false);
	const [reason, setReason] = useState("");
	const [problem, setProblem] = useState<string | null>(null);

	const you = me.data?.user?.id ?? "";
	const people = peopleOf(users.data ?? []);
	const first = (uid: string) =>
		uid === you ? "You" : (people.get(uid)?.name.split(" ")[0] ?? "Someone");

	const send = async (body: InputOf<"send_message">): Promise<boolean> => {
		const sent = await call("send_message", body);
		setProblem(sent.ok ? null : (sent.problems[0]?.message ?? "It did not send."));
		if (sent.ok) view.reload();
		return sent.ok;
	};

	if (view.problems || (view.data && !round))
		return (
			<section className="rev">
				<header className="rev-head">
					<button
						type="button"
						className="chip chip--quiet"
						onClick={() => navigate(`/conversations/${threadId}`)}
					>
						Thread
					</button>
				</header>
				<div className="rev-scroll">
					<Failed
						what="This review"
						why={view.problems?.[0]?.message ?? "It is not in this conversation."}
						onRetry={view.reload}
					/>
				</div>
			</section>
		);
	if (!round) return <section className="rev" />;

	const r = round.review;
	const id = round.message.id;
	const sender = round.message.senderId;
	const resolving = resolvingOf(messages);
	const verdictOf = (m: Message) => {
		const v = resolving.get(m.id);
		return v?.type === "verdict" ? { by: v.senderId, ...(v.payload as VerdictPayload) } : null;
	};
	const verdict = verdictOf(round.message);
	const approved = verdict?.decision === "approve";
	const pins = pinsOf(round, messages, flagsBefore(rounds, rounds.length - 1), approved);
	const open = pins.filter((p) => p.state === "open").length;
	const answered = pins.filter((p) => p.state === "answered").length;
	const yours = !verdict && sender !== you && (!r.reviewer || r.reviewer === you);
	const parts = r.parts ?? [];
	const previous = rounds.at(-2);
	const next = nextRoundOf(id, messages);
	const showRound = rounds.length > 1 || next !== undefined;
	const lookAt = (reviewMessageId: string) =>
		navigate(`/conversations/${threadId}?review=${reviewMessageId}`);

	const openPinAt = (key: string) => {
		setDraft(null);
		setOpenPin(key);
		const pin = pins.find((p) => p.key === key);
		if (wide && pin && pin.pin.part !== wide) setWide(null);
		requestAnimationFrame(() =>
			document.getElementById(`pin-${key}`)?.scrollIntoView({ block: "center" }),
		);
	};
	const point = (part: string) => (p: Point) => {
		setDraft({ ...p, part });
		setOpenPin("draft");
	};

	const reply = async (pin: PinThread | (Point & { part: string }), text: string) => {
		const anchor =
			"key" in pin
				? { ...pin.pin, review: id }
				: {
						id: crypto.randomUUID(),
						part: pin.part,
						label: pin.label,
						review: id,
						...(pin.spot ? { spot: pin.spot } : {}),
					};
		const sent = await send({ threadId, text, anchor });
		if (sent) {
			setDraft(null);
			setOpenPin(anchor.id);
		}
		return sent;
	};

	const thread = (key: string) => {
		const pin = pins.find((p) => p.key === key);
		const target = pin ?? (key === "draft" ? draft : null);
		if (!target) return null;
		const close = () => {
			setOpenPin(null);
			setDraft(null);
		};
		return (
			<>
				<div className="pop-head">
					<span>on {pin ? pin.pin.label : draft?.label}</span>
					<button type="button" style={{ marginLeft: "auto" }} aria-label="Close" onClick={close}>
						✕
					</button>
				</div>
				{pin && (
					<div className="pop-body">
						<div className="pop-msg">
							<span className="pop-who">{first(pin.asker)}</span>
							<p>{pin.says}</p>
						</div>
						{pin.replies.map((m) => (
							<div className="pop-msg" key={m.id}>
								<span className="pop-who">{first(m.senderId)}</span>
								<p>{(m.payload as PlainReadPayload).text}</p>
							</div>
						))}
					</div>
				)}
				<Say
					key={key}
					label={pin ? "Reply" : "Comment"}
					placeholder={pin ? "Reply…" : "Ask or say something about this…"}
					onSend={(text) => reply(pin ?? (target as Point & { part: string }), text)}
					onCancel={close}
				/>
			</>
		);
	};

	const body = (part: (typeof parts)[number], width?: number) => (
		<PartBody
			part={part}
			pins={pins.filter((p) => p.pin.part === part.id)}
			draft={draft?.part === part.id ? draft : null}
			open={
				openPin &&
				(openPin === "draft"
					? draft?.part === part.id
					: pins.some((p) => p.key === openPin && p.pin.part === part.id))
					? openPin
					: null
			}
			width={width}
			onOpen={(k) => (k ? openPinAt(k) : setOpenPin(null))}
			onPoint={point(part.id)}
			thread={thread}
		/>
	);

	const widePart = parts.find((p) => p.id === wide);
	if (widePart) {
		const w = DEVICES.find((d) => d.id === device)?.w ?? 1280;
		return (
			<div className="wide">
				<div className="wide-bar">
					<span className="art-kind">{widePart.label}</span>
					<span className="art-title">{partTitle(widePart)}</span>
					{widePart.kind === "preview" && (
						<span className="art-tools">
							{DEVICES.map((d) => (
								<button
									key={d.id}
									type="button"
									className="tool"
									aria-pressed={device === d.id}
									onClick={() => setDevice(d.id)}
								>
									{d.name}
								</button>
							))}
						</span>
					)}
					<span style={{ marginLeft: "auto" }}>
						<button type="button" className="btn" onClick={() => setWide(null)}>
							Done
						</button>
					</span>
				</div>
				<div className="wide-body">
					<div className="wide-part" style={widePart.kind === "preview" ? { width: w } : undefined}>
						{body(widePart, widePart.kind === "preview" ? w : undefined)}
					</div>
				</div>
			</div>
		);
	}

	const prevVerdict = previous && verdictOf(previous.message);
	const prevOpen = previous
		? pinsOf(
				previous,
				messages,
				flagsBefore(rounds, rounds.length - 2),
				prevVerdict?.decision === "approve",
			).filter((p) => p.state === "open").length
		: 0;
	const stage = ["Review", r.stage, showRound && `round ${rounds.length}`]
		.filter(Boolean)
		.join(" · ");

	return (
		<section className="rev">
			<header className="rev-head">
				<button
					type="button"
					className="chip chip--quiet"
					onClick={() => navigate(`/conversations/${threadId}`)}
				>
					Thread
				</button>
				<span className="rev-stage">{stage}</span>
				<h2>{r.title}</h2>
				<span className="rev-from">
					{[people.get(sender)?.name, task?.title].filter(Boolean).join(" · ")}
				</span>
				<section className="rev-act" aria-label="Verdict">
					{!verdict && open > 0 && <span className="rev-open">{open} open</span>}
					{verdict ? (
						<span className="chip chip--quiet">
							{approved
								? [
										"Approved",
										task?.state === "done" ? "work item closed" : open > 0 && `${open} open`,
									]
										.filter(Boolean)
										.join(" · ")
								: `Rejected · sent to ${first(sender)}`}
						</span>
					) : yours ? (
						<>
							<button
								type="button"
								className="btn"
								aria-expanded={rejecting}
								onClick={() => setRejecting(true)}
							>
								Reject
							</button>
							<button
								type="button"
								className="btn btn--accent"
								onClick={() =>
									void send({ threadId, verdict: { decision: "approve", resolvesMessageId: id } })
								}
							>
								Approve
							</button>
						</>
					) : (
						<span className="chip chip--quiet">
							{r.reviewer ? `Needs review by ${first(r.reviewer)}` : "Needs review"}
						</span>
					)}
				</section>
				{rejecting && !verdict && (
					<div className="reject" role="dialog" aria-label="Reject this review">
						<label className="reject-h" htmlFor="reject-reason">
							Why are you rejecting this?
						</label>
						<textarea
							id="reject-reason"
							rows={4}
							value={reason}
							placeholder="What is wrong, and what should happen instead…"
							onChange={(e) => setReason(e.target.value)}
						/>
						<p className="reject-to">
							Goes back to {first(sender)} and the session that raised this review.
						</p>
						<div className="reject-act">
							<button type="button" className="btn" onClick={() => setRejecting(false)}>
								Cancel
							</button>
							<button
								type="button"
								className="btn btn--accent"
								disabled={reason.trim() === ""}
								onClick={async () => {
									const sent = await send({
										threadId,
										verdict: { decision: "reject", resolvesMessageId: id, note: reason.trim() },
									});
									if (sent) setRejecting(false);
								}}
							>
								Reject and send
							</button>
						</div>
					</div>
				)}
			</header>
			{problem && <p className="composer-problem">{problem}</p>}

			<div className="rev-scroll">
				<div className="rev-in">
					{previous && (
						<button
							type="button"
							className="prev-round"
							onClick={() => lookAt(previous.message.id)}
						>
							<span className="prev-round-h">
								Round {rounds.length - 1} ·{" "}
								{prevVerdict
									? `${prevVerdict.decision === "approve" ? "approved" : "rejected"} by ${prevVerdict.by === you ? "you" : first(prevVerdict.by)}`
									: "not decided"}
							</span>
							{prevVerdict?.note && (
								<span className="prev-round-why">"{firstSentence(prevVerdict.note)}"</span>
							)}
							<span className="prev-round-meta">
								{prevOpen === 0
									? "No questions open there"
									: `${prevOpen} ${prevOpen === 1 ? "question" : "questions"} still open there`}{" "}
								· open round {rounds.length - 1} ›
							</span>
						</button>
					)}
					{verdict?.decision === "reject" && (
						<div className="rejected">
							<span className="rejected-h">
								{verdict.by === you ? "You rejected this" : `${first(verdict.by)} rejected this`} ·{" "}
								{first(sender)}'s session has {verdict.by === you ? "your" : "the"} reason
							</span>
							<p className="rejected-why">{verdict.note}</p>
							{next ? (
								<button type="button" className="rejected-next" onClick={() => lookAt(next.id)}>
									{first(sender)} answered with round {rounds.length + 1} · open round{" "}
									{rounds.length + 1} ›
								</button>
							) : (
								<span className="rejected-next">{first(sender)} answers in this thread.</span>
							)}
						</div>
					)}
					{r.reasoning.map((line) => (
						<p className="rev-said" key={line}>
							{line}
						</p>
					))}

					{(r.changed?.length ?? 0) > 0 && (
						<div className="since">
							<span className="since-h">Changed since round {rounds.length - 1}</span>
							<ul>
								{r.changed?.map((c) => (
									<li key={c}>{c}</li>
								))}
							</ul>
						</div>
					)}

					{task && (task.doneWhen.length > 0 || task.reasons.length > 0) && (
						<div className="rev-loop">
							<div>
								{task.doneWhen.length > 0 && (
									<Closes title="How this closes" items={task.doneWhen.map(toClose)} />
								)}
							</div>
							<div>{task.reasons.length > 0 && <Reasons items={task.reasons.map(toReason)} />}</div>
						</div>
					)}

					{parts.map((part) => (
						<div className="art" key={part.id}>
							<div className="art-bar">
								<span className="art-kind">{part.label}</span>
								<span className="art-title">{partTitle(part)}</span>
								{(part.kind === "preview" || part.kind === "code" || part.kind === "image") && (
									<span className="art-tools">
										<button
											type="button"
											className="tool"
											onClick={() => {
												setWide(part.id);
												setOpenPin(null);
												setDraft(null);
											}}
										>
											More space
										</button>
									</span>
								)}
							</div>
							{body(part)}
						</div>
					))}

					{pins.length > 0 && (
						<section className="qa" aria-label="Questions on this review">
							<div className="qa-head">
								<span className="qa-title">Questions on this review</span>
								<span className="qa-counts">
									{open > 0 && <span>{open} open</span>}
									{answered > 0 && <span>{answered} answered</span>}
									<span>{pins.length} total</span>
								</span>
							</div>
							{pins.map((p) => {
								const answer = [...p.replies].reverse().find((m) => m.senderId !== p.asker);
								return (
									<button
										key={p.key}
										type="button"
										className="qa-row"
										onClick={() => openPinAt(p.key)}
									>
										<span
											className={`qa-mark pin--${p.state !== "open" ? "done" : p.flag ? "agent" : "mine"}`}
										>
											{p.mark}
										</span>
										<span>
											<span className="qa-where">
												{p.flag
													? `${first(p.asker)} flagged`
													: p.asker === you
														? "You asked"
														: `${first(p.asker)} asked`}{" "}
												· on {p.pin.label}
											</span>
											<span className="qa-q">{p.says}</span>
											{answer && (
												<span className="qa-a">{(answer.payload as PlainReadPayload).text}</span>
											)}
										</span>
										<span
											className={`qa-state qa-state--${p.state === "settled" ? "done" : p.state}`}
										>
											{p.state === "open"
												? "Open"
												: p.state === "answered"
													? "Answered"
													: "Settled"}
										</span>
									</button>
								);
							})}
						</section>
					)}

					<div className="overall">
						<span className="overall-h">Anything overall?</span>
						<Composer
							label="Overall comment"
							placeholder="Comment on the whole thing, or @someone…"
							pickerHead="Hand to"
							pickerKeys={["hand on", "keep it"]}
							onSend={(text) => send({ threadId, text })}
						/>
					</div>
				</div>
			</div>
		</section>
	);
}

/** The box under a pin's thread: ↵ sends, esc closes. */
function Say({
	label,
	placeholder,
	onSend,
	onCancel,
}: {
	label: string;
	placeholder: string;
	onSend: (text: string) => Promise<boolean>;
	onCancel: () => void;
}) {
	const [text, setText] = useState("");
	const [sending, setSending] = useState(false);
	const submit = async () => {
		if (text.trim() === "" || sending) return;
		setSending(true);
		const sent = await onSend(text.trim());
		setSending(false);
		if (sent) setText("");
	};
	return (
		<form
			className="pop-reply"
			onSubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<input
				value={text}
				placeholder={placeholder}
				aria-label={label}
				// biome-ignore lint/a11y/noAutofocus: pointing at something opens its box to type in
				autoFocus
				onChange={(e) => setText(e.target.value)}
				onKeyDown={(e) => e.key === "Escape" && onCancel()}
			/>
			<button type="submit" className="btn" disabled={text.trim() === "" || sending}>
				Send
			</button>
		</form>
	);
}
