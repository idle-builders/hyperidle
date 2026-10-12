import { useState } from "react";
import { DOC_FORMATS, FormatBar } from "./FormatBar";
import { Avatar } from "./Msg";
import { type Need, NeedIcon } from "./NeedIcon";
import { type Row as Pair, ReachDialog, StartDialog, type Subject, UserDialog } from "./Setup";
import { Sidebar } from "./Sidebar";

/**
 * PEOPLE — agents and people are the same kind of user, so they share one page. The page is that
 * user's to-do and status list: what is assigned to them and what waits on them. A box floating
 * on the right holds how they are set up — the typical settings sidebar: a link to your
 * conversation with them, what they run on, where they work, what they can reach, when they start
 * working or what they are told about, and what makes them who they are (instructions, skills,
 * memory). There
 * is no separate settings screen: your own page is where your settings live, and it is one click
 * away at the bottom of the sidebar. A team is not a thing of its own, only everyone who has it.
 * Changing any of it happens in a small dialog over the page. Instructions are a document: a new
 * agent is made in a dialog, and its instructions are then written as a document.
 */
export const PEOPLE_STEPS = [
	{ id: 0, name: "The team: people and their agents" },
	{ id: 1, name: "An agent's page" },
	{ id: 2, name: "A person's page" },
	{ id: 3, name: "Your own page: your list and your settings" },
	{ id: 4, name: "Dialog: where an agent works" },
	{ id: 5, name: "Dialog: what an agent can reach" },
	{ id: 6, name: "Dialog: reasons to start working" },
	{ id: 7, name: "Dialog: what you are told about" },
	{ id: 8, name: "Dialog: edit a user" },
	{ id: 9, name: "Dialog: add someone" },
	{ id: 10, name: "The new agent: its instructions come next" },
	{ id: 11, name: "Its instructions, written as a document" },
];

type UserId = "you" | "maya" | "builder" | "growth" | "designer" | "facilitation" | "researcher";
type DialogId = "folder" | "service" | "start" | "edit";

interface Work {
	title: string;
	words: string;
	mark: "run" | "open" | "done";
	needs?: Need;
	/** Whose initials mark a running row, when it is not the user the page is about. */
	by?: string;
}
interface User {
	name: string;
	av: string;
	kind: "Agent" | "Person";
	/** An agent works for one person, or for the team as a whole. */
	owner?: UserId | "team";
	what: string;
	status: string;
	stand: string;
	about: string;
	onTitle: string;
	on: Work[];
	doneToday?: number;
	/** For a person: the tasks they handed to someone, and how each stands. */
	started?: Work[];
	runsOn?: Pair[];
	/** The folders they work in. */
	worksIn: Pair[];
	/** The services they can reach. */
	reach: Pair[];
	/** An agent: what makes it start working. A person: what they are told about, each a switch. */
	when: Pair[];
	/** What a person follows, beyond the general rules. */
	following?: string;
	/** What makes them who they are: an agent's instructions, skills and memory; a person's "about". */
	self: Pair[];
	facts: string[];
	/** When you last talked. */
	talked?: string;
	/** Not in the team until someone adds it. */
	fresh?: boolean;
	/** Its instructions are not written yet. */
	unwritten?: boolean;
}

const TEAM = "Northwind";

