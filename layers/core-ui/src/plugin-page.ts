import type {
	PluginAddView,
	PluginContributionView,
	PluginListing,
	UserRow,
} from "@hyperidle/domain-model";
import { joinWords, type Pair, pluginName, sinceWords } from "./people-page";
import { namesOf } from "./sidebar-lists";

/**
 * A plugin's page, worked out from `search_plugins`: how it stands, what it added (or would add),
 * where it came from, and what the team changed since. An installed plugin's parts are real rows;
 * a bundled one not installed yet reads its manifest's.
 */

export type PluginStand = "on" | "off" | "new";

export interface PluginAgent {
	/** The agent's user id; null until the plugin is installed. */
	id: string | null;
	name: string;
	what: string | null;
	/** What the plugin gives it, or that it is paused with the plugin. */
	comes: string;
}

export interface PluginChange {
	/** What `edit_plugin`'s restore names. */
	key: string;
	what: string;
	why: string;
}

export interface PluginPageView {
	name: string;
	about: string | null;
	version: string;
	state: PluginStand;
	stand: string;
	agents: PluginAgent[];
	skills: Pair[];
	reasons: Pair[];
	services: Pair[];
	from: string;
	forWhom: string;
	installed: string | null;
	changed: PluginChange[];
}

/** One thing a plugin adds, the same for a real row and a manifest line. */
interface Part {
	kind: PluginAddView["kind"];
	slot: PluginAddView["slot"];
	label: string;
	/** The name of the agent it belongs to. */
	agent: string | null;
	/** The agent's user id, for an installed agent. */
	id: string | null;
	what: string | null;
}

const DAY = 86_400_000;

const count = (n: number, one: string, many = `${one}s`): string | null =>
	n === 0 ? null : `${n} ${n === 1 ? one : many}`;

/** "1 agent, 2 skills and 2 reasons to start". */
function addsWords(parts: readonly Part[]): string {
	const n = (kind: Part["kind"], slot: Part["slot"] = null) =>
		parts.filter((p) => p.kind === kind && p.slot === slot).length;
	return joinWords(
		[
			count(n("agent"), "agent"),
			count(n("document", "skill"), "skill"),
			count(n("subscription"), "reason to start", "reasons to start"),
			count(n("mcp_server"), "service"),
		].filter((x) => x !== null),
	);
}

/** "today", "3 days ago", "last week", "2 weeks ago". */
export function agoWords(iso: string, now: number): string {
	const days = Math.floor(Math.max(0, now - Date.parse(iso)) / DAY);
	if (days === 0) return "today";
	if (days === 1) return "yesterday";
	if (days < 5) return `${days} days ago`;
	const weeks = Math.round(days / 7);
	if (weeks === 1) return "last week";
	if (weeks < 9) return `${weeks} weeks ago`;
	return `on ${sinceWords(iso)}`;
}

function partsOf(listing: PluginListing, users: readonly UserRow[]): Part[] {
	if (listing.state === "available")
		return listing.adds.map((a) => ({ ...a, id: null, what: a.what }));
	const nameOf = new Map(
		listing.contributions.filter((c) => c.kind === "agent").map((c) => [c.entityId, c.label]),
	);
	const whatOf = new Map(users.map((u) => [u.id, u.what]));
	return listing.contributions.map((c) => ({
		kind: c.kind,
		slot: c.slot,
		label: c.label,
		agent: c.agentId ? (nameOf.get(c.agentId) ?? null) : null,
		id: c.kind === "agent" ? c.entityId : null,
		what: c.kind === "agent" ? (whatOf.get(c.entityId) ?? null) : null,
	}));
}

/** "Instructions, 2 skills and 2 reasons to start": what one agent gets from the plugin. */
function comesWords(agent: string, parts: readonly Part[]): string {
	const skills = parts.filter((p) => p.slot === "skill").length;
	const reasons = parts.filter((p) => p.kind === "subscription" && p.agent === agent).length;
	const instructions = parts.some((p) => p.slot === "agent_file" && p.agent === agent);
	const words = [
		instructions ? "Instructions" : null,
		count(skills, "skill"),
		count(reasons, "reason to start", "reasons to start"),
	].filter((x) => x !== null);
	return joinWords(words);
}

