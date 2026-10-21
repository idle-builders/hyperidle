import { Fragment, useState } from "react";
import { DOC_FORMATS, FormatBar } from "./FormatBar";
import { Avatar } from "./Msg";
import { type Need, NeedIcon } from "./NeedIcon";
import {
	PLUGIN_ORDER,
	PLUGIN_STATES,
	PLUGINS,
	PluginDialog,
	type PluginId,
	PluginPage,
	type PluginState,
	pluginLine,
} from "./Plugins";
import { JOB, type Row as Pair, ReachDialog, StartDialog, type Subject, UserDialog } from "./Setup";
import { TEAMS, type TeamName } from "./teams";

/**
 * PEOPLE — agents and people are the same kind of user, so they share one page. The page is that
 * user's to-do and status list: what is assigned to them and what waits on them. A box floating
 * on the right holds how they are set up — the typical settings sidebar: a link to your
 * conversation with them, what they run on, where they work, what they can reach, when they start
 * working or what they are told about, and what makes them who they are (instructions, skills,
 * memory). There is no separate settings screen: your own page is where your settings live, and it
 * is one click away at the bottom of the sidebar. A team is a group inside the one organisation —
 * a product team, a function, or both; a person can be in several, an agent is in one. A team's
 * page is reached from Work, where you jump between teams: its people and agents, and in its box
 * its plugins. Changing any of it happens in a small dialog over the page. Anything long is a
 * document: a new agent, or a new reason for it to start, is made in a dialog, and its
 * instructions are then written as a document.
 */
type UserId = "you" | "maya" | "builder" | "growth" | "designer" | "facilitation" | "researcher";
type DialogId = "folder" | "service" | "start" | "edit";

/** Where the page opens. Nothing set is the Product team's page, opened from Work. */
interface View {
	team?: TeamName;
	open?: UserId;
	dialog?: DialogId | "add" | "plugin";
	/** A document: an agent's instructions, or what one of its reasons makes it do. */
	file?: string;
	plugin?: PluginId;
	plugins?: Partial<Record<PluginId, PluginState>>;
}
const INSTRUCTIONS = "Instructions";

/** The page a route names: `me` is your own; a name this page does not know opens the Product team. */
export function viewFor(route: { user?: string; team?: string; plugin?: string }): View {
	const user = route.user === "me" ? "you" : route.user;
	if (user && user in USERS) return { open: user as UserId };
	if (route.plugin && route.plugin in PLUGINS) return { plugin: route.plugin as PluginId };
	const team = TEAMS.find((t) => t.name === route.team);
	return team ? { team: team.name } : {};
}

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
	/** An agent works for one person, or for everyone in the organisation. */
	owner?: UserId | "everyone";
	/** The team an agent is in. A person's teams are in TEAM_PEOPLE. */
	team?: TeamName;
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
	/** Their craft. An agent gets the documents marked with the same discipline. */
	discipline?: string;
	/** When you last talked. */
	talked?: string;
	/** Not in the team until someone adds it. */
	fresh?: boolean;
	/** Its instructions are not written yet. */
	unwritten?: boolean;
	/** The plugin it came with. */
	plugin?: PluginId;
}

