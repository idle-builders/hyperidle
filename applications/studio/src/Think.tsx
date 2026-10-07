import { useState } from "react";
import { Sidebar } from "./Sidebar";

/**
 * THINK — a document stays a document. Conversation is a layer on top: a comment on a block
 * opens a thread that hangs under that block, joined to it by a bar, so you always see which
 * block it is about. Hide folds a thread to a count beside its block; Resolve takes it off the
 * page (it stays in Conversations). Edit mode shows a caret, block handles and an "Editing" mark;
 * view mode shows none of them. Sessions belong to threads, never to the document.
 */
export const THINK_STEPS = [
	{ id: 0, name: "Edit mode: write" },
	{ id: 1, name: "Hover shows the block" },
	{ id: 2, name: "Open a comment" },
	{ id: 3, name: "Answer + suggestion" },
	{ id: 4, name: "Accepted, thread hidden" },
	{ id: 5, name: "Thread resolved" },
	{ id: 6, name: "Hand off from the doc" },
	{ id: 7, name: "Published, view mode" },
];

type BlockId = "intro" | "know-h" | "know" | "decision-h" | "decision";
/** none · composing a first comment · thread open under the block · folded to a count · resolved (off the page) */
type ThreadState = "none" | "compose" | "open" | "folded" | "resolved";

interface Msg {
	id: string;
	who: string;
	av: string;
	agent?: boolean;
	when: string;
	text: React.ReactNode;
}

const ASK: Msg = { id: "ask", who: "You", av: "FO", when: "10:42", text: <><b className="mention">@Growth</b> how many people who pay would we lose with 10 days?</> };
const ANSWER: Msg = {
	id: "answer", who: "Growth", av: "GR", agent: true, when: "10:44",
	text: <>61% decide by day 9, so most stay. The risk is the 1 in 5 who decide on days 11–14. I added that to the list as a suggestion.</>,
};
const HAND: Msg = { id: "hand", who: "You", av: "FO", when: "11:05", text: <><b className="mention">@Builder</b> set new signups to a 10-day trial from Monday, for two weeks.</> };
const TAKE: Msg = { id: "take", who: "Builder", av: "BU", agent: true, when: "11:05", text: <>Taking it. I will come back in this thread when it is live.</> };

function Bubble({ plus }: { plus?: boolean }) {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
			<path d="M3 2.5h10a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H7.5L4.5 14v-3H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" strokeLinejoin="round" />
			{plus && <path d="M8 4.75v4M6 6.75h4" strokeLinecap="round" />}
		</svg>
	);
}

/** One block. A thin line in the left margin shows how far it goes, and runs on down its thread. */
function Block({ edit, active, hover, thread, count, heading, onComment, onOpen, children, under }: {
	edit: boolean; active?: boolean; hover?: boolean; thread: ThreadState; count: number; heading?: boolean;
	onComment: () => void; onOpen: () => void; children: React.ReactNode; under?: React.ReactNode;
}) {
	const cls = ["blk", heading && "blk--h", edit && "blk--edit", hover && "blk--hover",
		(thread === "open" || thread === "compose") && "blk--open"].filter(Boolean).join(" ");
	return (
		<div className={cls}>
			<div className="blk-row">
				{edit && <span className={active ? "blk-handle blk-handle--on" : "blk-handle"} aria-hidden="true">⠿</span>}
				{children}
				<span className="blk-side">
					{thread === "folded" ? (
						<button type="button" className="blk-count" onClick={onOpen} aria-label={`Open ${count} comments`}><Bubble />{count}</button>
					) : thread !== "open" && thread !== "compose" && (
						<button type="button" className="blk-add" onClick={onComment} aria-label="Comment on this block" title="Comment"><Bubble plus /></button>
					)}
				</span>
			</div>
			{under}
		</div>
	);
}

/** The thread on a block: plain messages, no box. Hide folds it to a count; Resolve takes it off the page. */
function Thread({ msgs, onHide, onResolve, children }: {
	msgs: Msg[]; onHide: () => void; onResolve: () => void; children?: React.ReactNode;
}) {
	return (
		<div className="cm">
			{msgs.map((m) => (
				<div className="cm-msg" key={m.id}>
					<span className={m.agent ? "avatar cm-av" : "avatar avatar--human cm-av"}>{m.av}</span>
					<div>
						<div className="cm-who"><b>{m.who}</b><span>{m.when}</span></div>
						<div className="cm-text">{m.text}</div>
					</div>
				</div>
			))}
			{children}
			<div className="cm-foot">
				<input className="cm-in" placeholder="Reply…" aria-label="Reply" />
				<span className="cm-acts">
					<button type="button" onClick={onHide}>Hide</button>
					<button type="button" onClick={onResolve}>Resolve</button>
				</span>
			</div>
		</div>
	);
}

