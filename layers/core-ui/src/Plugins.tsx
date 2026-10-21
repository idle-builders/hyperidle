import { useState } from "react";
import { Avatar } from "./Msg";
import { Seg } from "./Seg";
import { Dialog, Field, type Row } from "./Setup";
import type { TeamName } from "./teams";

/**
 * PLUGINS — a plugin is a ready-made pack: agents, skills, reasons to start and services. It has
 * no world of its own. What it adds are ordinary agents and documents in the team, yours to
 * change, so a plugin's page is mostly a list of links to them. A plugin is added for one team or
 * for every team, and listed in the box on the page of each team it is for.
 */
export type PluginId = "habits" | "notes" | "roles";
/** "gone" is not listed anywhere: it was never added, or it was removed. */
export type PluginState = "on" | "off" | "new" | "gone";

interface Plugin {
	name: string;
	what: string;
	about: string;
	version: string;
	from: string;
	/** The team it is added for; none is every team. Its agents join that team. */
	team?: TeamName;
	installed: string;
	/** `user` is set where the agent has a page in this walkthrough; `comes` is what the plugin gives it. */
	agents: { user?: string; av: string; name: string; what: string; comes: string }[];
	skills: Row[];
	reasons: Row[];
	services: Row[];
	/** What someone edited after the install: a newer version of the plugin leaves it alone. */
	changed: Row[];
}

export const PLUGINS: Record<PluginId, Plugin> = {
	habits: {
		name: "Team habits",
		what: "An agent that keeps how the team works written down.",
		about:
			"One agent that reads how finished tasks went and proposes changes to how the team works.",
		version: "1.2.0",
		from: "Comes with HyperIdle",
		installed: "Installed 3 July by you",
		agents: [
			{
				user: "facilitation",
				av: "FA",
				name: "Facilitation",
				what: "Keeps how we work written down.",
				comes: "Instructions, 2 skills and 2 reasons to start",
			},
		],
		skills: [
			{ what: "Read how a task went", why: "Facilitation" },
			{ what: "Propose a change to How we work", why: "Facilitation" },
		],
		reasons: [
			{ what: "A task finishes with a note on how it went", why: "Facilitation reads the note" },
			{ what: "Every Friday at 16:00", why: "Facilitation proposes changes to How we work" },
		],
		services: [],
		changed: [
			{ what: "Facilitation's instructions", why: "Maya edited them 2 weeks ago" },
			{ what: "Propose a change to How we work", why: "You edited this skill last week" },
		],
	},
	notes: {
		name: "Release notes",
		what: "Writes the weekly release note from what shipped.",
		about:
			"One agent that collects what was merged during the week and writes the release note for customers. It reads GitHub through a server of its own.",
		version: "0.4.1",
		from: "From github.com/northwind/release-notes",
		team: "Product",
		installed: "Installed today by you",
		agents: [
			{
				av: "WR",
				name: "Release writer",
				what: "Writes what shipped, for customers.",
				comes: "Instructions, 2 skills and 1 reason to start",
			},
		],
		skills: [
			{ what: "Collect what shipped this week", why: "Release writer" },
			{ what: "Write the release note", why: "Release writer" },
		],
		reasons: [
			{
				what: "Every Thursday at 15:00",
				why: "Release writer starts a run of Release note, weekly",
			},
		],
		services: [
			{
				what: "GitHub releases",
				why: "An MCP server that comes with the plugin · reads releases and merged pull requests",
			},
		],
		changed: [],
	},
	roles: {
		name: "Roles",
		what: "A ready-made team of four agents.",
		about:
			"Four agents, each with instructions and skills, so a team has someone to hand work to on the first day.",
		version: "1.0.0",
		from: "Comes with HyperIdle",
		team: "Product",
		installed: "Installed just now by you",
		agents: [
			{
				av: "PM",
				name: "Product manager",
				what: "Turns what customers ask for into tasks.",
				comes: "Instructions and 2 skills",
			},
			{
				av: "QA",
				name: "QA",
				what: "Tries to break what was built before a customer does.",
				comes: "Instructions and 2 skills",
			},
			{
				av: "OP",
				name: "Ops",
				what: "Keeps the servers and the deploys healthy.",
				comes: "Instructions and 1 skill",
			},
			{
				av: "SU",
				name: "Support",
				what: "Answers customers from what the team wrote down.",
				comes: "Instructions and 1 skill",
			},
		],
		skills: [
			{ what: "Write a task from a request", why: "Product manager" },
			{ what: "Sort a week of requests", why: "Product manager" },
			{ what: "Write a test plan", why: "QA" },
			{ what: "Try a page like a customer", why: "QA" },
			{ what: "Check a deploy", why: "Ops" },
			{ what: "Answer a customer", why: "Support" },
		],
		reasons: [],
		services: [],
		changed: [],
	},
};

