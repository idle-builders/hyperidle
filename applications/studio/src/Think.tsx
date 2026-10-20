import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DOC_FORMATS, type Format, FormatBar } from "./FormatBar";
import { mentionables } from "./handoff";
import { Sidebar } from "./Sidebar";

/**
 * THINK — a document stays a document; conversation is a layer on top, in the margin. A comment
 * waiting there is faded, and its text carries only a faint dashed underline, so reading is never
 * disturbed. Open it and its text is highlighted, with two ends you can drag to change what the
 * comment covers. Anyone — person or agent — proposes a change the same way: inside a comment,
 * as removed and added lines with Apply. Edit mode shows a caret, block handles, an "Editing"
 * mark and the format bar floating at the bottom; view mode shows none of them. Sessions belong to
 * threads, never to the document.
 */
/** Who a document is for: every agent, or only agents of one discipline. People read every document. */
const FOR = ["Everyone", "Design", "Engineering", "Growth", "Product", "Research", "Support"];

function ForPick({ open: initial }: { open: boolean }) {
	const [open, setOpen] = useState(initial);
	const [value, setValue] = useState("Growth");
	return (
		<span className="for">
			<button type="button" className="for-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
				For {value === "Everyone" ? "everyone" : value}
				<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
			</button>
			{open && (
				<div className="team-menu for-menu" role="menu" aria-label="Who this document is for">
					{FOR.map((f) => (
						<button key={f} type="button" role="menuitem" className="team-row" aria-current={value === f} onClick={() => { setValue(f); setOpen(false); }}>
							<span className="team-mark" aria-hidden="true">{value === f && "✓"}</span>
							<span className="team-name">{f}</span>
							<span className="team-n">{f === "Everyone" ? "every agent gets it" : `agents marked ${f}`}</span>
						</button>
					))}
					<p className="for-note">Which agents get it as they work. People can read every document either way.</p>
				</div>
			)}
		</span>
	);
}

export const THINK_STEPS = [
	{ id: 0, name: "Edit mode: write" },
	{ id: 1, name: "Add a table from the format bar" },
	{ id: 2, name: "Comment on a block" },
	{ id: 3, name: "Drag to narrow the region" },
	{ id: 4, name: "Reply proposes a change" },
	{ id: 5, name: "Change applied" },
	{ id: 6, name: "Hand off from the doc" },
	{ id: 7, name: "Published, view mode" },
	{ id: 8, name: "Who it is for: agents of one discipline" },
];
/** The walkthrough's steps by name, so the story below reads without counting. */
const AT = { add: 1, comment: 2, narrow: 3, propose: 4, applied: 5, handoff: 6, published: 7 };

type BlockId = "intro" | "know" | "decision";
/** none · writing the first comment · open · closed (waiting in the margin) · resolved (off the page) */
type ThreadState = "none" | "compose" | "open" | "closed" | "resolved";
/** First and last word a comment covers, counted across the block's lines. */
type Region = [number, number];

/** A change proposed inside a comment: the covered text as it was, and as it should become. */
interface Change {
	from: string;
	to: string;
	state: "open" | "applied" | "dismissed";
	by?: string;
}
interface Msg {
	id: string;
	who: string;
	av: string;
	agent?: boolean;
	when: string;
	plain: string;
	text?: React.ReactNode;
	change?: Change;
}
interface Thread {
	state: ThreadState;
	msgs: Msg[];
	region: Region | null;
}

const INTRO = ["Growth's option B shortens trials to 10 days. Before we decide, I want to know what we would lose."];
const KNOW = ["Trials run 14 days, card up front.", "Since the warning email, 27% more trials convert.", "Most cancellations happen on day 13."];
const KNOW_NEW = "Most cancellations happen on day 13, and 1 in 5 people who pay decide on days 11–14.";
const DECISION = ["Try 10 days for new signups for two weeks, and watch refund requests."];

const count = (lines: string[]) => lines.reduce((n, l) => n + l.split(" ").length, 0);
const whole = (lines: string[]): Region => [0, count(lines) - 1];
const span = (lines: string[], first: number, last = first): Region => {
	const start = count(lines.slice(0, first));
	return [start, start + count(lines.slice(first, last + 1)) - 1];
};

