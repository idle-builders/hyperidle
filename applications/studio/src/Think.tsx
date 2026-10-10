import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";

/**
 * THINK — a document stays a document; conversation is a layer on top. A comment marks the text
 * it is about, like a highlighter, and its thread shows in one of three styles under comparison:
 * beside the text in the margin, in a pop-up over it, or folded under the block. Edit mode shows a
 * caret, block handles and an "Editing" mark; view mode shows none of them. Sessions belong to
 * threads, never to the document.
 */
export const THINK_STEPS = [
	{ id: 0, name: "Edit mode: write" },
	{ id: 1, name: "Comment on a line" },
	{ id: 2, name: "Answer + suggestion" },
	{ id: 3, name: "Accepted, thread closed" },
	{ id: 4, name: "Hand off from the doc" },
	{ id: 5, name: "Published, view mode" },
];

export type CommentStyle = "margin" | "popup" | "under";
export const COMMENT_STYLES: { id: CommentStyle; name: string }[] = [
	{ id: "margin", name: "Margin" },
	{ id: "popup", name: "Pop-up" },
	{ id: "under", name: "Under" },
];

type BlockId = "intro" | "know" | "decision";
/** none · writing the first comment · open · closed (only the mark shows) · resolved (off the page) */
type ThreadState = "none" | "compose" | "open" | "closed" | "resolved";

interface Msg {
	id: string;
	who: string;
	av: string;
	agent?: boolean;
	when: string;
	plain: string;
	text?: React.ReactNode;
}
interface Thread {
	state: ThreadState;
	msgs: Msg[];
}

const ASK_TEXT = "@Growth if trials end on day 10, how many people who pay would we lose?";
const ASK: Msg = {
	id: "ask", who: "You", av: "FO", when: "10:42", plain: ASK_TEXT,
	text: <><b className="mention">@Growth</b> if trials end on day 10, how many people who pay would we lose?</>,
};
const ANSWER: Msg = {
	id: "answer", who: "Growth", av: "GR", agent: true, when: "10:44",
	plain: "About 1 in 5. 61% decide by day 9; 1 in 5 decide on days 11–14. I suggested a line for the list.",
};
const HAND: Msg = {
	id: "hand", who: "You", av: "FO", when: "11:05", plain: "@Builder set new signups to a 10-day trial from Monday, for two weeks.",
	text: <><b className="mention">@Builder</b> set new signups to a 10-day trial from Monday, for two weeks.</>,
};
const TAKE: Msg = { id: "take", who: "Builder", av: "BU", agent: true, when: "11:05", plain: "Taking it. I will come back in this thread when it is live." };

function Bubble() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
			<path d="M3 2.5h10a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H7.5L4.5 14v-3H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" strokeLinejoin="round" />
		</svg>
	);
}

function Av({ m }: { m: { av: string; agent?: boolean } }) {
	return <span className={m.agent ? "avatar cm-av" : "avatar avatar--human cm-av"}>{m.av}</span>;
}

