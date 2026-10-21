import { useState } from "react";
import { CHAT_FORMATS, DOC_FORMATS, FormatBar } from "./FormatBar";
import { Seg } from "./Seg";

/**
 * ARRIVE — first start, and every morning after.
 * One sidebar: find-or-ask, the three spines stacked, a separator, then the chosen spine's list.
 * Each list is one priority-ordered run of evenly spaced rows. Status is words on the row saying
 * what is going on; only what is yours gets the flag colour. Find or ask is an overlay.
 */
interface Hit {
	id: string;
	spine: "Thread" | "Task" | "Document";
	title: string;
	where: string;
	snippet: [string, string, string];
}

const HITS: Hit[] = [
	{
		id: "h1",
		spine: "Document",
		title: "Trials",
		where: "How we price › Trials",
		snippet: [
			"Every plan starts with a 14-day ",
			"trial",
			". We ask for a card up front and say, before it ends, exactly when the first bill comes.",
		],
	},
	{
		id: "h2",
		spine: "Thread",
		title: "Trial-end confusion, three tickets",
		where: "Conversations · Maya · 13:02",
		snippet: [
			"Three support tickets asking the same thing — people finish the ",
			"trial",
			" and cannot tell what they will pay.",
		],
	},
	{
		id: "h3",
		spine: "Task",
		title: "Trials that convert without a call",
		where: "Work · Growth · 3 of 7 subtasks",
		snippet: [
			"Can a ",
			"trial",
			" convert to paid without a sales call? Testing a self-serve checkout at day 12.",
		],
	},
	{
		id: "h4",
		spine: "Thread",
		title: "Pricing page, Q4 pass",
		where: "Conversations · Growth · yesterday",
		snippet: [
			"Two options drafted. Option B shortens the ",
			"trial",
			" to 10 days and adds a reminder.",
		],
	},
];

/** One input, two intents. Tab flips between them and keeps what you typed. */
function Palette({ initialMode }: { initialMode: "find" | "ask" }) {
	const [mode, setMode] = useState(initialMode);
	const [sel, setSel] = useState("h1");
	const hit = HITS.find((h) => h.id === sel) ?? HITS[0];
	const query = mode === "find" ? "trial" : "what do we know about trials?";

	return (
		<div className="pal-back">
			<div className="pal" role="dialog" aria-label="Find or ask">
				<div className="pal-top">
					<Seg
						label="Mode"
						options={["Find", "Ask"] as const}
						value={mode === "find" ? "Find" : "Ask"}
						onChange={(m) => setMode(m === "Find" ? "find" : "ask")}
					/>
					<input
						className="pal-in"
						defaultValue={query}
						key={mode}
						aria-label={mode === "find" ? "Find" : "Ask"}
						placeholder={
							mode === "find"
								? "Find threads, tasks, documents…"
								: "Ask anything — an agent answers with sources"
						}
					/>
					<kbd className="pal-kbd">esc</kbd>
				</div>

				{mode === "find" ? (
					<div className="pal-body">
						<div className="pal-list">
							<button type="button" className="pal-askrow" onClick={() => setMode("ask")}>
								<span className="pal-askrow-ic">↳</span>
								<span>Ask Builder about “trial”</span>
								<kbd>Tab</kbd>
							</button>
							{(["Document", "Thread", "Task"] as const).map((sp) => {
								const hits = HITS.filter((h) => h.spine === sp);
								if (hits.length === 0) return null;
								return (
									<div key={sp}>
										<p className="pal-group">
											{sp === "Document" ? "Knowledge" : sp === "Thread" ? "Conversations" : "Work"}
										</p>
										{hits.map((h) => (
											<button
												key={h.id}
												type="button"
												role="option"
												className="pal-hit"
												aria-selected={sel === h.id}
												onMouseEnter={() => setSel(h.id)}
												onClick={() => setSel(h.id)}
											>
												<span className="pal-hit-t">{h.title}</span>
												<span className="pal-hit-w">{h.where}</span>
											</button>
										))}
									</div>
								);
							})}
						</div>
						<div className="pal-prev">
							<span className="pal-prev-sp">{hit.spine}</span>
							<h3>{hit.title}</h3>
							<span className="pal-prev-w">{hit.where}</span>
							<p className="pal-prev-s">
								…{hit.snippet[0]}
								<mark>{hit.snippet[1]}</mark>
								{hit.snippet[2]}
							</p>
							<span className="pal-prev-go">↵ open here · ⌘↵ open beside</span>
						</div>
					</div>
				) : (
					<div className="pal-ask">
						<div className="pal-who">
							<span className="avatar">BU</span>
							<span>
								<b>Builder</b> is answering · searched 3 threads, 2 tasks, 4 documents
							</span>
						</div>
						<p className="pal-ans">
							Trials run <b>14 days</b> with a card up front. Since this week the pricing page and
							the three-day email both say the date and the amount before the first bill. Growth is
							testing whether trials convert without a sales call — 3 of 7 subtasks done. Option B
							in the Q4 pricing thread would shorten trials to 10 days; nobody has decided that yet.
						</p>
						<div className="pal-src">
							<span className="pal-src-h">Sources</span>
							{HITS.map((h) => (
								<button key={h.id} type="button" className="pal-src-row">
									<span className="pal-src-sp">{h.spine}</span>
									<span>{h.title}</span>
								</button>
							))}
						</div>
					</div>
				)}

				<footer className="pal-foot">
					{mode === "find" ? (
						<>
							<span>
								<kbd>↑↓</kbd> move
							</span>
							<span>
								<kbd>↵</kbd> open
							</span>
							<span>
								<kbd>Tab</kbd> ask instead
							</span>
						</>
					) : (
						<>
							<span className="pal-saved">Saved as a thread in Conversations</span>
							<span>
								<kbd>↵</kbd> follow up
							</span>
							<span>
								<kbd>⌘↵</kbd> open thread
							</span>
							<span>
								<kbd>Tab</kbd> back to find
							</span>
						</>
					)}
				</footer>
			</div>
		</div>
	);
}