const USERS: Record<UserId, User> = {
	you: {
		discipline: "Product",
		name: "You",
		av: "FO",
		kind: "Person",
		what: "Founder. Product and pricing.",
		status: "Here",
		stand: "Here now. Two reviews and two questions wait for you.",
		about: "You decide what gets built and what customers see. Builder and Growth work for you.",
		onTitle: "Waiting for you",
		on: [
			{
				title: "Trial-end explainer · Final",
				words: "Review · from Builder · open 8h",
				mark: "open",
				needs: "review",
			},
			{
				title: "Comparison table, stacked layout · Final",
				words: "Review · from Designer · open 5h",
				mark: "open",
				needs: "review",
			},
			{
				title: "When do we take the card?",
				words: "Question · from Builder · 6h ago",
				mark: "open",
				needs: "input",
			},
			{
				title: "Rollout rule, written down: will you own it?",
				words: "Question · from Maya · 11h ago",
				mark: "open",
				needs: "input",
			},
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
			{
				title: "Explain what happens when a trial ends",
				words: "Builder · needs review",
				mark: "open",
				needs: "review",
			},
		],
		when: [
			{ what: "A review is raised for me", why: "" },
			{ what: "Someone mentions me", why: "" },
			{ what: "A task I started is done or stuck", why: "" },
			{ what: "Something I follow changes", why: "" },
		],
		following: "You follow 4 documents and 3 tasks",
		self: [{ what: "About you", why: "What agents should know when they work with you" }],
		facts: ["Person", "Teams Product and Support", "Here since 3 July"],
	},
	maya: {
		discipline: "Support",
		name: "Maya Chen",
		av: "MC",
		kind: "Person",
		what: "Support and ops.",
		status: "Away",
		stand: "Away until Monday. One review waits for her.",
		about: "Answers customers and owns everything that goes out to them. Designer works for her.",
		onTitle: "Waiting for Maya",
		on: [
			{
				title: "Refund wording · Final",
				words: "Review · from Designer · open 2h",
				mark: "open",
				needs: "review",
			},
		],
		worksIn: [{ what: "~/code/northwind-site", why: "on her computer · Designer works here" }],
		reach: [
			{ what: "Zendesk", why: "the support desk" },
			{ what: "Google Drive", why: "the Northwind shared drive" },
		],
		started: [
			{ title: "Refund wording", words: "Designer · needs review", mark: "open", needs: "review" },
		],
		when: [],
		self: [{ what: "About Maya", why: "What agents should know when they work with her" }],
		facts: ["Person", "Team Support", "Here since 3 July"],
		talked: "Friday 13:10",
	},
	builder: {
		discipline: "Engineering",
		name: "Builder",
		av: "BU",
		kind: "Agent",
		owner: "you",
		team: "Product",
		what: "Builds and ships.",
		status: "Working",
		stand: "Working on “Reminder email three days before”, 12 minutes in.",
		about:
			"Writes and changes code, proves it works, and says what it did. It stops and asks when something reaches customers.",
		onTitle: "On now",
		on: [
			{ title: "Reminder email three days before", words: "Running · 12 min", mark: "run" },
			{ title: "Usage-based tier, metering", words: "Running · 2h", mark: "run" },
			{
				title: "Decide when the card is taken",
				words: "Needs input · 6h",
				mark: "open",
				needs: "input",
			},
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
		facts: ["Agent · works for you", "Team Product", "Here since 3 July"],
		talked: "yesterday 17:40",
	},
	growth: {
		discipline: "Growth",
		name: "Growth",
		av: "GR",
		kind: "Agent",
		owner: "you",
		team: "Product",
		what: "Trials and pricing: numbers and experiments.",
		status: "Idle",
		stand: "Idle. Its next run is “Support themes, weekly” on Monday at 07:00.",
		about:
			"Looks at how trials turn into paid plans, runs experiments on pricing, and keeps the numbers written down.",
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
		facts: ["Agent · works for you", "Team Product", "Here since 14 July"],
		talked: "today 14:32",
	},
	designer: {
		discipline: "Design",
		name: "Designer",
		av: "DS",
		kind: "Agent",
		owner: "maya",
		team: "Support",
		what: "Pages and copy.",
		status: "Idle",
		stand: "Idle. Its last task waits for a review.",
		about:
			"Lays out pages and writes the words on them. It shows its work at two widths and flags what it is unsure about.",
		onTitle: "On now",
		on: [
			{
				title: "Comparison table, stacked layout",
				words: "Needs review · 5h",
				mark: "open",
				needs: "review",
			},
		],
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
			{
				what: "Instructions",
				why: "Who Designer is and how it works · Maya edited it 5 weeks ago",
			},
			{ what: "Skills · 1", why: "Check a page at two widths" },
			{ what: "Memory · 6 notes", why: "Only Maya and Designer can read these" },
		],
		facts: ["Agent · works for Maya Chen", "Team Support", "Here since 20 July"],
	},
	facilitation: {
		name: "Facilitation",
		av: "FA",
		kind: "Agent",
		owner: "everyone",
		plugin: "habits",
		what: "Keeps how we work written down.",
		status: "Idle",
		stand: "Idle. One draft of its waits to be published.",
		about:
			"Reads what tasks say went well or badly when they finish, and proposes changes to how the team works.",
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
			{
				what: "Instructions",
				why: "Who Facilitation is and how it works · Maya edited it 2 weeks ago",
			},
			{ what: "Skills · 2", why: "Read how a task went · Propose a change to How we work" },
			{ what: "Memory · 21 notes", why: "Anyone in the team can read these" },
		],
		facts: ["Agent · works for everyone in Northwind", "In every team", "Here since 3 July"],
	},
	researcher: {
		discipline: "Research",
		name: "Researcher",
		av: "RE",
		kind: "Agent",
		owner: "you",
		fresh: true,
		team: "Product",
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
		facts: ["Agent · works for you", "Team Product", "Here since today"],
	},
};

