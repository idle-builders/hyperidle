import { useState } from "react";
import { CHAT_FORMATS, FormatBar } from "./FormatBar";
import { Avatar, Msg } from "./Msg";
import { type Need, NeedIcon } from "./NeedIcon";
import { Sidebar } from "./Sidebar";

/**
 * PEOPLE — agents and people are the same kind of user, so they share one page. The page holds
 * who they are, what they are on, and your conversation with them; a box floating on the right
 * holds how they are set up: what they run on, what they can reach, what they follow, their
 * documents. There is no separate settings screen: your own page is where your settings live.
 * A team is not a thing of its own, only everyone who has it — so the team page is the list of
 * its people, each with the agents that work for them.
 */
export const PEOPLE_STEPS = [
	{ id: 0, name: "The team: people and their agents" },
	{ id: 1, name: "An agent's page" },
	{ id: 2, name: "A person's page" },
	{ id: 3, name: "Your own page: where settings live" },
];

type UserId = "you" | "maya" | "builder" | "growth" | "designer" | "facilitation";

interface Work {
	title: string;
	words: string;
	mark: "run" | "open" | "done";
	needs?: Need;
}
interface Pair {
	what: string;
	why: string;
}
interface Line {
	id: string;
	av: string;
	human?: boolean;
	name: string;
	at: string;
	body: React.ReactNode;
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
	runsOn?: Pair[];
	reach: Pair[];
	follows: Pair[];
	docs: Pair[];
	facts: string[];
	thread: Line[];
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
		follows: [
			{ what: "A review is raised for you", why: "tells you" },
			{ what: "Someone mentions you", why: "tells you" },
			{ what: "A task you started is done or stuck", why: "tells you" },
			{ what: "4 documents you follow change", why: "tells you" },
		],
		docs: [
			{ what: "Plan: trials without a call", why: "You wrote it with Growth · 2 weeks ago" },
			{ what: "Should trials be 10 days?", why: "Draft · today" },
		],
		facts: ["Person", `Team ${TEAM}`, "Here since 3 July"],
		thread: [],
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
		follows: [
			{ what: "A review is raised for her", why: "tells her" },
			{ what: "Someone mentions her", why: "tells her" },
			{ what: "Support themes, weekly gets a new run", why: "tells her" },
		],
		docs: [{ what: "July support themes", why: "She wrote it · 3 months ago" }],
		facts: ["Person", `Team ${TEAM}`, "Here since 3 July"],
		thread: [
			{ id: "a", av: "MC", human: true, name: "Maya Chen", at: "Friday 13:02", body: "Sent all three, barely touched them. Closed the tickets. Thanks." },
			{ id: "b", av: "FO", human: true, name: "You", at: "Friday 13:10", body: "Good. Can you own the rollout rule once it is written down?" },
		],
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
		follows: [
			{ what: "Someone mentions @Builder", why: "joins that thread" },
			{ what: "A task is handed to it", why: "starts when a session is free" },
		],
		docs: [
			{ what: "Who Builder is", why: "Its instructions · you edited it 3 weeks ago" },
			{ what: "Memory · 14 notes", why: "Only you and Builder can read these" },
		],
		facts: ["Agent · works for you", `Team ${TEAM}`, "Here since 3 July"],
		thread: [
			{ id: "a", av: "FO", human: true, name: "You", at: "yesterday 17:40", body: <><strong>@Builder</strong> what is left on the checkout?</> },
			{ id: "b", av: "BU", name: "Builder", at: "yesterday 17:40", body: "The page is built. One question is open: when we take the card. After that I put the answer in and hand it to Designer." },
		],
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
		follows: [
			{ what: "Every Monday at 07:00", why: "starts a run of Support themes, weekly" },
			{ what: "Someone mentions @Growth", why: "joins that thread" },
			{ what: "A task is handed to it", why: "starts when a session is free" },
		],
		docs: [
			{ what: "Who Growth is", why: "Its instructions · you edited it 2 months ago" },
			{ what: "Memory · 9 notes", why: "Only you and Growth can read these" },
		],
		facts: ["Agent · works for you", `Team ${TEAM}`, "Here since 14 July"],
		thread: [{ id: "a", av: "GR", name: "Growth", at: "14:32", body: "Two parts need a person before the test can start: one answer on the checkout and one review of the layout." }],
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
		follows: [
			{ what: "Someone mentions @Designer", why: "joins that thread" },
			{ what: "A task is handed to it", why: "starts when a session is free" },
		],
		docs: [{ what: "Who Designer is", why: "Its instructions · Maya edited it 5 weeks ago" }],
		facts: ["Agent · works for Maya Chen", `Team ${TEAM}`, "Here since 20 July"],
		thread: [],
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
		follows: [
			{ what: "A task finishes with a note on how it went", why: "reads the note" },
			{ what: "Every Friday at 16:00", why: "proposes changes to How we work" },
		],
		docs: [{ what: "Who Facilitation is", why: "Its instructions · came with the team" }],
		facts: ["Agent · works for the whole team", `Team ${TEAM}`, "Here since 3 July"],
		thread: [],
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

function UserPage({ id, onOpen, onTeam }: { id: UserId; onOpen: (id: UserId) => void; onTeam: () => void }) {
	const u = USERS[id];
	const [paused, setPaused] = useState(false);
	const [looks, setLooks] = useState("Light");
	const mine = id === "you" || u.owner === "you" || u.owner === "team";
	const owner = u.owner && u.owner !== "team" ? u.owner : null;
	let follows = "what wakes it";
	if (u.kind === "Person") follows = id === "you" ? "what you are told about" : "what they are told about";
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
				<div className="jobs">
					{u.on.map((w) => (
						<button key={w.title} type="button" className="nd">
							<span className="nd-mark" aria-hidden="true"><Mark w={w} av={u.av} /></span>
							<span className="nd-text">
								<span className="nd-name">{w.title}</span>
								<span className="nd-sub">{w.words}</span>
							</span>
						</button>
					))}
					{u.doneToday && <button type="button" className="tbox-more">{u.doneToday} more, done today</button>}
				</div>

				{id !== "you" && (
					<>
						<h3>Conversation <span>you and {u.name} · also in Conversations</span></h3>
						{u.thread.length === 0 && <p className="tk-none">Nothing said here yet.</p>}
						{u.thread.map((l) => <Msg key={l.id} who={l.av} human={l.human} name={l.name} at={l.at}>{l.body}</Msg>)}
						<div className="composer-box task-reply">
							<input placeholder={`Tell ${u.name} something…`} aria-label="Message" />
							<div className="composer-row">
								<FormatBar kinds={CHAT_FORMATS} />
								<button type="button" className="btn btn--accent">Send</button>
							</div>
						</div>
					</>
				)}
			</div>

			<aside className="tbox" aria-label={`How ${u.name} is set up`}>
				<div className="tbox-head">
					<span className="tbox-name">{u.name}</span>
					<span className="tbox-state">{paused ? "Paused" : u.status}</span>
				</div>
				{mine && (
					<div className="tbox-acts">
						<button type="button" className="btn">Edit</button>
						{u.kind === "Agent" && <button type="button" className="btn" onClick={() => setPaused(!paused)}>{paused ? "Let it work" : "Pause"}</button>}
					</div>
				)}
				<ul className="tbox-facts">{u.facts.map((f) => <li key={f}>{f}</li>)}</ul>

				{u.runsOn && <Section title="Runs on" items={u.runsOn} />}
				<Section title="Can reach" items={u.reach} add={mine ? "Connect a folder or a service" : undefined} />
				<Section title="Follows" note={follows} items={u.follows} add={mine ? "Follow something else" : undefined} />
				<Section title="Documents" items={u.docs} />
				{id === "you" && (
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
			<Sidebar teamOpen={open === null} />
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