/** The first comment on a block: one quiet line; sending starts the thread. */
function Composer({ draft, onSend, onCancel }: { draft: string; onSend: () => void; onCancel: () => void }) {
	return (
		<div className="cm">
			<div className="cm-msg">
				<span className="avatar avatar--human cm-av">FO</span>
				<input className="cm-in cm-in--new" defaultValue={draft} placeholder="Comment, or @someone…" aria-label="Comment" />
			</div>
			<div className="cm-foot cm-foot--new">
				<span className="cm-note">↵ to send · esc to cancel · also shows in Conversations</span>
				<span className="cm-acts">
					<button type="button" onClick={onCancel}>Cancel</button>
					<button type="button" className="cm-send" onClick={onSend}>Comment</button>
				</span>
			</div>
		</div>
	);
}

export function Think({ step }: { step: number }) {
	const [published, setPublished] = useState(step === 7);
	const [edit, setEdit] = useState(step < 7);
	const [hidden, setHidden] = useState(false);
	const [sugg, setSugg] = useState<"pending" | "accepted" | "discarded">(step >= 4 ? "accepted" : "pending");
	const [justResolved, setJustResolved] = useState<BlockId | null>(step === 5 ? "know" : null);
	const [threads, setThreads] = useState<Record<BlockId, ThreadState>>({
		intro: "none",
		"know-h": "none",
		know: step === 2 ? "compose" : step === 3 ? "open" : step === 4 ? "folded" : step >= 5 ? "resolved" : "none",
		"decision-h": "none",
		decision: step === 6 ? "open" : step === 7 ? "folded" : "none",
	});
	const set = (id: BlockId, s: ThreadState) => setThreads((t) => ({ ...t, [id]: s }));
	const decided = step >= 6;

	const msgs: Partial<Record<BlockId, Msg[]>> = {
		know: step >= 3 ? [ASK, ANSWER] : [ASK],
		decision: [HAND, TAKE],
	};
	const anyComments = Object.values(threads).some((s) => s === "open" || s === "folded");

	/** What hangs under a block: the composer, its thread, or a short receipt after resolving. */
	const under = (id: BlockId, extra?: React.ReactNode) => {
		if (hidden) return null;
		const s = threads[id];
		if (s === "compose") {
			return (
				<Composer
					draft={id === "know" ? "@Growth how many people who pay would we lose with 10 days?" : ""}
					onSend={() => set(id, msgs[id] ? "open" : "none")}
					onCancel={() => set(id, "none")}
				/>
			);
		}
		if (s === "open" && msgs[id]) {
			return (
				<Thread msgs={msgs[id]} onHide={() => set(id, "folded")} onResolve={() => { set(id, "resolved"); setJustResolved(id); }}>
					{extra}
				</Thread>
			);
		}
		if (s === "resolved" && justResolved === id) {
			return (
				<p className="cm-receipt">
					Resolved. The thread stays in Conversations.{" "}
					<button type="button" onClick={() => { set(id, "folded"); setJustResolved(null); }}>Undo</button>
				</p>
			);
		}
		return null;
	};

	const block = (id: BlockId, children: React.ReactNode, opts: { heading?: boolean; active?: boolean; extra?: React.ReactNode } = {}) => (
		<Block
			edit={edit}
			heading={opts.heading}
			active={opts.active}
			hover={step === 1 && id === "know"}
			thread={hidden && threads[id] !== "compose" ? "none" : threads[id]}
			count={msgs[id]?.length ?? 0}
			onComment={() => set(id, "compose")}
			onOpen={() => set(id, "open")}
			under={under(id, opts.extra)}
		>
			{children}
		</Block>
	);

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
					<article className={edit ? "page page--edit" : "page"}>
						<h1 className="page-title">🤔 Should trials be 10 days?</h1>

						{block("intro", <p>Growth's option B shortens trials to 10 days. Before we decide, I want to know what we would lose.</p>)}

						{block("know-h", <h3>What we know</h3>, { heading: true })}
						{block("know", (
							<ul>
								<li>Trials run 14 days, card up front.</li>
								<li>Since the warning email, 27% more trials convert.</li>
								<li>Most cancellations happen on day 13.</li>
								{step >= 3 && sugg === "accepted" && <li>61% of people who pay decide by day 9; 1 in 5 decide on days 11–14.</li>}
								{step >= 3 && sugg === "pending" && (
									<li className="sugg">
										<span className="sugg-text">61% of people who pay decide by day 9; 1 in 5 decide on days 11–14.</span>
										<span className="sugg-meta">
											Suggested by Growth ·{" "}
											<button type="button" onClick={() => setSugg("accepted")}>Accept</button> ·{" "}
											<button type="button" onClick={() => setSugg("discarded")}>Discard</button>
										</span>
									</li>
								)}
							</ul>
						))}

						{block("decision-h", <h3>Decision</h3>, { heading: true })}
						{block("decision", (
							<p className={decided ? undefined : "page-empty"}>
								{decided ? "Try 10 days for new signups for two weeks, and watch refund requests." : "Not yet"}
								{edit && <span className="caret" />}
							</p>
						), {
							active: true,
							extra: (
								<button type="button" className="cm-task">
									<span className="cm-task-k">Task</span>
									<span className="cm-task-t">10-day trial for new signups</span>
									<span className="cm-task-s">Builder · Queued</span>
								</button>
							),
						})}

						{edit && <p className="blk-empty">Type / for a block, @ to ask someone</p>}
					</article>
				</div>
			</section>
		</>
	);
}
