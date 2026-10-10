import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";

/**
 * THINK — a document stays a document; conversation is a layer on top, in the margin. A comment
 * waiting there is faded, and its text carries only a faint dashed underline, so reading is never
 * disturbed. Open it and its text is highlighted, with two ends you can drag to change what the
 * comment covers. Edit mode shows a caret, block handles and an "Editing" mark; view mode shows
 * none of them. Sessions belong to threads, never to the document.
 */
export const THINK_STEPS = [
	{ id: 0, name: "Edit mode: write" },
	{ id: 1, name: "Comment on a block" },
	{ id: 2, name: "Drag to narrow the region" },
	{ id: 3, name: "Answer + suggestion" },
	{ id: 4, name: "Accepted, comment in the background" },
	{ id: 5, name: "Hand off from the doc" },
	{ id: 6, name: "Published, view mode" },
];

type BlockId = "intro" | "know" | "decision";
/** none · writing the first comment · open · closed (waiting in the margin) · resolved (off the page) */
type ThreadState = "none" | "compose" | "open" | "closed" | "resolved";
/** First and last word a comment covers, counted across the block's lines. */
type Region = [number, number];

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
	region: Region | null;
}

const INTRO = ["Growth's option B shortens trials to 10 days. Before we decide, I want to know what we would lose."];
const KNOW = ["Trials run 14 days, card up front.", "Since the warning email, 27% more trials convert.", "Most cancellations happen on day 13."];
const KNOW_ADDED = "61% of people who pay decide by day 9; 1 in 5 decide on days 11–14.";
const DECISION = ["Try 10 days for new signups for two weeks, and watch refund requests."];

