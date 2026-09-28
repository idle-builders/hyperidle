import { useState } from "react";
import { KNOWLEDGE_PRIORITY, Sidebar } from "./Sidebar";

/**
 * THINK — where we think together, and what we know afterwards.
 * A document is a run of blocks written by people and agents alike; authorship shows in the
 * gutter. What is close by sits under the title so nobody has to search. Draft → published →
 * the people who follow it hear about it.
 */
export const THINK_STEPS = [
	{ id: 0, name: "Start a thought" },
	{ id: 1, name: "Think with an agent" },
	{ id: 2, name: "Talk about a block" },
	{ id: 3, name: "A draft waits on you" },
	{ id: 4, name: "Published" },
	{ id: 5, name: "Built upon" },
];

function Author({ who, agent }: { who: string; agent?: boolean }) {
	return <span className={agent ? "author author--agent" : "author"} title={agent ? `${who} (agent) wrote this` : `${who} wrote this`}>{who.slice(0, 2).toUpperCase()}</span>;
}

function Block({ who, agent, children, talk, onTalk, changed }: {
	who: string; agent?: boolean; children: React.ReactNode; talk?: number; onTalk?: () => void; changed?: "added" | "removed";
}) {
	return (
		<div className={`blk${changed ? ` blk--${changed}` : ""}`}>
			<span className="blk-gutter"><Author who={who} agent={agent} /></span>
			<div className="blk-body">{children}</div>
			<span className="blk-side">
				{talk ? (
					<button type="button" className="blk-talk blk-talk--on" onClick={onTalk}>{talk} replies</button>
				) : (
					<button type="button" className="blk-talk" onClick={onTalk}>Talk about this</button>
				)}
			</span>
		</div>
	);
}

function CloseBy({ items }: { items: { kind: string; title: string }[] }) {
	return (
		<div className="closeby">
			<span className="closeby-h">Close by</span>
			{items.map((i) => (
				<a key={i.title} className="ref" href="#close">
					<span className="ref-src">{i.kind}</span>
					<span className="ref-title">{i.title}</span>
				</a>
			))}
		</div>
	);
}

function TrialsDoc({ step }: { step: number }) {
	const [talkOpen, setTalkOpen] = useState(step === 2);
	return (
		<section className="detail">
			<header className="detail-head">
				<span className="chip chip--quiet">Document</span>
				<h2>Should trials be 10 days?</h2>
				<span className="meta">Draft · you and Growth · in Product › How we price</span>
				<span className="doc-act">
					{step === 1 && <span className="doc-live"><Author who="Growth" agent /> Growth is writing…</span>}
					<button type="button" className="btn">Publish</button>
				</span>
			</header>
			<div className="detail-scroll">
				<article className="page">
					<h1 className="page-title">🤔 Should trials be 10 days?</h1>
					<p className="page-from">Started from the thread "Pricing page, Q4 pass" · what it knew came along</p>
					<CloseBy items={[
						{ kind: "Doc", title: "How we price › Trials" },
						{ kind: "Thread", title: "Pricing page, Q4 pass" },
						{ kind: "Task", title: "Trials that convert without a call" },
						{ kind: "Thread", title: "Trial-end confusion, three tickets" },
					]} />

					<Block who="You">
						<p>Growth's option B shortens trials to 10 days. Before we decide, I want to know what we would lose.</p>
					</Block>
					<Block who="You">
						<h3>What we know</h3>
					</Block>
					<Block who="You">
						<ul>
							<li>Trials run 14 days, card up front.</li>
							<li>Since the warning email, 27% more trials convert.</li>
							<li>Most cancellations happen on day 13.</li>
						</ul>
					</Block>

					{step === 1 && (
						<Block who="You">
							<p><b className="mention">@Growth</b> how many people who pay would we lose with 10 days?</p>
						</Block>
					)}
					{step >= 1 && (
						<Block who="Growth" agent>
							<p>
								61% of people who pay decide by day 9. A 10-day trial keeps most of them and brings the
								first bill four days sooner. The risk sits in the last group: 1 in 5 who pay decide on
								days 11–14.
							</p>
							<div className="refs">
								<a className="ref" href="#src"><span className="ref-src">Task</span><span className="ref-title">Trials that convert without a call</span></a>
							</div>
						</Block>
					)}

					<Block who="You">
						<h3>Open question</h3>
					</Block>
					<Block who="You" talk={step >= 2 ? 2 : undefined} onTalk={() => setTalkOpen(!talkOpen)}>
						<p>Does a shorter trial raise refund requests?</p>
						{step >= 2 && talkOpen && (
							<div className="blk-thread">
								<div className="pop-msg">
									<span className="pop-who">Maya Chen</span>
									<p>Refunds went up when we tried 7 days in March. Worth checking before we commit.</p>
								</div>
								<div className="pop-msg">
									<span className="pop-who">Growth</span>
									<p>I can pull the March numbers into this document.</p>
								</div>
								<div className="pop-reply">
									<input placeholder="Reply…" aria-label="Reply" />
									<button type="button" className="btn">Send</button>
								</div>
								<span className="blk-thread-note">This talk is a thread — it is in Conversations too.</span>
							</div>
						)}
					</Block>
				</article>
			</div>
		</section>
	);
}

