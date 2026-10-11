import { useState } from "react";
import { Avatar } from "./Msg";
import { type Need, NeedIcon } from "./NeedIcon";
import { Sidebar } from "./Sidebar";

/**
 * PEOPLE — agents and people are the same kind of user, so they share one page. The page is that
 * user's to-do and status list: what is assigned to them and what waits on them. A box floating
 * on the right holds how they are set up — the typical settings sidebar: a link to your
 * conversation with them, what they run on, what they can reach, when they start working or what
 * they are told about, and what makes them who they are (instructions, skills, memory). There
 * is no separate settings screen: your own page is where your settings live, and it is one click
 * away at the bottom of the sidebar. A team is not a thing of its own, only everyone who has it.
 */
export const PEOPLE_STEPS = [
	{ id: 0, name: "The team: people and their agents" },
	{ id: 1, name: "An agent's page" },
	{ id: 2, name: "A person's page" },
	{ id: 3, name: "Your own page: your list and your settings" },
];

type UserId = "you" | "maya" | "builder" | "growth" | "designer" | "facilitation";

interface Work {
	title: string;
	words: string;
	mark: "run" | "open" | "done";
	needs?: Need;
	/** Whose initials mark a running row, when it is not the user the page is about. */
	by?: string;
}
interface Pair {
	what: string;
	why: string;
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
		reach: [
			{ what: "This computer", why: "the folder ~/code/northwind" },
			{ what: "GitHub", why: "northwind, your account" },
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
		reach: [
			{ what: "Folder", why: "~/code/northwind · reads and writes" },
			{ what: "GitHub", why: "northwind/app · opens pull requests" },
			{ what: "Zendesk", why: "reads tickets" },
		],
		when: [
			{ what: "Someone mentions @Builder", why: "it joins that thread" },
			{ what: "A task is handed to it", why: "it starts when a session is free" },
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
		reach: [
			{ what: "Stripe", why: "reads payments" },
			{ what: "Zendesk", why: "reads tickets" },
			{ what: "Google Drive", why: "the Northwind shared drive" },
		],
		when: [
			{ what: "Every Monday at 07:00", why: "it starts a run of Support themes, weekly" },
			{ what: "Someone mentions @Growth", why: "it joins that thread" },
			{ what: "A task is handed to it", why: "it starts when a session is free" },
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
		reach: [
			{ what: "Folder", why: "~/code/northwind-site · reads and writes" },
			{ what: "Figma", why: "reads the brand file" },
		],
		when: [
			{ what: "Someone mentions @Designer", why: "it joins that thread" },
			{ what: "A task is handed to it", why: "it starts when a session is free" },
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
		reach: [{ what: "Nothing outside HyperIdle", why: "it only reads and writes documents here" }],
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
};

const PEOPLE: UserId[] = ["you", "maya"];
const worksFor = (owner: UserId | "team"): UserId[] => (Object.keys(USERS) as UserId[]).filter((id) => USERS[id].owner === owner);
const START: (UserId | null)[] = [null, "builder", "maya", "you"];

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

function TeamPage({ onOpen }: { onOpen: (id: UserId) => void }) {
	const agents = (Object.keys(USERS) as UserId[]).filter((id) => USERS[id].kind === "Agent").length;
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

				<div className="crew-add"><button type="button" className="btn">Add someone</button></div>
			</div>
		</article>
	);
}

function Section({ title, note, items, add }: { title: string; note?: string; items: Pair[]; add?: string }) {
	return (
		<section className="tbox-sec">
			<h4>{title} {note && <span>{note}</span>}</h4>
			{items.map((x) => (
				<div key={x.what} className="pair">
					<span className="pair-what">{x.what}</span>
					{x.why && <span className="pair-why">{x.why}</span>}
				</div>
			))}
			{add && <button type="button" className="tbox-more">{add}</button>}
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

function UserPage({ id, onOpen, onTeam }: { id: UserId; onOpen: (id: UserId) => void; onTeam: () => void }) {
	const u = USERS[id];
	const [paused, setPaused] = useState(false);
	const [looks, setLooks] = useState("Light");
	const [off, setOff] = useState<Set<string>>(new Set());
	const me = id === "you";
	const mine = me || u.owner === "you" || u.owner === "team";
	const owner = u.owner && u.owner !== "team" ? u.owner : null;
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

				<h3>{u.onTitle} <span>{u.on.length}</span></h3>
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
						{mine && <button type="button" className="btn">Edit</button>}
						{mine && u.kind === "Agent" && <button type="button" className="btn" onClick={() => setPaused(!paused)}>{paused ? "Let it work" : "Pause"}</button>}
					</div>
				)}
				<ul className="tbox-facts">
					{u.facts.map((f) => <li key={f}>{f}</li>)}
					{u.talked && <li>You last talked {u.talked}</li>}
				</ul>

				{u.runsOn && <Section title="Runs on" items={u.runsOn} />}
				<Section title="Can reach" items={u.reach} add={mine ? "Connect a folder or a service" : undefined} />

				{u.kind === "Agent" && <Section title="Starts working when" items={u.when} add={mine ? "Add a time or an event" : undefined} />}
				{me && (
					<section className="tbox-sec">
						<h4>Notifications <span>tell me when</span></h4>
						{u.when.map((x) => (
							<button
								key={x.what} type="button" className="fact-switch" role="switch" aria-checked={!off.has(x.what)}
								onClick={() => setOff((o) => { const n = new Set(o); if (n.has(x.what)) n.delete(x.what); else n.add(x.what); return n; })}
							>
								<span className="fact-knob" />
								{x.what}
							</button>
						))}
						<p className="pair-why">{u.following}. You follow a document, task or thread from its own page.</p>
						<button type="button" className="tbox-more">See what you follow</button>
					</section>
				)}

				<Section title={u.kind === "Agent" ? "Instructions, skills and memory" : "About"} items={u.self} />
				{me && (
					<section className="tbox-sec">
						<h4>Looks</h4>
						<div className="looks" role="radiogroup" aria-label="Looks">
							{["Light", "Dark", "Like this computer"].map((l) => (
								// biome-ignore lint/a11y/useSemanticElements: a row of buttons reads better here than native radio inputs
								<button key={l} type="button" role="radio" aria-checked={looks === l} onClick={() => setLooks(l)}>{l}</button>
							))}
						</div>
					</section>
				)}
			</aside>
		</article>
	);
}

export function People({ step }: { step: number }) {
	const [open, setOpen] = useState<UserId | null>(START[step] ?? null);
	const u = open ? USERS[open] : null;
	return (
		<>
			<Sidebar teamOpen={open === null} youOpen={open === "you"} />
			<section className="detail">
				<header className="detail-head">
					<span className="chip chip--quiet">{u ? u.kind : "Team"}</span>
					<h2>{u ? u.name : TEAM}</h2>
					<span className="doc-state">{u ? u.what : "Everyone in it"}</span>
				</header>
				<div className="detail-scroll">
					{open ? <UserPage key={open} id={open} onOpen={setOpen} onTeam={() => setOpen(null)} /> : <TeamPage onOpen={setOpen} />}
				</div>
			</section>
		</>
	);
}
