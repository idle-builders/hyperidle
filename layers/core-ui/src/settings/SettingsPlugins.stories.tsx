/**
 * SettingsPlugins — plugin install and management surface.
 *
 * DESIGN-CLASS = routine (extract). Plugin management follows the same
 * Settings-section grammar as SettingsHarnesses / SettingsFilesystems:
 *   - install form at the top (URL + scope)
 *   - ItemList of installed plugins (name, version, scope, state)
 *   - per-plugin inline contribution expand with detached indicator + restore
 *
 * Renders the POPULATED real state: three plugins covering the key variants:
 *   1. Enabled · factory scope · no contributions
 *   2. Enabled · team scope · one contribution detached (a person edited it)
 *   3. Disabled · factory scope · one clean contribution
 * followed by the two plugins that ship with the app, available to install
 * (one per team, one factory-wide), each with its description and Install.
 *
 * "Detached" = a person edited the agent, subscription or document the plugin
 * put there; Restore brings back the plugin's own version.
 */

// hearth-internal-padding

import { type JSX, useState } from "react";
import { Button, Input, ItemList, Row, Select, type Status, StatusChip, Tag } from "../ds";

// ---------------------------------------------------------------------------
// Fixture types (mirror the route response)
// ---------------------------------------------------------------------------

type SourceKind = "git" | "zip" | "folder";
type ScopeKind = "factory" | "team";
type PluginState = "enabled" | "disabled";

interface ContributionView {
	kind: string;
	manifestKey: string;
	detached: boolean;
}

interface PluginView {
	id: string;
	name: string;
	version: string;
	state: PluginState;
	scope: { kind: ScopeKind; teamId: string | null };
	contributions: ContributionView[];
}

// ---------------------------------------------------------------------------
// Fixture data — the three canonical plugin states
// ---------------------------------------------------------------------------

const PLUGINS: PluginView[] = [
	{
		id: "acme-search",
		name: "acme-search",
		version: "2.1.0",
		state: "enabled",
		scope: { kind: "factory", teamId: null },
		contributions: [],
	},
	{
		id: "acme-crm",
		name: "acme-crm",
		version: "1.0.4",
		state: "enabled",
		scope: { kind: "team", teamId: "team-sales" },
		contributions: [
			{ kind: "agent", manifestKey: "crm-agent", detached: true },
			{ kind: "document", manifestKey: "lookup-contact", detached: false },
		],
	},
	{
		id: "acme-billing",
		name: "acme-billing",
		version: "0.9.2",
		state: "disabled",
		scope: { kind: "factory", teamId: null },
		contributions: [{ kind: "mcp_server", manifestKey: "invoice-create", detached: false }],
	},
];

/** A plugin that ships with the app and is not installed for this viewer. */
interface AvailablePlugin {
	id: string;
	name: string;
	version: string;
	description: string;
	installScope: ScopeKind;
}