function DeployRule({ step }: { step: number }) {
	const published = step >= 4;
	return (
		<section className="detail">
			<header className="detail-head">
				<span className="chip chip--quiet">Document</span>
				<h2>Deploy rule</h2>
				<span className="meta">
					{published ? "Published · version 3 · just now" : "Draft · Facilitation asks you to publish"}
				</span>
				<span className="doc-act">
					{published ? (
						<span className="doc-done">Published · 5 followers told</span>
					) : (
						<>
							<button type="button" className="btn">Talk about it</button>
							<button type="button" className="btn btn--accent">Publish</button>
						</>
					)}
				</span>
			</header>
			<div className="detail-scroll">
				<article className="page">
					<h1 className="page-title">🚀 Deploy rule</h1>
					{!published && (
						<div className="draft-why">
							<b>Why you:</b> you own Engineering, and this is read by everyone who deploys —
							12 people and 8 agents. Facilitation redrafted it from Tuesday's retro.
							<span className="draft-count">Since version 2: 1 block removed, 2 added</span>
						</div>
					)}
					{published && step === 4 && (
						<div className="draft-why draft-why--done">
							Published. The 5 people and agents who follow this document got a notification. Version 2
							stays in its history.
						</div>
					)}

					<Block who="Facilitation" agent>
						<p>Deploy on weekdays before 16:00. Anyone can deploy; nobody deploys alone into the weekend.</p>
					</Block>
					{!published && (
						<Block who="Facilitation" agent changed="removed">
							<p>Every deploy needs a second person to approve it.</p>
						</Block>
					)}
					<Block who="Facilitation" agent changed={published ? undefined : "added"}>
						<p>
							A deploy needs a second look only when it changes billing, auth or data that customers
							see. Everything else ships on green.
						</p>
					</Block>
					<Block who="Facilitation" agent changed={published ? undefined : "added"}>
						<p>If a deploy breaks something, the one who deployed writes a short retro the same day.</p>
					</Block>

					{step === 5 && (
						<div className="usedby">
							<span className="usedby-h">Built upon since it was published</span>
							<div className="usedby-row"><span className="ref-src">Task</span><b>Usage-based tier, metering</b><span>Builder followed it: shipped on green, no second look — 2h ago</span></div>
							<div className="usedby-row"><span className="ref-src">Thread</span><b>Billing hotfix</b><span>Maya quoted it to ask for a second look — yesterday</span></div>
							<div className="usedby-row"><span className="ref-src">Doc</span><b>On-call handbook</b><span>links here</span></div>
						</div>
					)}
				</article>
			</div>
		</section>
	);
}

export function Think({ step }: { step: number }) {
	const onDeploy = step >= 3;
	return (
		<>
			<Sidebar initialSpine="knowledge" initialPicked={onDeploy ? "k-deploy" : "t-10days"}
				lists={step >= 4 ? { knowledge: KNOWLEDGE_PRIORITY.filter((i) => i.id !== "k-deploy") } : undefined} />
			{onDeploy ? <DeployRule step={step} /> : <TrialsDoc step={step} />}
		</>
	);
}
