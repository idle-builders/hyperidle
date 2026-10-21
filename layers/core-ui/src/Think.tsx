import {
	type Anchor,
	DOCUMENT_STATUS_LABEL,
	type Message,
	type PlainReadPayload,
	type ProposedChange,
	type Task,
} from "@hyperidle/domain-model";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { call, type InputOf } from "./api";
import { activeFormat, addFormat, DocEditor, useDocText } from "./DocEditor";
import {
	changeAt,
	changeOf,
	commentsOf,
	type DocComment,
	disciplinesOf,
	locate,
	type Range,
	tasksIn,
	UNTITLED,
} from "./doc-page";
import { DOC_FORMATS, FormatBar } from "./FormatBar";
import { listen } from "./live";
import { MentionPicker, useMentionables } from "./MentionPicker";
import { type Mentionable, matching, typedMention } from "./mentionables";
import { RichText } from "./RichText";
import { initials, STATE_WORDS } from "./sidebar-lists";
import { clock } from "./thread-timeline";
import { useAction } from "./useAction";

/**
 * THINK — a document stays a document; conversation is a layer on top, in the margin. A comment
 * waiting there is faded, and its text carries only a faint dashed underline, so reading is never
 * disturbed. Open it and its text is highlighted, with two ends you can drag to change what the
 * comment covers. Anyone — person or agent — proposes a change the same way: inside a comment,
 * as removed and added lines with Apply. Edit mode shows the caret, block handles, an "Editing"
 * mark and the format bar floating at the bottom; view mode shows none of them. Drafts open in
 * edit mode, published documents in view mode. Sessions belong to threads, never to the document.
 */
const NEW = "new";

interface People {
	readonly you: string;
	/** "You", or a first name. */
	readonly name: (id: string) => string;
	readonly initials: (id: string) => string;
	readonly human: (id: string) => boolean;
}

/** Who a document is for: every agent, or only agents of one discipline. People read every document. */
function ForPick({
	value,
	choices,
	onPick,
}: {
	value: string | null;
	choices: readonly string[];
	onPick: (discipline: string | null) => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<span className="for">
			<button type="button" className="for-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
				For {value ?? "everyone"}
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
			{open && (
				<div className="team-menu for-menu" role="menu" aria-label="Who this document is for">
					{[null, ...choices].map((f) => (
						<button
							key={f ?? "everyone"}
							type="button"
							role="menuitem"
							className="team-row"
							aria-current={(value?.toLowerCase() ?? null) === (f?.toLowerCase() ?? null)}
							onClick={() => {
								onPick(f);
								setOpen(false);
							}}
						>
							<span className="team-mark" aria-hidden="true">
								{(value?.toLowerCase() ?? null) === (f?.toLowerCase() ?? null) && "✓"}
							</span>
							<span className="team-name">{f ?? "Everyone"}</span>
							<span className="team-n">{f ? `agents marked ${f}` : "every agent gets it"}</span>
						</button>
					))}
					<p className="for-note">
						Which agents get it as they work. People can read every document either way.
					</p>
				</div>
			)}
		</span>
	);
}

function Bubble() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.4"
			aria-hidden="true"
		>
			<path
				d="M3 2.5h10a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H7.5L4.5 14v-3H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function Av({ id, people }: { id: string; people: People }) {
	return (
		<span className={people.human(id) ? "avatar avatar--human cm-av" : "avatar cm-av"}>
			{people.initials(id)}
		</span>
	);
}

/** A proposed change as diff lines: old in red, new in green. Apply puts it into the document. */
function ChangeBox({
	c,
	people,
	onApply,
	onDismiss,
}: {
	c: ProposedChange;
	people: People;
	onApply: () => void;
	onDismiss: () => void;
}) {
	const was = c.from.split("\n");
	const now = c.to.split("\n").filter(Boolean);
	const rows = [
		...was.filter((l) => !now.includes(l)).map((l) => ({ kind: "out", sign: "−", l })),
		...now.map((l) =>
			was.includes(l) ? { kind: "same", sign: "", l } : { kind: "in", sign: "+", l },
		),
	];
	const by = c.settled ? people.name(c.settled.by) : "";
	return (
		<div className={c.settled?.state === "dismissed" ? "chg chg--off" : "chg"}>
			<div className="chg-h">Proposed change</div>
			{rows.map((r) => (
				<div key={`${r.kind}${r.l}`} className={`chg-l chg-l--${r.kind}`}>
					<span className="chg-s">{r.sign}</span>
					<span>{r.l}</span>
				</div>
			))}
			<div className="chg-f">
				{c.settled ? (
					<span>{c.settled.state === "applied" ? `✓ Applied by ${by}` : `Dismissed by ${by}`}</span>
				) : (
					<>
						<button type="button" className="btn btn--accent" onClick={onApply}>
							Apply
						</button>
						<button type="button" className="btn" onClick={onDismiss}>
							Dismiss
						</button>
					</>
				)}
			</div>
		</div>
	);
}