const USERS: Record<UserId, User> = {
	you: {
		name: "You", av: "FO", kind: "Person",
		what: "Founder. Product and pricing.",
		status: "Here",
		stand: "Here now. Two reviews and two questions wait for you.",
		about: "You decide what gets built and what customers see. Builder and Growth work for you.",
		onTitle: "Waiting for you",
		on: [
			{ title: "Trial-end explainer · Final", words: "Review · from Builder · open 8h", mark: "open", needs: "review" },
			{ title: "Comparison table, stacked layout · Final", words: "Review · from Designer · open 5h", mark: "open", needs: "review" },
			{ title: "When do we take the card?", words: "Question · from Builder · 6h ago", mark: "open", needs: "input" },
			{ title: "Rollout rule, written down: will you own it?", words: "Question · from Maya · 11h ago", mark: "open", needs: "input" },
		],
		worksIn: [
			{ what: "~/code/northwind", why: "on this computer · Builder works here" },
			{ what: "~/code/northwind-site", why: "on this computer" },
		],
		reach: [
			{ what: "GitHub", why: "northwind, your account" },
			{ what: "Zendesk", why: "the support desk" },
			{ what: "Stripe", why: "payments" },
			{ what: "Google Drive", why: "the Northwind shared drive" },
		],
		started: [
			{ title: "Trials that convert without a call", words: "Growth · 6 of 12 done", mark: "open" },
			{ title: "Usage-based tier, metering", words: "Builder · running 2h", mark: "run", by: "BU" },
			{ title: "Explain what happens when a trial ends", words: "Builder · needs review", mark: "open", needs: "review" },
		],
		when: [
			{ what: "A review is raised for me", why: "" },
			{ what: "Someone mentions me", why: "" },
			{ what: "A task I started is done or stuck", why: "" },
			{ what: "Something I follow changes", why: "" },
		],
		following: "You follow 4 documents and 3 tasks",
		self: [{ what: "About you", why: "What agents should know when they work with you" }],
		facts: ["Person", `Team ${TEAM}`, "Here since 3 July"],
	},
	maya: {
		name: "Maya Chen", av: "MC", kind: "Person",
		what: "Support and ops.",
		status: "Away",
		stand: "Away until Monday. One review waits for her.",
		about: "Answers customers and owns everything that goes out to them. Designer works for her.",
		onTitle: "Waiting for Maya",
		on: [{ title: "Refund wording · Final", words: "Review · from Designer · open 2h", mark: "open", needs: "review" }],
		worksIn: [{ what: "~/code/northwind-site", why: "on her computer · Designer works here" }],
		reach: [
			{ what: "Zendesk", why: "the support desk" },
			{ what: "Google Drive", why: "the Northwind shared drive" },
		],
		started: [{ title: "Refund wording", words: "Designer · needs review", mark: "open", needs: "review" }],
		when: [],
		self: [{ what: "About Maya", why: "What agents should know when they work with her" }],
		facts: ["Person", `Team ${TEAM}`, "Here since 3 July"],
		talked: "Friday 13:10",
	},
	builder: {
		name: "Builder", av: "BU", kind: "Agent", owner: "you",
		what: "Builds and ships.",
		status: "Working",
		stand: "Working on “Reminder email three days before”, 12 minutes in.",
		about: "Writes and changes code, proves it works, and says what it did. It stops and asks when something reaches customers.",
		onTitle: "On now",
		on: [
			{ title: "Reminder email three days before", words: "Running · 12 min", mark: "run" },
			{ title: "Usage-based tier, metering", words: "Running · 2h", mark: "run" },
			{ title: "Decide when the card is taken", words: "Needs input · 6h", mark: "open", needs: "input" },
			{ title: "Put the answer into the checkout", words: "Waits", mark: "open" },
		],
		doneToday: 2,
		runsOn: [
			{ what: "Claude Code", why: "on your computer · signed in" },
			{ what: "Model", why: "the default" },
			{ what: "2 sessions at a time", why: "" },
		],
		worksIn: [{ what: "~/code/northwind", why: "reads and changes" }],
		reach: [
			{ what: "GitHub", why: "northwind/app · opens pull requests" },
			{ what: "Zendesk", why: "reads tickets" },
		],
		when: [
			{ what: "Someone mentions @Builder", why: "it joins that thread", fixed: true },
			{ what: "A task is handed to it", why: "it starts when a session is free", fixed: true },
		],
		self: [
			{ what: "Instructions", why: "Who Builder is and how it works · you edited it 3 weeks ago" },
			{ what: "Skills · 3", why: "Write a migration · Run the tests · Open a pull request" },
			{ what: "Memory · 14 notes", why: "Only you and Builder can read these" },
		],
		facts: ["Agent · works for you", `Team ${TEAM}`, "Here since 3 July"],
		talked: "yesterday 17:40",
	},
	growth: {
		name: "Growth", av: "GR", kind: "Agent", owner: "you",
		what: "Trials and pricing: numbers and experiments.",
		status: "Idle",
		stand: "Idle. Its next run is “Support themes, weekly” on Monday at 07:00.",
		about: "Looks at how trials turn into paid plans, runs experiments on pricing, and keeps the numbers written down.",
		onTitle: "On now",
		on: [
			{ title: "Trials that convert without a call", words: "6 of 12 done", mark: "open" },
			{ title: "Support themes, weekly", words: "Every Monday", mark: "open" },
		],
		runsOn: [
			{ what: "Codex", why: "on your computer · signed in" },
			{ what: "Model", why: "the default" },
			{ what: "1 session at a time", why: "" },
		],
		worksIn: [],
		reach: [
			{ what: "Stripe", why: "reads payments" },
			{ what: "Zendesk", why: "reads tickets" },
			{ what: "Google Drive", why: "the Northwind shared drive" },
		],
		when: [
			{ what: "Every Monday at 07:00", why: "it starts a run of Support themes, weekly" },
			{ what: "Someone mentions @Growth", why: "it joins that thread", fixed: true },
			{ what: "A task is handed to it", why: "it starts when a session is free", fixed: true },
		],
		self: [
			{ what: "Instructions", why: "Who Growth is and how it works · you edited it 2 months ago" },
			{ what: "Skills · 2", why: "Read the payment numbers · Read the support desk" },
			{ what: "Memory · 9 notes", why: "Only you and Growth can read these" },
		],
		facts: ["Agent · works for you", `Team ${TEAM}`, "Here since 14 July"],
		talked: "today 14:32",
	},
	designer: {
		name: "Designer", av: "DS", kind: "Agent", owner: "maya",
		what: "Pages and copy.",
		status: "Idle",
		stand: "Idle. Its last task waits for a review.",
		about: "Lays out pages and writes the words on them. It shows its work at two widths and flags what it is unsure about.",
		onTitle: "On now",
		on: [{ title: "Comparison table, stacked layout", words: "Needs review · 5h", mark: "open", needs: "review" }],
		doneToday: 1,
		runsOn: [
			{ what: "Claude Code", why: "on Maya's computer · signed in" },
			{ what: "Model", why: "the default" },
			{ what: "1 session at a time", why: "" },
		],
		worksIn: [{ what: "~/code/northwind-site", why: "reads and changes" }],
		reach: [{ what: "Figma", why: "reads the brand file" }],
		when: [
			{ what: "Someone mentions @Designer", why: "it joins that thread", fixed: true },
			{ what: "A task is handed to it", why: "it starts when a session is free", fixed: true },
		],
		self: [
			{ what: "Instructions", why: "Who Designer is and how it works · Maya edited it 5 weeks ago" },
			{ what: "Skills · 1", why: "Check a page at two widths" },
			{ what: "Memory · 6 notes", why: "Only Maya and Designer can read these" },
		],
		facts: ["Agent · works for Maya Chen", `Team ${TEAM}`, "Here since 20 July"],
	},
	facilitation: {
		name: "Facilitation", av: "FA", kind: "Agent", owner: "team",
		what: "Keeps how we work written down.",
		status: "Idle",
		stand: "Idle. One draft of its waits to be published.",
		about: "Reads what tasks say went well or badly when they finish, and proposes changes to how the team works.",
		onTitle: "On now",
		on: [{ title: "Deploy rule", words: "Draft · waits to be published", mark: "open" }],
		runsOn: [
			{ what: "Claude Code", why: "on your computer · signed in" },
			{ what: "Model", why: "the default" },
			{ what: "1 session at a time", why: "" },
		],
		worksIn: [],
		reach: [],
		when: [
			{ what: "A task finishes with a note on how it went", why: "it reads the note" },
			{ what: "Every Friday at 16:00", why: "it proposes changes to How we work" },
		],
		self: [
			{ what: "Instructions", why: "Who Facilitation is and how it works · came with the team" },
			{ what: "Memory · 21 notes", why: "Anyone in the team can read these" },
		],
		facts: ["Agent · works for the whole team", `Team ${TEAM}`, "Here since 3 July"],
	},
	researcher: {
		name: "Researcher", av: "RE", kind: "Agent", owner: "you", fresh: true,
		what: "Reads what competitors ship and writes it down.",
		status: "Idle",
		stand: "New. It has no instructions yet.",
		about: "Watches what the three closest competitors ship and says what it means for pricing.",
		onTitle: "On now",
		on: [],
		runsOn: [
			{ what: "Claude Code", why: "on your computer · signed in" },
			{ what: "Model", why: "the default" },
			{ what: "1 session at a time", why: "" },
		],
		worksIn: [],
		reach: [],
		when: [
			{ what: "Someone mentions @Researcher", why: "it joins that thread", fixed: true },
			{ what: "A task is handed to it", why: "it starts when a session is free", fixed: true },
		],
		self: [{ what: "Instructions", why: "Not written yet" }],
		unwritten: true,
		facts: ["Agent · works for you", `Team ${TEAM}`, "Here since today"],
	},
};