/** A text box you can see, with its buttons. A reply box stays one line until you use it. */
function Field({ draft = "", placeholder, button, compact, onPost, onCancel }: {
	draft?: string; placeholder: string; button: string; compact?: boolean;
	onPost: (text: string) => void; onCancel?: () => void;
}) {
	const [text, setText] = useState(draft);
	const [focus, setFocus] = useState(false);
	const post = () => { if (text.trim()) { onPost(text.trim()); setText(""); } };
	const showActs = !compact || focus || text.length > 0;
	return (
		<div className="fld">
			<textarea
				className={compact && !focus && !text ? "fld-in fld-in--one" : "fld-in"} value={text} rows={2} placeholder={placeholder} aria-label={placeholder}
				onChange={(e) => setText(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
				onKeyDown={(e) => {
					if (e.key === "Escape") onCancel?.();
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post();
				}}
			/>
			{showActs && (
				<div className="fld-acts">
					<span className="fld-hint">⌘↵ to send</span>
					{onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
					<button type="button" className="btn btn--accent" disabled={!text.trim()} onMouseDown={(e) => e.preventDefault()} onClick={post}>{button}</button>
				</div>
			)}
		</div>
	);
}

/** An open thread: who said what, then a reply box. Resolve and close sit in its top line. */
function ThreadView({ t, closeLabel, onClose, onResolve, onReply, task }: {
	t: Thread; closeLabel: string; onClose: () => void; onResolve: () => void; onReply: (text: string) => void; task?: React.ReactNode;
}) {
	return (
		<div className="tv">
			<div className="tv-head">
				<span className="tv-where">Also in Conversations</span>
				<button type="button" className="tv-btn" onClick={onResolve}>✓ Resolve</button>
				<button type="button" className="tv-btn" onClick={onClose} aria-label="Close thread">{closeLabel}</button>
			</div>
			{t.msgs.map((m) => (
				<div className="tv-msg" key={m.id}>
					<Av m={m} />
					<div>
						<div className="tv-who"><b>{m.who}</b><span>{m.when}</span></div>
						<div className="tv-text">{m.text ?? m.plain}</div>
					</div>
				</div>
			))}
			{task}
			<Field placeholder="Reply…" button="Reply" compact onPost={onReply} />
		</div>
	);
}

/** A closed thread, as one line: who is in it, how many comments, the latest. Click to open. */
function Summary({ t, onOpen }: { t: Thread; onOpen: () => void }) {
	const last = t.msgs[t.msgs.length - 1];
	const people = [...new Map(t.msgs.map((m) => [m.av, m])).values()];
	return (
		<button type="button" className="sum" onClick={onOpen}>
			<span className="sum-avs">{people.map((m) => <Av key={m.av} m={m} />)}</span>
			<span className="sum-n">{t.msgs.length} comments</span>
			{last && <span className="sum-last">{last.who}: {last.plain}</span>}
		</button>
	);
}

/** A thread over the page. Closes on ×, Escape, or a click anywhere else on the page. */
function PopUp({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const down = (e: MouseEvent) => {
			const t = e.target as Node;
			if (!ref.current?.contains(t) && (t as Element).closest?.(".page")) onClose();
		};
		const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
		document.addEventListener("mousedown", down);
		document.addEventListener("keydown", key);
		return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
	}, [onClose]);
	return <div className="pop" role="dialog" aria-label="Thread" ref={ref}>{children}</div>;
}

function Block({ edit, active, heading, children, side, over, under }: {
	edit: boolean; active?: boolean; heading?: boolean; children: React.ReactNode;
	side?: React.ReactNode; over?: React.ReactNode; under?: React.ReactNode;
}) {
	return (
		<div className={["blk", heading && "blk--h", edit && "blk--edit"].filter(Boolean).join(" ")}>
			<div className="blk-row">
				{edit && <span className={active ? "blk-handle blk-handle--on" : "blk-handle"} aria-hidden="true">⠿</span>}
				{children}
			</div>
			{side}
			{over}
			{under}
		</div>
	);
}

export function Think({ step, style }: { step: number; style: CommentStyle }) {
	const [published, setPublished] = useState(step === 5);
	const [edit, setEdit] = useState(step < 5);
	const [hidden, setHidden] = useState(false);
	const [sugg, setSugg] = useState<"pending" | "accepted" | "discarded">(step >= 3 ? "accepted" : "pending");
	const [justResolved, setJustResolved] = useState<BlockId | null>(null);
	const [threads, setThreads] = useState<Record<BlockId, Thread>>({
		intro: { state: "none", msgs: [] },
		know: step === 1 ? { state: "compose", msgs: [] }
			: step === 2 ? { state: "open", msgs: [ASK, ANSWER] }
			: step >= 3 ? { state: "closed", msgs: [ASK, ANSWER] } : { state: "none", msgs: [] },
		decision: step === 4 ? { state: "open", msgs: [HAND, TAKE] } : step === 5 ? { state: "closed", msgs: [HAND, TAKE] } : { state: "none", msgs: [] },
	});
	const setState = (id: BlockId, state: ThreadState) => setThreads((t) => ({ ...t, [id]: { ...t[id], state } }));
	const post = (id: BlockId, text: string) =>
		setThreads((t) => ({
			...t,
			[id]: { state: "open", msgs: [...t[id].msgs, { id: `m${t[id].msgs.length}-${Date.now()}`, who: "You", av: "FO", when: "now", plain: text }] },
		}));
	const decided = step >= 4;
	const pageRef = useRef<HTMLElement>(null);
	// A thread sits by the text it is about, not by the top of its block: a margin card or a
	// closed thread's count level with it, a pop-up just under it.
	useLayoutEffect(() => {
		for (const card of pageRef.current?.querySelectorAll<HTMLElement>(".mg, .pop, .blk-side--count") ?? []) {
			const blk = card.closest(".blk")?.getBoundingClientRect();
			const anchor = card.closest(".blk")?.querySelector<HTMLElement>(".anc")?.getBoundingClientRect();
			if (!(blk && anchor)) continue;
			if (card.classList.contains("mg")) card.style.top = `${anchor.top - blk.top - 6}px`;
			else if (card.classList.contains("blk-side--count")) card.style.top = `${anchor.top - blk.top}px`;
			else {
				card.style.top = `${anchor.bottom - blk.top + 10}px`;
				card.style.left = `${Math.max(0, anchor.left - blk.left - 12)}px`;
			}
		}
	});
	const anyComments = Object.values(threads).some((t) => t.state === "open" || t.state === "closed");

	/** The commented text, marked like a highlighter. Darker while its thread is open. */
	const mark = (id: BlockId, text: React.ReactNode) => {
		const s = hidden ? "none" : threads[id].state;
		if (s === "none" || s === "resolved") return text;
		const on = s === "open" || s === "compose";
		const open = () => { if (s === "closed") setState(id, "open"); };
		return (
			<mark className={on ? "anc anc--on" : "anc"} title="Open the thread on this text" onClick={open} onKeyDown={(e) => { if (e.key === "Enter") open(); }}>
				{text}
			</mark>
		);
	};

	/** The thread for a block, placed by the comment style under comparison. */
	const layer = (id: BlockId, task?: React.ReactNode): { side?: React.ReactNode; over?: React.ReactNode; under?: React.ReactNode } => {
		const t = threads[id];
		const add = (
			<span className="blk-side">
				<button type="button" className="blk-add" onClick={() => setState(id, "compose")} aria-label="Comment on this block" title="Comment">
					<Bubble />
				</button>
			</span>
		);
		if (hidden || t.state === "none") return { side: add };
		if (t.state === "resolved") {
			return {
				side: add,
				under: justResolved === id && (
					<p className="cm-receipt">
						Resolved. The thread stays in Conversations.{" "}
						<button type="button" onClick={() => { setState(id, "closed"); setJustResolved(null); }}>Undo</button>
					</p>
				),
			};
		}
		const open = () => setState(id, "open");
		const close = () => setState(id, t.msgs.length ? "closed" : "none");
		const body = t.state === "compose" ? (
			<Field
				draft={id === "know" ? ASK_TEXT : ""} placeholder="Comment, or @mention someone" button="Comment"
				onPost={(text) => post(id, text)} onCancel={close}
			/>
		) : (
			<ThreadView
				t={t} closeLabel={style === "under" ? "Hide" : "×"} onClose={close}
				onResolve={() => { setState(id, "resolved"); setJustResolved(id); }}
				onReply={(text) => post(id, text)} task={task}
			/>
		);

		if (style === "margin") {
			return { side: <aside className={t.state === "closed" ? "mg" : "mg mg--on"}>{t.state === "closed" ? <Summary t={t} onOpen={open} /> : body}</aside> };
		}
		if (style === "popup") {
			if (t.state === "closed") {
				return {
					side: (
						<span className="blk-side blk-side--count">
							<button type="button" className="blk-count" onClick={open} aria-label={`Open ${t.msgs.length} comments`}><Bubble />{t.msgs.length}</button>
						</span>
					),
				};
			}
			return { over: <PopUp onClose={close}>{body}</PopUp> };
		}
		return { under: <div className="ub">{t.state === "closed" ? <Summary t={t} onOpen={open} /> : body}</div> };
	};

	const intro = layer("intro");
	const know = layer("know");
	const decision = layer("decision", (
		<button type="button" className="cm-task">
			<span className="cm-task-k">Task</span>
			<span className="cm-task-t">10-day trial for new signups</span>
			<span className="cm-task-s">Builder · Queued</span>
		</button>
	));

	return (
		<>
			<Sidebar initialSpine="knowledge" initialPicked="t-10days" published={published ? ["t-10days"] : []} />
			<section className="detail">
				<header className="detail-head">
					<span className="chip chip--quiet">Document</span>
					<h2>Should trials be 10 days?</h2>
					<span className="doc-state">{published ? "Published · 4 followers told" : "Draft"}</span>
					<span className="doc-act">
						{(anyComments || hidden) && (
							<button type="button" className="tool doc-cm" onClick={() => setHidden(!hidden)}>
								<Bubble />{hidden ? "Show comments" : "Hide comments"}
							</button>
						)}
						{edit ? (
							<>
								<span className="doc-mode">✎ Editing</span>
								<button type="button" className="btn" onClick={() => setEdit(false)}>Done</button>
							</>
						) : (
							<button type="button" className="btn" onClick={() => setEdit(true)}>✎ Edit</button>
						)}
						{!published && (
							<button type="button" className="btn btn--accent" onClick={() => { setPublished(true); setEdit(false); }}>Publish</button>
						)}
					</span>
				</header>

				<div className="detail-scroll">
					<article className={`page page--${style}`} ref={pageRef}>
						<h1 className="page-title">🤔 Should trials be 10 days?</h1>

						<Block edit={edit} {...intro}>
							<p>{mark("intro", "Growth's option B shortens trials to 10 days. Before we decide, I want to know what we would lose.")}</p>
						</Block>

						<Block edit={edit} heading><h3>What we know</h3></Block>
						<Block edit={edit} {...know}>
							<ul>
								<li>Trials run 14 days, card up front.</li>
								<li>Since the warning email, 27% more trials convert.</li>
								<li>{mark("know", "Most cancellations happen on day 13.")}</li>
								{step >= 2 && sugg === "accepted" && <li>61% of people who pay decide by day 9; 1 in 5 decide on days 11–14.</li>}
								{step >= 2 && sugg === "pending" && (
									<li>
										<span className="sugg-text">61% of people who pay decide by day 9; 1 in 5 decide on days 11–14.</span>
										<span className="sugg-meta">
											Suggested by Growth ·{" "}
											<button type="button" onClick={() => setSugg("accepted")}>Accept</button> ·{" "}
											<button type="button" onClick={() => setSugg("discarded")}>Discard</button>
										</span>
									</li>
								)}
							</ul>
						</Block>

						<Block edit={edit} heading><h3>Decision</h3></Block>
						<Block edit={edit} active {...decision}>
							<p className={decided ? undefined : "page-empty"}>
								{decided ? mark("decision", "Try 10 days for new signups for two weeks, and watch refund requests.") : "Not yet"}
								{edit && <span className="caret" />}
							</p>
						</Block>

						{edit && <p className="blk-empty">Type / for a block, @ to ask someone</p>}
					</article>
				</div>
			</section>
		</>
	);
}