function fromWords(listing: PluginListing): string {
	if (listing.state === "available") return "Comes with HyperIdle";
	const { kind, address, found } = listing.source;
	const gone = found ? "" : ", no longer there";
	if (kind === "bundled") return "Comes with HyperIdle";
	if (kind === "git") return `From ${address.replace(/^[a-z+]+:\/\//, "").replace(/\.git$/, "")}`;
	if (kind === "zip") return `From the zip file ${address.split(/[\\/]/).pop() ?? address}${gone}`;
	return `From the folder ${address}${gone}`;
}

/** What someone changed, and how to say "it" for that kind. */
function changedWhat(c: PluginContributionView, agentName: string | null): [string, string] {
	if (c.slot === "agent_file") return [`${agentName ?? c.label}'s instructions`, "them"];
	if (c.slot === "skill") return [c.label, "this skill"];
	if (c.slot === "prompt") return [`${c.label}, what it asks`, "it"];
	if (c.kind === "subscription") return [`${c.label}, when it starts`, "it"];
	return [`${c.label}, the agent`, "it"];
}

export function pluginPage(
	listing: PluginListing,
	ctx: {
		users: readonly UserRow[];
		you: string;
		/** The team the page was opened from: a team plugin not installed would go there. */
		team: { id: string; name: string } | null;
		now: number;
	},
): PluginPageView {
	const parts = partsOf(listing, ctx.users);
	const state: PluginStand =
		listing.state === "available" ? "new" : listing.state === "enabled" ? "on" : "off";
	const adds = addsWords(parts);
	const teamName = (id: string) =>
		[...(ctx.team ? [ctx.team] : []), ...ctx.users.flatMap((u) => u.teams)].find((t) => t.id === id)
			?.name ?? "";
	const forTeam =
		listing.state === "available"
			? listing.installScope === "team"
				? (ctx.team?.name ?? null)
				: null
			: listing.scope.kind === "team"
				? teamName(listing.scope.teamId)
				: null;
	const firstNames = namesOf(ctx.users);
	const nameOf = (id: string | null) =>
		id === ctx.you ? "you" : id ? (firstNames.get(id) ?? null) : null;
	const agentNames = new Map(parts.filter((p) => p.id).map((p) => [p.id, p.label]));

	return {
		name: pluginName(listing.name),
		about: listing.description,
		version: listing.version,
		state,
		stand:
			state === "on"
				? `On. It added ${adds}.`
				: state === "off"
					? "Off. What it added is paused, not gone."
					: `Not installed. Installing adds ${adds}.`,
		agents: parts
			.filter((p) => p.kind === "agent")
			.map((a) => ({
				id: a.id,
				name: a.label,
				what: a.what,
				comes: state === "off" ? "Paused with the plugin" : comesWords(a.label, parts),
			})),
		skills: parts
			.filter((p) => p.slot === "skill")
			.map((s) => ({
				what: s.label,
				why: forTeam ? `For every agent in ${forTeam}` : "For every agent",
			})),
		reasons: parts
			.filter((p) => p.kind === "subscription")
			.map((r) => ({ what: r.label, why: r.agent ? `Starts ${r.agent}` : "" })),
		services: parts
			.filter((p) => p.kind === "mcp_server")
			.map((s) => ({ what: s.label, why: "An MCP server that comes with the plugin" })),
		from: fromWords(listing),
		forWhom: forTeam ? `For the ${forTeam} team` : "For every team",
		installed:
			listing.state === "available"
				? null
				: `Installed ${sinceWords(listing.installedAt)}${
						listing.installedBy ? ` by ${nameOf(listing.installedBy) ?? "someone"}` : ""
					}`,
		changed:
			listing.state === "available"
				? []
				: listing.contributions
						.filter((c) => c.detachedAt !== null)
						.sort((a, b) => (a.detachedAt ?? "").localeCompare(b.detachedAt ?? ""))
						.map((c) => {
							const [what, it] = changedWhat(
								c,
								c.agentId ? (agentNames.get(c.agentId) ?? null) : null,
							);
							const who = nameOf(c.detachedBy);
							const by = who === "you" ? "You" : (who ?? "Someone");
							return {
								key: c.key,
								what,
								why: `${by} edited ${it} ${agoWords(c.detachedAt ?? "", ctx.now)}`,
							};
						}),
	};
}

/** What a plugin says in a team's box: how it stands, then what it adds. */
export function pluginLine(listing: PluginListing): string {
	if (listing.state === "available") return "Comes with HyperIdle · not installed";
	if (listing.state === "disabled") return "Off · what it added is paused";
	const adds = addsWords(partsOf(listing, []));
	return adds ? `On · ${adds}` : "On";
}