const PEOPLE: UserId[] = ["you", "maya"];
const START: (UserId | null)[] = [null, "builder", "maya", "you", "builder", "builder", "growth", "you", "builder", null, "researcher", "researcher"];
const DIALOG: (DialogId | "add" | null)[] = [null, null, null, null, "folder", "service", "start", "start", "edit", "add", null, null];
const FILE_STEP = 11;

/** The same marks as on a task's graph: an icon where a person is needed, initials where an agent is working. */
function Mark({ w, av }: { w: Work; av: string }) {
	if (w.needs) return <NeedIcon kind={w.needs} />;
	if (w.mark === "run") return <span className="avatar nd-av">{av}</span>;
	return <>{w.mark === "done" ? "✓" : "○"}</>;
}

/** One row on the team page: who, what they do, and what they are doing right now. */
function Row({ id, onOpen }: { id: UserId; onOpen: (id: UserId) => void }) {
	const u = USERS[id];
	return (
		<button type="button" className="who" onClick={() => onOpen(id)}>
			<Avatar who={u.av} human={u.kind === "Person"} />
			<span className="who-text">
				<span className="who-name">{u.name}</span>
				<span className="who-what">{u.what}</span>
			</span>
			<span className="who-now">{u.stand}</span>
		</button>
	);
}