/**
 * A text box you can see, with its buttons. A reply box stays one line until you use it.
 * "Propose a change" adds the covered text below, to edit into what it should become. Typing @
 * opens the mention picker.
 */
function Field({
	placeholder,
	button,
	compact,
	note,
	covers,
	everyone,
	onPost,
	onCancel,
}: {
	placeholder: string;
	button: string;
	compact?: boolean;
	note?: string;
	covers?: string;
	everyone: readonly Mentionable[];
	onPost: (text: string, to?: string) => Promise<boolean>;
	onCancel?: () => void;
}) {
	const box = useRef<HTMLTextAreaElement>(null);
	const [text, setText] = useState("");
	const [caret, setCaret] = useState(0);
	const [to, setTo] = useState<string | null>(null);
	const [focus, setFocus] = useState(false);
	const [active, setActive] = useState(0);
	const [busy, setBusy] = useState(false);
	const changed = to !== null && to !== covers;
	const ready = (text.trim().length > 0 || changed) && !busy;
	const typed = focus ? typedMention(text, caret) : null;
	const options = typed ? matching(everyone, typed.query) : [];
	const chosen = Math.min(active, Math.max(0, options.length - 1));
	const pick = (m: Mentionable) => {
		if (!typed) return;
		const name = `@${m.name} `;
		setText(text.slice(0, typed.at) + name + text.slice(caret));
		setCaret(typed.at + name.length);
		box.current?.focus();
	};
	const post = async () => {
		if (!ready) return;
		setBusy(true);
		const sent = await onPost(text.trim(), changed && to !== null ? to : undefined);
		setBusy(false);
		if (!sent) return;
		setText("");
		setTo(null);
	};
	const used = !compact || focus || text.length > 0 || to !== null;
	return (
		<div className="fld">
			<textarea
				ref={box}
				className={used ? "fld-in" : "fld-in fld-in--one"}
				value={text}
				rows={2}
				placeholder={placeholder}
				aria-label={placeholder}
				onChange={(e) => {
					setText(e.target.value);
					setCaret(e.target.selectionStart);
					setActive(0);
				}}
				onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
				onFocus={() => setFocus(true)}
				onBlur={() => setFocus(false)}
				onKeyDown={(e) => {
					if (options.length > 0 && e.key === "ArrowDown") {
						e.preventDefault();
						setActive((chosen + 1) % options.length);
					} else if (options.length > 0 && e.key === "ArrowUp") {
						e.preventDefault();
						setActive((chosen - 1 + options.length) % options.length);
					} else if (options.length > 0 && e.key === "Enter") {
						e.preventDefault();
						const m = options[chosen];
						if (m) pick(m);
					} else if (e.key === "Escape") onCancel?.();
					else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void post();
				}}
			/>
			{options.length > 0 && (
				<MentionPicker inline options={options} active={chosen} head="Mention" onPick={pick} />
			)}
			{to !== null && (
				<div className="chg">
					<div className="chg-h">
						<span>Proposed change</span>
						<button type="button" onClick={() => setTo(null)}>
							Remove
						</button>
					</div>
					{covers?.split("\n").map((l) => (
						<div key={l} className="chg-l chg-l--out">
							<span className="chg-s">−</span>
							<span>{l}</span>
						</div>
					))}
					<label className="chg-l chg-l--in">
						<span className="chg-s">+</span>
						<textarea
							className="chg-in"
							value={to}
							rows={1}
							aria-label="Text as it should become"
							onChange={(e) => setTo(e.target.value)}
						/>
					</label>
				</div>
			)}
			{used && covers && to === null && (
				<button
					type="button"
					className="fld-link"
					onMouseDown={(e) => e.preventDefault()}
					onClick={() => setTo(covers)}
				>
					± Propose a change
				</button>
			)}
			{note && <p className="fld-note">{note}</p>}
			{used && (
				<div className="fld-acts">
					<span className="fld-hint">⌘↵ to send</span>
					{onCancel && (
						<button type="button" className="btn" onClick={onCancel}>
							Cancel
						</button>
					)}
					<button
						type="button"
						className="btn btn--accent"
						disabled={!ready}
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => void post()}
					>
						{button}
					</button>
				</div>
			)}
		</div>
	);
}

