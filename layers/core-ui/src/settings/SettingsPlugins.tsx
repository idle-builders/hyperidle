// @lore: restore — names contribution by PluginContributionView.key; no REGISTRY_KINDS branch needed

// hearth-internal-padding

import type {
	AvailablePluginView,
	EditPluginSource,
	PluginContributionView,
	PluginListing,
	PluginListState,
	PluginScope,
	PluginView,
} from "@hyperidle/domain-model";
import { type JSX, useCallback, useEffect, useState } from "react";
import {
	Button,
	Combobox,
	EmptyState,
	ErrorState,
	Input,
	ItemList,
	Row,
	Select,
	SkeletonList,
	StatusChip,
	Tag,
} from "../ds";
import { useTeams } from "../hooks/useTeams.js";
import { call } from "../services/call.js";
import { useToast } from "../shell/ToastRegion.js";

type SourceKind = Exclude<EditPluginSource["kind"], "bundled">;
type ScopeKind = PluginScope["kind"];

function isAvailable(p: PluginListing): p is AvailablePluginView {
	return p.state === "available";
}

type LoadState = "loading" | "ready" | "error";

function stateChipStatus(state: PluginListState): "healthy" | "behind" {
	return state === "enabled" ? "healthy" : "behind";
}

/**
 * Whose install a row is, in words: "For everyone", or "For <team name>".
 * Never the raw team id — a team a person cannot see reads "For another team".
 */
function scopeLabel(scope: PluginScope, teamNames: ReadonlyMap<string, string>): string {
	if (scope.kind === "factory") return "For everyone";
	const name = scope.teamId ? teamNames.get(scope.teamId) : undefined;
	return name ? `For ${name}` : "For another team";
}

interface InstallFormProps {
	onInstalled: () => void;
	teamOptions: readonly { readonly id: string; readonly label: string }[];
}

function InstallForm({ onInstalled, teamOptions }: InstallFormProps): JSX.Element {
	const { showToast } = useToast();
	const [sourceKind, setSourceKind] = useState<SourceKind>("git");
	const [value, setValue] = useState("");
	const [scopeKind, setScopeKind] = useState<ScopeKind>("factory");
	const [teamId, setTeamId] = useState("");
	const [installing, setInstalling] = useState(false);

	async function install(): Promise<void> {
		if (!value.trim()) return;
		if (scopeKind === "team" && !teamId.trim()) return;
		setInstalling(true);
		try {
			const scope: PluginScope =
				scopeKind === "factory"
					? { kind: "factory", teamId: null }
					: { kind: "team", teamId: teamId.trim() };
			const source: EditPluginSource =
				sourceKind === "git"
					? { kind: "git", url: value.trim(), scope }
					: { kind: sourceKind, path: value.trim(), scope };
			const result = await call("edit_plugin", { source });
			if (!result.ok) {
				showToast(result.problems[0]?.message ?? "Install failed");
				return;
			}
			setValue("");
			setTeamId("");
			showToast("Plugin installed.");
			onInstalled();
		} catch {
			showToast("Network error — install failed.");
		} finally {
			setInstalling(false);
		}
	}

	const sourceLabel =
		sourceKind === "git" ? "Git URL" : sourceKind === "zip" ? "Zip path" : "Folder path";
	const sourcePlaceholder =
		sourceKind === "git" ? "https://github.com/org/my-plugin" : "/path/to/plugin";

	return (
		<form
			className="flex flex-col gap-[12px]"
			data-testid="plugin-install-form"
			onSubmit={(e) => {
				e.preventDefault();
				void install();
			}}
		>
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
					data-testid="plugin-source-kind"
				/>
				<div className="flex-1">
					<Input
						label={sourceLabel}
						placeholder={sourcePlaceholder}
						value={value}
						onChange={(e) => setValue(e.target.value)}
						data-testid="plugin-source-value"
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
					data-testid="plugin-scope-kind"
				/>
				{scopeKind === "team" && (
					<div className="flex-1" data-testid="plugin-scope-team-id">
						<Combobox
							id="plugin-scope-team-id-combobox"
							label="Team"
							options={teamOptions}
							value={teamId}
							onChange={setTeamId}
							placeholder="Select a team…"
							listAriaLabel="Teams"
							inputAriaLabel="Filter teams"
						/>
					</div>
				)}
				<Button
					type="submit"
					variant="primary"
					disabled={installing || !value.trim() || (scopeKind === "team" && !teamId.trim())}
					data-testid="plugin-install-btn"
				>
					{installing ? "Installing…" : "Install"}
				</Button>
			</div>
		</form>
	);
}

const KIND_LABEL: Record<string, string> = {
	agent: "agent",
	subscription: "subscription",
	document: "document",
	mcp_server: "MCP server",
};

interface ContributionListProps {
	pluginId: string;
	contributions: PluginContributionView[];
	onRestore: (pluginId: string, c: PluginContributionView) => Promise<void>;
	restoring: string | null; // "pluginId/manifestKey" key being restored
}