function TeamPage({ added, onOpen, onAdd }: { added: boolean; onOpen: (id: UserId) => void; onAdd: () => void }) {
	const here = (Object.keys(USERS) as UserId[]).filter((id) => added || !USERS[id].fresh);
	const worksFor = (owner: UserId | "team"): UserId[] => here.filter((id) => USERS[id].owner === owner);
	const agents = here.filter((id) => USERS[id].kind === "Agent").length;
	return (
		<article className="tk-page tk-page--one">
			<div className="tk-main">
				<h1 className="page-title">{TEAM}</h1>
				<p className="stand"><span>{PEOPLE.length} people and {agents} agents.</span></p>
				<p>Everyone here can talk to everyone else, and to anyone's agent.</p>

				{PEOPLE.map((p) => (
					<section key={p} className="crew">
						<Row id={p} onOpen={onOpen} />
						<div className="crew-agents">{worksFor(p).map((a) => <Row key={a} id={a} onOpen={onOpen} />)}</div>
					</section>
				))}
				<section className="crew">
					<h3>Works for the whole team</h3>
					<div className="crew-agents">{worksFor("team").map((a) => <Row key={a} id={a} onOpen={onOpen} />)}</div>
				</section>

				<div className="crew-add"><button type="button" className="btn" onClick={onAdd}>Add someone</button></div>
			</div>
		</article>
	);
}

function Section({ title, items, none, add, onAdd }: { title: string; items: Pair[]; none?: string; add?: string; onAdd?: () => void }) {
	return (
		<section className="tbox-sec">
			<h4>{title}</h4>
			{items.length === 0 && <p className="tbox-none">{none}</p>}
			{items.map((x) => (
				<div key={x.what + x.why} className="pair">
					<span className="pair-what">{x.what}</span>
					{x.why && <span className="pair-why">{x.why}</span>}
				</div>
			))}
			{add && <button type="button" className="tbox-more" onClick={onAdd}>{add}</button>}
		</section>
	);
}

function Jobs({ u, items }: { u: User; items: Work[] }) {
	return (
		<div className="jobs">
			{items.map((w) => (
				<button key={w.title} type="button" className="nd">
					<span className="nd-mark" aria-hidden="true"><Mark w={w} av={w.by ?? u.av} /></span>
					<span className="nd-text">
						<span className="nd-name">{w.title}</span>
						<span className="nd-sub">{w.words}</span>
					</span>
				</button>
			))}
		</div>
	);
}