/** The text a region covers, one covered line per line. */
const covered = (lines: string[], [a, b]: Region): string => {
	let start = 0;
	const out: string[] = [];
	for (const l of lines) {
		const ws = l.split(" ");
		const inside = ws.filter((_, k) => start + k >= a && start + k <= b);
		if (inside.length) out.push(inside.join(" "));
		start += ws.length;
	}
	return out.join("\n");
};

/** Put new text where a region was. The region then covers the new text. */
const replace = (lines: string[], [a, b]: Region, to: string): { lines: string[]; region: Region } => {
	const toks = lines.map((l) => l.split(" "));
	let i = 0;
	let first = { line: 0, word: 0 };
	let last = { line: 0, word: 0 };
	for (const [li, ws] of toks.entries()) {
		for (const wi of ws.keys()) {
			if (i === a) first = { line: li, word: wi };
			if (i === b) last = { line: li, word: wi };
			i++;
		}
	}
	const fresh = to.split("\n").map((l) => l.trim().split(" ").filter(Boolean)).filter((ws) => ws.length);
	const added = fresh.reduce((n, ws) => n + ws.length, 0);
	const body = fresh.length ? fresh : [[]];
	body[0] = [...toks[first.line].slice(0, first.word), ...body[0]];
	body[body.length - 1] = [...body[body.length - 1], ...toks[last.line].slice(last.word + 1)];
	return {
		lines: [...lines.slice(0, first.line), ...body.map((ws) => ws.join(" ")).filter(Boolean), ...lines.slice(last.line + 1)],
		region: [a, Math.max(a, a + added - 1)],
	};
};

const ASK_TEXT = "@Growth if trials end on day 10, how many people who pay would we lose?";
const ASK: Msg = {
	id: "ask", who: "You", av: "FO", when: "10:42", plain: ASK_TEXT,
	text: <><b className="mention">@Growth</b> if trials end on day 10, how many people who pay would we lose?</>,
};
const answer = (state: Change["state"]): Msg => ({
	id: "answer", who: "Growth", av: "GR", agent: true, when: "10:44",
	plain: "About 1 in 5. This line should say so.",
	change: { from: KNOW[2], to: KNOW_NEW, state, by: state === "open" ? undefined : "You" },
});
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

/** A proposed change as diff lines: old in red, kept in grey, new in green. Apply puts it into the document. */
function ChangeBox({ c, onApply, onDismiss }: { c: Change; onApply: () => void; onDismiss: () => void }) {
	const was = c.from.split("\n");
	const now = c.to.split("\n").filter(Boolean);
	const rows = [
		...was.filter((l) => !now.includes(l)).map((l) => ({ kind: "out", sign: "−", l })),
		...now.map((l) => (was.includes(l) ? { kind: "same", sign: "", l } : { kind: "in", sign: "+", l })),
	];
	return (
		<div className={c.state === "dismissed" ? "chg chg--off" : "chg"}>
			<div className="chg-h">Proposed change</div>
			{rows.map((r) => (
				<div key={`${r.kind}${r.l}`} className={`chg-l chg-l--${r.kind}`}>
					<span className="chg-s">{r.sign}</span>
					<span>{r.l}</span>
				</div>
			))}
			<div className="chg-f">
				{c.state === "open" ? (
					<>
						<button type="button" className="btn btn--accent" onClick={onApply}>Apply</button>
						<button type="button" className="btn" onClick={onDismiss}>Dismiss</button>
					</>
				) : (
					<span>{c.state === "applied" ? `✓ Applied by ${c.by}` : `Dismissed by ${c.by}`}</span>
				)}
			</div>
		</div>
	);
}

/**
 * A text box you can see, with its buttons. A reply box stays one line until you use it.
 * "Propose a change" adds the covered text below, to edit into what it should become.
 */