/** A document that tells an agent what to do: who it is, or what one of its reasons starts. */
interface Doc {
	lead: string;
	parts: { title: string; lines: string[] }[];
}
const DOCS: Record<string, Doc> = {
	[INSTRUCTIONS]: {
		lead: "You watch what our three closest competitors ship, and say what it means for our pricing.",
		parts: [
			{
				title: "What you do",
				lines: [
					"Once a week, read their changelogs, pricing pages and release posts.",
					"Write what changed into “Competitors”, newest first.",
					"Say in one line what each change means for us.",
				],
			},
			{
				title: "How you work",
				lines: [
					"Ask me before you contact anyone outside the team.",
					"If you are not sure something is true, say so and say where you read it.",
				],
			},
		],
	},
	[JOB]: {
		lead: "Check that the numbers on the pricing page still match the document “Pricing”.",
		parts: [
			{
				title: "What to check",
				lines: [
					"Every price and every plan name.",
					"How long a trial is, and what happens when it ends.",
					"The date the page says its prices are from.",
				],
			},
			{
				title: "What to do then",
				lines: [
					"If something does not match, tell me which number and on which page.",
					"If nothing is wrong, say so in one line.",
					"If a different document changed, stop.",
				],
			},
		],
	},
};
/** The reasons that come with the step that opens on what they make the agent do. */
const JOB_REASONS: Pair[] = [
	{ what: "Every Thursday at 08:00", why: `it starts a run of ${JOB}` },
	{ what: "A document changes", why: `it starts a run of ${JOB}` },
];

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

/** The people in each team. A person can be in several; an agent is in one, named on the agent. */
const TEAM_PEOPLE: Record<TeamName, UserId[]> = { Product: ["you"], Support: ["maya", "you"] };
/** Where a user's crumbs start: an agent's team, or a person's first team. */
const homeTeam = (id: UserId): TeamName | null =>
	USERS[id].team ?? TEAMS.map((t) => t.name).find((t) => TEAM_PEOPLE[t].includes(id)) ?? null;

function TeamPage({
	team,
	added,
	plugins,
	onOpen,
	onAdd,
	onPlugin,
	onAddPlugin,
}: {
	team: TeamName;
	added: boolean;
	plugins: Record<PluginId, PluginState>;
	onOpen: (id: UserId) => void;
	onAdd: () => void;
	onPlugin: (id: PluginId) => void;
	onAddPlugin: () => void;
}) {
	const t = TEAMS.find((x) => x.name === team) ?? TEAMS[0];
	const here = (Object.keys(USERS) as UserId[]).filter((id) => added || !USERS[id].fresh);
	const people = TEAM_PEOPLE[team];
	const agents = here.filter((a) => USERS[a].kind === "Agent" && USERS[a].team === team);
	const everyone = here.filter((a) => USERS[a].owner === "everyone");
	const theirs = (person: UserId) => agents.filter((a) => USERS[a].owner === person);
	const shown = PLUGIN_ORDER.filter(
		(id) => plugins[id] !== "gone" && (PLUGINS[id].team ?? team) === team,
	);
	return (
		<article className="tk-page">
			<div className="tk-main">
				<h1 className="page-title">{team}</h1>
				<p className="stand">
					<span>
						{people.length} {people.length === 1 ? "person" : "people"} and {agents.length}{" "}
						{agents.length === 1 ? "agent" : "agents"}.
					</span>
				</p>
				<p>
					{t.what} A team can be a product team, a function such as sales, or a group across
					functions. Its conversations and knowledge are open to everyone; its work is what Work
					shows when you pick it.
				</p>

				{people.map((person) => (
					<section key={person} className="crew">
						<Row id={person} onOpen={onOpen} />
						{theirs(person).length > 0 && (
							<div className="crew-agents">
								{theirs(person).map((a) => (
									<Row key={a} id={a} onOpen={onOpen} />
								))}
							</div>
						)}
					</section>
				))}
				<section className="crew-team">
					<h3>
						Also here <span>works for every team</span>
					</h3>
					<div className="crew-agents">
						{everyone.map((a) => (
							<Row key={a} id={a} onOpen={onOpen} />
						))}
					</div>
				</section>

				<div className="crew-add">
					<button type="button" className="btn" onClick={onAdd}>
						Add someone to {team}
					</button>
				</div>
			</div>

			<aside className="tbox" aria-label={`How ${team} is set up`}>
				<div className="tbox-head">
					<span className="tbox-name">{team}</span>
					<span className="tbox-state">Team</span>
				</div>
				<ul className="tbox-facts">
					<li>
						{people.length} {people.length === 1 ? "person" : "people"} and {agents.length}{" "}
						{agents.length === 1 ? "agent" : "agents"}
					</li>
					<li>Here since 3 July</li>
				</ul>
				<section className="tbox-sec">
					<h4>
						Plugins <span>ready-made agents and skills</span>
					</h4>
					{shown.map((id) => (
						<button key={id} type="button" className="pair pair--go" onClick={() => onPlugin(id)}>
							<span className="pair-what">{PLUGINS[id].name}</span>
							<span className="pair-why">{pluginLine(id, plugins[id])}</span>
						</button>
					))}
					<button type="button" className="tbox-more" onClick={onAddPlugin}>
						Add a plugin
					</button>
				</section>
			</aside>
		</article>
	);
}