function UserPage({ id, initialDialog, onOpen, onTeam, onFile }: { id: UserId; initialDialog: DialogId | null; onOpen: (id: UserId) => void; onTeam: () => void; onFile: () => void }) {
	const u = USERS[id];
	const [dialog, setDialog] = useState(initialDialog);
	const [worksIn, setWorksIn] = useState(u.worksIn);
	const [reach, setReach] = useState(u.reach);
	const [when, setWhen] = useState(u.when);
	const [paused, setPaused] = useState(false);
	const [looks, setLooks] = useState("Light");
	const [off, setOff] = useState<Set<string>>(new Set());
	const me = id === "you";
	const mine = me || u.owner === "you" || u.owner === "team";
	const owner = u.owner && u.owner !== "team" ? u.owner : null;
	const edited = u.self[0].why.split(" · ")[1];
	const subject: Subject = {
		name: u.name, kind: u.kind, what: u.what, me,
		sessions: Number.parseInt(u.runsOn?.[2].what ?? "1", 10),
		edited: edited && `${edited[0].toUpperCase()}${edited.slice(1)}.`,
	};
	const close = () => setDialog(null);
	return (
		<article className="tk-page">
			<div className="tk-main">
				<nav className="crumbs" aria-label="Where you are">
					<button type="button" onClick={onTeam}>{TEAM}</button>
					{owner && <button type="button" onClick={() => onOpen(owner)}>{USERS[owner].name}</button>}
					<span aria-current="true">{u.name}</span>
				</nav>
				<h1 className="page-title who-title"><Avatar who={u.av} human={u.kind === "Person"} />{u.name}</h1>
				<p className="stand"><span>{paused ? "Paused. It takes no new work until you let it." : u.stand}</span></p>
				<p>{u.about}</p>
				{u.unwritten && (
					<div className="hint">
						<span>{u.name} has no instructions yet. They are a document: who it is and how it should work.</span>
						<span className="hint-acts"><button type="button" className="btn btn--accent" onClick={onFile}>Write its instructions</button></span>
					</div>
				)}

				<h3>{u.onTitle} <span>{u.on.length}</span></h3>
				{u.on.length === 0 && <p className="tbox-none">Nothing yet. Hand it a task, or mention @{u.name} in a thread.</p>}
				<Jobs u={u} items={u.on} />
				{u.doneToday && <button type="button" className="tbox-more">{u.doneToday} more, done today</button>}

				{u.started && (
					<>
						<h3>{me ? "Started by you" : `Started by ${u.name.split(" ")[0]}`} <span>{u.started.length}</span></h3>
						<Jobs u={u} items={u.started} />
					</>
				)}
			</div>

			<aside className="tbox" aria-label={`How ${u.name} is set up`}>
				<div className="tbox-head">
					<span className="tbox-name">{u.name}</span>
					<span className="tbox-state">{paused ? "Paused" : u.status}</span>
				</div>
				{(mine || !me) && (
					<div className="tbox-acts">
						{!me && <button type="button" className="btn btn--accent">Open conversation</button>}
						{mine && <button type="button" className="btn" onClick={() => setDialog("edit")}>Edit</button>}
						{mine && u.kind === "Agent" && <button type="button" className="btn" onClick={() => setPaused(!paused)}>{paused ? "Let it work" : "Pause"}</button>}
					</div>
				)}
				<ul className="tbox-facts">
					{u.facts.map((f) => <li key={f}>{f}</li>)}
					{u.talked && <li>You last talked {u.talked}</li>}
				</ul>

				{u.runsOn && <Section title="Runs on" items={u.runsOn} />}
				<Section
					title="Works in" items={worksIn} none={u.kind === "Agent" ? "No folder. It works inside HyperIdle and with what it can reach." : "No folder yet."}
					add={mine ? "Add a folder" : undefined} onAdd={() => setDialog("folder")}
				/>
				<Section title="Can reach" items={reach} none="No service yet." add={mine ? "Connect a service" : undefined} onAdd={() => setDialog("service")} />

				{u.kind === "Agent" && <Section title="Starts working when" items={when} add={mine ? "Add a time or an event" : undefined} onAdd={() => setDialog("start")} />}
				{me && (
					<section className="tbox-sec">
						<h4>Notifications <span>tell me when</span></h4>
						{when.map((x) => (
							<button
								key={x.what} type="button" className="fact-switch" role="switch" aria-checked={!off.has(x.what)}
								onClick={() => setOff((o) => { const n = new Set(o); if (n.has(x.what)) n.delete(x.what); else n.add(x.what); return n; })}
							>
								<span className="fact-knob" />
								{x.what}
							</button>
						))}
						<button type="button" className="tbox-more" onClick={() => setDialog("start")}>Change what you are told about</button>
						<p className="pair-why">{u.following}. You follow a document, task or thread from its own page.</p>
						<button type="button" className="tbox-more">See what you follow</button>
					</section>
				)}

				<Section title={u.kind === "Agent" ? "Instructions, skills and memory" : "About"} items={u.self} />
				{me && (
					<section className="tbox-sec">
						<h4>Looks</h4>
						<div className="chips">
							{["Light", "Dark", "Like this computer"].map((l) => <button key={l} type="button" aria-pressed={looks === l} onClick={() => setLooks(l)}>{l}</button>)}
						</div>
					</section>
				)}
			</aside>

			{dialog === "folder" && <ReachDialog who={subject} kind="folder" given={worksIn.map((x) => x.what)} onClose={close} onDone={(added) => { setWorksIn([...worksIn, added]); close(); }} />}
			{dialog === "service" && <ReachDialog who={subject} kind="service" given={reach.map((x) => x.what)} onClose={close} onDone={(added) => { setReach([...reach, added]); close(); }} />}
			{dialog === "start" && (
				<StartDialog
					who={subject} rows={when} onClose={close}
					onDone={(added) => { setWhen([...when, ...added.filter((a) => !when.some((w) => w.what === a.what && w.why === a.why))]); close(); }}
				/>
			)}
			{dialog === "edit" && <UserDialog user={subject} program={u.runsOn?.[0].what} onClose={close} onDone={close} />}
		</article>
	);
}