function Field({ draft = "", placeholder, button, compact, note, covers, onPost, onCancel }: {
	draft?: string; placeholder: string; button: string; compact?: boolean; note?: string; covers?: string;
	onPost: (text: string, to?: string) => void; onCancel?: () => void;
}) {
	const [text, setText] = useState(draft);
	const [to, setTo] = useState<string | null>(null);
	const [focus, setFocus] = useState(false);
	const changed = to !== null && to.trim() !== covers;
	const ready = text.trim().length > 0 || changed;
	const post = () => {
		if (!ready) return;
		onPost(text.trim(), changed && to !== null ? to : undefined);
		setText("");
		setTo(null);
	};
	const used = !compact || focus || text.length > 0 || to !== null;
	return (
		<div className="fld">
			<textarea
				className={used ? "fld-in" : "fld-in fld-in--one"} value={text} rows={2} placeholder={placeholder} aria-label={placeholder}
				onChange={(e) => setText(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
				onKeyDown={(e) => {
					if (e.key === "Escape") onCancel?.();
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post();
				}}
			/>
			{to !== null && (
				<div className="chg">
					<div className="chg-h">
						<span>Proposed change</span>
						<button type="button" onClick={() => setTo(null)}>Remove</button>
					</div>
					{covers?.split("\n").map((l) => (
						<div key={l} className="chg-l chg-l--out"><span className="chg-s">−</span><span>{l}</span></div>
					))}
					<label className="chg-l chg-l--in">
						<span className="chg-s">+</span>
						<textarea className="chg-in" value={to} rows={1} aria-label="Text as it should become" onChange={(e) => setTo(e.target.value)} />
					</label>
				</div>
			)}
			{used && covers && to === null && (
				<button type="button" className="fld-link" onMouseDown={(e) => e.preventDefault()} onClick={() => setTo(covers)}>± Propose a change</button>
			)}
			{note && <p className="fld-note">{note}</p>}
			{used && (
				<div className="fld-acts">
					<span className="fld-hint">⌘↵ to send</span>
					{onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
					<button type="button" className="btn btn--accent" disabled={!ready} onMouseDown={(e) => e.preventDefault()} onClick={post}>{button}</button>
				</div>
			)}
		</div>
	);
}

/** An open thread: who said what, then a reply box. Resolve and close sit in its top line. */
function ThreadView({ t, covers, onClose, onResolve, onReply, onChange, task }: {
	t: Thread; covers?: string; onClose: () => void; onResolve: () => void; onReply: (text: string, to?: string) => void;
	onChange: (msg: string, state: "applied" | "dismissed") => void; task?: React.ReactNode;
}) {
	return (
		<div className="tv">
			<div className="tv-head">
				<span className="tv-where">Also in Conversations</span>
				<button type="button" className="tv-btn" onClick={onResolve}>✓ Resolve</button>
				<button type="button" className="tv-btn" onClick={onClose} aria-label="Close thread">×</button>
			</div>
			{t.msgs.map((m) => (
				<div className="tv-turn" key={m.id}>
					<div className="tv-msg">
						<Av m={m} />
						<div>
							<div className="tv-who"><b>{m.who}</b><span>{m.when}</span></div>
							{(m.text ?? m.plain) && <div className="tv-text">{m.text ?? m.plain}</div>}
						</div>
					</div>
					{m.change && <ChangeBox c={m.change} onApply={() => onChange(m.id, "applied")} onDismiss={() => onChange(m.id, "dismissed")} />}
				</div>
			))}
			{task}
			<Field placeholder="Reply…" button="Reply" compact covers={covers} onPost={onReply} />
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
			{last && <span className="sum-last">{last.who}: {last.plain || "proposed a change"}</span>}
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
	const [published, setPublished] = useState(step === AT.published);
	const [edit, setEdit] = useState(step < AT.published);
	const [hidden, setHidden] = useState(false);
	const [following, setFollowing] = useState(true);
	const [justResolved, setJustResolved] = useState<BlockId | null>(null);
	const [drag, setDrag] = useState<{ id: BlockId; end: 0 | 1 } | null>(null);
	/** Pieces added from the format bar, in order, after the last block. */
	const [added, setAdded] = useState<{ id: number; kind: Format; who?: string }[]>(step === AT.add ? [{ id: 0, kind: "table" }] : []);
	const applied = [KNOW[0], KNOW[1], KNOW_NEW];
	const [doc, setDoc] = useState<Record<BlockId, string[]>>({
		intro: INTRO,
		know: step >= AT.applied ? applied : KNOW,
		decision: step >= AT.handoff ? DECISION : [],
	});
	const [threads, setThreads] = useState<Record<BlockId, Thread>>({
		intro: { state: "none", msgs: [], region: null },
		know: step === AT.comment ? { state: "compose", msgs: [], region: whole(KNOW) }
			: step === AT.narrow ? { state: "compose", msgs: [], region: span(KNOW, 2) }
			: step === AT.propose ? { state: "open", msgs: [ASK, answer("open")], region: span(KNOW, 2) }
			: step === AT.applied ? { state: "open", msgs: [ASK, answer("applied")], region: span(applied, 2) }
			: step >= AT.handoff ? { state: "closed", msgs: [ASK, answer("applied")], region: span(applied, 2) }
			: { state: "none", msgs: [], region: null },
		decision: step === AT.handoff ? { state: "open", msgs: [HAND, TAKE], region: whole(DECISION) }
			: step === AT.published ? { state: "closed", msgs: [HAND, TAKE], region: whole(DECISION) }
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
	const compose = (id: BlockId) => setThreads((t) => ({ ...t, [id]: { state: "compose", msgs: [], region: whole(doc[id]) } }));
	const close = (id: BlockId) => setThreads((t) => ({ ...t, [id]: t[id].msgs.length ? { ...t[id], state: "closed" } : { state: "none", msgs: [], region: null } }));
	const post = (id: BlockId, text: string, to?: string) =>
		setThreads((t) => {
			const r = t[id].region;
			const change: Change | undefined = to !== undefined && r ? { from: covered(doc[id], r), to, state: "open" } : undefined;
			const msg: Msg = { id: `m${t[id].msgs.length}-${Date.now()}`, who: "You", av: "FO", when: "now", plain: text, change };
			return { ...t, [id]: { ...t[id], state: "open", msgs: [...t[id].msgs, msg] } };
		});
	/** Apply puts the proposed text where the comment's region was; Dismiss only marks it. */
	const settle = (id: BlockId, msgId: string, state: "applied" | "dismissed") => {
		const t = threads[id];
		const to = t.msgs.find((m) => m.id === msgId)?.change?.to;
		const next = state === "applied" && t.region && to !== undefined ? replace(doc[id], t.region, to) : null;
		if (next) setDoc((d) => ({ ...d, [id]: next.lines }));
		setThreads((all) => ({
			...all,
			[id]: {
				...all[id],
				region: next ? next.region : all[id].region,
				msgs: all[id].msgs.map((m) => (m.id === msgId && m.change ? { ...m, change: { ...m.change, state, by: "You" } } : m)),
			},
		}));
	};
	const moveEnd = (id: BlockId, end: 0 | 1, to: number) =>
		setThreads((t) => {
			const r = t[id].region;
			if (!r) return t;
			const region: Region = end === 0 ? [Math.max(0, Math.min(to, r[1])), r[1]] : [r[0], Math.min(count(doc[id]) - 1, Math.max(to, r[0]))];
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
		return doc[id].map((text) => {
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
		const add = doc[id].length > 0 && (
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
		const covers = t.region ? covered(doc[id], t.region) : undefined;
		return {
			side: (
				<aside className="mg mg--on">
					{t.state === "compose" ? (
						<Field
							draft={id === "know" ? ASK_TEXT : ""} placeholder="Comment, or @mention someone" button="Comment" covers={covers}
							note="Drag the ends of the highlight to change what this covers."
							onPost={(text, to) => post(id, text, to)} onCancel={() => close(id)}
						/>
					) : (
						<ThreadView
							t={t} covers={covers} onClose={() => close(id)} onResolve={() => { setState(id, "resolved"); setJustResolved(id); }}
							onReply={(text, to) => post(id, text, to)} onChange={(msg, state) => settle(id, msg, state)} task={task}
						/>
					)}
				</aside>
			),
		};
	};

	/** A piece just added from the format bar: its shape, with placeholder words to type over. */
	const piece = (a: { id: number; kind: Format; who?: string }, last: boolean): React.ReactNode => {
		const caret = edit && last && <span className="caret" />;
		if (a.kind === "heading") return <h3 className="page-empty">Heading{caret}</h3>;
		if (a.kind === "list") return <ul><li className="page-empty">List item{caret}</li></ul>;
		if (a.kind === "checklist") return <ul className="todo"><li className="page-empty"><span className="todo-box" />To-do{caret}</li></ul>;
		if (a.kind === "quote") return <blockquote className="quote page-empty">Quote{caret}</blockquote>;
		if (a.kind === "code") return <pre className="code page-empty">Code{caret}</pre>;
		if (a.kind === "bold") return <p><b className="page-empty">Bold words</b>{caret}</p>;
		if (a.kind === "italic") return <p><i className="page-empty">Italic words</i>{caret}</p>;
		if (a.kind === "link") return <p><span className="lnk">Link text</span>{caret} <span className="lnk-url">Paste or type a link…</span></p>;
		if (a.kind === "table") {
			return (
				<table className="tbl">
					<thead><tr><th>Column{caret}</th><th>Column</th><th>Column</th></tr></thead>
					<tbody><tr><td /><td /><td /></tr><tr><td /><td /><td /></tr></tbody>
				</table>
			);
		}
		if (a.who) return <p><b className="mention">@{a.who}</b>{caret}</p>;
		return (
			<>
				<p><b className="mention">@</b>{caret}</p>
				<div className="picker picker--inline">
					<div className="picker-head"><span>Mention</span><span>agents and people, same list</span></div>
					{mentionables.map((m) => (
						<button key={m.id} type="button" className="picker-row" onClick={() => setAdded((all) => all.map((x) => (x.id === a.id ? { ...x, who: m.name } : x)))}>
							<Av m={{ av: m.initials, agent: m.id !== "maya" }} />
							<span>
								<span className="picker-name">{m.name}</span>
								<span className="picker-what">{m.what}</span>
							</span>
							<span className="picker-load">{m.load}</span>
						</button>
					))}
				</div>
			</>
		);
	};

	const intro = words("intro");
	const know = words("know");
	const decision = words("decision");
	const writingAtEnd = edit && added.length === 0;

	return (
		<>
			<Sidebar initialSpine="knowledge" initialPicked="t-10days" published={published ? ["t-10days"] : []} />
			<section className="detail">
				<header className="detail-head">
					<span className="chip chip--quiet">Document</span>
					<span className="doc-state">{published ? "Published · 4 followers told" : "Draft"}</span>
					<ForPick open={step === 8} />
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
							<>
								{published && <button type="button" className="btn" aria-pressed={following} onClick={() => setFollowing(!following)}>{following ? "Following" : "Follow"}</button>}
								<button type="button" className="btn" onClick={() => setEdit(true)}>✎ Edit</button>
							</>
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
							{intro.map((p, i) => <p key={doc.intro[i]}>{p}</p>)}
						</Block>

						<Block edit={edit} heading><h3>What we know</h3></Block>
						<Block edit={edit} {...margin("know")}>
							<ul>{know.map((item, i) => <li key={doc.know[i]}>{item}</li>)}</ul>
						</Block>

						<Block edit={edit} heading><h3>Decision</h3></Block>
						<Block
							edit={edit} active={added.length === 0}
							{...margin("decision", (
								<button type="button" className="cm-task">
									<span className="cm-task-k">Task</span>
									<span className="cm-task-t">10-day trial for new signups</span>
									<span className="cm-task-s">Builder · Queued</span>
								</button>
							))}
						>
							{doc.decision.length === 0 && <p className="page-empty">Not yet{writingAtEnd && <span className="caret" />}</p>}
							{decision.map((p, i) => (
								<p key={doc.decision[i]}>{p}{writingAtEnd && i === decision.length - 1 && <span className="caret" />}</p>
							))}
						</Block>

						{added.map((a, i) => (
							<Block key={a.id} edit={edit} active={i === added.length - 1}>{piece(a, i === added.length - 1)}</Block>
						))}

						{edit && <p className="blk-empty">Type / for a block, @ to ask someone</p>}
					</article>
				</div>
				{edit && (
					<FormatBar
						floating kinds={DOC_FORMATS} active={added[added.length - 1]?.kind ?? null}
						onAdd={(kind) => setAdded((all) => [...all, { id: all.length, kind }])}
					/>
				)}
			</section>
		</>
	);
}