function Section({
	title,
	items,
	none,
	add,
	onAdd,
}: {
	title: string;
	items: Pair[];
	none?: string;
	add?: string;
	onAdd?: () => void;
}) {
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
			{add && (
				<button type="button" className="tbox-more" onClick={onAdd}>
					{add}
				</button>
			)}
		</section>
	);
}

function Jobs({ u, items }: { u: User; items: Work[] }) {
	return (
		<div className="jobs">
			{items.map((w) => (
				<button key={w.title} type="button" className="nd">
					<span className="nd-mark" aria-hidden="true">
						<Mark w={w} av={w.by ?? u.av} />
					</span>
					<span className="nd-text">
						<span className="nd-name">{w.title}</span>
						<span className="nd-sub">{w.words}</span>
					</span>
				</button>
			))}
		</div>
	);
}

function UserPage({
	id,
	initialDialog,
	more,
	onOpen,
	onTeam,
	onFile,
	onJob,
	onPlugin,
}: {
	id: UserId;
	initialDialog: DialogId | null;
	/** Reasons added since the page was first opened. */
	more: Pair[];
	onOpen: (id: UserId) => void;
	onTeam: (team: TeamName) => void;
	onFile: () => void;
	/** New reasons for an agent: they are kept, and what to do is written next. */
	onJob: (added: Pair[]) => void;
	onPlugin: (id: PluginId) => void;
}) {
	const u = USERS[id];
	const [dialog, setDialog] = useState(initialDialog);
	const [worksIn, setWorksIn] = useState(u.worksIn);
	const [reach, setReach] = useState(u.reach);
	const [when, setWhen] = useState([...u.when, ...more]);
	const [paused, setPaused] = useState(false);
	const [looks, setLooks] = useState("Light");
	const [off, setOff] = useState<Set<string>>(new Set());
	const me = id === "you";
	const mine = me || u.owner === "you" || u.owner === "everyone";
	const owner = u.owner && u.owner !== "everyone" ? u.owner : null;
	const edited = u.self[0].why.split(" · ")[1];
	const subject: Subject = {
		name: u.name,
		kind: u.kind,
		what: u.what,
		me,
		sessions: Number.parseInt(u.runsOn?.[2].what ?? "1", 10),
		discipline: u.discipline,
		edited: edited && `${edited[0].toUpperCase()}${edited.slice(1)}.`,
	};
	const close = () => setDialog(null);
	const home = homeTeam(id);
	return (
		<article className="tk-page">
			<div className="tk-main">
				<nav className="crumbs" aria-label="Where you are">
					{home && (
						<button type="button" onClick={() => onTeam(home)}>
							{home}
						</button>
					)}
					{owner && (
						<button type="button" onClick={() => onOpen(owner)}>
							{USERS[owner].name}
						</button>
					)}
					<span aria-current="true">{u.name}</span>
				</nav>
				<h1 className="page-title who-title">
					<Avatar who={u.av} human={u.kind === "Person"} />
					{u.name}
				</h1>
				<p className="stand">
					<span>{paused ? "Paused. It takes no new work until you let it." : u.stand}</span>
				</p>
				<p>{u.about}</p>
				{u.unwritten && (
					<div className="hint">
						<span>
							{u.name} has no instructions yet. They are a document: who it is and how it should
							work.
						</span>
						<span className="hint-acts">
							<button type="button" className="btn btn--accent" onClick={onFile}>
								Write its instructions
							</button>
						</span>
					</div>
				)}

				<h3>
					{u.onTitle} <span>{u.on.length}</span>
				</h3>
				{u.on.length === 0 && (
					<p className="tbox-none">
						Nothing yet. Hand it a task, or mention @{u.name} in a thread.
					</p>
				)}
				<Jobs u={u} items={u.on} />
				{u.doneToday && (
					<button type="button" className="tbox-more">
						{u.doneToday} more, done today
					</button>
				)}

				{u.started && (
					<>
						<h3>
							{me ? "Started by you" : `Started by ${u.name.split(" ")[0]}`}{" "}
							<span>{u.started.length}</span>
						</h3>
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
						{!me && (
							<button type="button" className="btn btn--accent">
								Open conversation
							</button>
						)}
						{mine && (
							<button type="button" className="btn" onClick={() => setDialog("edit")}>
								Edit
							</button>
						)}
						{mine && u.kind === "Agent" && (
							<button type="button" className="btn" onClick={() => setPaused(!paused)}>
								{paused ? "Let it work" : "Pause"}
							</button>
						)}
					</div>
				)}
				<ul className="tbox-facts">
					{u.facts.map((f) => (
						<li key={f}>{f}</li>
					))}
					{u.discipline && (
						<li>
							Discipline {u.discipline}
							{u.kind === "Agent" && ` · gets the documents marked ${u.discipline}`}
						</li>
					)}
					{u.plugin && (
						<li>
							<button
								type="button"
								className="tbox-link"
								onClick={() => u.plugin && onPlugin(u.plugin)}
							>
								Came with the plugin {PLUGINS[u.plugin].name}
							</button>
						</li>
					)}
					{u.talked && <li>You last talked {u.talked}</li>}
				</ul>

				{u.runsOn && <Section title="Runs on" items={u.runsOn} />}
				<Section
					title="Works in"
					items={worksIn}
					none={
						u.kind === "Agent"
							? "No folder. It works inside HyperIdle and with what it can reach."
							: "No folder yet."
					}
					add={mine ? "Add a folder" : undefined}
					onAdd={() => setDialog("folder")}
				/>
				<Section
					title="Can reach"
					items={reach}
					none="No service yet."
					add={mine ? "Connect a service" : undefined}
					onAdd={() => setDialog("service")}
				/>

				{u.kind === "Agent" && (
					<Section
						title="Starts working when"
						items={when}
						add={mine ? "Add a time or an event" : undefined}
						onAdd={() => setDialog("start")}
					/>
				)}
				{me && (
					<section className="tbox-sec">
						<h4>
							Notifications <span>tell me when</span>
						</h4>
						{when.map((x) => (
							<button
								key={x.what}
								type="button"
								className="fact-switch"
								role="switch"
								aria-checked={!off.has(x.what)}
								onClick={() =>
									setOff((o) => {
										const n = new Set(o);
										if (n.has(x.what)) n.delete(x.what);
										else n.add(x.what);
										return n;
									})
								}
							>
								<span className="fact-knob" />
								{x.what}
							</button>
						))}
						<button type="button" className="tbox-more" onClick={() => setDialog("start")}>
							Change what you are told about
						</button>
						<p className="pair-why">
							{u.following}. You follow a document, task or thread from its own page.
						</p>
					</section>
				)}

				<Section
					title={u.kind === "Agent" ? "Instructions, skills and memory" : "About"}
					items={u.self}
				/>
				{me && (
					<section className="tbox-sec">
						<h4>This app</h4>
						<div className="pair">
							<span className="pair-what">Lives on a shared server</span>
							<span className="pair-why">
								hyperidle.northwind.example · everyone sees the same work
							</span>
						</div>
					</section>
				)}
				{me && <Programs />}
				{me && (
					<section className="tbox-sec">
						<h4>Looks</h4>
						<div className="chips">
							{["Light", "Dark", "Like this computer"].map((l) => (
								<button
									key={l}
									type="button"
									aria-pressed={looks === l}
									onClick={() => setLooks(l)}
								>
									{l}
								</button>
							))}
						</div>
					</section>
				)}
			</aside>

			{dialog === "folder" && (
				<ReachDialog
					who={subject}
					kind="folder"
					given={worksIn.map((x) => x.what)}
					onClose={close}
					onDone={(added) => {
						setWorksIn([...worksIn, added]);
						close();
					}}
				/>
			)}
			{dialog === "service" && (
				<ReachDialog
					who={subject}
					kind="service"
					given={reach.map((x) => x.what)}
					onClose={close}
					onDone={(added) => {
						setReach([...reach, added]);
						close();
					}}
				/>
			)}
			{dialog === "start" && (
				<StartDialog
					who={subject}
					rows={when}
					onClose={close}
					onDone={(added) => {
						const fresh = added.filter(
							(a) => !when.some((w) => w.what === a.what && w.why === a.why),
						);
						if (u.kind === "Agent") onJob(fresh);
						else setWhen([...when, ...fresh]);
						close();
					}}
				/>
			)}
			{dialog === "edit" && (
				<UserDialog user={subject} program={u.runsOn?.[0].what} onClose={close} onDone={close} />
			)}
		</article>
	);
}