const textOf = (m: Message): PlainReadPayload | null =>
	m.type === "plain" ? (m.payload as PlainReadPayload) : null;

/** An open comment: who said what, then a reply box. Resolve and close sit in its top line. */
function ThreadView({
	comment,
	tasks,
	people,
	everyone,
	covers,
	onConversation,
	onTask,
	onClose,
	onResolve,
	onReply,
	onSettle,
}: {
	comment: DocComment;
	tasks: readonly Task[];
	people: People;
	everyone: readonly Mentionable[];
	covers?: string;
	onConversation: () => void;
	onTask: (id: string) => void;
	onClose: () => void;
	onResolve: () => void;
	onReply: (text: string, to?: string) => Promise<boolean>;
	onSettle: (m: Message, state: "applied" | "dismissed") => void;
}) {
	return (
		<div className="tv">
			<div className="tv-head">
				<button type="button" className="tv-where" onClick={onConversation}>
					Also in Conversations
				</button>
				<button type="button" className="tv-btn" onClick={onResolve}>
					✓ Resolve
				</button>
				<button type="button" className="tv-btn" onClick={onClose} aria-label="Close comment">
					×
				</button>
			</div>
			{comment.messages.map((m) => {
				const p = textOf(m);
				const change = changeOf(m);
				const mentions = (p?.refs ?? []).flatMap((r) =>
					r.kind === "mention" ? [r.sourceText] : [],
				);
				return (
					<div className="tv-turn" key={m.id}>
						<div className="tv-msg">
							<Av id={m.senderId} people={people} />
							<div>
								<div className="tv-who">
									<b>{people.name(m.senderId)}</b>
									<span>{clock(m.createdAt)}</span>
								</div>
								{p?.text && (
									<div className="tv-text">
										<RichText text={p.text} mentions={mentions} />
									</div>
								)}
							</div>
						</div>
						{change && (
							<ChangeBox
								c={change}
								people={people}
								onApply={() => onSettle(m, "applied")}
								onDismiss={() => onSettle(m, "dismissed")}
							/>
						)}
					</div>
				);
			})}
			{tasks.map((t) => (
				<button key={t.id} type="button" className="cm-task" onClick={() => onTask(t.id)}>
					<span className="cm-task-k">Task</span>
					<span className="cm-task-t">{t.title}</span>
					<span className="cm-task-s">
						{people.name(t.ownerAgentId ?? "")} · {STATE_WORDS[t.state]}
					</span>
				</button>
			))}
			<Field
				placeholder="Reply…"
				button="Reply"
				compact
				covers={covers}
				everyone={everyone}
				onPost={onReply}
			/>
		</div>
	);
}

/** A comment waiting in the margin, faded: who is in it, how many, the latest. Click to open. */
function Summary({
	comment,
	people,
	onOpen,
}: {
	comment: DocComment;
	people: People;
	onOpen: () => void;
}) {
	const last = comment.messages.at(-1);
	const who = [...new Set(comment.messages.map((m) => m.senderId))];
	const n = comment.messages.length;
	return (
		<button type="button" className="sum" onClick={onOpen}>
			<span className="sum-avs">
				{who.map((id) => (
					<Av key={id} id={id} people={people} />
				))}
			</span>
			<span className="sum-n">
				{n} {n === 1 ? "comment" : "comments"}
			</span>
			{last && (
				<span className="sum-last">
					{people.name(last.senderId)}: {textOf(last)?.text || "proposed a change"}
				</span>
			)}
		</button>
	);
}