/** The agent programs found on this computer. Each signs itself in; HyperIdle only looks. */
const FOUND = {
	ready: [
		{ ok: true, name: "Claude Code", how: "signed in · 6 connectors" },
		{ ok: true, name: "Codex", how: "signed in" },
		{ ok: false, name: "Cursor", how: "not installed" },
	],
	none: [
		{
			ok: false,
			name: "Claude Code",
			how: "not installed",
			fix: (
				<>
					Install it from <a href="#ref">claude.com/code ↗</a>
				</>
			),
		},
		{
			ok: false,
			name: "Codex",
			how: "installed · not signed in",
			fix: (
				<>
					Sign in: run <code>codex login</code> in a terminal
				</>
			),
		},
		{ ok: false, name: "Cursor", how: "not installed" },
	],
};

function Found({
	rows,
}: {
	rows: { ok: boolean; name: string; how: string; fix?: React.ReactNode }[];
}) {
	return (
		<div className="found">
			<span className="found-h">Found on this computer</span>
			{rows.map((x) => (
				<div key={x.name} className={x.ok ? "found-row" : "found-row found-row--off"}>
					<span className={x.ok ? "found-ok" : undefined}>{x.ok ? "✓" : "–"}</span>
					<b>{x.name}</b>
					<span>{x.how}</span>
					{x.fix && <span />}
					{x.fix && (
						<span className="found-fix" style={{ gridColumn: "2 / -1" }}>
							{x.fix}
						</span>
					)}
				</div>
			))}
		</div>
	);
}

/**
 * First start: agents already on this computer can start right away. With none ready, it says how
 * to get one and looks again. A team that already runs on a server is joined instead of named.
 */
function FirstStart({ variant }: { variant: "ready" | "none" | "join" }) {
	const [looked, setLooked] = useState(false);
	if (variant === "join") {
		return (
			<div className="first">
				<div className="first-card">
					<h1>HyperIdle</h1>
					<p className="first-lead">Join a team that already runs on a server.</p>
					<label className="first-field">
						<span>Server address</span>
						<input defaultValue="hyperidle.northwind.example" aria-label="Server address" />
					</label>
					<label className="first-field">
						<span>Key</span>
						<input type="password" defaultValue="••••••••••••••••" aria-label="Key" />
					</label>
					<p className="first-note">
						Whoever runs the server gives you a key. Your agents keep running on this computer, with
						the programs below.
					</p>
					<Found rows={FOUND.ready} />
					<div className="first-acts">
						<button type="button" className="btn btn--accent">
							Join
						</button>
						<button type="button" className="first-other">
							Start a new team on this computer instead
						</button>
					</div>
				</div>
			</div>
		);
	}
	const none = variant === "none";
	return (
		<div className="first">
			<div className="first-card">
				<h1>HyperIdle</h1>
				<p className="first-lead">
					{none
						? "Agents work through a program on this computer. None is ready yet."
						: "Agents already on this computer can start right away."}
				</p>
				<Found rows={none ? FOUND.none : FOUND.ready} />
				{none && (
					<p className="first-note">
						{looked
							? "Looked again just now: still none ready."
							: "Install one, or sign in to one, then look again. Any one of them is enough."}
					</p>
				)}
				<label className="first-field">
					<span>Name your team</span>
					<input placeholder="e.g. Product" aria-label="Team name" />
				</label>
				{!none && (
					<p className="first-note">
						Folders, GitHub and teammates can come later, when you need them.
					</p>
				)}
				<div className="first-acts">
					{none ? (
						<>
							<button type="button" className="btn btn--accent" onClick={() => setLooked(true)}>
								Look again
							</button>
							<button
								type="button"
								className="btn"
								disabled
								title="Needs one agent program that is signed in"
							>
								Start talking
							</button>
						</>
					) : (
						<button type="button" className="btn btn--accent">
							Start talking
						</button>
					)}
				</div>
				<button type="button" className="first-other" style={{ alignSelf: "flex-start" }}>
					Join a team on a server instead
				</button>
			</div>
		</div>
	);
}

