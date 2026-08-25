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
 *   2. Enabled · team scope · one contribution detached (user override)
 *   3. Disabled · factory scope · one clean contribution
 *
 * @lore BA9a scope-deferral: scope is stored and shown here. Team-scoped filtering
 * bites during session materialisation (BA9b) — operators see scope now.
 *
 * @lore BA9a detached: "detached" = contribution has a user override on top
 * of the plugin default (valueSource === "user_override"). Restore clears it.
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
			{ kind: "skill", manifestKey: "lookup-contact", detached: false },
		],
	},
	{
		id: "acme-billing",
		name: "acme-billing",
		version: "0.9.2",
		state: "disabled",
		scope: { kind: "factory", teamId: null },
		contributions: [{ kind: "tool", manifestKey: "invoice-create", detached: false }],
	},
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stateChipStatus(s: PluginState): Status {
	return s === "enabled" ? "healthy" : "behind";
}

function scopeLabel(scope: { kind: ScopeKind; teamId: string | null }): string {
	if (scope.kind === "factory") return "Factory";
	return scope.teamId ? `Team: ${scope.teamId}` : "Team";
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
						<span className="type-label text-[var(--text-primary)]">{c.manifestKey}</span>
						 · 
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
				lead={<StatusChip status={stateChipStatus(plugin.state)} label={plugin.state} />}
				actions={
					<div className="flex items-center gap-[6px]">
						<Tag label={scopeLabel(plugin.scope)} />
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
			</ItemList>
		</div>
	</div>
);
Populated.storyName =
	"Plugins — installed list (factory + team scope, detached contribution expanded)";