export const PLUGIN_ORDER: PluginId[] = ["habits", "notes", "roles"];
export const PLUGIN_STATES: Record<PluginId, PluginState> = {
	habits: "on",
	notes: "gone",
	roles: "new",
};
const STATE_WORDS: Record<PluginState, string> = {
	on: "On",
	off: "Off",
	new: "Not installed",
	gone: "Removed",
};

const count = (n: number, one: string, many = `${one}s`): string | null =>
	n === 0 ? null : `${n} ${n === 1 ? one : many}`;
/** "4 agents, 6 skills and 2 reasons to start". */
function adds(p: Plugin): string {
	const parts = [
		count(p.agents.length, "agent"),
		count(p.skills.length, "skill"),
		count(p.reasons.length, "reason to start", "reasons to start"),
		count(p.services.length, "service"),
	].filter((x) => x !== null);
	return parts.length > 1
		? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
		: parts.join("");
}

/** One line for a plugin in the team's box: how it stands, then what it is. */
export function pluginLine(id: PluginId, state: PluginState): string {
	const p = PLUGINS[id];
	return state === "on"
		? `On · ${adds(p)}`
		: state === "off"
			? "Off · what it added is paused"
			: `${p.from} · not installed`;
}

function Items({ title, items }: { title: string; items: Row[] }) {
	if (items.length === 0) return null;
	return (
		<>
			<h3>
				{title} <span>{items.length}</span>
			</h3>
			<div className="adds">
				{items.map((x) => (
					<div key={x.what} className="who who--plain">
						<span className="who-name">{x.what}</span>
						<span className="who-now">{x.why}</span>
					</div>
				))}
			</div>
		</>
	);
}