const count = (lines: string[]) => lines.reduce((n, l) => n + l.split(" ").length, 0);
const whole = (lines: string[]): Region => [0, count(lines) - 1];
const line = (lines: string[], i: number): Region => {
	const start = count(lines.slice(0, i));
	return [start, start + lines[i].split(" ").length - 1];
};

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
function Field({ draft = "", placeholder, button, compact, note, onPost, onCancel }: {
	draft?: string; placeholder: string; button: string; compact?: boolean; note?: string;
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
			{note && <p className="fld-note">{note}</p>}
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
function ThreadView({ t, onClose, onResolve, onReply, task }: {
	t: Thread; onClose: () => void; onResolve: () => void; onReply: (text: string) => void; task?: React.ReactNode;
}) {
	return (
		<div className="tv">
			<div className="tv-head">
				<span className="tv-where">Also in Conversations</span>
				<button type="button" className="tv-btn" onClick={onResolve}>✓ Resolve</button>
				<button type="button" className="tv-btn" onClick={onClose} aria-label="Close thread">×</button>
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

/** A comment waiting in the margin, faded: who is in it, how many, the latest. Click to open. */
function Summary({ t, onOpen }: { t: Thread; onOpen: () => void }) {
	const last = t.msgs[t.msgs.length - 1];
	const people = [...new Map(t.msgs.map((m) => [m.av, m])).values()];
	return (
		<button type="button" className="sum" onClick={onOpen}>
			<span className="sum-avs">{people.map((m) => <Av key={m.av} m={m} />)}</span>
			<span className="sum-n">{t.msgs.length} {t.msgs.length === 1 ? "comment" : "comments"}</span>
			{last && <span className="sum-last">{last.who}: {last.plain}</span>}
		</button>
	);
}

function Block({ edit, active, heading, children, side, under }: {
	edit: boolean; active?: boolean; heading?: boolean; children: React.ReactNode; side?: React.ReactNode; under?: React.ReactNode;
}) {
	return (
		<div className={["blk", heading && "blk--h", edit && "blk--edit"].filter(Boolean).join(" ")}>
			<div className="blk-row">
				{edit && <span className={active ? "blk-handle blk-handle--on" : "blk-handle"} aria-hidden="true">⠿</span>}
				{children}
			</div>
			{side}
			{under}
		</div>
	);
}

export function Think({ step }: { step: number }) {
	const [published, setPublished] = useState(step === 6);
	const [edit, setEdit] = useState(step < 6);
	const [hidden, setHidden] = useState(false);
	const [sugg, setSugg] = useState<"pending" | "accepted" | "discarded">(step >= 4 ? "accepted" : "pending");
	const [justResolved, setJustResolved] = useState<BlockId | null>(null);
	const [drag, setDrag] = useState<{ id: BlockId; end: 0 | 1 } | null>(null);
	const decided = step >= 5;
	const lines: Record<BlockId, string[]> = {
		intro: INTRO,
		know: step >= 3 && sugg === "accepted" ? [...KNOW, KNOW_ADDED] : KNOW,
		decision: decided ? DECISION : [],
	};
	const [threads, setThreads] = useState<Record<BlockId, Thread>>({
		intro: { state: "none", msgs: [], region: null },
		know: step === 1 ? { state: "compose", msgs: [], region: whole(KNOW) }
			: step === 2 ? { state: "compose", msgs: [], region: line(KNOW, 2) }
			: step === 3 ? { state: "open", msgs: [ASK, ANSWER], region: line(KNOW, 2) }
			: step >= 4 ? { state: "closed", msgs: [ASK, ANSWER], region: line(KNOW, 2) }
			: { state: "none", msgs: [], region: null },
		decision: step === 5 ? { state: "open", msgs: [HAND, TAKE], region: whole(DECISION) }
			: step === 6 ? { state: "closed", msgs: [HAND, TAKE], region: whole(DECISION) }
			: { state: "none", msgs: [], region: null },
	});

	const setState = (id: BlockId, state: ThreadState) => setThreads((t) => ({ ...t, [id]: { ...t[id], state } }));
	/** One comment is in front at a time; opening one sends any other back to the margin. */
	const open = (id: BlockId) =>
		setThreads((t) => {
			const next = { ...t };
			for (const k of Object.keys(next) as BlockId[]) if (next[k].state === "open") next[k] = { ...next[k], state: "closed" };
			next[id] = { ...next[id], state: "open" };
			return next;
		});
	const compose = (id: BlockId) => setThreads((t) => ({ ...t, [id]: { state: "compose", msgs: [], region: whole(lines[id]) } }));
	const close = (id: BlockId) => setThreads((t) => ({ ...t, [id]: t[id].msgs.length ? { ...t[id], state: "closed" } : { state: "none", msgs: [], region: null } }));
	const post = (id: BlockId, text: string) =>
		setThreads((t) => ({
			...t,
			[id]: { ...t[id], state: "open", msgs: [...t[id].msgs, { id: `m${t[id].msgs.length}-${Date.now()}`, who: "You", av: "FO", when: "now", plain: text }] },
		}));
	const moveEnd = (id: BlockId, end: 0 | 1, to: number) =>
		setThreads((t) => {
			const r = t[id].region;
			if (!r) return t;
			const region: Region = end === 0 ? [Math.max(0, Math.min(to, r[1])), r[1]] : [r[0], Math.min(count(lines[id]) - 1, Math.max(to, r[0]))];
			return region[0] === r[0] && region[1] === r[1] ? t : { ...t, [id]: { ...t[id], region } };
		});

	const pageRef = useRef<HTMLElement>(null);
	// A margin comment sits level with the first line it is about, not with the top of its block.
	useLayoutEffect(() => {
		for (const card of pageRef.current?.querySelectorAll<HTMLElement>(".mg") ?? []) {
			const blk = card.closest(".blk")?.getBoundingClientRect();
			const anchor = card.closest(".blk")?.querySelector<HTMLElement>(".anc")?.getBoundingClientRect();
			if (blk && anchor) card.style.top = `${anchor.top - blk.top - 6}px`;
		}
	});

	// Dragging an end of the highlight: the end follows the word under the pointer.
	useEffect(() => {
		if (!drag) return;
		const move = (e: MouseEvent) => {
			const word = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(`[data-b="${drag.id}"]`);
			if (word) moveEnd(drag.id, drag.end, Number(word.dataset.w));
		};
		const up = () => setDrag(null);
		document.addEventListener("mousemove", move);
		document.addEventListener("mouseup", up);
		return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
	});

	// A click on the page outside an open comment sends it back to the margin.
	useEffect(() => {
		const down = (e: MouseEvent) => {
			const el = e.target as Element;
			if (!el.closest?.(".page") || el.closest(".mg, .anc, .anc-h, .blk-side")) return;
			setThreads((t) => {
				const next = { ...t };
				for (const k of Object.keys(next) as BlockId[]) if (next[k].state === "open") next[k] = { ...next[k], state: "closed" };
				return next;
			});
		};
		document.addEventListener("mousedown", down);
		return () => document.removeEventListener("mousedown", down);
	}, []);

	const anyComments = Object.values(threads).some((t) => t.state === "open" || t.state === "closed");

	/**
	 * A block's lines, word by word. The words a comment covers get a faint dashed underline while
	 * the comment waits in the margin, and a highlight with two draggable ends while it is open.
	 */
	const words = (id: BlockId): React.ReactNode[] => {
		const t = threads[id];
		const state = hidden ? "none" : t.state;
		const r = state === "none" || state === "resolved" ? null : t.region;
		const front = state === "open" || state === "compose";
		const grip = (end: 0 | 1) => (
			<button
				type="button" className={end === 0 ? "anc-h anc-h--start" : "anc-h anc-h--end"}
				aria-label={end === 0 ? "Drag to change where the comment starts" : "Drag to change where the comment ends"}
				title="Drag to change what this comment covers"
				onMouseDown={(e) => { e.preventDefault(); setDrag({ id, end }); }}
				onKeyDown={(e) => {
					if (!r) return;
					if (e.key === "ArrowLeft") moveEnd(id, end, r[end] - 1);
					if (e.key === "ArrowRight") moveEnd(id, end, r[end] + 1);
				}}
			/>
		);
		let i = 0;
		return lines[id].map((text) => {
			const ws = text.split(" ").map((w) => ({ w, idx: i++ }));
			const run = (items: { w: string; idx: number }[]) =>
				items.flatMap(({ w, idx }, k) => [k ? " " : "", <span key={idx} data-b={id} data-w={idx}>{w}</span>]);
			const mid = r ? ws.filter((x) => x.idx >= r[0] && x.idx <= r[1]) : [];
			if (!(r && mid.length)) return run(ws);
			const pre = ws.filter((x) => x.idx < r[0]);
			const post = ws.filter((x) => x.idx > r[1]);
			return (
				<>
					{run(pre)}{pre.length > 0 && " "}
					{/* biome-ignore lint/a11y/noStaticElementInteractions: the margin summary is the keyboard way to open a comment; the text is a pointer shortcut */}
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: same */}
					<span className={front ? "anc anc--on" : "anc anc--bg"} onClick={front ? undefined : () => open(id)}>
						{front && mid[0].idx === r[0] && grip(0)}
						{run(mid)}
						{front && mid[mid.length - 1].idx === r[1] && grip(1)}
					</span>
					{post.length > 0 && " "}{run(post)}
				</>
			);
		});
	};

	/** What a block has in the margin: the comment button, a faded waiting comment, or the open one. */
	const margin = (id: BlockId, task?: React.ReactNode): { side?: React.ReactNode; under?: React.ReactNode } => {
		const t = threads[id];
		const add = lines[id].length > 0 && (
			<span className="blk-side">
				<button type="button" className="blk-add" onClick={() => compose(id)} aria-label="Comment on this block" title="Comment">
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
		if (t.state === "closed") return { side: <aside className="mg"><Summary t={t} onOpen={() => open(id)} /></aside> };
		return {
			side: (
				<aside className="mg mg--on">
					{t.state === "compose" ? (
						<Field
							draft={id === "know" ? ASK_TEXT : ""} placeholder="Comment, or @mention someone" button="Comment"
							note="Drag the ends of the highlight to change what this covers."
							onPost={(text) => post(id, text)} onCancel={() => close(id)}
						/>
					) : (
						<ThreadView
							t={t} onClose={() => close(id)} onResolve={() => { setState(id, "resolved"); setJustResolved(id); }}
							onReply={(text) => post(id, text)} task={task}
						/>
					)}
				</aside>
			),
		};
	};

	const intro = words("intro");
	const know = words("know");
	const decision = words("decision");

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
					<article className={drag ? "page page--dragging" : "page"} ref={pageRef}>
						<h1 className="page-title">🤔 Should trials be 10 days?</h1>

						<Block edit={edit} {...margin("intro")}>
							<p>{intro[0]}</p>
						</Block>

						<Block edit={edit} heading><h3>What we know</h3></Block>
						<Block edit={edit} {...margin("know")}>
							<ul>
								{know.map((item, i) => <li key={lines.know[i]}>{item}</li>)}
								{step >= 3 && sugg === "pending" && (
									<li>
										<span className="sugg-text">{KNOW_ADDED}</span>
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
						<Block
							edit={edit} active
							{...margin("decision", (
								<button type="button" className="cm-task">
									<span className="cm-task-k">Task</span>
									<span className="cm-task-t">10-day trial for new signups</span>
									<span className="cm-task-s">Builder · Queued</span>
								</button>
							))}
						>
							<p className={decided ? undefined : "page-empty"}>
								{decided ? decision[0] : "Not yet"}
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