function ContributionList({
	pluginId,
	contributions,
	onRestore,
	restoring,
}: ContributionListProps): JSX.Element | null {
	if (contributions.length === 0) return null;
	return (
		<ul
			className="flex flex-col gap-[6px] pl-[12px] border-l-[var(--bw-thin)] border-l-[var(--border-subtle)]"
			data-testid={`plugin-contributions-${pluginId}`}
		>
			{contributions.map((c) => {
				const key = `${pluginId}/${c.entityId}`;
				const isRestoring = restoring === key;
				return (
					<li key={c.entityId} className="flex items-center gap-[9px]">
						<span className="type-small text-[var(--text-secondary)] flex-1">
							<span className="type-label text-[var(--text-primary)]">{c.label}</span>·
							<span className="text-[var(--text-tertiary)]">{KIND_LABEL[c.kind] ?? c.kind}</span>
						</span>
						{c.detached && (
							<>
								<Tag label="detached" />
								<Button
									variant="ghost"
									size="sm"
									disabled={isRestoring}
									onClick={() => void onRestore(pluginId, c)}
									data-testid={`btn-restore-${c.entityId}`}
								>
									{isRestoring ? "Restoring…" : "Restore"}
								</Button>
							</>
						)}
					</li>
				);
			})}
		</ul>
	);
}