/** The document's thread: its comments, and the tasks handed off from them. Made on the first comment. */
function useDocThread(docId: string) {
	const found = useAction("search_threads", { host: { kind: "document", id: docId } }, [
		"conversations",
	]);
	const threadId = found.data?.[0]?.id ?? null;
	const [messages, setMessages] = useState<readonly Message[]>([]);
	const [tasks, setTasks] = useState<readonly Task[]>([]);
	const [turn, setTurn] = useState(0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `turn` asks again
	useEffect(() => {
		if (!threadId) return;
		let current = true;
		void Promise.all([
			call("open_thread", { id: threadId }),
			call("search_tasks", { threadId }),
		]).then(([t, k]) => {
			if (!current) return;
			if (t.ok) setMessages(t.data.messages);
			if (k.ok) setTasks(k.data.filter((x) => x.parentTaskId === null));
		});
		return () => {
			current = false;
		};
	}, [threadId, turn]);
	useEffect(
		() =>
			threadId ? listen([`thread:${threadId}`, "tasks"], () => setTurn((t) => t + 1)) : undefined,
		[threadId],
	);
	return { threadId, messages, tasks, reload: () => setTurn((t) => t + 1), found: found.reload };
}

/** The open comment, or the one being written, and the stretch it covers while it is in front. */
interface Front {
	readonly id: string;
	readonly range: Range | null;
}

export function Think({ id }: { id: string }) {
	const navigate = useNavigate();
	const view = useAction("open_document", { id }, [`document:${id}`]);
	const me = useAction("open_user", {});
	const users = useAction("search_users", {});
	const tree = useAction("search_documents", { inTree: true }, ["documents"]);
	const everyone = useMentionables();
	const thread = useDocThread(id);
	const doc = view.data?.document;

	const [edit, setEdit] = useState<boolean | null>(null);
	const [dirty, setDirty] = useState(false);
	const [typed, setTyped] = useState(0);
	const [title, setTitle] = useState<string | null>(null);
	const [problem, setProblem] = useState<string | null>(null);
	const [hidden, setHidden] = useState(false);
	const [front, setFront] = useState<Front | null>(null);
	const [justResolved, setJustResolved] = useState<string | null>(null);
	const [drag, setDrag] = useState<{ end: 0 | 1 } | null>(null);
	const [hover, setHover] = useState<{ top: number; index: number } | null>(null);
	const [picked, setPicked] = useState<{ top: number; range: Range } | null>(null);
	const [linking, setLinking] = useState(false);
	const base = useRef(0);

	const editing = edit === true;
	const text = useDocText(doc?.body ?? null, editing, () => {
		setDirty(true);
		setTyped((t) => t + 1);
	});
	const body = text.markdown();
	const you = me.data?.user?.id ?? "";
	const names = new Map((users.data ?? []).map((u) => [u.id, u]));
	const people: People = {
		you,
		name: (uid) => (uid === you ? "You" : (names.get(uid)?.name.split(" ")[0] ?? "Someone")),
		initials: (uid) => initials(names.get(uid)?.name ?? ""),
		human: (uid) => names.get(uid)?.kind === "human",
	};

	// Drafts open in edit mode, published documents in view mode.
	useEffect(() => {
		if (doc && edit === null) setEdit(doc.status === "proposed");
	}, [doc, edit]);
	// The version the text in the editor is built on; it moves only while nothing is unsaved.
	useEffect(() => {
		if (doc && !dirty) base.current = Math.max(base.current, doc.version);
	}, [doc, dirty]);

	const comments = commentsOf(thread.messages, id);
	const where = new Map(comments.map((c) => [c.id, locate(body, c)]));
	const handed = tasksIn(comments, thread.tasks);
	const regionOf = (cid: string): Range | null =>
		front?.id === cid && front.range ? front.range : (where.get(cid) ?? null);
	const shown = hidden ? [] : comments.filter((c) => !c.resolved);
	const highlights = [
		...shown.flatMap((c) => {
			const range = regionOf(c.id);
			return range ? [{ id: c.id, range, front: front?.id === c.id }] : [];
		}),
		...(front?.id === NEW && front.range ? [{ id: NEW, range: front.range, front: true }] : []),
	];
	useEffect(() => text.draw(highlights));

	/** Every write to the document goes through here, on the version the page is built on. */
	const write = async (patch: Omit<InputOf<"edit_document">, "id" | "version">) => {
		const done = await call("edit_document", {
			id,
			version: base.current || doc?.version,
			...patch,
		});
		if (!done.ok) {
			setProblem(
				done.problems[0]?.code === "stale"
					? "Someone else saved this document while you were writing. Your text is still here: copy it, then reload to see theirs."
					: (done.problems[0]?.message ?? "That did not save."),
			);
			return false;
		}
		base.current = done.data.document.version;
		setProblem(null);
		view.reload();
		return true;
	};

	const save = async (): Promise<boolean> => {
		if (!doc) return false;
		const next = text.markdown();
		const named = (title ?? doc.title).trim() || doc.title;
		if (next === doc.body && named === doc.title) {
			setDirty(false);
			return true;
		}
		const saved = await write({
			...(next !== doc.body ? { body: next } : {}),
			...(named !== doc.title ? { title: named } : {}),
		});
		if (saved) {
			setDirty(false);
			setTitle(null);
		}
		return saved;
	};
	const saveRef = useRef(save);
	saveRef.current = save;
	// Leaving the page keeps what was written.
	useEffect(() => () => void saveRef.current(), []);
	// What is written saves itself a moment after typing stops.
	useEffect(() => {
		if (!(dirty || title !== null) || typed < 0) return;
		const timer = setTimeout(() => void saveRef.current(), 1200);
		return () => clearTimeout(timer);
	}, [dirty, title, typed]);

	const ensureThread = async (): Promise<string | null> => {
		if (thread.threadId) return thread.threadId;
		const made = await call("adjust_thread", {
			host: { kind: "document", id },
			title: doc?.title ?? null,
		});
		if (!made.ok) {
			setProblem(made.problems[0]?.message ?? "The comment could not start.");
			return null;
		}
		thread.found();
		return made.data.thread.id;
	};

	/** A comment covers what it covers in the saved text, so anything unsaved is saved first. */
	const post = async (
		commentId: string | null,
		range: Range,
		words: string,
		to?: string,
	): Promise<boolean> => {
		if (!(await save())) return false;
		const threadId = await ensureThread();
		if (!threadId) return false;
		const saved = text.markdown();
		const covered = saved.slice(range.start, range.end);
		const anchor: Anchor = {
			id: commentId ?? crypto.randomUUID(),
			part: id,
			label: covered.slice(0, 128),
			spot: { kind: "range", start: range.start, end: range.end },
		};
		const sent = await call("send_message", {
			threadId,
			text: words,
			anchor,
			...(to !== undefined ? { change: { from: covered, to } } : {}),
		});
		if (!sent.ok) {
			setProblem(sent.problems[0]?.message ?? "It did not send.");
			return false;
		}
		setProblem(null);
		setFront({ id: anchor.id, range: null });
		thread.reload();
		return true;
	};

	const settle = async (c: DocComment, m: Message, state: "applied" | "dismissed") => {
		const change = changeOf(m);
		const threadId = thread.threadId;
		if (!(change && threadId)) return;
		if (state === "applied") {
			if (!(await save())) return;
			const pin = textOf(m)?.anchor;
			const saved = text.markdown();
			const at = pin ? locate(saved, { ...c, anchor: pin, messages: [m] }) : null;
			const next = at ? changeAt(saved, at, change) : null;
			if (next === null) {
				setProblem(
					"The text this change is for has changed since. Propose it again on the new text.",
				);
				return;
			}
			if (!(await write({ body: next }))) return;
			text.editor?.commands.setContent(next, { emitUpdate: false });
		}
		const done = await call("adjust_thread", {
			id: threadId,
			message: { id: m.id, change: state },
		});
		if (!done.ok) setProblem(done.problems[0]?.message ?? "That did not work.");
		thread.reload();
	};

	const resolve = async (c: DocComment, resolved: boolean) => {
		if (!thread.threadId) return;
		await call("adjust_thread", { id: thread.threadId, message: { id: c.first.id, resolved } });
		setJustResolved(resolved ? c.id : null);
		if (resolved) setFront(null);
		thread.reload();
	};

	const follow = me.data?.subscriptions.find(
		(s) => s.objectId === id && s.event === "document.changed",
	);
	const toggleFollow = async () => {
		await call("edit_user", {
			id: you,
			subscriptions: follow
				? { remove: [follow.id] }
				: { add: [{ event: "document.changed", objectId: id }] },
		});
		me.reload();
	};

	const publish = async () => {
		if (!(await save())) return;
		if (await write({ status: "active" })) setEdit(false);
	};

	const done = async () => {
		if (await save()) setEdit(false);
	};

	// Positions in the margin: each card level with the first line it is about, never on top of another.
	const bodyRef = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const wrap = bodyRef.current;
		const ed = text.editor;
		if (!(wrap && ed)) return;
		const top0 = wrap.getBoundingClientRect().top;
		const cards = [...wrap.querySelectorAll<HTMLElement>(":scope > .mg")].map((el) => {
			const start = Number(el.dataset.start);
			const at = start >= 0 ? text.toEditor({ start, end: start + 1 }) : null;
			const top = at ? ed.view.coordsAtPos(at.from).top - top0 - 6 : 0;
			return { el, top };
		});
		let floor = Number.NEGATIVE_INFINITY;
		for (const card of cards.sort((a, b) => a.top - b.top)) {
			const top = Math.max(card.top, floor);
			card.el.style.top = `${top}px`;
			floor = top + card.el.offsetHeight + 8;
		}
	});

	// Dragging an end of the highlight: the end follows the character under the pointer.
	useEffect(() => {
		if (!(drag && front)) return;
		const move = (e: MouseEvent) => {
			const ed = text.editor;
			const range = front.range ?? where.get(front.id);
			const at = ed?.view.posAtCoords({ left: e.clientX, top: e.clientY });
			const md = at ? text.toText(at.pos, at.pos + 1) : null;
			if (!(range && md)) return;
			const next =
				drag.end === 0
					? { start: Math.min(md.start, range.end - 1), end: range.end }
					: { start: range.start, end: Math.max(md.start, range.start + 1) };
			if (next.start !== range.start || next.end !== range.end)
				setFront({ id: front.id, range: next });
		};
		const up = () => setDrag(null);
		document.addEventListener("mousemove", move);
		document.addEventListener("mouseup", up);
		return () => {
			document.removeEventListener("mousemove", move);
			document.removeEventListener("mouseup", up);
		};
	});

	// A click on the page outside an open comment sends it back to the margin.
	useEffect(() => {
		const down = (e: MouseEvent) => {
			const el = e.target as Element;
			if (!el.closest?.(".page") || el.closest(".mg, .anc, .anc-h, .cm-add")) return;
			setFront((f) => (f && f.id !== NEW ? null : f));
		};
		document.addEventListener("mousedown", down);
		return () => document.removeEventListener("mousedown", down);
	}, []);

	if (view.problems)
		return (
			<section className="detail">
				<header className="detail-head">
					<span className="chip chip--quiet">Document</span>
				</header>
				<div className="detail-scroll">
					<p className="opened-note">
						{view.problems[0]?.message ?? "This document did not load."}
					</p>
				</div>
			</section>
		);

	const published = doc?.status === "active";
	const followers = view.data?.followers ?? 0;
	const state = !doc
		? ""
		: doc.status === "proposed"
			? "Draft"
			: published
				? followers > 0
					? `Published · ${followers} ${followers === 1 ? "follower" : "followers"} told`
					: "Published"
				: DOCUMENT_STATUS_LABEL[doc.status];
	const untitled = doc?.title === UNTITLED && doc.body === "";
	const choices = disciplinesOf(users.data ?? [], tree.data ?? []);
	const coversOf = (r: Range | null) => (r ? body.slice(r.start, r.end) : undefined);

	/** A block's whole text, or the words picked, start a new comment. */
	const compose = (range: Range | null) => {
		if (!range) return;
		setFront({ id: NEW, range });
		setPicked(null);
		window.getSelection()?.removeAllRanges();
	};
	const blockRange = (index: number): Range | null => {
		const ed = text.editor;
		if (!ed) return null;
		let offset = 0;
		for (let i = 0; i < index; i++) offset += ed.state.doc.child(i).nodeSize;
		const node = ed.state.doc.maybeChild(index);
		return node ? text.toText(offset + 1, offset + node.nodeSize - 1) : null;
	};
	const pickWords = () => {
		const ed = text.editor;
		const wrap = bodyRef.current;
		const sel = window.getSelection();
		if (!(ed && wrap && sel && !sel.isCollapsed && ed.view.dom.contains(sel.anchorNode))) {
			setPicked(null);
			return;
		}
		const r = sel.getRangeAt(0);
		const from = ed.view.posAtDOM(r.startContainer, r.startOffset);
		const to = ed.view.posAtDOM(r.endContainer, r.endOffset);
		const range = text.toText(Math.min(from, to), Math.max(from, to));
		const top = r.getBoundingClientRect().top - wrap.getBoundingClientRect().top;
		setPicked(range ? { top, range } : null);
	};

	const card = (c: DocComment) => {
		const range = regionOf(c.id);
		const isFront = front?.id === c.id;
		return (
			<aside key={c.id} className={isFront ? "mg mg--on" : "mg"} data-start={range?.start ?? -1}>
				{isFront ? (
					<ThreadView
						comment={c}
						tasks={handed.get(c.id) ?? []}
						people={people}
						everyone={everyone}
						covers={coversOf(range)}
						onConversation={() => thread.threadId && navigate(`/conversations/${thread.threadId}`)}
						onTask={(t) => navigate(`/work/${t}`)}
						onClose={() => setFront(null)}
						onResolve={() => void resolve(c, true)}
						onReply={(words, to) => (range ? post(c.id, range, words, to) : Promise.resolve(false))}
						onSettle={(m, s) => void settle(c, m, s)}
					/>
				) : (
					<Summary comment={c} people={people} onOpen={() => setFront({ id: c.id, range: null })} />
				)}
			</aside>
		);
	};

	return (
		<section className="detail">
			<header className="detail-head">
				<span className="chip chip--quiet">Document</span>
				<span className="doc-state">{state}</span>
				{doc && (
					<ForPick
						value={doc.discipline}
						choices={choices}
						onPick={(discipline) => void write({ discipline })}
					/>
				)}
				<span className="doc-act">
					{(comments.length > 0 || hidden) && (
						<button type="button" className="tool doc-cm" onClick={() => setHidden(!hidden)}>
							<Bubble />
							{hidden ? "Show comments" : "Hide comments"}
						</button>
					)}
					{!doc ? null : editing ? (
						<>
							<span className="doc-mode">✎ Editing</span>
							<button type="button" className="btn" onClick={() => void done()}>
								Done
							</button>
						</>
					) : (
						<>
							{published && me.data && (
								<button
									type="button"
									className="btn"
									aria-pressed={Boolean(follow)}
									onClick={() => void toggleFollow()}
								>
									{follow ? "Following" : "Follow"}
								</button>
							)}
							<button type="button" className="btn" onClick={() => setEdit(true)}>
								✎ Edit
							</button>
						</>
					)}
					{doc && !published && (
						<button type="button" className="btn btn--accent" onClick={() => void publish()}>
							Publish
						</button>
					)}
				</span>
			</header>
			{problem && <p className="doc-problem">{problem}</p>}

			<div className="detail-scroll">
				<article className={drag ? "page page--dragging" : "page"}>
					{editing ? (
						<div className="page-title page-title--row">
							{doc?.icon && <span>{doc.icon}</span>}
							<input
								className="page-title--edit"
								aria-label="Title"
								placeholder={UNTITLED}
								value={title ?? (untitled ? "" : (doc?.title ?? ""))}
								// biome-ignore lint/a11y/noAutofocus: a new document starts at its title
								autoFocus={untitled}
								onChange={(e) => setTitle(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") text.editor?.commands.focus("start");
								}}
							/>
						</div>
					) : (
						<h1 className="page-title">
							{doc?.icon && `${doc.icon} `}
							{doc?.title}
						</h1>
					)}

					{/* biome-ignore lint/a11y/noStaticElementInteractions: the comment buttons in the margin are the keyboard way in; this only follows the pointer */}
					<div
						className={editing ? "doc-body doc-body--edit" : "doc-body"}
						ref={bodyRef}
						onMouseMove={(e) => {
							const el = (e.target as Element).closest?.(".tiptap > *");
							const wrap = bodyRef.current;
							if (!(el && wrap && el.parentElement)) return;
							const index = [...el.parentElement.children].indexOf(el);
							const top = el.getBoundingClientRect().top - wrap.getBoundingClientRect().top;
							if (hover?.index !== index || hover.top !== top) setHover({ top, index });
						}}
						onMouseUp={pickWords}
						onKeyUp={pickWords}
						onMouseDown={(e) => {
							const g = (e.target as HTMLElement).closest?.<HTMLElement>(".anc-h");
							if (g) {
								e.preventDefault();
								setDrag({ end: g.dataset.end === "0" ? 0 : 1 });
								return;
							}
							const mark = (e.target as HTMLElement).closest?.<HTMLElement>(".anc--bg");
							if (mark?.dataset.comment) setFront({ id: mark.dataset.comment, range: null });
						}}
					>
						<DocEditor text={text} people={everyone} />
						{!hidden && shown.map(card)}
						{front?.id === NEW && (
							<aside className="mg mg--on" data-start={front.range?.start ?? -1}>
								<Field
									placeholder="Comment, or @mention someone"
									button="Comment"
									covers={coversOf(front.range)}
									everyone={everyone}
									note="Drag the ends of the highlight to change what this covers."
									onPost={(words, to) =>
										front.range ? post(null, front.range, words, to) : Promise.resolve(false)
									}
									onCancel={() => setFront(null)}
								/>
							</aside>
						)}
						{justResolved && (
							<p className="cm-receipt mg-receipt">
								Resolved. The thread stays in Conversations.{" "}
								<button
									type="button"
									onClick={() => {
										const c = comments.find((x) => x.id === justResolved);
										if (c) void resolve(c, false);
									}}
								>
									Undo
								</button>
							</p>
						)}
						{picked ? (
							<button
								type="button"
								className="blk-add cm-add"
								style={{ top: picked.top }}
								onMouseDown={(e) => e.preventDefault()}
								onClick={() => compose(picked.range)}
							>
								<Bubble />
								Comment
							</button>
						) : (
							hover && (
								<button
									type="button"
									className="blk-add cm-add cm-add--block"
									style={{ top: hover.top }}
									aria-label="Comment on this block"
									title="Comment"
									onClick={() => compose(blockRange(hover.index))}
								>
									<Bubble />
								</button>
							)
						)}
					</div>
					{editing && (
						<button
							type="button"
							className="blk-empty"
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => {
								const ed = text.editor;
								const last = ed?.state.doc.lastChild;
								if (!ed) return;
								// The line starts a new piece at the end, unless an empty one is already there.
								if (last?.type.name === "paragraph" && last.content.size === 0)
									ed.commands.focus("end");
								else
									ed.chain()
										.insertContentAt(ed.state.doc.content.size, { type: "paragraph" })
										.focus("end")
										.run();
							}}
						>
							Type / for a block, @ to ask someone
						</button>
					)}
				</article>
			</div>
			{editing && (
				<>
					{linking && (
						<LinkBox
							onDone={(href) => {
								setLinking(false);
								const ed = text.editor;
								if (!(ed && href)) return;
								if (ed.state.selection.empty)
									ed.chain()
										.focus()
										.insertContent({
											type: "text",
											text: href,
											marks: [{ type: "link", attrs: { href } }],
										})
										.run();
								else ed.chain().focus().setLink({ href }).run();
							}}
						/>
					)}
					<FormatBar
						floating
						kinds={DOC_FORMATS}
						active={activeFormat(text.editor)}
						onAdd={(kind) => {
							if (kind === "link") setLinking(true);
							else if (text.editor) addFormat(text.editor, kind);
						}}
					/>
				</>
			)}
		</section>
	);
}

/** Where a link goes: typed or pasted, then ↵. */
function LinkBox({ onDone }: { onDone: (href: string | null) => void }) {
	const [href, setHref] = useState("");
	return (
		<input
			className="lnk-url doc-link-box"
			aria-label="Link address"
			placeholder="Paste or type a link…"
			value={href}
			// biome-ignore lint/a11y/noAutofocus: the box opens because a link is being added
			autoFocus
			onChange={(e) => setHref(e.target.value)}
			onBlur={() => onDone(null)}
			onKeyDown={(e) => {
				if (e.key === "Enter") onDone(href.trim() || null);
				if (e.key === "Escape") onDone(null);
			}}
		/>
	);
}
