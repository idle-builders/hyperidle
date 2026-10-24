import type { EditPluginSource, PluginListing, Problem } from "@hyperidle/domain-model";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { call } from "./api";
import { Avatar } from "./Msg";
import type { Pair as Row } from "./people-page";
import { type PluginStand, pluginPage } from "./plugin-page";
import { Seg } from "./Seg";
import { Dialog, Field } from "./Setup";
import { initials, teamsOf } from "./sidebar-lists";
import { useNow } from "./Thread";
import { useAction } from "./useAction";

/**
 * PLUGINS — a plugin is a ready-made pack: agents, skills, reasons to start and services. It has
 * no world of its own. What it adds are ordinary agents and documents in the team, yours to
 * change, so a plugin's page is mostly a list of links to them. A plugin is added for one team or
 * for every team, and listed in the box on the page of each team it is for.
 */

const STATE_WORDS: Record<PluginStand, string> = { on: "On", off: "Off", new: "Not installed" };

const problemWords = (problems: readonly Problem[]): string =>
	problems.map((p) => p.message).join(" ");

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

/**
 * A plugin's page, opened from a team's box or an agent it added. `?team=` names the team it was
 * opened from: the crumbs go back there, and a team plugin not installed would be installed there.
 */
export function PluginScreen({ id }: { id: string }): React.ReactElement {
	const navigate = useNavigate();
	const now = useNow();
	const [search] = useSearchParams();
	const teamName = search.get("team") ?? "";
	const plugins = useAction("search_plugins", {});
	const users = useAction("search_users", {}, ["users"]);
	const me = useAction("open_user", {});
	const [problem, setProblem] = useState<string | null>(null);

	const listing = plugins.data?.find((p) => p.id === id);
	const everyone = users.data ?? [];
	const you = me.data?.user?.id ?? "";
	const team =
		teamsOf(everyone).find((t) => t.name === teamName) ?? me.data?.user?.teams[0] ?? null;
	const toTeam = () => navigate(`/teams/${encodeURIComponent(team?.name ?? teamName)}`);

	if (plugins.data && !listing)
		return (
			<section className="detail">
				<header className="detail-head">
					<span className="chip chip--quiet">Plugin</span>
				</header>
				<div className="detail-scroll">
					<p className="opened-note">There is no plugin {id} here.</p>
				</div>
			</section>
		);
	if (!(listing && users.data)) return <section className="detail" />;

	const p = pluginPage(listing, { users: everyone, you, team, now });
	const here = p.state !== "new";
	const changeThen = async (run: () => ReturnType<typeof call<"edit_plugin">>) => {
		setProblem(null);
		const result = await run();
		if (!result.ok) setProblem(problemWords(result.problems));
		plugins.reload();
		users.reload();
		return result;
	};
	const install = async (l: PluginListing) => {
		if (l.state !== "available") return;
		const scope: EditPluginSource["scope"] =
			l.installScope === "team" && team
				? { kind: "team", teamId: team.id }
				: { kind: "factory", teamId: null };
		const result = await changeThen(() =>
			call("edit_plugin", { source: { kind: "bundled", name: l.id, scope } }),
		);
		if (result.ok)
			navigate(
				`/plugins/${encodeURIComponent(result.data.id)}?team=${encodeURIComponent(team?.name ?? "")}`,
				{ replace: true },
			);
	};

	return (
		<section className="detail">
			<header className="detail-head">
				<span className="chip chip--quiet">Plugin</span>
				{p.about && <span className="doc-state">{p.about}</span>}
			</header>
			<div className="detail-scroll">
				<article className="tk-page">
					<div className="tk-main">
						<nav className="crumbs" aria-label="Where you are">
							<button type="button" onClick={toTeam}>
								{team?.name ?? teamName}
							</button>
							<span aria-current="true">{p.name}</span>
						</nav>
						<h1 className="page-title">{p.name}</h1>
						<p className="stand">
							<span>{p.stand}</span>
						</p>
						<p>
							Its agents join the team it is added for. Everything it adds is ordinary, and yours to
							change.
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
									disabled={!(here && a.id)}
									onClick={() => a.id && navigate(`/people/${a.id}`)}
								>
									<Avatar who={initials(a.name)} />
									<span className="who-text">
										<span className="who-name">{a.name}</span>
										{a.what && <span className="who-what">{a.what}</span>}
									</span>
									<span className="who-now">{a.comes}</span>
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
							<span className="tbox-state">{STATE_WORDS[p.state]}</span>
						</div>
						<div className="tbox-acts">
							{here ? (
								<>
									<button
										type="button"
										className="btn"
										onClick={() =>
											void changeThen(() =>
												call("edit_plugin", {
													id: listing.id,
													state: p.state === "on" ? "disabled" : "enabled",
												}),
											)
										}
									>
										{p.state === "on" ? "Switch off" : "Switch on"}
									</button>
									<button
										type="button"
										className="btn"
										onClick={async () => {
											const result = await changeThen(() =>
												call("edit_plugin", { id: listing.id, remove: true }),
											);
											if (result.ok)
												navigate(`/teams/${encodeURIComponent(team?.name ?? teamName)}`, {
													state: { removed: { id: listing.id, name: p.name } },
												});
										}}
									>
										Remove
									</button>
								</>
							) : (
								<button
									type="button"
									className="btn btn--accent"
									onClick={() => void install(listing)}
								>
									Install
								</button>
							)}
						</div>
						{problem && <p className="tbox-none">{problem}</p>}
						<ul className="tbox-facts">
							<li>Plugin · version {p.version}</li>
							<li className="tbox-wrap">{p.from}</li>
							<li>{p.forWhom}</li>
							{p.installed && <li>{p.installed}</li>}
						</ul>

						{p.changed.length > 0 && (
							<section className="tbox-sec">
								<h4>
									Changed by the team <span>{p.changed.length}</span>
								</h4>
								{p.changed.map((c) => (
									<div key={c.key} className="pair">
										<span className="pair-what">{c.what}</span>
										<span className="pair-why">{c.why}</span>
										<button
											type="button"
											className="tbox-more"
											aria-label={`Put the plugin's version back: ${c.what}`}
											onClick={() =>
												void changeThen(() =>
													call("edit_plugin", {
														id: listing.id,
														restore: { contribution: c.key },
													}),
												)
											}
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
									Switching it off pauses its agents and reasons to start. Removing it takes its
									agents out of the team and archives its documents.
								</p>
							</section>
						)}
					</aside>
				</article>
			</div>
		</section>
	);
}

const SOURCES = ["A git address", "A folder", "A zip file"] as const;
type SourceWords = (typeof SOURCES)[number];
const WHERE: Record<SourceWords, { placeholder: string; hint: string }> = {
	"A git address": {
		placeholder: "https://github.com/owner/repository",
		hint: "The address of the repository the plugin is in.",
	},
	"A folder": {
		placeholder: "/path/to/the/plugin",
		hint: "A folder on the computer HyperIdle runs on.",
	},
	"A zip file": {
		placeholder: "/path/to/the/plugin.zip",
		hint: "A zip file on the computer HyperIdle runs on.",
	},
};
const EVERY_TEAM = "Every team";

/** Add a plugin from elsewhere: a git address, a folder or a zip file, for one team or every team. */
export function AddPluginDialog({
	teams,
	team,
	onClose,
	onAdded,
}: {
	teams: readonly { id: string; name: string }[];
	/** The team whose page it was opened from; the plugin is for it unless changed. */
	team: string;
	onClose: () => void;
	onAdded: (pluginId: string, forTeam: string) => void;
}): React.ReactElement {
	const [from, setFrom] = useState<SourceWords>("A git address");
	const [where, setWhere] = useState("");
	const [forWhom, setForWhom] = useState<string>(team);
	const [problem, setProblem] = useState<string | null>(null);

	const add = async () => {
		const address = where.trim();
		if (!address) return setProblem("Say where the plugin is.");
		const chosen = teams.find((t) => t.name === forWhom);
		const scope: EditPluginSource["scope"] = chosen
			? { kind: "team", teamId: chosen.id }
			: { kind: "factory", teamId: null };
		const source: EditPluginSource =
			from === "A git address"
				? { kind: "git", url: address, scope }
				: { kind: from === "A folder" ? "folder" : "zip", path: address, scope };
		const result = await call("edit_plugin", { source });
		if (!result.ok) return setProblem(problemWords(result.problems));
		onAdded(result.data.id, chosen?.name ?? team);
	};

	return (
		<Dialog
			title="Add a plugin"
			sub="A plugin adds ready-made agents, skills, reasons to start and services. Everything it adds is yours to change."
			done="Add"
			problem={problem}
			onClose={onClose}
			onDone={() => void add()}
		>
			<Field label="From">
				<Seg label="From" options={SOURCES} value={from} onChange={setFrom} />
			</Field>
			<Field label="Where" hint={WHERE[from].hint}>
				<input
					className="in"
					aria-label="Where"
					placeholder={WHERE[from].placeholder}
					value={where}
					onChange={(e) => setWhere(e.target.value)}
				/>
			</Field>
			<Field
				label="For"
				hint="A plugin's agents join the team it is added for. Every team: added once, for the whole organisation."
			>
				<Seg
					label="For"
					options={[...teams.map((t) => t.name), EVERY_TEAM]}
					value={forWhom}
					onChange={setForWhom}
				/>
			</Field>
		</Dialog>
	);
}