const PROGRAMS_HERE = [
	{ name: "Claude Code", how: "signed in · 6 connectors · Builder and Growth run on it" },
	{ name: "Codex", how: "signed in" },
	{ name: "Cursor", how: "not installed", off: true },
];

/** The agent programs this computer has. Each signs itself in; HyperIdle only finds them. */
function Programs() {
	const [looked, setLooked] = useState(false);
	return (
		<section className="tbox-sec">
			<h4>
				Agent programs <span>on this computer</span>
			</h4>
			{PROGRAMS_HERE.map((x) => (
				<div key={x.name} className={x.off ? "pair pair--off" : "pair"}>
					<span className="pair-what">{x.name}</span>
					<span className="pair-why">{x.how}</span>
				</div>
			))}
			<p className="pair-why">
				Each one signs in on its own. Install or sign in to one, then look again.
			</p>
			<button type="button" className="tbox-more" onClick={() => setLooked(true)}>
				{looked ? "Looked just now · nothing new" : "Look again"}
			</button>
		</section>
	);
}

/** What an agent is told is a document, written where every document is written. */
function FilePage({
	id,
	name,
	onUser,
	onTeam,
}: {
	id: UserId;
	name: string;
	onUser: () => void;
	onTeam: (team: TeamName) => void;
}) {
	const u = USERS[id];
	const doc = DOCS[name];
	const home = homeTeam(id);
	return (
		<article className="page">
			<nav className="crumbs" aria-label="Where you are">
				{home && (
					<button type="button" onClick={() => onTeam(home)}>
						{home}
					</button>
				)}
				<button type="button" onClick={onUser}>
					{u.name}
				</button>
				<span aria-current="true">{name}</span>
			</nav>
			<h1 className="page-title">
				{name === INSTRUCTIONS ? `Who ${u.name} is and how it works` : name}
			</h1>
			<div className="blk blk--edit">
				<div className="blk-row">
					<p>{doc.lead}</p>
				</div>
			</div>
			{doc.parts.map((part, i) => (
				<Fragment key={part.title}>
					<div className="blk blk--h blk--edit">
						<div className="blk-row">
							<h3>{part.title}</h3>
						</div>
					</div>
					<div className="blk blk--edit">
						<div className="blk-row">
							<ul>
								{part.lines.map((line, j) => (
									<li key={line}>
										{line}
										{i === doc.parts.length - 1 && j === part.lines.length - 1 && (
											<span className="caret" />
										)}
									</li>
								))}
							</ul>
						</div>
					</div>
				</Fragment>
			))}
			<p className="blk-empty">Type / for a block, @ to ask someone</p>
		</article>
	);
}

