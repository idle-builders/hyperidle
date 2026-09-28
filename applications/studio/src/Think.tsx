import { useState } from "react";
import { Sidebar } from "./Sidebar";

/**
 * THINK — a document stays a document. Conversation is a layer on top: a comment on a block
 * opens a thread anchored there, which you can hide. An agent answers in the thread and, when
 * it wants to change the page, leaves a suggestion you accept or discard. Sessions belong to
 * threads, never to the document.
 */
export const THINK_STEPS = [
	{ id: 0, name: "Start empty, write" },
	{ id: 1, name: "Ask on a block" },
	{ id: 2, name: "Answer + suggestion" },
	{ id: 3, name: "Accepted" },
	{ id: 4, name: "Hand off from the doc" },
	{ id: 5, name: "Publish" },
];

interface Msg {
	who: string;
	agent?: boolean;
	text: React.ReactNode;
}

/** A thread anchored to a block. Shown under it; folds to a count when hidden. */
function Comments({ msgs, open, onToggle, children }: {
	msgs: Msg[]; open: boolean; onToggle: () => void; children?: React.ReactNode;
}) {
	if (!open) {
		return (
			<button type="button" className="cm-fold" onClick={onToggle}>
				<span className="cm-fold-ic">💬</span> {msgs.length} {msgs.length === 1 ? "comment" : "comments"}
			</button>
		);
	}
	return (
		<div className="cm">
			<div className="cm-head">
				<span>Thread on this block · also in Conversations</span>
				<button type="button" onClick={onToggle}>Hide</button>
			</div>
			{msgs.map((m, i) => (
				<div className="cm-msg" key={`${m.who}${i}`}>
					<span className={m.agent ? "cm-who cm-who--agent" : "cm-who"}>{m.who}</span>
					<div className="cm-text">{m.text}</div>
				</div>
			))}
			{children}
			<div className="cm-reply">
				<input placeholder="Reply, or @someone…" aria-label="Reply" />
				<button type="button" className="btn">Send</button>
			</div>
		</div>
	);
}

function Suggestion({ who, children }: { who: string; children: React.ReactNode }) {
	return (
		<div className="sugg">
			<div className="sugg-head">
				<span>Suggested by {who}</span>
				<span className="sugg-acts">
					<button type="button" className="btn btn--accent">Accept</button>
					<button type="button" className="btn">Discard</button>
				</span>
			</div>
			<div className="sugg-body">{children}</div>
		</div>
	);
}

const ASK: Msg = { who: "You", text: <><b className="mention">@Growth</b> how many people who pay would we lose with 10 days?</> };
const ANSWER: Msg = {
	who: "Growth", agent: true,
	text: <>61% decide by day 9, so most stay. The risk is the 1 in 5 who decide on days 11–14. I put the numbers in the document as a suggestion.</>,
};

export function Think({ step }: { step: number }) {
	const [hidden, setHidden] = useState(false);
	const [openA, setOpenA] = useState(step >= 1 && step <= 2);
	const [openB, setOpenB] = useState(step === 4);
	const published = step === 5;

	return (
		<>
			<Sidebar initialSpine="knowledge" initialPicked="t-10days" />
			<section className="detail">
				<header className="detail-head">
					<span className="chip chip--quiet">Document</span>
					<h2>Should trials be 10 days?</h2>
					<span className="meta">
						{published ? "Published · 4 followers told · in Product › How we price" : "Draft · in Product › How we price"}
					</span>
					<span className="doc-act">
						{step >= 1 && (
							<button type="button" className="tool" aria-pressed={!hidden} onClick={() => setHidden(!hidden)}>
								{hidden ? "Show comments" : "Hide comments"}
							</button>
						)}
						{published ? <span className="doc-done">Published</span> : <button type="button" className="btn">Publish</button>}
					</span>
				</header>

				<div className="detail-scroll">
					<article className="page">
						<h1 className="page-title">🤔 Should trials be 10 days?</h1>

						<div className="pblk">
							<p>Growth's option B shortens trials to 10 days. Before we decide, I want to know what we would lose.</p>
						</div>

						<div className="pblk">
							<h3>What we know</h3>
							<ul>
								<li>Trials run 14 days, card up front.</li>
								<li>Since the warning email, 27% more trials convert.</li>
								<li>Most cancellations happen on day 13.</li>
								{step >= 3 && <li>61% of people who pay decide by day 9; 1 in 5 decide on days 11–14.</li>}
							</ul>
							{step === 0 && <span className="pblk-hint">Hover a block to comment, or type @ to ask someone</span>}
							{step >= 1 && !hidden && (
								<Comments msgs={step === 1 ? [ASK] : [ASK, ANSWER]} open={openA} onToggle={() => setOpenA(!openA)} />
							)}
						</div>

						{step === 2 && !hidden && (
							<Suggestion who="Growth">
								<ul><li>61% of people who pay decide by day 9; 1 in 5 decide on days 11–14.</li></ul>
							</Suggestion>
						)}

						<div className="pblk">
							<h3>Decision</h3>
							<p>
								{step >= 3
									? "Try 10 days for new signups for two weeks, and watch refund requests."
									: <span className="page-caret">Not yet<span className="caret" /></span>}
							</p>
							{step >= 4 && !hidden && (
								<Comments
									msgs={[
										{ who: "You", text: <><b className="mention">@Builder</b> set new signups to a 10-day trial from Monday, for two weeks.</> },
										{ who: "Builder", agent: true, text: <>Taking it. I will come back in this thread when it is live.</> },
									]}
									open={openB}
									onToggle={() => setOpenB(!openB)}
								>
									<button type="button" className="workitem cm-task">
										<div>
											<div className="workitem-title">10-day trial for new signups</div>
											<div className="workitem-sub">Builder owns this · made from this thread</div>
										</div>
										<span className="workitem-state"><span className="dot" />Queued</span>
									</button>
								</Comments>
							)}
						</div>

						{published && (
							<p className="page-note">
								Published. The 4 people and agents who follow this document got a notification. The comments
								stay as threads; the page shows only what was decided.
							</p>
						)}
					</article>
				</div>
			</section>
		</>
	);
}