export function SettingsPlugins(): JSX.Element {
	const { showToast } = useToast();
	const { data: teamsData } = useTeams();
	const teams = teamsData?.teams ?? [];
	const teamOptions = teams.map((t) => ({ id: t.id, label: t.name }));
	const teamNames = new Map(teams.map((t) => [t.id, t.name]));
	const [plugins, setPlugins] = useState<PluginListing[]>([]);
	const [loadState, setLoadState] = useState<LoadState>("loading");
	const [busy, setBusy] = useState<Set<string>>(new Set());
	const [restoring, setRestoring] = useState<string | null>(null);
	const [expanded, setExpanded] = useState<Set<string>>(new Set());

	const load = useCallback(async (): Promise<void> => {
		setLoadState("loading");
		try {
			const result = await call("search_plugins", {});
			if (!result.ok) {
				setLoadState("error");
				return;
			}
			setPlugins(result.data);
			setLoadState("ready");
		} catch {
			setLoadState("error");
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function toggle(plugin: PluginView): Promise<void> {
		const nextState: PluginListState = plugin.state === "enabled" ? "disabled" : "enabled";
		setBusy((prev) => new Set([...prev, plugin.id]));
		try {
			const result = await call("edit_plugin", { id: plugin.id, state: nextState });
			if (!result.ok) {
				const verb = nextState === "enabled" ? "enable" : "disable";
				showToast(result.problems[0]?.message ?? `${verb} failed`);
				return;
			}
			await load();
		} catch {
			showToast("Network error.");
		} finally {
			setBusy((prev) => {
				const next = new Set(prev);
				next.delete(plugin.id);
				return next;
			});
		}
	}

	async function remove(plugin: PluginView): Promise<void> {
		setBusy((prev) => new Set([...prev, plugin.id]));
		try {
			const result = await call("edit_plugin", { id: plugin.id, remove: true });
			if (!result.ok) {
				showToast(result.problems[0]?.message ?? "Remove failed");
				return;
			}
			showToast(`${plugin.name} removed.`);
			await load();
		} catch {
			showToast("Network error.");
		} finally {
			setBusy((prev) => {
				const next = new Set(prev);
				next.delete(plugin.id);
				return next;
			});
		}
	}

	async function restore(pluginId: string, contribution: PluginContributionView): Promise<void> {
		const key = `${pluginId}/${contribution.entityId}`;
		setRestoring(key);
		try {
			const result = await call("edit_plugin", {
				id: pluginId,
				restore: { contribution: contribution.key },
			});
			if (!result.ok) {
				showToast(result.problems[0]?.message ?? "Restore failed");
				return;
			}
			showToast(`${contribution.label} restored to plugin default.`);
			await load();
		} catch {
			showToast("Network error.");
		} finally {
			setRestoring(null);
		}
	}

	async function installBundled(plugin: AvailablePluginView): Promise<void> {
		setBusy((prev) => new Set([...prev, plugin.id]));
		try {
			let scope: PluginScope = { kind: "factory", teamId: null };
			if (plugin.installScope === "team") {
				const viewer = await call("open_user", {});
				const teamId = viewer.ok ? viewer.data.user?.team?.id : undefined;
				if (!teamId) {
					showToast("You are not in a team, so there is no team to install it for.");
					return;
				}
				scope = { kind: "team", teamId };
			}
			const result = await call("edit_plugin", {
				source: { kind: "bundled", name: plugin.name, scope },
			});
			if (!result.ok) {
				showToast(result.problems[0]?.message ?? "Install failed");
				return;
			}
			showToast(`${plugin.name} installed.`);
			await load();
		} catch {
			showToast("Network error — install failed.");
		} finally {
			setBusy((prev) => {
				const next = new Set(prev);
				next.delete(plugin.id);
				return next;
			});
		}
	}

	function toggleExpand(id: string): void {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	if (loadState === "loading") return <SkeletonList rows={2} ariaLabel="Loading plugins…" />;
	if (loadState === "error")
		return (
			<ErrorState
				title="Failed to load plugins"
				description="Check the server connection and try again."
				onRetry={() => void load()}
			/>
		);

	return (
		<div className="flex flex-col gap-[18px]" data-testid="settings-plugins">
			<InstallForm onInstalled={() => void load()} teamOptions={teamOptions} />

			{plugins.every(isAvailable) && (
				<EmptyState
					title="No plugins installed"
					description={
						plugins.length > 0
							? "Install one that ships with the app below, or paste a git URL, zip path, or folder path above."
							: "Paste a git URL, zip path, or folder path above to install a plugin."
					}
					dataTestId="plugins-empty"
				/>
			)}
			{plugins.length > 0 && (
				<div className="flex flex-col gap-[6px]" data-testid="plugins-list">
					<ItemList isEmpty={false}>
						{plugins.map((plugin) => {
							if (isAvailable(plugin)) {
								return (
									<AvailableRow
										key={plugin.id}
										plugin={plugin}
										busy={busy.has(plugin.id)}
										onInstall={installBundled}
									/>
								);
							}
							const isBusy = busy.has(plugin.id);
							const isExpanded = expanded.has(plugin.id);
							const hasContributions = plugin.contributions.length > 0;
							const hasDetached = plugin.contributions.some((c) => c.detached);
							return (
								<div key={plugin.id} className="flex flex-col">
									<Row
										title={<PluginTitle name={plugin.name} version={plugin.version} />}
										// @lore: scope in subtitle not actions — tag beside three buttons collapsed the title to nothing
										subtitle={scopeLabel(plugin.scope, teamNames)}
										lead={
											<StatusChip status={stateChipStatus(plugin.state)} label={plugin.state} />
										}
										actions={
											<div className="flex items-center gap-[6px]">
												{hasContributions && (
													<Button
														variant="ghost"
														size="sm"
														onClick={() => toggleExpand(plugin.id)}
														data-testid={`plugin-expand-${plugin.id}`}
														aria-expanded={isExpanded}
													>
														{hasDetached && !isExpanded
															? "Contributions (detached)"
															: "Contributions"}
													</Button>
												)}
												<Button
													variant="ghost"
													size="sm"
													disabled={isBusy}
													onClick={() => void toggle(plugin)}
													data-testid={`plugin-toggle-${plugin.id}`}
												>
													{plugin.state === "enabled" ? "Disable" : "Enable"}
												</Button>
												<Button
													variant="ghost"
													size="sm"
													disabled={isBusy}
													onClick={() => void remove(plugin)}
													data-testid={`plugin-remove-${plugin.id}`}
												>
													Remove
												</Button>
											</div>
										}
										data-testid={`plugin-row-${plugin.id}`}
									/>
									{isExpanded && hasContributions && (
										<div className="px-[12px] pb-[9px]">
											<ContributionList
												pluginId={plugin.id}
												contributions={plugin.contributions}
												onRestore={restore}
												restoring={restoring}
											/>
										</div>
									)}
								</div>
							);
						})}
					</ItemList>
				</div>
			)}
		</div>
	);
}

function PluginTitle({ name, version }: { name: string; version: string }): JSX.Element {
	return (
		<span>
			<span className="type-control text-[var(--text-primary)]">{name}</span>
			<span className="type-small text-[var(--text-secondary)] ml-[6px]">v{version}</span>
		</span>
	);
}

interface AvailableRowProps {
	plugin: AvailablePluginView;
	busy: boolean;
	onInstall: (plugin: AvailablePluginView) => Promise<void>;
}

function AvailableRow({ plugin, busy, onInstall }: AvailableRowProps): JSX.Element {
	return (
		<Row
			title={<PluginTitle name={plugin.name} version={plugin.version} />}
			{...(plugin.description ? { subtitle: plugin.description } : {})}
			lead={<StatusChip status="behind" label="available" />}
			actions={
				<div className="flex items-center gap-[6px]">
					<Tag label={plugin.installScope === "factory" ? "Factory" : "Your team"} />
					<Button
						variant="primary"
						size="sm"
						disabled={busy}
						onClick={() => void onInstall(plugin)}
						data-testid={`plugin-install-${plugin.id}`}
					>
						{busy ? "Installing…" : "Install"}
					</Button>
				</div>
			}
			data-testid={`plugin-row-${plugin.id}`}
		/>
	);
}