export function People({ view }: { view: View }): React.ReactElement {
	const [open, setOpen] = useState<UserId | null>(view.open ?? null);
	const [adding, setAdding] = useState<"someone" | "plugin" | null>(
		view.dialog === "add" ? "someone" : view.dialog === "plugin" ? "plugin" : null,
	);
	const [added, setAdded] = useState(view.open === "researcher");
	const [file, setFile] = useState<string | null>(view.file ?? null);
	const [more, setMore] = useState(view.file === JOB ? JOB_REASONS : []);
	const [wrote, setWrote] = useState(false);
	const [plugin, setPlugin] = useState<PluginId | null>(view.plugin ?? null);
	const [plugins, setPlugins] = useState<Record<PluginId, PluginState>>({
		...PLUGIN_STATES,
		...view.plugins,
	});
	const [team, setTeam] = useState<TeamName>(view.team ?? "Product");
	const first =
		!wrote && view.dialog !== "add" && view.dialog !== "plugin" ? (view.dialog ?? null) : null;
	const u = open ? USERS[open] : null;
	const go = (id: UserId | null) => {
		setOpen(id);
		setPlugin(null);
		setFile(null);
		setMore([]);
	};
	const goTeam = (t: TeamName) => {
		setTeam(t);
		go(null);
	};
	const show = (id: PluginId) => {
		setPlugin(id);
		setOpen(null);
		setFile(null);
	};
	const write = (name: string) => {
		setFile(name);
		setWrote(true);
	};
	const set = (id: PluginId, state: PluginState) => setPlugins({ ...plugins, [id]: state });
	return (
		<section className="detail">
			{u && file ? (
				<header className="detail-head">
					<span className="chip chip--quiet">Document</span>
					<span className="doc-state">
						Draft · {u.name} reads this every time{" "}
						{file === INSTRUCTIONS ? "it starts" : "one of its reasons starts it"}
					</span>
					<span className="doc-act">
						<span className="doc-mode">✎ Editing</span>
						<button type="button" className="btn" onClick={() => setFile(null)}>
							Done
						</button>
					</span>
				</header>
			) : (
				<header className="detail-head">
					<span className="chip chip--quiet">{plugin ? "Plugin" : u ? u.kind : "Team"}</span>
					<span className="doc-state">
						{plugin ? PLUGINS[plugin].what : u ? u.what : "Its people and agents"}
					</span>
				</header>
			)}
			<div className="detail-scroll">
				{open && file && (
					<FilePage id={open} name={file} onUser={() => setFile(null)} onTeam={goTeam} />
				)}
				{open && !file && (
					<UserPage
						key={open}
						id={open}
						initialDialog={open === view.open ? first : null}
						more={more}
						onOpen={go}
						onTeam={goTeam}
						onFile={() => write(INSTRUCTIONS)}
						onJob={(reasons) => {
							setMore([...more, ...reasons]);
							write(JOB);
						}}
						onPlugin={show}
					/>
				)}
				{plugin && (
					<PluginPage
						key={plugin}
						id={plugin}
						state={plugins[plugin]}
						team={team}
						onTeam={() => go(null)}
						onOpen={(user) => {
							if (user in USERS) go(user as UserId);
						}}
						onState={(state) => set(plugin, state)}
						onRemove={() => {
							set(plugin, PLUGINS[plugin].from.startsWith("Comes with") ? "new" : "gone");
							go(null);
						}}
					/>
				)}
				{!(open || plugin) && (
					<TeamPage
						team={team}
						added={added}
						plugins={plugins}
						onOpen={go}
						onAdd={() => setAdding("someone")}
						onPlugin={show}
						onAddPlugin={() => setAdding("plugin")}
					/>
				)}
				{adding === "someone" && (
					<UserDialog
						onClose={() => setAdding(null)}
						onDone={(agent) => {
							setAdding(null);
							if (agent) {
								setAdded(true);
								go("researcher");
							}
						}}
					/>
				)}
				{adding === "plugin" && (
					<PluginDialog
						teams={TEAMS.map((t) => t.name)}
						onClose={() => setAdding(null)}
						onDone={() => {
							setAdding(null);
							setPlugins({ ...plugins, notes: "on" });
							show("notes");
						}}
					/>
				)}
			</div>
			{file && <FormatBar floating kinds={DOC_FORMATS} />}
		</section>
	);
}