export function PluginPage({
	id,
	state,
	team,
	onTeam,
	onOpen,
	onState,
	onRemove,
}: {
	id: PluginId;
	state: PluginState;
	/** The team whose page it was opened from. */
	team: TeamName;
	onTeam: () => void;
	/** Open the page of an agent the plugin added. */
	onOpen: (user: string) => void;
	onState: (state: PluginState) => void;
	onRemove: () => void;
}): React.ReactElement {
	const p = PLUGINS[id];
	const [changed, setChanged] = useState(p.changed);
	const here = state !== "new";
	return (
		<article className="tk-page">
			<div className="tk-main">
				<nav className="crumbs" aria-label="Where you are">
					<button type="button" onClick={onTeam}>
						{team}
					</button>
					<span aria-current="true">{p.name}</span>
				</nav>
				<h1 className="page-title">{p.name}</h1>
				<p className="stand">
					<span>
						{state === "on"
							? `On. It added ${adds(p)}.`
							: state === "off"
								? "Off. What it added is paused, not gone."
								: `Not installed. Installing adds ${adds(p)}.`}
					</span>
				</p>
				<p>
					{p.about} Its agents join the team it is added for. Everything it adds is ordinary, and
					yours to change.
				</p>

				<h3>
					Agents <span>{p.agents.length}</span>
				</h3>
				<div className="adds">
					{p.agents.map((a) => (
						<button
							key={a.name}
							type="button"
							className="who"
							disabled={!(here && a.user)}
							onClick={() => a.user && onOpen(a.user)}
						>
							<Avatar who={a.av} />
							<span className="who-text">
								<span className="who-name">{a.name}</span>
								<span className="who-what">{a.what}</span>
							</span>
							<span className="who-now">
								{state === "off" ? "Paused with the plugin" : a.comes}
							</span>
						</button>
					))}
				</div>
				<Items title="Skills" items={p.skills} />
				<Items title="Reasons to start" items={p.reasons} />
				<Items title="Services" items={p.services} />
			</div>

			<aside className="tbox" aria-label={`The plugin ${p.name}`}>
				<div className="tbox-head">
					<span className="tbox-name">{p.name}</span>
					<span className="tbox-state">{STATE_WORDS[state]}</span>
				</div>
				<div className="tbox-acts">
					{here ? (
						<>
							<button
								type="button"
								className="btn"
								onClick={() => onState(state === "on" ? "off" : "on")}
							>
								{state === "on" ? "Switch off" : "Switch on"}
							</button>
							<button type="button" className="btn" onClick={onRemove}>
								Remove
							</button>
						</>
					) : (
						<button type="button" className="btn btn--accent" onClick={() => onState("on")}>
							Install
						</button>
					)}
				</div>
				<ul className="tbox-facts">
					<li>Plugin · version {p.version}</li>
					<li>{p.from}</li>
					<li>{p.team ? `For the ${p.team} team` : "For every team"}</li>
					{here && <li>{p.installed}</li>}
				</ul>

				{here && changed.length > 0 && (
					<section className="tbox-sec">
						<h4>
							Changed by the team <span>{changed.length}</span>
						</h4>
						{changed.map((c) => (
							<div key={c.what} className="pair">
								<span className="pair-what">{c.what}</span>
								<span className="pair-why">{c.why}</span>
								<button
									type="button"
									className="tbox-more"
									onClick={() => setChanged(changed.filter((x) => x !== c))}
								>
									Put the plugin's version back
								</button>
							</div>
						))}
						<p className="pair-why">A newer version of the plugin leaves these alone.</p>
					</section>
				)}
				{here && (
					<section className="tbox-sec">
						<h4>Off, or removed</h4>
						<p className="pair-why">
							Switching it off pauses its agents and reasons to start. Removing it takes its agents
							out of the team and archives its documents.
						</p>
					</section>
				)}
			</aside>
		</article>
	);
}

const SOURCES = ["A git address", "A folder", "A zip file"] as const;

export function PluginDialog({
	teams,
	onClose,
	onDone,
}: {
	teams: string[];
	onClose: () => void;
	onDone: () => void;
}): React.ReactElement {
	const [from, setFrom] = useState<(typeof SOURCES)[number]>("A git address");
	const [scope, setScope] = useState(teams[0]);
	return (
		<Dialog
			title="Add a plugin"
			sub="A plugin adds ready-made agents, skills, reasons to start and services. Everything it adds is yours to change."
			done="Add"
			onClose={onClose}
			onDone={onDone}
		>
			<Field label="From">
				<Seg label="From" options={SOURCES} value={from} onChange={setFrom} />
			</Field>
			<Field
				label="Where"
				hint={
					from === "A git address" ? "The address of the repository the plugin is in." : undefined
				}
			>
				<div className="in-row">
					<input
						className="in"
						key={from}
						aria-label="Where"
						defaultValue={
							from === "A git address"
								? "github.com/northwind/release-notes"
								: from === "A folder"
									? "~/code/release-notes"
									: "~/Downloads/release-notes.zip"
						}
					/>
					{from !== "A git address" && (
						<button type="button" className="btn">
							Choose…
						</button>
					)}
				</div>
			</Field>
			<Field
				label="For"
				hint="A plugin's agents join the team it is added for. Every team: added once, for the whole organisation."
			>
				<Seg label="For" options={[...teams, "Every team"]} value={scope} onChange={setScope} />
			</Field>
		</Dialog>
	);
}