/** An agent's instructions are a document, written where every document is written. */
function Blk({ heading, children }: { heading?: boolean; children: React.ReactNode }) {
	return (
		<div className={heading ? "blk blk--h blk--edit" : "blk blk--edit"}>
			<div className="blk-row">{children}</div>
		</div>
	);
}

function AgentFile({ id, onUser, onTeam }: { id: UserId; onUser: () => void; onTeam: () => void }) {
	const u = USERS[id];
	return (
		<article className="page">
			<nav className="crumbs" aria-label="Where you are">
				<button type="button" onClick={onTeam}>{TEAM}</button>
				<button type="button" onClick={onUser}>{u.name}</button>
				<span aria-current="true">Instructions</span>
			</nav>
			<h1 className="page-title">Who {u.name} is and how it works</h1>
			<Blk><p>You watch what our three closest competitors ship, and say what it means for our pricing.</p></Blk>
			<Blk heading><h3>What you do</h3></Blk>
			<Blk>
				<ul>
					<li>Once a week, read their changelogs, pricing pages and release posts.</li>
					<li>Write what changed into “Competitors”, newest first.</li>
					<li>Say in one line what each change means for us.</li>
				</ul>
			</Blk>
			<Blk heading><h3>How you work</h3></Blk>
			<Blk>
				<ul>
					<li>Ask me before you contact anyone outside the team.</li>
					<li>If you are not sure something is true, say so and say where you read it.<span className="caret" /></li>
				</ul>
			</Blk>
			<p className="blk-empty">Type / for a block, @ to ask someone</p>
		</article>
	);
}

export function People({ step }: { step: number }) {
	const [open, setOpen] = useState<UserId | null>(START[step] ?? null);
	const [adding, setAdding] = useState(DIALOG[step] === "add");
	const [added, setAdded] = useState(START[step] === "researcher");
	const [file, setFile] = useState(step === FILE_STEP);
	const first = DIALOG[step] ?? null;
	const u = open ? USERS[open] : null;
	const go = (id: UserId | null) => { setOpen(id); setFile(false); };
	return (
		<>
			<Sidebar teamOpen={open === null} youOpen={open === "you"} />
			<section className="detail">
				{u && file ? (
					<header className="detail-head">
						<span className="chip chip--quiet">Document</span>
						<h2>{u.name}: instructions</h2>
						<span className="doc-state">Draft · {u.name} reads this every time it starts</span>
						<span className="doc-act">
							<span className="doc-mode">✎ Editing</span>
							<button type="button" className="btn" onClick={() => setFile(false)}>Done</button>
						</span>
					</header>
				) : (
					<header className="detail-head">
						<span className="chip chip--quiet">{u ? u.kind : "Team"}</span>
						<h2>{u ? u.name : TEAM}</h2>
						<span className="doc-state">{u ? u.what : "Everyone in it"}</span>
					</header>
				)}
				<div className="detail-scroll">
					{open && file && <AgentFile id={open} onUser={() => setFile(false)} onTeam={() => go(null)} />}
					{open && !file && (
						<UserPage
							key={open} id={open} initialDialog={first !== "add" && open === START[step] ? first : null}
							onOpen={go} onTeam={() => go(null)} onFile={() => setFile(true)}
						/>
					)}
					{!open && <TeamPage added={added} onOpen={go} onAdd={() => setAdding(true)} />}
					{adding && (
						<UserDialog
							onClose={() => setAdding(false)}
							onDone={(agent) => { setAdding(false); if (agent) { setAdded(true); setOpen("researcher"); } }}
						/>
					)}
				</div>
				{file && <FormatBar floating kinds={DOC_FORMATS} />}
			</section>
		</>
	);
}