function FirstConversation() {
	return (
		<section className="detail">
			<header className="detail-head">
				<span className="chip chip--quiet">Thread</span>
				<h2>Getting started</h2>
			</header>
			<div className="detail-scroll">
				<article className="msg">
					<span className="avatar">BU</span>
					<div>
						<div className="msg-who">
							<span className="msg-name">Builder</span>
							<span className="meta">now</span>
						</div>
						<div className="msg-body">
							Hi. I run on your Claude Code, so I can already read and change files on this
							computer. What are you working on?
						</div>
					</div>
				</article>
				<div className="hint">
					<span>Point me at your code and I can do more</span>
					<span className="hint-acts">
						<button type="button" className="btn">
							Connect a folder
						</button>
						<button type="button" className="btn">
							Connect GitHub
						</button>
						<button type="button" className="hint-skip">
							Not now
						</button>
					</span>
				</div>
			</div>
			<div className="composer">
				<div className="composer-box">
					<input placeholder="Say what you are working on, or @someone…" aria-label="Message" />
					<div className="composer-row">
						<FormatBar kinds={CHAT_FORMATS} />
						<button type="button" className="btn btn--accent">
							Send
						</button>
					</div>
				</div>
			</div>
		</section>
	);
}

function Focused() {
	return (
		<section className="detail">
			<header className="detail-head">
				<span className="chip chip--quiet">Document</span>
				<span className="meta">You are editing</span>
			</header>
			<div className="detail-scroll">
				<div className="doc">
					<h1 className="page-title">💷 How we price</h1>
					<h3>Trials</h3>
					<p>
						Every plan starts with a 14-day trial. We ask for a card up front and say, before the
						trial ends, exactly when the first bill comes and how much it is.
					</p>
					<p>
						We do not extend trials by hand. If someone needs more time, …<span className="caret" />
					</p>
				</div>
			</div>
		</section>
	);
}
/** A document starts untitled, in edit mode, where its "+" was pressed in the tree. */
function NewDocument() {
	return (
		<section className="detail">
			<header className="detail-head">
				<span className="chip chip--quiet">Document</span>
				<span className="doc-state">Draft</span>
				<span className="doc-act">
					<span className="doc-mode">✎ Editing</span>
					<button type="button" className="btn">
						Done
					</button>
					<button type="button" className="btn btn--accent">
						Publish
					</button>
				</span>
			</header>
			<div className="detail-scroll">
				<article className="page">
					<h1 className="page-title page-title--empty">
						Untitled
						<span className="caret" />
					</h1>
					<p className="blk-empty">Type / for a block, @ to ask someone</p>
				</article>
			</div>
			<FormatBar floating kinds={DOC_FORMATS} />
		</section>
	);
}

/** A page that did not load says so in one line, and offers to try again. */
function Failed() {
	const [tried, setTried] = useState(false);
	return (
		<section className="detail">
			<header className="detail-head">
				<span className="chip chip--quiet">Task</span>
			</header>
			<div className="detail-scroll">
				<div className="failed">
					<span>
						This task did not load.
						<span className="failed-why">
							{tried
								? "Tried again just now. The server still does not answer."
								: "The server did not answer."}
						</span>
					</span>
					<button type="button" className="tbox-more" onClick={() => setTried(true)}>
						Try again
					</button>
				</div>
			</div>
		</section>
	);
}

function Placeholder({
	kind,
	title,
	meta,
	note,
}: {
	kind: string;
	title: string;
	meta: string;
	note: string;
}) {
	return (
		<section className="detail">
			<header className="detail-head">
				<span className="chip chip--quiet">{kind}</span>
				<h2>{title}</h2>
				<span className="meta">{meta}</span>
			</header>
			<div className="detail-scroll">
				<p className="opened-note">{note}</p>
			</div>
		</section>
	);
}

export function Arrive({ step }: { step: number }) {
	if (step === 0) return <FirstStart variant="ready" />;
	if (step === 9) return <FirstStart variant="none" />;
	if (step === 10) return <FirstStart variant="join" />;

	let detail = (
		<Placeholder
			kind="Thread"
			title="Trial-end explainer"
			meta="Review · Builder · final"
			note="A review is a thread. It opens here as designed in Judge; the list stays put, so the next one is one click away."
		/>
	);
	if (step === 1) detail = <FirstConversation />;
	else if (step === 3)
		detail = (
			<Placeholder
				kind="Task"
				title="Trials that convert without a call"
				meta="Growth owns this · 3 of 7 subtasks done"
				note="The task opens here with its subtasks. Its thread and any reviews live in Conversations."
			/>
		);
	else if (step === 4)
		detail = (
			<Placeholder
				kind="Document"
				title="How we price"
				meta="Published · Growth edited the Trials section 2 days ago"
				note="The document opens here. Click any icon in the tree to change it."
			/>
		);
	else if (step === 7) detail = <Focused />;
	else if (step === 12) detail = <NewDocument />;
	else if (step === 13) detail = <Failed />;

	return (
		<>
			{detail}
			{(step === 5 || step === 6) && <Palette initialMode={step === 5 ? "find" : "ask"} />}
		</>
	);
}