const AVAILABLE: AvailablePlugin[] = [
	{
		id: "document-management",
		name: "document-management",
		version: "1.0.0",
		description:
			"Document Librarian agent with decay, document triage, and post-task retro subscriptions.",
		installScope: "factory",
	},
	{
		id: "role-personas",
		name: "role-personas",
		version: "1.0.0",
		description:
			"A team of agents with defined roles — builder, designer, product manager, QA, growth, ops, facilitator — each with its own identity.",
		installScope: "team",
	},
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stateChipStatus(s: PluginState): Status {
	return s === "enabled" ? "healthy" : "behind";
}

/** The team names the page reads from `search_users` — a row names its team, never its id. */
const TEAM_NAMES = new Map([["team-sales", "Sales"]]);

function scopeLabel(scope: { kind: ScopeKind; teamId: string | null }): string {
	if (scope.kind === "factory") return "For everyone";
	const name = scope.teamId ? TEAM_NAMES.get(scope.teamId) : undefined;
	return name ? `For ${name}` : "For another team";
}

// ---------------------------------------------------------------------------
// Install form (design-time, no actual submission)
// ---------------------------------------------------------------------------

function InstallFormStory(): JSX.Element {
	const [sourceKind, setSourceKind] = useState<SourceKind>("git");
	const [value, setValue] = useState("");
	const [scopeKind, setScopeKind] = useState<ScopeKind>("factory");
	const [teamId, setTeamId] = useState("");

	const sourceLabel =
		sourceKind === "git" ? "Git URL" : sourceKind === "zip" ? "Zip path" : "Folder path";
	const sourcePlaceholder =
		sourceKind === "git" ? "https://github.com/org/my-plugin" : "/path/to/plugin";

	return (
		<form className="flex flex-col gap-[12px]" onSubmit={(e) => e.preventDefault()}>
			<div className="flex gap-[9px]">
				<Select
					label="Source type"
					value={sourceKind}
					onChange={(e) => setSourceKind(e.target.value as SourceKind)}
					options={[
						{ value: "git", label: "Git URL" },
						{ value: "zip", label: "Zip file" },
						{ value: "folder", label: "Local folder" },
					]}
				/>
				<div className="flex-1">
					<Input
						label={sourceLabel}
						placeholder={sourcePlaceholder}
						value={value}
						onChange={(e) => setValue(e.target.value)}
					/>
				</div>
			</div>
			<div className="flex gap-[9px] items-end">
				<Select
					label="Scope"
					value={scopeKind}
					onChange={(e) => setScopeKind(e.target.value as ScopeKind)}
					options={[
						{ value: "factory", label: "Whole backend (factory)" },
						{ value: "team", label: "One team" },
					]}
				/>
				{scopeKind === "team" && (
					<div className="flex-1">
						<Input
							label="Team ID"
							placeholder="team-id"
							value={teamId}
							onChange={(e) => setTeamId(e.target.value)}
						/>
					</div>
				)}
				<Button
					type="submit"
					variant="primary"
					disabled={!value.trim() || (scopeKind === "team" && !teamId.trim())}
				>
					Install
				</Button>
			</div>
		</form>
	);
}

// ---------------------------------------------------------------------------
// Contribution list row (shown expanded)
// ---------------------------------------------------------------------------

function ContributionList({
	pluginId,
	contributions,
}: {
	pluginId: string;
	contributions: ContributionView[];
}): JSX.Element | null {
	if (contributions.length === 0) return null;
	return (
		<ul className="flex flex-col gap-[6px] pl-[12px] border-l-[var(--bw-thin)] border-l-[var(--border-subtle)]">
			{contributions.map((c) => (
				<li key={`${pluginId}/${c.manifestKey}`} className="flex items-center gap-[9px]">
					<span className="type-small text-[var(--text-secondary)] flex-1">
						<span className="type-label text-[var(--text-primary)]">{c.manifestKey}</span>·
						<span className="text-[var(--text-tertiary)]">{c.kind}</span>
					</span>
					{c.detached && (
						<>
							<Tag label="detached" />
							<Button variant="ghost" size="sm">
								Restore
							</Button>
						</>
					)}
				</li>
			))}
		</ul>
	);
}

// ---------------------------------------------------------------------------
// Plugin row (with inline expand for contributions)
// ---------------------------------------------------------------------------

function PluginRow({ plugin }: { plugin: PluginView }): JSX.Element {
	const [expanded, setExpanded] = useState(plugin.id === "acme-crm");
	const hasContributions = plugin.contributions.length > 0;
	const hasDetached = plugin.contributions.some((c) => c.detached);

	return (
		<div className="flex flex-col">
			<Row
				title={
					<span>
						<span className="type-control text-[var(--text-primary)]">{plugin.name}</span>
						<span className="type-small text-[var(--text-secondary)] ml-[6px]">
							v{plugin.version}
						</span>
					</span>
				}
				subtitle={scopeLabel(plugin.scope)}
				lead={<StatusChip status={stateChipStatus(plugin.state)} label={plugin.state} />}
				actions={
					<div className="flex items-center gap-[6px]">
						{hasContributions && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setExpanded((o) => !o)}
								aria-expanded={expanded}
							>
								{hasDetached && !expanded ? "Contributions (detached)" : "Contributions"}
							</Button>
						)}
						<Button variant="ghost" size="sm">
							{plugin.state === "enabled" ? "Disable" : "Enable"}
						</Button>
						<Button variant="ghost" size="sm">
							Remove
						</Button>
					</div>
				}
			/>
			{expanded && hasContributions && (
				<div className="px-[12px] pb-[9px]">
					<ContributionList pluginId={plugin.id} contributions={plugin.contributions} />
				</div>
			)}
		</div>
	);
}

function AvailableRow({ plugin }: { plugin: AvailablePlugin }): JSX.Element {
	return (
		<Row
			title={
				<span>
					<span className="type-control text-[var(--text-primary)]">{plugin.name}</span>
					<span className="type-small text-[var(--text-secondary)] ml-[6px]">
						v{plugin.version}
					</span>
				</span>
			}
			subtitle={plugin.description}
			lead={<StatusChip status="behind" label="available" />}
			actions={
				<div className="flex items-center gap-[6px]">
					<Tag label={plugin.installScope === "factory" ? "Factory" : "Your team"} />
					<Button variant="primary" size="sm">
						Install
					</Button>
				</div>
			}
		/>
	);
}

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

export default {
	title: "SettingsPlugins",
	group: "Settings" as const,
};

export const Populated = (): JSX.Element => (
	<div className="flex flex-col gap-[18px] bg-[var(--surface-page)] p-[24px] max-w-[720px]">
		<InstallFormStory />
		<div className="flex flex-col gap-[6px]">
			<ItemList isEmpty={false}>
				{PLUGINS.map((plugin) => (
					<PluginRow key={plugin.id} plugin={plugin} />
				))}
				{AVAILABLE.map((plugin) => (
					<AvailableRow key={plugin.id} plugin={plugin} />
				))}
			</ItemList>
		</div>
	</div>
);
Populated.storyName =
	"Plugins — installed list (factory + team scope, detached contribution expanded) and the bundled plugins available to install";
